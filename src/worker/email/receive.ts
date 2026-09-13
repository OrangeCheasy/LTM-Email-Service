import PostalMime from "postal-mime";

function safePreview(text: string | undefined): string {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function storageKey(id: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `emails/${year}/${month}/${day}/${id}/message.eml`;
}

export async function receiveEmail(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date();
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);

  const headerMessageId = message.headers.get("message-id")?.trim() || null;
  const inReplyTo = message.headers.get("in-reply-to")?.trim() || null;
  const references = message.headers.get("references")?.trim() || null;
  const threadId = inReplyTo || references?.split(/\s+/).at(-1) || headerMessageId || id;
  const key = storageKey(id, now);

  await env.MAIL.put(key, raw, {
    httpMetadata: { contentType: "message/rfc822" },
    customMetadata: {
      messageId: headerMessageId ?? id,
      from: message.from,
      to: message.to,
    },
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO threads (id, subject, latest_message_at, message_count)
       VALUES (?1, ?2, ?3, 0)`,
    ).bind(threadId, parsed.subject || "(no subject)", now.toISOString()),
    env.DB.prepare(
      `INSERT INTO messages (
        id, message_id, thread_id, direction, from_address, to_addresses,
        subject, preview, received_at, has_attachments, raw_r2_key,
        in_reply_to, reference_ids
      ) VALUES (?1, ?2, ?3, 'inbound', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(
      id,
      headerMessageId,
      threadId,
      message.from,
      JSON.stringify([message.to]),
      parsed.subject || "(no subject)",
      safePreview(parsed.text),
      now.toISOString(),
      parsed.attachments.length > 0 ? 1 : 0,
      key,
      inReplyTo,
      references,
    ),
    env.DB.prepare(
      `UPDATE threads
       SET latest_message_at = ?2,
           message_count = message_count + 1,
           subject = CASE WHEN subject = '' THEN ?3 ELSE subject END
       WHERE id = ?1`,
    ).bind(threadId, now.toISOString(), parsed.subject || "(no subject)"),
  ]);

  if (env.FORWARD_TO.trim() && message.canBeForwarded) {
    ctx.waitUntil(message.forward(env.FORWARD_TO.trim()));
  }
}

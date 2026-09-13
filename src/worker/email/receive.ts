import PostalMime from "postal-mime";
import type { Address, Mailbox } from "postal-mime";
import { sendNewMailPush } from "../push";

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function safePreview(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function messageStorageKey(id: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `emails/${year}/${month}/${day}/${id}/message.eml`;
}

function attachmentStorageKey(id: string, attachmentId: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `emails/${year}/${month}/${day}/${id}/attachments/${attachmentId}`;
}

function mailbox(address: Address | undefined): Mailbox | null {
  if (!address || ("group" in address && address.group)) return null;
  return address as Mailbox;
}

function addressList(addresses: Address[] | undefined): string[] {
  if (!addresses) return [];
  const values: string[] = [];
  for (const address of addresses) {
    if ("group" in address && address.group) {
      for (const member of address.group) if (member.address) values.push(member.address);
    } else {
      const item = address as Mailbox;
      if (item.address) values.push(item.address);
    }
  }
  return [...new Set(values)];
}

function referenceCandidates(inReplyTo: string | null, references: string | null): string[] {
  const candidates = [inReplyTo, ...(references?.match(/<[^>]+>/g) ?? references?.split(/\s+/) ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  return [...new Set(candidates)].reverse().slice(0, 30);
}

async function resolveThreadId(env: Env, inReplyTo: string | null, references: string | null): Promise<string> {
  for (const candidate of referenceCandidates(inReplyTo, references)) {
    const match = await env.DB.prepare("SELECT thread_id FROM messages WHERE message_id = ?1 LIMIT 1")
      .bind(candidate)
      .first<{ thread_id: string }>();
    if (match) return match.thread_id;
  }
  return crypto.randomUUID();
}

function contentSize(content: ArrayBuffer | Uint8Array | string): number {
  if (typeof content === "string") return new TextEncoder().encode(content).byteLength;
  return content.byteLength;
}

export async function receiveEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw, { maxNestingDepth: 100, maxHeadersSize: 1_048_576 });
  const headerMessageId = parsed.messageId?.trim() || message.headers.get("message-id")?.trim() || null;

  if (headerMessageId) {
    const duplicate = await env.DB.prepare("SELECT id FROM messages WHERE message_id = ?1 LIMIT 1").bind(headerMessageId).first<{ id: string }>();
    if (duplicate) return;
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const inReplyTo = parsed.inReplyTo?.trim() || message.headers.get("in-reply-to")?.trim() || null;
  const references = parsed.references?.trim() || message.headers.get("references")?.trim() || null;
  const threadId = await resolveThreadId(env, inReplyTo, references);
  const key = messageStorageKey(id, now);
  const sender = mailbox(parsed.from);
  const to = addressList(parsed.to);
  const cc = addressList(parsed.cc);
  const bodyText = parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "");

  await env.MAIL.put(key, raw, {
    httpMetadata: { contentType: "message/rfc822" },
    customMetadata: { messageId: headerMessageId ?? id, from: message.from, to: message.to },
  });

  const attachmentRows: Array<{ id: string; key: string; filename: string; mimeType: string; size: number }> = [];
  for (const attachment of parsed.attachments) {
    const attachmentId = crypto.randomUUID();
    const attachmentKey = attachmentStorageKey(id, attachmentId, now);
    await env.MAIL.put(attachmentKey, attachment.content, { httpMetadata: { contentType: attachment.mimeType || "application/octet-stream" } });
    attachmentRows.push({
      id: attachmentId,
      key: attachmentKey,
      filename: attachment.filename || "attachment",
      mimeType: attachment.mimeType || "application/octet-stream",
      size: contentSize(attachment.content),
    });
  }

  const statements = [
    env.DB.prepare(`INSERT OR IGNORE INTO threads (id, subject, latest_message_at, message_count, is_read) VALUES (?1, ?2, ?3, 0, 0)`).bind(threadId, parsed.subject || "(no subject)", nowIso),
    env.DB.prepare(
      `INSERT INTO messages (
        id, message_id, thread_id, direction, from_address, from_name, to_addresses, cc_addresses,
        subject, preview, body_text, body_html, received_at, has_attachments, raw_r2_key,
        in_reply_to, reference_ids, delivery_status
      ) VALUES (?1, ?2, ?3, 'inbound', ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?12, ?13, ?14, ?15, 'received')`,
    ).bind(
      id,
      headerMessageId,
      threadId,
      sender?.address || message.from,
      sender?.name || null,
      JSON.stringify(to.length ? to : [message.to]),
      JSON.stringify(cc),
      parsed.subject || "(no subject)",
      safePreview(bodyText),
      bodyText,
      parsed.date || nowIso,
      attachmentRows.length > 0 ? 1 : 0,
      key,
      inReplyTo,
      references,
    ),
    ...attachmentRows.map((attachment) => env.DB.prepare("INSERT INTO attachments (id, message_id, filename, content_type, size, r2_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(attachment.id, id, attachment.filename, attachment.mimeType, attachment.size, attachment.key)),
    env.DB.prepare(`UPDATE threads SET latest_message_at = ?2, message_count = message_count + 1, is_read = 0, subject = CASE WHEN subject = '' THEN ?3 ELSE subject END WHERE id = ?1`).bind(threadId, nowIso, parsed.subject || "(no subject)"),
  ];
  await env.DB.batch(statements);

  ctx.waitUntil(sendNewMailPush(env, {
    id,
    sender: sender?.name || sender?.address || message.from,
    subject: parsed.subject || "(no subject)",
  }));

  const forwardTo = env.FORWARD_TO.trim();
  if (forwardTo) ctx.waitUntil(message.forward(forwardTo));
}

import PostalMime from "postal-mime";
import { sendNewMailPush } from "../push";

const MAX_RAW_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 30;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_STORED_TEXT = 2 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024;
const MAX_MIME_DEPTH = 30;

const safePreview = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 240);
const safeFilename = (value: string | undefined, fallback: string) => (value || fallback).replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 255);
const addresses = (items: Array<{ address?: string }> | undefined) => (items ?? []).map(item => item.address?.trim()).filter((value): value is string => Boolean(value)).slice(0, 100);

function truncateUtf8(value: string, maxBytes: number): string {
  if (new TextEncoder().encode(value).byteLength <= maxBytes) return value;
  let low = 0, high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (new TextEncoder().encode(value.slice(0, mid)).byteLength <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return value.slice(0, low);
}

function reject(message: ForwardableEmailMessage, reason: string): void {
  message.setReject(reason.slice(0, 100));
}

export async function receiveEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
  if (message.rawSize > MAX_RAW_BYTES) {
    reject(message, "Message exceeds the maximum accepted size");
    return;
  }

  let raw: ArrayBuffer;
  try {
    raw = await new Response(message.raw).arrayBuffer();
  } catch {
    reject(message, "Message could not be read");
    return;
  }
  if (raw.byteLength > MAX_RAW_BYTES) {
    reject(message, "Message exceeds the maximum accepted size");
    return;
  }

  let parsed: Awaited<ReturnType<PostalMime["parse"]>>;
  try {
    parsed = await new PostalMime({ maxNestingDepth: MAX_MIME_DEPTH, maxHeadersSize: MAX_HEADER_BYTES }).parse(raw);
  } catch {
    reject(message, "Message MIME could not be parsed");
    return;
  }

  if (parsed.attachments.length > MAX_ATTACHMENTS || parsed.attachments.some(attachment => attachment.content.byteLength > MAX_ATTACHMENT_BYTES)) {
    reject(message, "Message contains too many or oversized attachments");
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const headerMessageId = parsed.messageId?.slice(0, 998) || `<${id}@email.liamthemo.com>`;
  const inReplyTo = parsed.inReplyTo;
  const references = parsed.references?.join(" ") || null;
  const sender = parsed.from;
  const to = addresses(parsed.to);
  const cc = addresses(parsed.cc);
  const bodyText = truncateUtf8(parsed.text || "", MAX_STORED_TEXT);
  const threadId = crypto.randomUUID();
  const key = `emails/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${id}/raw.eml`;
  const rows: Array<{ id: string; filename: string; mimeType: string; size: number; key: string }> = [];

  try {
    await env.MAIL.put(key, raw, { httpMetadata: { contentType: "message/rfc822" }, customMetadata: { messageId: headerMessageId.slice(0, 512) } });
    for (const attachment of parsed.attachments) {
      const attachmentId = crypto.randomUUID();
      const attachmentKey = `${key.slice(0, -7)}attachments/${attachmentId}`;
      const mimeType = (attachment.mimeType || "application/octet-stream").slice(0, 127);
      await env.MAIL.put(attachmentKey, attachment.content, { httpMetadata: { contentType: mimeType } });
      rows.push({ id: attachmentId, filename: safeFilename(attachment.filename, "attachment"), mimeType, size: attachment.content.byteLength, key: attachmentKey });
    }
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO threads (id, subject, latest_message_at, message_count, is_read) VALUES (?1, ?2, ?3, 0, 0)").bind(threadId, (parsed.subject || "(no subject)").slice(0, 998), nowIso),
      env.DB.prepare(`INSERT INTO messages (id,message_id,thread_id,direction,from_address,from_name,to_addresses,cc_addresses,subject,preview,body_text,body_html,received_at,has_attachments,raw_r2_key,in_reply_to,reference_ids,delivery_status) VALUES (?1,?2,?3,'inbound',?4,?5,?6,?7,?8,?9,?10,NULL,?11,?12,?13,?14,?15,'received')`).bind(id, headerMessageId, threadId, (sender?.address || message.from).slice(0, 320), sender?.name?.slice(0, 320) || null, JSON.stringify(to.length ? to : [message.to]), JSON.stringify(cc), (parsed.subject || "(no subject)").slice(0, 998), safePreview(bodyText), bodyText, nowIso, rows.length ? 1 : 0, key, inReplyTo?.slice(0, 998) || null, references?.slice(0, 8192) || null),
      ...rows.map(attachment => env.DB.prepare("INSERT INTO attachments (id,message_id,filename,content_type,size,r2_key) VALUES (?1,?2,?3,?4,?5,?6)").bind(attachment.id, id, attachment.filename, attachment.mimeType, attachment.size, attachment.key)),
      env.DB.prepare("UPDATE threads SET latest_message_at=?2,message_count=message_count+1,is_read=0,subject=CASE WHEN subject='' THEN ?3 ELSE subject END WHERE id=?1").bind(threadId, nowIso, (parsed.subject || "(no subject)").slice(0, 998)),
    ]);
  } catch {
    await Promise.allSettled([env.MAIL.delete(key), ...rows.map(row => env.MAIL.delete(row.key))]);
    reject(message, "Message could not be stored");
    return;
  }

  ctx.waitUntil(sendNewMailPush(env, { id }));
  const forwardTo = env.FORWARD_TO.trim();
  if (forwardTo) ctx.waitUntil(message.forward(forwardTo));
}

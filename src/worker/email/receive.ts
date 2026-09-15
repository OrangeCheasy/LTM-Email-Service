import PostalMime from "postal-mime";
import type { Address, Mailbox } from "postal-mime";
import { sendNewMailPush } from "../push";

const MAX_RAW_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 30;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_STORED_TEXT = 2 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024;
const MAX_MIME_DEPTH = 30;

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

const safePreview = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
function path(id: string, now: Date, suffix: string) { return `emails/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${id}/${suffix}`; }
function mailbox(address: Address | undefined): Mailbox | null { return !address || ("group" in address && address.group) ? null : address as Mailbox; }
function addressList(addresses: Address[] | undefined): string[] { if (!addresses) return []; const values: string[] = []; for (const address of addresses) { if ("group" in address && address.group) { for (const member of address.group) if (member.address) values.push(member.address); } else { const member = address as Mailbox; if (member.address) values.push(member.address); } } return [...new Set(values)].slice(0, 100); }
function referenceCandidates(inReplyTo: string | null, references: string | null): string[] { return [...new Set([inReplyTo, ...(references?.match(/<[^>]+>/g) ?? references?.split(/\s+/) ?? [])].filter((value): value is string => Boolean(value)))].reverse().slice(0, 30); }
async function resolveThreadId(env: Env, inReplyTo: string | null, references: string | null): Promise<string> { for (const candidate of referenceCandidates(inReplyTo, references)) { const match = await env.DB.prepare("SELECT thread_id FROM messages WHERE message_id = ?1 LIMIT 1").bind(candidate).first<{ thread_id: string }>(); if (match) return match.thread_id; } return crypto.randomUUID(); }
function size(content: ArrayBuffer | Uint8Array | string): number { return typeof content === "string" ? new TextEncoder().encode(content).byteLength : content.byteLength; }
function truncateUtf8(value: string, maxBytes: number): string { const encoder = new TextEncoder(); if (encoder.encode(value).byteLength <= maxBytes) return value; let low = 0, high = value.length; while (low < high) { const mid = Math.ceil((low + high) / 2); if (encoder.encode(value.slice(0, mid)).byteLength <= maxBytes) low = mid; else high = mid - 1; } return value.slice(0, low); }
function cleanFilename(value: string): string { return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "attachment"; }
function reject(message: ForwardableEmailMessage, reason: string): void { message.setReject(reason); }

export async function receiveEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
  if (message.rawSize > MAX_RAW_BYTES) { reject(message, "Message too large"); return; }

  let raw: ArrayBuffer;
  let parsed: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    raw = await new Response(message.raw).arrayBuffer();
    if (raw.byteLength > MAX_RAW_BYTES) { reject(message, "Message too large"); return; }
    parsed = await PostalMime.parse(raw, { maxNestingDepth: MAX_MIME_DEPTH, maxHeadersSize: MAX_HEADER_BYTES });
  } catch {
    reject(message, "Message could not be processed");
    return;
  }

  if (parsed.attachments.length > MAX_ATTACHMENTS) { reject(message, "Too many attachments"); return; }
  const attachments = parsed.attachments.map(source => ({ source, id: crypto.randomUUID(), size: size(source.content) }));
  if (attachments.some(attachment => attachment.size > MAX_ATTACHMENT_BYTES)) { reject(message, "Attachment too large"); return; }

  const headerMessageId = parsed.messageId?.trim() || message.headers.get("message-id")?.trim() || null;
  if (headerMessageId && await env.DB.prepare("SELECT 1 FROM messages WHERE message_id = ?1 LIMIT 1").bind(headerMessageId).first()) return;

  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const inReplyTo = parsed.inReplyTo?.trim() || message.headers.get("in-reply-to")?.trim() || null;
  const references = parsed.references?.trim() || message.headers.get("references")?.trim() || null;
  const threadId = await resolveThreadId(env, inReplyTo, references);
  const key = path(id, now, "message.eml");
  const sender = mailbox(parsed.from);
  const to = addressList(parsed.to);
  const cc = addressList(parsed.cc);
  const bodyText = truncateUtf8(parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : ""), MAX_STORED_TEXT);

  await env.MAIL.put(key, raw, { httpMetadata: { contentType: "message/rfc822" }, customMetadata: { messageId: headerMessageId ?? id } });
  const rows: Array<{ id: string; key: string; filename: string; mimeType: string; size: number }> = [];
  try {
    for (const attachment of attachments) {
      const attachmentKey = path(id, now, `attachments/${attachment.id}`);
      const mimeType = (attachment.source.mimeType || "application/octet-stream").slice(0, 127);
      await env.MAIL.put(attachmentKey, attachment.source.content, { httpMetadata: { contentType: mimeType } });
      rows.push({ id: attachment.id, key: attachmentKey, filename: cleanFilename(attachment.source.filename || "attachment"), mimeType, size: attachment.size });
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
  if (forwardTo && message.canBeForwarded) ctx.waitUntil(message.forward(forwardTo));
}

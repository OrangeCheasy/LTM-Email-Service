type ReplyTarget = { id: string; message_id: string | null; thread_id: string; reference_ids: string | null; subject: string };
type ForwardTarget = { id: string; subject: string };
type StoredAttachment = { filename: string; content_type: string; size: number; r2_key: string };
type Upload = { filename: string; type: string; content: ArrayBuffer };

const MAX_ATTACHMENT_BYTES = 4_000_000;
const MAX_BODY_CHARS = 500_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_DELIVERY_CODES = new Set(["E_RECIPIENT_NOT_ALLOWED", "E_RECIPIENT_SUPPRESSED", "E_SENDER_DOMAIN_NOT_AVAILABLE", "E_CONTENT_TOO_LARGE", "E_DELIVERY_FAILED", "E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED", "E_INTERNAL_SERVER_ERROR", "E_HEADER_NOT_ALLOWED", "E_HEADER_USE_API_FIELD", "E_HEADER_VALUE_INVALID", "E_HEADER_VALUE_TOO_LONG", "E_HEADERS_TOO_LARGE", "E_HEADERS_TOO_MANY"]);

function splitRecipients(value: FormDataEntryValue | null): string[] { if (typeof value !== "string") return []; return [...new Set(value.split(/[;,\n]+/).map(part => part.trim()).filter(Boolean))]; }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function textToHtml(value: string): string { return `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(value).replace(/\n/g, "<br>")}</div>`; }
function preview(value: string): string { return value.replace(/\s+/g, " ").trim().slice(0, 240); }
function safeDeliveryError(error: unknown): string { const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined; return code && SAFE_DELIVERY_CODES.has(code) ? code : "EMAIL_DELIVERY_FAILED"; }
function userDeliveryError(code: string): string { return code === "E_RECIPIENT_SUPPRESSED" ? "Recipient cannot currently receive this email" : code === "E_CONTENT_TOO_LARGE" ? "Email content is too large" : code === "E_RATE_LIMIT_EXCEEDED" || code === "E_DAILY_LIMIT_EXCEEDED" ? "Email sending limit reached" : "Email delivery failed"; }
function replySubject(subject: string): string { return /^re:/i.test(subject) ? subject : `Re: ${subject}`; }
function forwardSubject(subject: string): string { return /^(fwd|fw):/i.test(subject) ? subject : `Fwd: ${subject}`; }
function attachmentKey(messageId: string, attachmentId: string, now: Date): string { return `emails/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${messageId}/attachments/${attachmentId}`; }

async function parseUploads(form: FormData): Promise<Upload[]> { const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0); const total = files.reduce((sum, file) => sum + file.size, 0); if (total > MAX_ATTACHMENT_BYTES) throw new Error("Attachments must total less than 4 MB"); return Promise.all(files.map(async file => ({ filename: file.name || "attachment", type: file.type || "application/octet-stream", content: await file.arrayBuffer() }))); }
async function forwardedUploads(messageId: string, env: Env): Promise<Upload[]> { const attachments = await env.DB.prepare("SELECT filename, content_type, size, r2_key FROM attachments WHERE message_id = ?1 ORDER BY created_at ASC").bind(messageId).all<StoredAttachment>(); const uploads: Upload[] = []; for (const attachment of attachments.results) { const object = await env.MAIL.get(attachment.r2_key); if (!object) throw new Error("Forwarded attachment is unavailable"); uploads.push({ filename: attachment.filename, type: attachment.content_type || "application/octet-stream", content: await object.arrayBuffer() }); } return uploads; }

export async function sendEmail(request: Request, env: Env): Promise<Response> {
  let form: FormData; try { form = await request.formData(); } catch { return Response.json({ error: "Expected multipart form data" }, { status: 400 }); }
  const to = splitRecipients(form.get("to")), cc = splitRecipients(form.get("cc")), bcc = splitRecipients(form.get("bcc"));
  let subject = String(form.get("subject") ?? "").trim().slice(0, 500);
  const text = String(form.get("text") ?? "").slice(0, MAX_BODY_CHARS), replyToMessageId = String(form.get("replyToMessageId") ?? "").trim() || null, forwardMessageId = String(form.get("forwardMessageId") ?? "").trim() || null, draftId = String(form.get("draftId") ?? "").trim() || null, recipients = [...to, ...cc, ...bcc];
  if (replyToMessageId && forwardMessageId) return Response.json({ error: "A message cannot be both a reply and a forward" }, { status: 400 });
  if (!to.length) return Response.json({ error: "At least one recipient is required" }, { status: 400 });
  if (recipients.length > 50) return Response.json({ error: "A message can contain at most 50 recipients" }, { status: 400 });
  if (recipients.some(address => !EMAIL_PATTERN.test(address))) return Response.json({ error: "One or more recipient addresses are invalid" }, { status: 400 });
  if (!text.trim()) return Response.json({ error: "Message body cannot be empty" }, { status: 400 });
  let uploads: Upload[]; try { uploads = await parseUploads(form); } catch { return Response.json({ error: "Attachments must total less than 4 MB" }, { status: 400 }); }

  let replyTarget: ReplyTarget | null = null;
  if (replyToMessageId) { replyTarget = await env.DB.prepare("SELECT id, message_id, thread_id, reference_ids, subject FROM messages WHERE id = ?1").bind(replyToMessageId).first<ReplyTarget>(); if (!replyTarget) return Response.json({ error: "Reply target was not found" }, { status: 404 }); if (!subject) subject = replySubject(replyTarget.subject); }
  let forwardTarget: ForwardTarget | null = null, inheritedUploads: Upload[] = [];
  if (forwardMessageId) { forwardTarget = await env.DB.prepare("SELECT id, subject FROM messages WHERE id = ?1").bind(forwardMessageId).first<ForwardTarget>(); if (!forwardTarget) return Response.json({ error: "Forward target was not found" }, { status: 404 }); if (!subject) subject = forwardSubject(forwardTarget.subject); try { inheritedUploads = await forwardedUploads(forwardTarget.id, env); } catch { return Response.json({ error: "Forwarded attachment is unavailable" }, { status: 400 }); } }
  const allUploads = [...inheritedUploads, ...uploads]; if (allUploads.reduce((sum, upload) => sum + upload.content.byteLength, 0) > MAX_ATTACHMENT_BYTES) return Response.json({ error: "Attachments must total less than 4 MB" }, { status: 400 });
  if (!subject) subject = "(no subject)";

  const id = crypto.randomUUID(), threadId = replyTarget?.thread_id ?? crypto.randomUUID(), now = new Date(), nowIso = now.toISOString(), references = [replyTarget?.reference_ids, replyTarget?.message_id].filter(Boolean).join(" ") || null;
  const headers: Record<string, string> = {}; if (replyTarget?.message_id) headers["In-Reply-To"] = replyTarget.message_id; if (references) headers.References = references;
  let status = "sent", deliveryError: string | null = null, cloudflareMessageId: string | null = null;
  try { const result = await env.EMAIL.send({ from: { email: env.PRIMARY_ADDRESS, name: "Liam" }, to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined, replyTo: env.PRIMARY_ADDRESS, subject, text, html: textToHtml(text), headers: Object.keys(headers).length ? headers : undefined, attachments: allUploads.map(upload => ({ content: upload.content, filename: upload.filename, type: upload.type, disposition: "attachment" as const })) }); cloudflareMessageId = result.messageId; }
  catch (error) { status = "failed"; deliveryError = safeDeliveryError(error); }

  const attachmentRows: Array<{ id: string; key: string; upload: Upload }> = [];
  if (status === "sent") for (const upload of allUploads) { const attachmentId = crypto.randomUUID(), key = attachmentKey(id, attachmentId, now); await env.MAIL.put(key, upload.content, { httpMetadata: { contentType: upload.type } }); attachmentRows.push({ id: attachmentId, key, upload }); }
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO threads (id, subject, latest_message_at, message_count, is_read) VALUES (?1, ?2, ?3, 0, 1)").bind(threadId, subject, nowIso),
    env.DB.prepare(`INSERT INTO messages (id,message_id,thread_id,direction,from_address,to_addresses,cc_addresses,bcc_addresses,subject,preview,body_text,body_html,received_at,sent_at,is_read,has_attachments,in_reply_to,reference_ids,delivery_status,delivery_error) VALUES (?1,?2,?3,'outbound',?4,?5,?6,?7,?8,?9,?10,?11,?12,?12,1,?13,?14,?15,?16,?17)`).bind(id, cloudflareMessageId, threadId, env.PRIMARY_ADDRESS, JSON.stringify(to), JSON.stringify(cc), JSON.stringify(bcc), subject, preview(text), text, textToHtml(text), nowIso, attachmentRows.length ? 1 : 0, replyTarget?.message_id ?? null, references, status, deliveryError),
    ...attachmentRows.map(({ id: attachmentId, key, upload }) => env.DB.prepare("INSERT INTO attachments (id, message_id, filename, content_type, size, r2_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(attachmentId, id, upload.filename, upload.type, upload.content.byteLength, key)),
    env.DB.prepare("UPDATE threads SET latest_message_at = ?2, message_count = message_count + 1, subject = ?3 WHERE id = ?1").bind(threadId, nowIso, subject),
  ]);
  if (status === "failed") return Response.json({ error: userDeliveryError(deliveryError ?? ""), messageId: id }, { status: 502 });
  if (draftId) await env.DB.prepare("DELETE FROM drafts WHERE id = ?1").bind(draftId).run();
  return Response.json({ ok: true, messageId: id, providerMessageId: cloudflareMessageId }, { status: 201 });
}

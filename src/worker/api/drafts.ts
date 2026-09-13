type DraftRow = {
  id: string;
  thread_id: string | null;
  to_addresses: string;
  cc_addresses: string;
  bcc_addresses: string;
  subject: string;
  body_text: string;
  reply_to_message_id: string | null;
  forward_message_id: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_BODY_CHARS = 500_000;
const MAX_SUBJECT_CHARS = 500;

function parseArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function splitRecipients(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(/[;,\n]+/).map((part) => part.trim()).filter(Boolean))].slice(0, 50);
}

function draftResponse(row: DraftRow) {
  return {
    id: row.id,
    threadId: row.thread_id,
    to: parseArray(row.to_addresses).join(", "),
    cc: parseArray(row.cc_addresses).join(", "),
    bcc: parseArray(row.bcc_addresses).join(", "),
    subject: row.subject,
    text: row.body_text,
    replyToMessageId: row.reply_to_message_id ?? "",
    forwardMessageId: row.forward_message_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDraft(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, thread_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text,
            reply_to_message_id, forward_message_id, created_at, updated_at
       FROM drafts WHERE id = ?1`,
  ).bind(id).first<DraftRow>();

  if (!row) return Response.json({ error: "Draft not found" }, { status: 404 });
  return Response.json({ draft: draftResponse(row) });
}

export async function saveDraft(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  const id = requestedId || crypto.randomUUID();
  const to = splitRecipients(body.to);
  const cc = splitRecipients(body.cc);
  const bcc = splitRecipients(body.bcc);
  const subject = typeof body.subject === "string" ? body.subject.slice(0, MAX_SUBJECT_CHARS) : "";
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_BODY_CHARS) : "";
  const replyToMessageId = typeof body.replyToMessageId === "string" && body.replyToMessageId.trim() ? body.replyToMessageId.trim() : null;
  const forwardMessageId = typeof body.forwardMessageId === "string" && body.forwardMessageId.trim() ? body.forwardMessageId.trim() : null;

  if (replyToMessageId && forwardMessageId) {
    return Response.json({ error: "A draft cannot be both a reply and a forward" }, { status: 400 });
  }

  let threadId: string | null = null;
  if (replyToMessageId) {
    const target = await env.DB.prepare("SELECT thread_id FROM messages WHERE id = ?1")
      .bind(replyToMessageId)
      .first<{ thread_id: string }>();
    if (!target) return Response.json({ error: "Reply target was not found" }, { status: 404 });
    threadId = target.thread_id;
  }

  if (forwardMessageId) {
    const target = await env.DB.prepare("SELECT id FROM messages WHERE id = ?1")
      .bind(forwardMessageId)
      .first<{ id: string }>();
    if (!target) return Response.json({ error: "Forward target was not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO drafts (
       id, thread_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text, body_html,
       reply_to_message_id, forward_message_id, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', ?8, ?9, ?10, ?10)
     ON CONFLICT(id) DO UPDATE SET
       thread_id = excluded.thread_id,
       to_addresses = excluded.to_addresses,
       cc_addresses = excluded.cc_addresses,
       bcc_addresses = excluded.bcc_addresses,
       subject = excluded.subject,
       body_text = excluded.body_text,
       body_html = '',
       reply_to_message_id = excluded.reply_to_message_id,
       forward_message_id = excluded.forward_message_id,
       updated_at = excluded.updated_at`,
  ).bind(
    id,
    threadId,
    JSON.stringify(to),
    JSON.stringify(cc),
    JSON.stringify(bcc),
    subject,
    text,
    replyToMessageId,
    forwardMessageId,
    nowIso,
  ).run();

  const row = await env.DB.prepare(
    `SELECT id, thread_id, to_addresses, cc_addresses, bcc_addresses, subject, body_text,
            reply_to_message_id, forward_message_id, created_at, updated_at
       FROM drafts WHERE id = ?1`,
  ).bind(id).first<DraftRow>();

  if (!row) return Response.json({ error: "Draft could not be saved" }, { status: 500 });
  return Response.json({ draft: draftResponse(row) });
}

export async function deleteDraft(id: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare("DELETE FROM drafts WHERE id = ?1").bind(id).run();
  if (!result.meta.changes) return Response.json({ error: "Draft not found" }, { status: 404 });
  return Response.json({ ok: true });
}

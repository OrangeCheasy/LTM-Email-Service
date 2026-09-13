type Folder = "inbox" | "starred" | "sent" | "archive" | "trash";

type MessageRow = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  to_addresses: string;
  cc_addresses: string;
  bcc_addresses: string;
  subject: string;
  preview: string;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  sent_at: string | null;
  is_read: number;
  is_starred: number;
  is_archived: number;
  is_deleted: number;
  has_attachments: number;
  in_reply_to: string | null;
  reference_ids: string | null;
  delivery_status: string | null;
  delivery_error: string | null;
};

type AttachmentRow = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  r2_key: string;
};

const folderWhere: Record<Folder, string> = {
  inbox: "direction = 'inbound' AND is_archived = 0 AND is_deleted = 0",
  starred: "is_starred = 1 AND is_deleted = 0",
  sent: "direction = 'outbound' AND is_deleted = 0",
  archive: "is_archived = 1 AND is_deleted = 0",
  trash: "is_deleted = 1",
};

function folderFrom(value: string | null): Folder {
  return value && value in folderWhere ? (value as Folder) : "inbox";
}

function parseArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toListItem(row: MessageRow) {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    fromAddress: row.from_address,
    fromName: row.from_name,
    toAddresses: parseArray(row.to_addresses),
    subject: row.subject,
    preview: row.preview,
    receivedAt: row.received_at,
    sentAt: row.sent_at,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    isArchived: Boolean(row.is_archived),
    isDeleted: Boolean(row.is_deleted),
    hasAttachments: Boolean(row.has_attachments),
    deliveryStatus: row.delivery_status,
  };
}

export async function listMessages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const folder = folderFrom(url.searchParams.get("folder"));
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 200);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;

  let where = folderWhere[folder];
  const bindings: Array<string | number> = [];
  if (search) {
    where += " AND (LOWER(subject) LIKE ? OR LOWER(from_address) LIKE ? OR LOWER(COALESCE(from_name, '')) LIKE ? OR LOWER(preview) LIKE ?)";
    const term = `%${search}%`;
    bindings.push(term, term, term, term);
  }
  bindings.push(limit);

  const result = await env.DB.prepare(
    `SELECT id, thread_id, direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
            subject, preview, body_text, body_html, received_at, sent_at, is_read, is_starred, is_archived,
            is_deleted, has_attachments, in_reply_to, reference_ids, delivery_status, delivery_error
       FROM messages
      WHERE ${where}
      ORDER BY COALESCE(sent_at, received_at) DESC
      LIMIT ?`,
  ).bind(...bindings).all<MessageRow>();

  const unread = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM messages WHERE direction = 'inbound' AND is_archived = 0 AND is_deleted = 0 AND is_read = 0",
  ).first<{ count: number }>();

  return Response.json({ folder, unreadCount: unread?.count ?? 0, messages: result.results.map(toListItem) });
}

export async function getMessage(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, thread_id, direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
            subject, preview, body_text, body_html, received_at, sent_at, is_read, is_starred, is_archived,
            is_deleted, has_attachments, in_reply_to, reference_ids, delivery_status, delivery_error
       FROM messages WHERE id = ?1`,
  ).bind(id).first<MessageRow>();

  if (!row) return Response.json({ error: "Message not found" }, { status: 404 });

  if (!row.is_read) {
    await env.DB.prepare("UPDATE messages SET is_read = 1 WHERE id = ?1").bind(id).run();
    row.is_read = 1;
  }

  const attachments = await env.DB.prepare(
    "SELECT id, filename, content_type, size, r2_key FROM attachments WHERE message_id = ?1 ORDER BY created_at ASC",
  ).bind(id).all<AttachmentRow>();

  return Response.json({
    message: {
      ...toListItem(row),
      ccAddresses: parseArray(row.cc_addresses),
      bccAddresses: parseArray(row.bcc_addresses),
      bodyText: row.body_text ?? row.preview,
      bodyHtmlAvailable: Boolean(row.body_html),
      inReplyTo: row.in_reply_to,
      references: row.reference_ids,
      deliveryError: row.delivery_error,
      attachments: attachments.results.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        size: attachment.size,
      })),
    },
  });
}

export async function patchMessage(request: Request, id: string, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const allowed: Array<[string, string]> = [
    ["isRead", "is_read"],
    ["isStarred", "is_starred"],
    ["isArchived", "is_archived"],
    ["isDeleted", "is_deleted"],
  ];
  const sets: string[] = [];
  const values: number[] = [];

  for (const [property, column] of allowed) {
    if (typeof body[property] === "boolean") {
      sets.push(`${column} = ?`);
      values.push(body[property] ? 1 : 0);
    }
  }

  if (sets.length === 0) return Response.json({ error: "No supported fields supplied" }, { status: 400 });

  const result = await env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();

  if (!result.meta.changes) return Response.json({ error: "Message not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function downloadAttachment(id: string, env: Env): Promise<Response> {
  const attachment = await env.DB.prepare(
    "SELECT id, filename, content_type, size, r2_key FROM attachments WHERE id = ?1",
  ).bind(id).first<AttachmentRow>();
  if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });

  const object = await env.MAIL.get(attachment.r2_key);
  if (!object) return Response.json({ error: "Attachment data is unavailable" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.content_type || "application/octet-stream",
      "Content-Length": String(attachment.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type Folder = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash";
type MessageFolder = Exclude<Folder, "drafts">;

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

type DraftListRow = {
  id: string;
  thread_id: string | null;
  to_addresses: string;
  subject: string;
  body_text: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size: number;
  r2_key: string;
};

const messageFolderWhere: Record<MessageFolder, string> = {
  inbox: "direction = 'inbound' AND is_archived = 0 AND is_deleted = 0",
  starred: "is_starred = 1 AND is_deleted = 0",
  sent: "direction = 'outbound' AND is_archived = 0 AND is_deleted = 0",
  archive: "is_archived = 1 AND is_deleted = 0",
  trash: "is_deleted = 1",
};

const folders = new Set<Folder>(["inbox", "starred", "sent", "drafts", "archive", "trash"]);

function folderFrom(value: string | null): Folder {
  return value && folders.has(value as Folder) ? (value as Folder) : "inbox";
}

function parseArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function preview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
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
    isDraft: false,
  };
}

function toDraftListItem(row: DraftListRow, primaryAddress: string) {
  return {
    id: row.id,
    threadId: row.thread_id ?? row.id,
    direction: "outbound" as const,
    fromAddress: primaryAddress,
    fromName: "You",
    toAddresses: parseArray(row.to_addresses),
    subject: row.subject,
    preview: preview(row.body_text),
    receivedAt: row.updated_at,
    sentAt: null,
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDeleted: false,
    hasAttachments: false,
    deliveryStatus: "draft",
    isDraft: true,
  };
}

async function mailboxCounts(env: Env): Promise<{ unreadCount: number; draftCount: number }> {
  const [unread, drafts] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE direction = 'inbound' AND is_archived = 0 AND is_deleted = 0 AND is_read = 0",
    ).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM drafts").first<{ count: number }>(),
  ]);
  return { unreadCount: unread?.count ?? 0, draftCount: drafts?.count ?? 0 };
}

export async function listMessages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const folder = folderFrom(url.searchParams.get("folder"));
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 200);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const counts = await mailboxCounts(env);

  if (folder === "drafts") {
    let where = "1 = 1";
    const bindings: Array<string | number> = [];
    if (search) {
      where += " AND (LOWER(subject) LIKE ? OR LOWER(body_text) LIKE ? OR LOWER(to_addresses) LIKE ?)";
      const term = `%${search}%`;
      bindings.push(term, term, term);
    }
    bindings.push(limit);

    const result = await env.DB.prepare(
      `SELECT id, thread_id, to_addresses, subject, body_text, updated_at
         FROM drafts
        WHERE ${where}
        ORDER BY updated_at DESC
        LIMIT ?`,
    ).bind(...bindings).all<DraftListRow>();

    return Response.json({ folder, ...counts, messages: result.results.map((row) => toDraftListItem(row, env.PRIMARY_ADDRESS)) });
  }

  let where = messageFolderWhere[folder];
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

  return Response.json({ folder, ...counts, messages: result.results.map(toListItem) });
}

function detailFrom(row: MessageRow, attachments: AttachmentRow[]) {
  return {
    ...toListItem(row),
    ccAddresses: parseArray(row.cc_addresses),
    bccAddresses: parseArray(row.bcc_addresses),
    bodyText: row.body_text ?? row.preview,
    bodyHtmlAvailable: Boolean(row.body_html),
    inReplyTo: row.in_reply_to,
    references: row.reference_ids,
    deliveryError: row.delivery_error,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.content_type,
      size: attachment.size,
    })),
  };
}

export async function getMessage(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, thread_id, direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
            subject, preview, body_text, body_html, received_at, sent_at, is_read, is_starred, is_archived,
            is_deleted, has_attachments, in_reply_to, reference_ids, delivery_status, delivery_error
       FROM messages WHERE id = ?1`,
  ).bind(id).first<MessageRow>();

  if (!row) return Response.json({ error: "Message not found" }, { status: 404 });

  const unread = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM messages WHERE thread_id = ?1 AND direction = 'inbound' AND is_read = 0",
  ).bind(row.thread_id).first<{ count: number }>();
  const newlyReadCount = unread?.count ?? 0;

  if (newlyReadCount > 0) {
    await env.DB.prepare("UPDATE messages SET is_read = 1 WHERE thread_id = ?1 AND direction = 'inbound' AND is_read = 0")
      .bind(row.thread_id)
      .run();
    await env.DB.prepare("UPDATE threads SET is_read = 1 WHERE id = ?1").bind(row.thread_id).run();
  }

  const threadResult = await env.DB.prepare(
    `SELECT id, thread_id, direction, from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
            subject, preview, body_text, body_html, received_at, sent_at, is_read, is_starred, is_archived,
            is_deleted, has_attachments, in_reply_to, reference_ids, delivery_status, delivery_error
       FROM messages
      WHERE thread_id = ?1
      ORDER BY COALESCE(sent_at, received_at) ASC
      LIMIT 100`,
  ).bind(row.thread_id).all<MessageRow>();

  const messageIds = threadResult.results.map((item) => item.id);
  const attachmentMap = new Map<string, AttachmentRow[]>();
  if (messageIds.length > 0) {
    const placeholders = messageIds.map(() => "?").join(",");
    const attachments = await env.DB.prepare(
      `SELECT id, message_id, filename, content_type, size, r2_key
         FROM attachments
        WHERE message_id IN (${placeholders})
        ORDER BY created_at ASC`,
    ).bind(...messageIds).all<AttachmentRow>();

    for (const attachment of attachments.results) {
      const current = attachmentMap.get(attachment.message_id) ?? [];
      current.push(attachment);
      attachmentMap.set(attachment.message_id, current);
    }
  }

  const thread = threadResult.results.map((item) => detailFrom(item, attachmentMap.get(item.id) ?? []));
  const message = thread.find((item) => item.id === id);
  if (!message) return Response.json({ error: "Message not found" }, { status: 404 });

  return Response.json({ message, thread, newlyReadCount });
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
    "SELECT id, message_id, filename, content_type, size, r2_key FROM attachments WHERE id = ?1",
  ).bind(id).first<AttachmentRow>();
  if (!attachment) return Response.json({ error: "Attachment not found" }, { status: 404 });

  const object = await env.MAIL.get(attachment.r2_key);
  if (!object) return Response.json({ error: "Attachment data is unavailable" }, { status: 404 });

  const disposition = attachment.content_type.startsWith("image/") ? "inline" : "attachment";
  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.content_type || "application/octet-stream",
      "Content-Length": String(attachment.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

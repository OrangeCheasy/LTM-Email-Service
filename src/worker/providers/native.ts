import type { MailProvider, ProviderListOptions, ProviderMutation } from "./types";

type NativeMessageRow = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  to_addresses: string;
  subject: string;
  preview: string;
  received_at: string;
  sent_at: string | null;
  is_read: number;
  is_starred: number;
  is_archived: number;
  is_deleted: number;
  has_attachments: number;
  delivery_status: string | null;
};

const folderWhere = {
  inbox: "direction = 'inbound' AND is_archived = 0 AND is_deleted = 0",
  starred: "is_starred = 1 AND is_deleted = 0",
  sent: "direction = 'outbound' AND is_archived = 0 AND is_deleted = 0",
  archive: "is_archived = 1 AND is_deleted = 0",
  trash: "is_deleted = 1",
} as const;

function parseAddresses(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toListItem(row: NativeMessageRow) {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    fromAddress: row.from_address,
    fromName: row.from_name,
    toAddresses: parseAddresses(row.to_addresses),
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

export class NativeMailProvider implements MailProvider {
  readonly kind = "native" as const;
  readonly accountId = "native:primary";

  constructor(private readonly env: Env) {}

  get address(): string {
    return this.env.PRIMARY_ADDRESS;
  }

  async listMessages(options: ProviderListOptions): Promise<unknown[]> {
    let where = folderWhere[options.folder];
    const bindings: Array<string | number> = [];
    if (options.search) {
      where += " AND (LOWER(subject) LIKE ? OR LOWER(from_address) LIKE ? OR LOWER(COALESCE(from_name, '')) LIKE ? OR LOWER(preview) LIKE ?)";
      const term = `%${options.search.toLowerCase().slice(0, 200)}%`;
      bindings.push(term, term, term, term);
    }
    bindings.push(Math.max(1, Math.min(100, Math.floor(options.limit))));
    const result = await this.env.DB.prepare(`SELECT id, thread_id, direction, from_address, from_name, to_addresses, subject, preview, received_at, sent_at, is_read, is_starred, is_archived, is_deleted, has_attachments, delivery_status FROM messages WHERE ${where} ORDER BY COALESCE(sent_at, received_at) DESC LIMIT ?`).bind(...bindings).all<NativeMessageRow>();
    return result.results.map(toListItem);
  }

  async getMessage(id: string): Promise<unknown | null> {
    return this.env.DB.prepare("SELECT id, thread_id, direction, from_address, from_name, to_addresses, subject, preview, received_at, sent_at, is_read, is_starred, is_archived, is_deleted, has_attachments, delivery_status FROM messages WHERE id = ?1 LIMIT 1").bind(id).first<NativeMessageRow>();
  }

  async patchMessage(id: string, mutation: ProviderMutation): Promise<boolean> {
    const mapping: Array<[keyof ProviderMutation, string]> = [["isRead", "is_read"], ["isStarred", "is_starred"], ["isArchived", "is_archived"], ["isDeleted", "is_deleted"]];
    const sets: string[] = [];
    const values: number[] = [];
    for (const [key, column] of mapping) {
      const value = mutation[key];
      if (typeof value === "boolean") {
        sets.push(`${column} = ?`);
        values.push(value ? 1 : 0);
      }
    }
    if (!sets.length) return false;
    const result = await this.env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`).bind(...values, id).run();
    return Boolean(result.meta.changes);
  }
}

export function nativeProvider(env: Env): NativeMailProvider {
  return new NativeMailProvider(env);
}

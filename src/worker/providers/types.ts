export type MailProviderKind = "native" | "gmail";

export type MailFolder = "inbox" | "starred" | "sent" | "archive" | "trash";

export type ProviderListOptions = {
  folder: MailFolder;
  search: string;
  limit: number;
};

export type ProviderMutation = Partial<{
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDeleted: boolean;
}>;

export interface MailProvider {
  readonly kind: MailProviderKind;
  readonly accountId: string;
  readonly address: string;
  listMessages(options: ProviderListOptions): Promise<unknown[]>;
  getMessage(id: string): Promise<unknown | null>;
  patchMessage(id: string, mutation: ProviderMutation): Promise<boolean>;
}

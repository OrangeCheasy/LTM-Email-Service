export type HealthState = "checking" | "online" | "offline";
export type Folder = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash";
export type NotificationState = "checking" | "off" | "on" | "blocked" | "unsupported" | "unconfigured" | "working";

export type MessageListItem = {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  preview: string;
  receivedAt: string;
  sentAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  hasAttachments: boolean;
  deliveryStatus: string | null;
  isDraft?: boolean;
};

export type MessageDetail = MessageListItem & {
  ccAddresses: string[];
  bccAddresses: string[];
  bodyText: string;
  bodyHtmlAvailable: boolean;
  inReplyTo?: string | null;
  references?: string | null;
  deliveryError: string | null;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
};

export type DraftDetail = {
  id: string;
  threadId: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  replyToMessageId: string;
  forwardMessageId: string;
  createdAt: string;
  updatedAt: string;
};

export type ComposeState = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  replyToMessageId: string;
  forwardMessageId: string;
  draftId: string;
};

export type FolderDefinition = {
  key: Folder;
  label: string;
  icon: "inbox" | "star" | "send" | "draft" | "archive" | "trash";
};

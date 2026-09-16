interface EmailAddressInput {
  email: string;
  name?: string;
}

interface OutboundAttachmentInput {
  content: string | ArrayBuffer | ArrayBufferView;
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
  contentId?: string;
}

interface OutboundEmailInput {
  from: EmailAddressInput | string;
  to: EmailAddressInput | EmailAddressInput[] | string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: EmailAddressInput | EmailAddressInput[] | string | string[];
  bcc?: EmailAddressInput | EmailAddressInput[] | string | string[];
  replyTo?: EmailAddressInput | string;
  attachments?: OutboundAttachmentInput[];
  headers?: Record<string, string>;
}

interface EmailSendResult {
  messageId: string;
}

interface EmailServiceBinding {
  send(message: OutboundEmailInput): Promise<EmailSendResult>;
}

interface Env {
  DB: D1Database;
  MAIL: R2Bucket;
  ASSETS: Fetcher;
  EMAIL: EmailServiceBinding;
  PRIMARY_ADDRESS: string;
  FORWARD_TO: string;
  AUTH_SETUP_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PROVIDER_CREDENTIAL_KEY?: string;
}

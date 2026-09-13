interface EmailAddressInput {
  email: string;
  name?: string;
}

interface OutboundEmailInput {
  from: EmailAddressInput;
  to: EmailAddressInput | EmailAddressInput[] | string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: EmailAddressInput[] | string[];
  bcc?: EmailAddressInput[] | string[];
  replyTo?: EmailAddressInput | string;
  headers?: Record<string, string>;
}

interface EmailServiceBinding {
  send(message: OutboundEmailInput): Promise<unknown>;
}

interface Env {
  DB: D1Database;
  MAIL: R2Bucket;
  ASSETS: Fetcher;
  EMAIL: EmailServiceBinding;
  PRIMARY_ADDRESS: string;
  FORWARD_TO: string;
}

PRAGMA foreign_keys = ON;

-- Provider-neutral account registry. The existing Cloudflare mailbox is
-- represented by native:primary; OAuth providers will receive UUID account IDs.
CREATE TABLE IF NOT EXISTS connected_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('native', 'gmail')),
  provider_account_id TEXT,
  email_address TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reauth_required', 'disabled')),
  sync_cursor TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_account_id),
  UNIQUE(provider, email_address)
);

-- OAuth secrets deliberately live apart from account metadata. encrypted_blob
-- is reserved for authenticated encryption performed by the Worker; plaintext
-- access/refresh tokens must never be stored here.
CREATE TABLE IF NOT EXISTS provider_credentials (
  account_id TEXT PRIMARY KEY,
  encrypted_blob TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES connected_accounts(id) ON DELETE CASCADE
);

-- Maps local message/thread IDs to provider-native IDs without forcing Gmail's
-- model onto the existing RFC Message-ID based native mailbox.
CREATE TABLE IF NOT EXISTS provider_message_map (
  account_id TEXT NOT NULL,
  local_message_id TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  provider_thread_id TEXT,
  PRIMARY KEY (account_id, provider_message_id),
  UNIQUE(account_id, local_message_id),
  FOREIGN KEY (account_id) REFERENCES connected_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (local_message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider ON connected_accounts(provider, status);
CREATE INDEX IF NOT EXISTS idx_provider_message_map_local ON provider_message_map(local_message_id);
CREATE INDEX IF NOT EXISTS idx_provider_message_map_thread ON provider_message_map(account_id, provider_thread_id);

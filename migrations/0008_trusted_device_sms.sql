CREATE TABLE IF NOT EXISTS auth_trusted_devices (
  token_hash TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (credential_id) REFERENCES auth_credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_expires_at
  ON auth_trusted_devices (expires_at);

CREATE TABLE IF NOT EXISTS auth_sms_challenges (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL,
  verification_sid TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (credential_id) REFERENCES auth_credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sms_challenges_expires_at
  ON auth_sms_challenges (expires_at);

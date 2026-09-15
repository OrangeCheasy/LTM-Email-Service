CREATE TABLE IF NOT EXISTS oauth_states (
  id_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'gmail'),
  pkce_verifier_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);

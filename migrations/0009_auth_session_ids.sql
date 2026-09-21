ALTER TABLE auth_sessions ADD COLUMN session_id TEXT;

UPDATE auth_sessions
SET session_id = lower(hex(randomblob(16)))
WHERE session_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_session_id
  ON auth_sessions (session_id);

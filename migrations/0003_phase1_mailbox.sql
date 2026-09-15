ALTER TABLE drafts ADD COLUMN forward_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_reply_to_message_id ON drafts(reply_to_message_id);

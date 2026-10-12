-- Spine T10 (C105): caller_dm "sends" a direct message by writing one row here. There is no network call: the row is the
-- proof that the outward call ran (exactly once per approved hold).
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  text TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX outbox_by_time ON outbox (created_at DESC, id DESC);

-- Baseline (SDK-API §7.1): forward-only, one transaction per file, never edited after release.
-- App tables only; `tb_*` names are reserved for the SDK.
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX notes_by_time ON notes (created_at DESC, id DESC);

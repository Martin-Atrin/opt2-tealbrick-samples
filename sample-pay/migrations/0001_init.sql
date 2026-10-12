-- Baseline (SDK-API §7.1): forward-only, one transaction per file, never edited after release.
-- QA fixture: pretend payments. A row is the only effect of pay_test; no money ever moves. `tb_*` names are reserved.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 100),
  memo TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX payments_by_time ON payments (created_at DESC, id DESC);

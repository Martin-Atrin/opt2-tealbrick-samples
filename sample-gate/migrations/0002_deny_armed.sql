-- C82 probe (spine T8): texts with both "hold" and "deny" that gate_hold has already held once. gate_forbidden refuses
-- every later call with such a text, so the retry after the owner approved the hold is refused at the bridge.
-- Only the sha256 of the text is kept, never the text.
CREATE TABLE deny_armed (
  text_sha256 TEXT PRIMARY KEY,
  armed_at INTEGER NOT NULL
);

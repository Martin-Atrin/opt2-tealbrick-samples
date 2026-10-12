// Note store over the app's own table (migrations/0001_init.sql). Plain functions over the SDK's Db handle,
// so handlers stay thin and tests can run them against the migrated database.
import { ulid } from "@opt2-tealbrick/manifest";
import type { Db } from "@opt2-tealbrick/miniapp-sdk";

export interface Note {
  id: string;
  text: string;
  /** caller id: an agent (`agt_…`) or a companion app instance (`ins_…`) */
  createdBy: string;
  /** ISO 8601 */
  createdAt: string;
}

function toNote(row: Record<string, unknown>): Note {
  return { id: String(row.id), text: String(row.text), createdBy: String(row.created_by), createdAt: new Date(Number(row.created_at)).toISOString() };
}

/** Newest first. */
export function listNotes(db: Db, limit: number): Note[] {
  return db.prepare("SELECT id, text, created_by, created_at FROM notes ORDER BY created_at DESC, id DESC LIMIT ?").all(limit).map(toNote);
}

export function writeNote(db: Db, input: { text: string; createdBy: string }, now: number = Date.now()): Note {
  const id = `nte_${ulid(now)}`;
  db.prepare("INSERT INTO notes (id, text, created_by, created_at) VALUES (?, ?, ?, ?)").run(id, input.text, input.createdBy, now);
  return { id, text: input.text, createdBy: input.createdBy, createdAt: new Date(now).toISOString() };
}

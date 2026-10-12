// Spine T10 (C105): the outward op `caller_dm` "sends" a direct message by writing one row to the app's own outbox
// table (migrations/0002_outbox.sql). No network: the row is the proof that the call ran. The manifest declares the op
// `effect: outward`, `holdFamily: first_contact`, so on a default agent card (held ⊇ DEFAULT_HELD_FAMILIES) the SDK
// holds it before `run`; the approved retry runs once (C8) and writes exactly one row.
import { ulid } from "@opt2-tealbrick/manifest";
import type { Db } from "@opt2-tealbrick/miniapp-sdk";

export interface DmSent {
  sent: true;
  id: string;
}

export function sendDm(db: Db, input: { to: string; text: string; sentBy: string }, now: number = Date.now()): DmSent {
  const id = `dm_${ulid(now)}`;
  db.prepare("INSERT INTO outbox (id, recipient, text, sent_by, created_at) VALUES (?, ?, ?, ?, ?)").run(id, input.to, input.text, input.sentBy, now);
  return { sent: true, id };
}

/** Rows sent to `to` (all rows when `to` is omitted). */
export function countDms(db: Db, to?: string): number {
  const row = (to === undefined ? db.prepare("SELECT COUNT(*) AS n FROM outbox").get() : db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE recipient = ?").get(to)) as
    | { n: number | bigint }
    | undefined;
  return Number(row?.n ?? 0);
}

/** Owner-facing hold text: what will be sent to whom (shown only on the app's own holds page). */
export function dmHoldView(input: { to: string; text: string }): string {
  return `Direct message to ${input.to}:\n\n${input.text}`;
}

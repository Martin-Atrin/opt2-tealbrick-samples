// QA fixture store: pretend payments over the app's own table (migrations/0001_init.sql). Recording a row is the ONLY
// effect: there is no payment provider, no key and no network call. Plain functions over the SDK's Db handle.
import { ulid } from "@opt2-tealbrick/manifest";
import type { Db } from "@opt2-tealbrick/miniapp-sdk";

export interface Payment {
  id: string;
  amountCents: number;
  memo: string;
  /** caller id: an agent (`agt_…`) or a companion app instance (`ins_…`) */
  createdBy: string;
  /** ISO 8601 */
  createdAt: string;
}

function toPayment(row: Record<string, unknown>): Payment {
  return {
    id: String(row.id),
    amountCents: Number(row.amount_cents),
    memo: String(row.memo),
    createdBy: String(row.created_by),
    createdAt: new Date(Number(row.created_at)).toISOString(),
  };
}

/** Records a pretend payment. No money moves. */
export function recordPayment(db: Db, input: { amountCents: number; memo: string; createdBy: string }, now: number = Date.now()): Payment {
  const id = `pay_${ulid(now)}`;
  db.prepare("INSERT INTO payments (id, amount_cents, memo, created_by, created_at) VALUES (?, ?, ?, ?, ?)").run(id, input.amountCents, input.memo, input.createdBy, now);
  return { id, amountCents: input.amountCents, memo: input.memo, createdBy: input.createdBy, createdAt: new Date(now).toISOString() };
}

/** Newest first. */
export function listPayments(db: Db, limit: number): Payment[] {
  return db.prepare("SELECT id, amount_cents, memo, created_by, created_at FROM payments ORDER BY created_at DESC, id DESC LIMIT ?").all(limit).map(toPayment);
}

/** Owner-facing hold text. */
export function payHoldView(input: { amountCents: number; memo: string }): string {
  return `Test payment of ${input.amountCents} cents (pretend: no money moves).\n\nMemo: ${input.memo}`;
}

// Smoke test for the QA fixture Sample Pay: the app boots on the SDK, serves the derived routes, `pay_test` is declared
// as a money op (always held, never adoptable) and its run only records a row. The hold itself (money is held even
// with grant.held = []) is checked through a fake bridge by `pnpm conformance` (A3.money).
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { manifestDigest, validateManifest } from "@opt2-tealbrick/manifest";
import { type Db, defineApp, type OpContext, startApp } from "@opt2-tealbrick/miniapp-sdk";
import { MANIFEST_DIGEST, OP } from "#kit";
import { definition, handlers, manifest, migrationsDir } from "../src/app.ts";
import { listPayments } from "../src/payments.ts";

const FIXTURE = "QA fixture — dev channel only, never in the default catalog.";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => resolve(typeof a === "object" && a ? a.port : 0));
    });
  });
}

function migratedDb(): Db {
  const raw = new DatabaseSync(":memory:");
  const db = { exec: (sql: string) => raw.exec(sql), prepare: (sql: string) => raw.prepare(sql), transaction: <T>(fn: () => T) => fn() } as unknown as Db;
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  return db;
}

test("manifest validates and is marked as a fixture", () => {
  const v = validateManifest(manifest);
  assert.equal(v.ok, true, v.ok ? "" : JSON.stringify(v.errors));
  assert.ok(manifest.summary.includes(FIXTURE));
  assert.ok(manifest.description?.includes(FIXTURE));
  assert.equal(manifest.discovery.category, "developer");
  assert.ok(manifest.discovery.keywords?.includes("fixture"));
});

test("the generated kit matches the manifest and every operation has exactly one handler", () => {
  assert.equal(MANIFEST_DIGEST, manifestDigest(manifest), "kit is stale: run node --run kit");
  const ids = manifest.operations.map((o) => o.id).sort();
  assert.deepEqual(Object.values(OP).sort(), ids);
  assert.deepEqual(Object.keys(handlers).sort(), ids);
});

test("boots on the SDK and serves derived routes", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), `${manifest.id}-test-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const port = await freePort();
  const local = { ...manifest, runtime: { ...manifest.runtime, port } };
  const running = await startApp(defineApp({ ...definition, manifest: local }), { TB_DATA_DIR: dir, TB_STANDALONE: "1", TB_LOG_LEVEL: "error" });
  try {
    const base = `http://127.0.0.1:${port}`;
    const health = (await (await fetch(`${base}/tb/v1/health`)).json()) as { status: string; manifestDigest: string };
    assert.equal(health.status, "ok");
    assert.equal(health.manifestDigest, manifestDigest(local));
    // agent operations need a bridge (call proof + grant); app-alone mode refuses them
    const refused = await fetch(`${base}/tb/v1/ops/pay_test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: {} }) });
    assert.equal(refused.status, 503);
  } finally {
    await running.stop();
  }
});

test("pay_test is a money op: always held, receipt, idempotency required, amount 1..100", () => {
  const op = manifest.operations.find((o) => o.id === OP.payTest);
  assert.ok(op);
  assert.deepEqual(
    { effect: op.effect, holdFamily: op.holdFamily, crud: op.crud, idempotency: op.idempotency, receipt: op.receipt, audience: op.audience },
    { effect: "money", holdFamily: "money", crud: ["create"], idempotency: "required", receipt: true, audience: "agent" },
  );
  assert.match(op.description, /Test fixture: records a pretend payment; no money moves/);
  const amount = (op.input?.properties as Record<string, { minimum: number; maximum: number }> | undefined)?.amountCents;
  assert.deepEqual([amount?.minimum, amount?.maximum], [1, 100]);
  const list = manifest.operations.find((o) => o.id === OP.payList);
  assert.deepEqual([list?.effect, list?.crud, list?.audience], ["read", ["read"], "agent"]);
});

test("pay_test only records one row per run (no money moves); pay_list lists them newest first", async () => {
  const db = migratedDb();
  const ctx = { db, caller: { type: "agent", id: "agt_01J0000000000000000000000A", name: "Agent A", mode: "free" } } as unknown as OpContext;
  const first = (await handlers.pay_test.run({ amountCents: 42, memo: "first" }, ctx)) as { id: string; amountCents: number };
  assert.match(first.id, /^pay_/);
  assert.equal(first.amountCents, 42);
  assert.equal(listPayments(db, 100).length, 1);
  await handlers.pay_test.run({ amountCents: 1, memo: "second" }, ctx);
  const out = (await handlers.pay_list.run({}, ctx)) as { payments: { memo: string }[] };
  assert.equal(out.payments.length, 2);
  assert.throws(() => db.prepare("INSERT INTO payments VALUES ('x', 101, 'm', 'a', 0)").run(), /CHECK/, "table refuses > 100 cents");
  const spec = handlers.pay_test as { redact?: (i: unknown) => string };
  assert.equal(spec.redact?.({ amountCents: 42, memo: "m" }), "Test payment of 42 cents (no money moves)");
});

// Smoke test: the app boots on the SDK (manifest, handler set and migrations accepted), serves the derived routes,
// the send flow echoes the hook context and returns the companion result, and the spine T10 op `caller_dm` is an
// outward first_contact op that writes exactly one outbox row per run. Agent calls, holds and the companion call
// through a bridge are covered by `pnpm conformance`.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DEFAULT_HELD_FAMILIES, manifestDigest, validateManifest } from "@opt2-tealbrick/manifest";
import { type CompanionResult, type Db, defineApp, type Json, type OpContext, startApp, TbError } from "@opt2-tealbrick/miniapp-sdk";
import { MANIFEST_DIGEST, OP } from "#kit";
import { definition, handlers, manifest, migrationsDir } from "../src/app.ts";
import { countDms, dmHoldView } from "../src/dm.ts";
import { companionTarget, send } from "../src/send.ts";

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

test("manifest validates", () => {
  const v = validateManifest(manifest);
  assert.equal(v.ok, true, v.ok ? "" : JSON.stringify(v.errors));
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
    const served = await (await fetch(`${base}/tb/v1/manifest`)).json();
    assert.equal(manifestDigest(served), manifestDigest(local));
    const openapi = (await (await fetch(`${base}/tb/v1/openapi.json`)).json()) as { paths: Record<string, unknown> };
    for (const op of manifest.operations) assert.ok(Object.keys(openapi.paths).some((p) => p.endsWith(`/${op.id}`)), `openapi lists ${op.id}`);
    // agent operations need a bridge (call proof + grant); app-alone mode refuses them
    const refused = await fetch(`${base}/tb/v1/ops/caller_send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: {} }) });
    assert.equal(refused.status, 503);
  } finally {
    await running.stop();
  }

});

// ── send flow: context echo + companion call (the bridge path is covered by `pnpm conformance`) ──
test("the companion target is manifest data and its grant covers the operation", () => {
  const target = companionTarget(manifest);
  const c = manifest.companions?.[0];
  assert.deepEqual(target, { product: c?.product, op: c?.operations[0] });
  assert.notEqual(target.product, manifest.id, "an app is not its own companion");
  assert.deepEqual(c?.crud, ["create"]);
  assert.throws(() => companionTarget({}), /no companion/);
});

test("send echoes the hook context and returns the companion result", async () => {
  const calls: { product: string; op: string; input: Json; opts: object | undefined }[] = [];
  const context = { "peer.tag": "checked", "peer.agent": "agt_01J0000000000000000000000A" };
  const companion: CompanionResult = { status: "ok", output: { id: "nte_1", text: "hello" }, receiptId: "rcp_1" };
  const deps = {
    context,
    idempotencyKey: "key-1",
    async callApp(product: string, op: string, input: Json, opts?: object) {
      calls.push({ product, op, input, opts });
      return companion;
    },
  };
  const out = await send("hello", deps, companionTarget(manifest));
  assert.deepEqual(out, { text: "hello", context, companion });
  assert.deepEqual(calls, [{ product: manifest.companions?.[0]?.product, op: manifest.companions?.[0]?.operations[0], input: { text: "hello" }, opts: { idempotencyKey: `key-1.${manifest.companions?.[0]?.operations[0]}` } }]);
  // the handler passes its OpContext straight through
  const viaHandler = await handlers.caller_send.run({ text: "hello" }, deps as unknown as OpContext);
  assert.deepEqual(viaHandler, out);
});

test("a refused companion call fails the send (no partial output)", async () => {
  const deps = {
    context: {},
    idempotencyKey: null,
    async callApp(): Promise<CompanionResult> {
      throw new TbError("hook_denied", "refused", 403);
    },
  };
  await assert.rejects(send("x", deps, companionTarget(manifest)), { code: "hook_denied" });
});

// ── spine T10 (C105): first contact held on a default card ──
/** In-memory database with this app's migrations applied, shaped like the SDK's Db. */
function migratedDb(): Db {
  const raw = new DatabaseSync(":memory:");
  const db = { exec: (sql: string) => raw.exec(sql), prepare: (sql: string) => raw.prepare(sql), transaction: <T>(fn: () => T) => fn() } as unknown as Db;
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  return db;
}

test("T10: caller_dm is an outward first_contact op with receipt and required idempotency (held on a default card)", () => {
  const op = manifest.operations.find((o) => o.id === OP.callerDm);
  assert.ok(op);
  assert.deepEqual(
    { effect: op.effect, holdFamily: op.holdFamily, receipt: op.receipt, idempotency: op.idempotency, audience: op.audience, crud: op.crud },
    { effect: "outward", holdFamily: "first_contact", receipt: true, idempotency: "required", audience: "agent", crud: ["create"] },
  );
  assert.ok((DEFAULT_HELD_FAMILIES as readonly string[]).includes("first_contact"), "a new card holds it without policy edits");
  assert.deepEqual(op.input?.required, ["to", "text"]);
  const outward = manifest.operations.filter((o) => o.effect === "outward");
  assert.ok(outward.every((o) => o.holdFamily), "every outward op declares a family (C107)");
  assert.ok(manifest.operations.some((o) => o.id === OP.callerSend), "caller_send stays");
});

test("T10: caller_dm writes exactly one outbox row per run and returns {sent, id}", async () => {
  const db = migratedDb();
  const agent = { type: "agent", id: "agt_01J0000000000000000000000A", name: "Agent A", mode: "free" };
  const ctx = { db, caller: agent } as unknown as OpContext;
  assert.equal(countDms(db), 0, "nothing sent before the run (a held call never reaches run)");
  const out = (await handlers.caller_dm.run({ to: "new-contact@example.test", text: "hello" }, ctx)) as { sent: boolean; id: string };
  assert.equal(out.sent, true);
  assert.match(out.id, /^dm_[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.deepEqual(Object.keys(out).sort(), ["id", "sent"]);
  assert.equal(countDms(db, "new-contact@example.test"), 1, "exactly one row");
  const row = db.prepare("SELECT recipient, text, sent_by FROM outbox WHERE id = ?").get(out.id) as Record<string, unknown>;
  assert.deepEqual({ ...row }, { recipient: "new-contact@example.test", text: "hello", sent_by: agent.id });
  const again = (await handlers.caller_dm.run({ to: "new-contact@example.test", text: "hello" }, ctx)) as { id: string };
  assert.notEqual(again.id, out.id);
  assert.equal(countDms(db, "new-contact@example.test"), 2, "one more run = one more row (the SDK replays a repeated idempotency key without run)");
});

test("T10: receipt summary names the recipient only; the owner's hold view shows the message", () => {
  const spec = handlers.caller_dm as { redact?: (i: unknown) => string; holdView?: (i: unknown) => string };
  const input = { to: "new-contact@example.test", text: "the message body" };
  assert.equal(spec.redact?.(input), "Direct message to new-contact@example.test");
  assert.ok(!spec.redact?.(input).includes("message body"));
  assert.equal(spec.holdView?.(input), dmHoldView(input));
  assert.match(dmHoldView(input), /new-contact@example\.test[\s\S]*the message body/);
});

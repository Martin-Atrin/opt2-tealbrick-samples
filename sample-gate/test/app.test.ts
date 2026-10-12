// Smoke test: the app boots on the SDK (manifest, handler set, hook set and migrations accepted), serves the derived
// routes, its handlers work against the migrated table, and each hook behaves as declared. Agent calls and hook calls
// through a bridge are covered by `pnpm conformance`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { manifestDigest, validateManifest } from "@opt2-tealbrick/manifest";
import { type Db, defineApp, type HookContext, type HookRequest, type OpContext, startApp } from "@opt2-tealbrick/miniapp-sdk";
import { MANIFEST_DIGEST, OP } from "#kit";
import { definition, handlers, hooks, manifest } from "../src/app.ts";
import { REDACTED, redact, SLOW_MS, WORDS } from "../src/hooks.ts";
import { listNotes, writeNote } from "../src/notes.ts";

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

/** node:sqlite handle shaped like the SDK's Db (the SDK gives handlers the same interface). */
function openDb(file: string): { db: Db; close(): void } {
  const raw = new DatabaseSync(file);
  const db = { exec: (sql: string) => raw.exec(sql), prepare: (sql: string) => raw.prepare(sql), transaction: <T>(fn: () => T) => fn() };
  return { db: db as unknown as Db, close: () => raw.close() };
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

test("boots on the SDK, serves derived routes, handlers work on the migrated table", async (t) => {
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
    const refused = await fetch(`${base}/tb/v1/ops/gate_notes_list`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: {} }) });
    assert.equal(refused.status, 503);
  } finally {
    await running.stop();
  }

  const { db, close } = openDb(join(dir, "app.db"));
  t.after(close);
  const agent = { type: "agent", id: "agt_01J0000000000000000000000A", name: "Agent A", mode: "free" };
  const peer = { type: "app", id: "ins_01J0000000000000000000000B" };
  const ctx = (caller: object) => ({ db, caller }) as unknown as OpContext;

  const first = (await handlers.gate_note_write.run({ text: "first" }, ctx(agent))) as { id: string; createdBy: string };
  assert.match(first.id, /^nte_/);
  assert.equal(first.createdBy, agent.id);
  writeNote(db, { text: "from a companion app", createdBy: peer.id }, Date.now() + 1000);
  const all = (await handlers.gate_notes_list.run({}, ctx(agent))) as { notes: { text: string; createdBy: string }[] };
  assert.deepEqual(
    all.notes.map((n) => [n.text, n.createdBy]),
    [
      ["from a companion app", peer.id],
      ["first", agent.id],
    ],
    "newest first, companion notes included",
  );
  assert.equal(listNotes(db, 1).length, 1, "limited");
});

// ── hooks: behaviour of each manifest hook (the SDK route adds the proof check and the timeout) ──
const call = (input: unknown) => ({
  id: "call_01J00000000000000000000000",
  ws: "ws_01J000000000000000000000000",
  caller: { type: "agent", id: "agt_01J0000000000000000000000A", mode: "free" },
  target: { instance: "ins_01J0000000000000000000000C", product: manifest.hooks?.[0]?.match.products[0], op: manifest.hooks?.[0]?.match.operations?.[0], crud: ["create"], effect: "write" },
  ...(input === undefined ? {} : { input }),
});
const req = (phase: string, input: unknown, extra: object = {}) => ({ phase, call: call(input), context: {}, ...extra }) as unknown as HookRequest;
const hctx = (ms = 2000) => ({ signal: AbortSignal.timeout(ms) }) as unknown as HookContext;

test("every manifest hook has exactly one handler; ordering is declared", () => {
  const declared = (manifest.hooks ?? []).map((h) => h.id).sort();
  assert.deepEqual(Object.keys(hooks).sort(), declared);
  for (const h of manifest.hooks ?? []) {
    assert.equal(typeof h.order, "number", `${h.id} has an order`);
    assert.ok((h.timeoutMs ?? 2000) <= 2000);
  }
  const before = (manifest.hooks ?? []).filter((h) => h.phase === "before").sort((a, b) => a.order - b.order);
  assert.deepEqual(
    before.map((h) => h.id),
    ["gate_forbidden", "gate_timeout"],
    "refusal runs before the slow check",
  );
});

test("before hook refuses input text with the refuse word, allows other text", async () => {
  assert.deepEqual(await hooks.gate_forbidden(req("before", { text: `this is ${WORDS.refuse}` }), hctx()), { allow: false, reason: `blocked by ${manifest.id}` });
  assert.deepEqual(await hooks.gate_forbidden(req("before", { text: "hello" }), hctx()), { allow: true });
  assert.deepEqual(await hooks.gate_forbidden(req("before", undefined), hctx()), { allow: true }, "no input text = allow");
});

test("slow before hook outlasts the hook timeout only for the slow word", async () => {
  assert.deepEqual(await hooks.gate_timeout(req("before", { text: "quick" }), hctx()), { allow: true });
  assert.ok(SLOW_MS > 2000, "slower than the 2 s hook limit");
  const started = Date.now();
  await assert.rejects(hooks.gate_timeout(req("before", { text: `please ${WORDS.slow}` }), hctx(100)), { name: "AbortError" });
  assert.ok(Date.now() - started < 1000, "stops when the hook context aborts");
});

test("context hook adds namespaced tag and caller id", async () => {
  const out = (await hooks.gate_tag(req("context", { text: "x" }), hctx())) as { add: Record<string, unknown> };
  assert.deepEqual(out, { add: { [`${manifest.id}.tag`]: "checked", [`${manifest.id}.agent`]: "agt_01J0000000000000000000000A" } });
  assert.ok(Object.keys(out.add).every((k) => k.startsWith(`${manifest.id}.`)));
});

test("after hook redacts the word in every string of the output", async () => {
  const output = { text: "my Secret and secret", nested: { list: ["secret", 3, true, null] } };
  assert.deepEqual(await hooks.gate_redact(req("after", { text: "x" }, { output }), hctx()), {
    output: { text: `my ${REDACTED} and ${REDACTED}`, nested: { list: [REDACTED, 3, true, null] } },
  });
  assert.deepEqual(redact("plain", WORDS.redact), "plain");
});

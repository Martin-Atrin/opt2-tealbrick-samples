// Smoke test: the app boots on the SDK (manifest, handler set, hook set and migrations accepted), serves the derived
// routes, its handlers work against the migrated table, and each hook behaves as declared. Spine T8 (hook hold, C82
// refuse after approval) and T9 (holds overview over the wildcard companion) run here without a bridge. Agent calls and
// hook calls through a bridge are covered by `pnpm conformance`.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { HOOK_HOLD_FAMILIES, manifestDigest, requiredBridgeVersion, validateManifest } from "@opt2-tealbrick/manifest";
import { type CompanionResult, type Db, defineApp, type HookContext, type HookRequest, type Json, type OpContext, startApp, TbError } from "@opt2-tealbrick/miniapp-sdk";
import { MANIFEST_DIGEST, OP } from "#kit";
import { definition, handlers, hooks, manifest, migrationsDir } from "../src/app.ts";
import { HOLD, isArmed, REDACTED, redact, SLOW_MS, WORDS } from "../src/hooks.ts";
import { listNotes, writeNote } from "../src/notes.ts";
import { HOLDS_PENDING, holdsOverview, NO_CONSENT, type OverviewDeps, openUrlFor } from "../src/overview.ts";

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

/** In-memory database with this app's migrations applied (hooks and stores run against it). */
function migratedDb(): Db {
  const { db } = openDb(":memory:");
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(`${migrationsDir}/${f}`, "utf8"));
  return db;
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
const hookDb = migratedDb();
const hctx = (ms = 2000, db: Db = hookDb) => ({ signal: AbortSignal.timeout(ms), db }) as unknown as HookContext;

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
    ["gate_forbidden", "gate_hold", "gate_timeout"],
    "refusal runs before the hold and the slow check",
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

// ── spine T8 (G1 hook hold, C82 refuse after approval) ──
type BeforeAnswer = { allow: boolean; reason?: string; hold?: { family: string; reason: string } };

/** The bridge's before-chain precedence (BRIDGE G1): any refuse wins at once; else the FIRST hold is kept; else allow. */
async function beforeChain(text: string, db: Db): Promise<BeforeAnswer> {
  const chain = (manifest.hooks ?? []).filter((h) => h.phase === "before").sort((a, b) => a.order - b.order);
  let held: BeforeAnswer | null = null;
  for (const h of chain) {
    const handler = hooks[h.id];
    assert.ok(handler, h.id);
    const a = (await handler(req("before", { text }), hctx(2000, db))) as BeforeAnswer;
    if (!a.allow && !a.hold) return a;
    if (a.hold && !held) held = a;
  }
  return held ?? { allow: true };
}

test("T8: gate_hold answers a policy hold for 'hold' text, allows other text", async () => {
  assert.deepEqual(await hooks.gate_hold(req("before", { text: "please hold this" }), hctx()), { allow: false, hold: { family: "policy", reason: "needs owner review" } });
  assert.deepEqual(await hooks.gate_hold(req("before", { text: "hello" }), hctx()), { allow: true });
  assert.deepEqual(await hooks.gate_hold(req("before", undefined), hctx()), { allow: true });
  assert.ok((HOOK_HOLD_FAMILIES as readonly string[]).includes(HOLD.family));
  assert.ok(HOLD.reason.length >= 1 && HOLD.reason.length <= 280);
});

test("T8: the same 'hold' input is held on every call (the SDK's approved hold lets the retry run once)", async () => {
  const db = migratedDb();
  for (let i = 0; i < 3; i++) assert.deepEqual(await beforeChain("hold: send the report", db), { allow: false, hold: { ...HOLD } });
  assert.deepEqual(await beforeChain("send the report", db), { allow: true });
  assert.deepEqual((await beforeChain("hold forbidden", db)).reason, `blocked by ${manifest.id}`, "refuse beats hold");
});

test("T8 / C82: 'deny' refuses; a 'hold' + 'deny' text is held once, then every retry is refused at the bridge", async () => {
  const db = migratedDb();
  assert.deepEqual(await beforeChain("deny this", db), { allow: false, reason: `denied by ${manifest.id}` });
  const text = "hold and deny: pay the invoice";
  assert.equal(isArmed(db, text), false);
  assert.deepEqual(await beforeChain(text, db), { allow: false, hold: { ...HOLD } }, "first call: held (the owner approves it)");
  assert.equal(isArmed(db, text), true, "only the sha256 of the text is stored");
  assert.deepEqual(await beforeChain(text, db), { allow: false, reason: `denied by ${manifest.id}` }, "retry after approval: refused");
  assert.deepEqual(await beforeChain(text, db), { allow: false, reason: `denied by ${manifest.id}` }, "and stays refused");
  assert.deepEqual(await beforeChain("hold and deny: another text", db), { allow: false, hold: { ...HOLD } }, "a different input is held again");
  const stored = (db.prepare("SELECT * FROM deny_armed").all() as Record<string, unknown>[]).map((r) => Object.values(r).join(" "));
  assert.ok(stored.every((row) => !row.includes("invoice")), "no text stored");
});

// ── spine T9 (G4 wildcard companion + C82 consent) ──
test("T9: manifest declares the wildcard companion to tb.holds_pending, the person op and requires bridge 0.1.17", () => {
  assert.deepEqual(manifest.companions, [{ product: "*", operations: [HOLDS_PENDING], crud: ["read"], purpose: "Show the pending approvals of all apps" }]);
  assert.deepEqual(manifest.requires, { bridge: "0.1.17" });
  assert.equal(requiredBridgeVersion(manifest).bridge, "0.1.17");
  const op = manifest.operations.find((o) => o.id === OP.gateHoldsOverview);
  assert.equal(op?.audience, "person");
  assert.deepEqual([op?.crud, op?.effect, op?.receipt], [["read"], "read", false]);
});

const PORTAL = "https://portal.example.test";
const pendingItem = (id: string, createdAt: string) => ({
  id,
  product: "sample-caller",
  op: "caller_send",
  family: "policy",
  reason: "needs owner review",
  heldBy: `${manifest.id}/gate_hold`,
  summary: "Send text: the secret plan",
  caller: { type: "agent", id: "agt_01J0000000000000000000000A", name: "Agent A" },
  input: { text: "the secret plan" },
  createdAt,
  ageS: 5,
  decidePath: `/holds/${id}`,
});

function overviewDeps(targets: string[], answer: (product: string, input: Json) => CompanionResult): OverviewDeps & { calls: [string, string, Json][] } {
  const calls: [string, string, Json][] = [];
  return {
    calls,
    self: manifest.id,
    companionTargets: () => targets,
    async callApp(product, op, input) {
      calls.push([product, op, input]);
      return answer(product, input);
    },
    ownerLink: (path) => `${PORTAL}/w/ws_01J000000000000000000000000/open?product=${manifest.id}&path=${encodeURIComponent(path)}`,
  };
}

test("T9: before consent (no granted app) the overview is one no_grant refusal and calls nothing", async () => {
  const deps = overviewDeps([], () => {
    throw new Error("must not be called");
  });
  assert.deepEqual(await holdsOverview(deps), { targets: [], items: [], refused: [{ product: "*", code: "no_grant", message: NO_CONSENT }] });
  assert.equal(deps.calls.length, 0);
});

test("T9: after consent the overview lists the other apps' pending holds, summary fields only, across pages", async () => {
  const id1 = "hld_01J00000000000000000000001";
  const id2 = "hld_01J00000000000000000000002";
  const deps = overviewDeps(["sample-caller", manifest.id], (_product, input) => {
    const page2 = (input as { cursor?: string }).cursor === "c2";
    const out = page2 ? { items: [pendingItem(id1, "2026-10-13T10:00:00.000Z")], nextCursor: null } : { items: [pendingItem(id2, "2026-10-13T11:00:00.000Z")], nextCursor: "c2" };
    return { status: "ok", output: out as unknown as Json };
  });
  const out = await holdsOverview(deps);
  assert.deepEqual(out.targets, ["sample-caller"], "never its own product");
  assert.deepEqual(deps.calls, [
    ["sample-caller", HOLDS_PENDING, { limit: 100 }],
    ["sample-caller", HOLDS_PENDING, { limit: 100, cursor: "c2" }],
  ]);
  assert.deepEqual(out.refused, []);
  assert.deepEqual(
    out.items.map((i) => i.id),
    [id1, id2],
    "oldest first",
  );
  assert.deepEqual(out.items[0], {
    product: "sample-caller",
    id: id1,
    op: "caller_send",
    family: "policy",
    reason: "needs owner review",
    heldBy: `${manifest.id}/gate_hold`,
    decidePath: `/holds/${id1}`,
    openUrl: `${PORTAL}/w/ws_01J000000000000000000000000/open?product=sample-caller&path=%2Fholds%2F${id1}`,
    createdAt: "2026-10-13T10:00:00.000Z",
  });
  assert.ok(!JSON.stringify(out).includes("secret plan"), "no payload or summary text leaves the target app");
});

test("T9: an app without a grant (or after revoke) answers one no_grant entry; others still list", async () => {
  const deps = overviewDeps(["sample-caller"], (product) => {
    if (product === "other-app") throw new TbError("no_grant", `no companion grant for ${product} in the slice`, 403);
    return { status: "ok", output: { items: [pendingItem("hld_01J00000000000000000000003", "2026-10-13T10:00:00.000Z")], nextCursor: null } as unknown as Json };
  });
  const out = await holdsOverview(deps, ["other-app"]);
  assert.deepEqual(out.targets, ["other-app", "sample-caller"]);
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.refused, [{ product: "other-app", code: "no_grant", message: "no companion grant for other-app in the slice" }]);
});

test("T9: the person op handler uses the ctx's companion targets, callApp and ownerLink", async () => {
  const deps = overviewDeps([], () => ({ status: "ok", output: { items: [], nextCursor: null } }));
  const ctx = { companionTargets: deps.companionTargets, callApp: deps.callApp, ownerLink: deps.ownerLink } as unknown as OpContext;
  assert.deepEqual(await handlers.gate_holds_overview.run({}, ctx), { targets: [], items: [], refused: [{ product: "*", code: "no_grant", message: NO_CONSENT }] });
  assert.deepEqual(await handlers.gate_holds_overview.run({ products: ["sample-caller"] }, ctx), { targets: ["sample-caller"], items: [], refused: [] });
});

test("T9: launch links only when the SDK gives an own link", () => {
  assert.equal(openUrlFor({ self: manifest.id, ownerLink: () => null }, "x-app", "/holds/h"), null);
  assert.equal(
    openUrlFor({ self: manifest.id, ownerLink: () => { throw new TbError("path_invalid", "bad", 400); } }, "x-app", "/holds/h"),
    null,
  );
});

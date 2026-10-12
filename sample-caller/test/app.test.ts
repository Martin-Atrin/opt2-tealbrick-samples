// Smoke test: the app boots on the SDK (manifest, handler set and migrations accepted), serves the derived routes,
// and the send flow echoes the hook context and returns the companion result. Agent calls and the companion call
// through a bridge are covered by `pnpm conformance`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { manifestDigest, validateManifest } from "@opt2-tealbrick/manifest";
import { type CompanionResult, defineApp, type Json, type OpContext, startApp, TbError } from "@opt2-tealbrick/miniapp-sdk";
import { MANIFEST_DIGEST, OP } from "#kit";
import { definition, handlers, manifest } from "../src/app.ts";
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

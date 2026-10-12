// Smoke test for the QA fixture Sample Mismatch: the app boots on the SDK and SERVES a manifest whose digest differs from
// the released `tealbrick.manifest.json` (the release record's manifestDigest), on purpose. Everything else is a valid app.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { manifestDigest, validateManifest } from "@opt2-tealbrick/manifest";
import { defineApp, type OpContext, startApp } from "@opt2-tealbrick/miniapp-sdk";
import { MANIFEST_DIGEST, OP } from "#kit";
import { definition, handlers, manifest, RUNTIME_SUFFIX, releasedManifest } from "../src/app.ts";

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

test("both manifests validate; the released one is marked as a fixture", () => {
  for (const m of [releasedManifest, manifest]) {
    const v = validateManifest(m);
    assert.equal(v.ok, true, v.ok ? "" : JSON.stringify(v.errors));
  }
  assert.ok(releasedManifest.summary.includes(FIXTURE));
  assert.ok(releasedManifest.description?.includes("QA fixture: deliberately serves a manifest different from its release record"));
  assert.equal(releasedManifest.discovery.category, "developer");
});

test("the served manifest differs from the released one only in summary (different digest)", () => {
  assert.equal(manifest.summary, `${releasedManifest.summary}${RUNTIME_SUFFIX}`);
  assert.deepEqual({ ...manifest, summary: releasedManifest.summary }, releasedManifest);
  assert.notEqual(manifestDigest(manifest), manifestDigest(releasedManifest));
  assert.equal(MANIFEST_DIGEST, manifestDigest(releasedManifest), "the kit (and CI's release record) use the file");
  assert.deepEqual(Object.keys(handlers).sort(), Object.values(OP).sort());
});

test("boots on the SDK and reports the SERVED digest, not the release digest", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), `${manifest.id}-test-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const port = await freePort();
  const local = { ...manifest, runtime: { ...manifest.runtime, port } };
  const running = await startApp(defineApp({ ...definition, manifest: local }), { TB_DATA_DIR: dir, TB_STANDALONE: "1", TB_LOG_LEVEL: "error" });
  try {
    const base = `http://127.0.0.1:${port}`;
    const health = (await (await fetch(`${base}/tb/v1/health`)).json()) as { manifestDigest: string };
    assert.equal(health.manifestDigest, manifestDigest(local));
    const served = (await (await fetch(`${base}/tb/v1/manifest`)).json()) as { summary: string };
    assert.ok(served.summary.endsWith(RUNTIME_SUFFIX));
    const released = { ...releasedManifest, runtime: { ...releasedManifest.runtime, port } };
    assert.notEqual(health.manifestDigest, manifestDigest(released));
  } finally {
    await running.stop();
  }
});

test("the one op answers pong", async () => {
  assert.deepEqual(await handlers.mismatch_ping.run({}, {} as OpContext), { pong: true });
});

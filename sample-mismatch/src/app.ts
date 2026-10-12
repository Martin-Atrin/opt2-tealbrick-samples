// App definition (SDK-API §3). QA fixture — dev channel only, never in the default catalog.
// DELIBERATE DEFECT: the app serves a manifest that differs from its released `tealbrick.manifest.json`. `defineApp`
// gets the file's manifest with `summary` changed in code, so the digest the app reports (health, status push) differs
// from the release record's `manifestDigest` and the bridge refuses the instance (`manifest_mismatch`; StatusReport
// rejected kind `manifest`). Never copy this pattern into a real app: the manifest file is the only source.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AppDefinition, defineApp, type HandlerSpec, type SdkAppDefinition } from "@opt2-tealbrick/miniapp-sdk";
import { type MismatchPingInput, type MismatchPingOutput, OP, type OpId } from "#kit";

/** The released manifest (what CI signs into the release record). */
export const releasedManifest = JSON.parse(readFileSync(new URL("../tealbrick.manifest.json", import.meta.url), "utf8")) as AppDefinition["manifest"];
export const RUNTIME_SUFFIX = " (runtime)";
/** The manifest the app actually serves: the released one with `summary` changed. */
export const manifest: AppDefinition["manifest"] = { ...releasedManifest, summary: `${releasedManifest.summary}${RUNTIME_SUFFIX}` };
export const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

/** Typed handler. The SDK validates `input` against the manifest schema before `run` and the output after it. */
function op<I, O>(spec: HandlerSpec<I, O>): HandlerSpec {
  return spec as unknown as HandlerSpec;
}

export const handlers = {
  [OP.mismatchPing]: op<MismatchPingInput, MismatchPingOutput>({
    async run() {
      return { pong: true };
    },
  }),
} satisfies Record<OpId, HandlerSpec>;

export const definition: SdkAppDefinition = { manifest, handlers, migrations: migrationsDir };

export const app = defineApp(definition);

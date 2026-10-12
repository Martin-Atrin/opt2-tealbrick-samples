// App definition (SDK-API §3). The manifest is the only source: the SDK derives routes, input/output validation,
// OpenAPI, receipts, holds, idempotency, backups and status from it. This file registers exactly one handler per
// manifest operation id. Op ids and input/output types come from the kit that `tb-gen kit` generates from the
// manifest (`#kit`, built by `node --run kit`); none is written by hand. The companion product is manifest data.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AppDefinition, defineApp, type HandlerSpec, type SdkAppDefinition } from "@opt2-tealbrick/miniapp-sdk";
import { type CallerSendInput, type CallerSendOutput, OP, type OpId } from "#kit";
import { companionTarget, send } from "./send.ts";

export const manifest = JSON.parse(readFileSync(new URL("../tealbrick.manifest.json", import.meta.url), "utf8")) as AppDefinition["manifest"];
export const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

/** Typed handler. The SDK validates `input` against the manifest schema before `run` and the output after it. */
function op<I, O>(spec: HandlerSpec<I, O>): HandlerSpec {
  return spec as unknown as HandlerSpec;
}

const target = companionTarget(manifest);

export const handlers = {
  [OP.callerSend]: op<CallerSendInput, CallerSendOutput>({
    // Idempotency (manifest "required") is the SDK's: a repeated key returns the stored result without calling run.
    async run(input, ctx) {
      return (await send(input.text, ctx, target)) as CallerSendOutput;
    },
  }),
} satisfies Record<OpId, HandlerSpec>;

export const definition: SdkAppDefinition = { manifest, handlers, migrations: migrationsDir };

export const app = defineApp(definition);

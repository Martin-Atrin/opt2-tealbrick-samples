// App definition (SDK-API §3). The manifest is the only source: the SDK derives routes, input/output validation,
// OpenAPI, receipts, holds, idempotency, backups and status from it. This file registers exactly one handler per
// manifest operation id and one handler per manifest hook id. Op ids and input/output types come from the kit that
// `tb-gen kit` generates from the manifest (`#kit`, built by `node --run kit`); none is written by hand.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AppDefinition, defineApp, type HandlerSpec, type SdkAppDefinition, type SdkOpContext } from "@opt2-tealbrick/miniapp-sdk";
import {
  type GateHoldsOverviewInput,
  type GateHoldsOverviewOutput,
  type GateNotesListInput,
  type GateNotesListOutput,
  type GateNoteWriteInput,
  type GateNoteWriteOutput,
  OP,
  type OpId,
} from "#kit";
import { makeHooks } from "./hooks.ts";
import { listNotes, writeNote } from "./notes.ts";
import { holdsOverview } from "./overview.ts";

export const manifest = JSON.parse(readFileSync(new URL("../tealbrick.manifest.json", import.meta.url), "utf8")) as AppDefinition["manifest"];
export const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

/** Typed handler. The SDK validates `input` against the manifest schema before `run` and the output after it. */
function op<I, O>(spec: HandlerSpec<I, O>): HandlerSpec {
  return spec as unknown as HandlerSpec;
}

export const handlers = {
  [OP.gateNoteWrite]: op<GateNoteWriteInput, GateNoteWriteOutput>({
    // Idempotency (manifest "required") is the SDK's: a repeated key returns the stored result without calling run.
    // The caller is an agent or, through its companion grant, another app instance.
    async run(input, ctx) {
      return writeNote(ctx.db, { text: input.text, createdBy: ctx.caller.id });
    },
  }),
  [OP.gateNotesList]: op<GateNotesListInput, GateNotesListOutput>({
    async run(input, ctx) {
      return { notes: listNotes(ctx.db, input.limit ?? 50) };
    },
  }),
  // Person op (owner, app UI). Spine T9: the wildcard companion's per-app grants exist only after the owner's consent;
  // the SDK's person-op ctx has the app's companion grants (app-initiated calls, no parentCall).
  [OP.gateHoldsOverview]: op<GateHoldsOverviewInput, GateHoldsOverviewOutput>({
    async run(input, ctx) {
      const c = ctx as SdkOpContext;
      return (await holdsOverview(
        { self: manifest.id, companionTargets: () => c.companionTargets(), callApp: (p, o, i) => c.callApp(p, o, i), ownerLink: (path) => c.ownerLink(path) },
        input.products,
      )) as GateHoldsOverviewOutput;
    },
  }),
} satisfies Record<OpId, HandlerSpec>;

export const hooks = makeHooks(manifest.id);

export const definition: SdkAppDefinition = { manifest, handlers, hooks, migrations: migrationsDir };

export const app = defineApp(definition);

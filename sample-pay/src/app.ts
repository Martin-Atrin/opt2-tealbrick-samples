// App definition (SDK-API §3). QA fixture — dev channel only, never in the default catalog. The manifest is the only
// source: `pay_test` is declared `effect: money` / `holdFamily: money`, so the SDK ALWAYS holds it before `run` (CORE §7)
// and Core never offers it for adoption. `run` records a row; no money moves. Op ids and I/O types come from `#kit`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AppDefinition, defineApp, type HandlerSpec, type SdkAppDefinition } from "@opt2-tealbrick/miniapp-sdk";
import { OP, type OpId, type PayListInput, type PayListOutput, type PayTestInput, type PayTestOutput } from "#kit";
import { listPayments, payHoldView, recordPayment } from "./payments.ts";

export const manifest = JSON.parse(readFileSync(new URL("../tealbrick.manifest.json", import.meta.url), "utf8")) as AppDefinition["manifest"];
export const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

/** Typed handler. The SDK validates `input` against the manifest schema before `run` and the output after it. */
function op<I, O>(spec: HandlerSpec<I, O>): HandlerSpec {
  return spec as unknown as HandlerSpec;
}

export const handlers = {
  [OP.payTest]: op<PayTestInput, PayTestOutput>({
    // Runs only after the owner approved the money hold (approved retry runs once, C8). Records a row; no money moves.
    async run(input, ctx) {
      return recordPayment(ctx.db, { amountCents: input.amountCents, memo: input.memo, createdBy: ctx.caller.id });
    },
    redact: (input) => `Test payment of ${input.amountCents} cents (no money moves)`,
    holdView: payHoldView,
  }),
  [OP.payList]: op<PayListInput, PayListOutput>({
    async run(input, ctx) {
      return { payments: listPayments(ctx.db, input.limit ?? 50) };
    },
  }),
} satisfies Record<OpId, HandlerSpec>;

export const definition: SdkAppDefinition = { manifest, handlers, migrations: migrationsDir };

export const app = defineApp(definition);

// The send flow as a plain function of its dependencies, so tests run it without a bridge: echo the hook context the
// call received, then write the text as a note in the companion app (app→app through the bridge, SDK-API §9).
import type { AppDefinition, CompanionResult, Json } from "@opt2-tealbrick/miniapp-sdk";

export interface SendDeps {
  /** open hook context of this call ("<product>.<key>" → JSON) */
  context: Record<string, Json>;
  /** this call's idempotency key (manifest "required" for create ops) */
  idempotencyKey: string | null;
  callApp(product: string, op: string, input: Json, opts?: { idempotencyKey?: string }): Promise<CompanionResult>;
}

export interface SendOutput {
  text: string;
  context: Record<string, Json>;
  companion: Json;
  [k: string]: Json;
}

/** The one companion the manifest declares: target product and its single operation (data, not code). */
export function companionTarget(manifest: Pick<AppDefinition["manifest"], "companions">): { product: string; op: string } {
  const c = manifest.companions?.[0];
  const op = c?.operations[0];
  if (!c || !op) throw new Error("manifest declares no companion operation");
  return { product: c.product, op };
}

export async function send(text: string, deps: SendDeps, target: { product: string; op: string }): Promise<SendOutput> {
  // A derived key keeps the companion write idempotent when this call is repeated with the same key.
  const key = deps.idempotencyKey ? `${deps.idempotencyKey}.${target.op}` : undefined;
  const result = await deps.callApp(target.product, target.op, { text }, key ? { idempotencyKey: key } : {});
  return { text, context: deps.context, companion: result as unknown as Json };
}

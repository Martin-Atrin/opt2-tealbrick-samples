// Hook handlers (MANIFEST §8, BRIDGE §8.2). The bridge calls them for the operations the manifest `hooks[].match`
// names; which product and operation they gate is manifest data only. Each handler is a pure function of the hook
// request, so tests call them directly and the SDK route (`POST /tb/v1/hooks/<id>`) adds proof checks and the timeout.
import { setTimeout as sleep } from "node:timers/promises";
import type { HookContext, HookHandler, HookRequest, Json } from "@opt2-tealbrick/miniapp-sdk";

/** Words the hooks react to in the gated call's input text. */
export const WORDS = { refuse: "forbidden", slow: "timeout", redact: "secret" } as const;
export const REDACTED = "[redacted]";
/** Longer than any hook timeout (MANIFEST: timeoutMs ≤ 2000): the bridge must refuse the call (fail closed). */
export const SLOW_MS = 2500;

const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

/** The gated call's input text (`input.text`), or "" when the input has none. */
export function inputText(req: HookRequest): string {
  const input = req.call.input;
  return isObj(input) && typeof input.text === "string" ? input.text : "";
}

/** Every string in `v` with `word` replaced by REDACTED (case-insensitive), structure unchanged. */
export function redact(v: Json, word: string): Json {
  if (typeof v === "string") return v.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), REDACTED);
  if (Array.isArray(v)) return v.map((x) => redact(x, word));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, word)]));
  return v;
}

/** Builds the four handlers for the product `product` (its id prefixes context keys and names it in refusals). */
export function makeHooks(product: string): Record<string, HookHandler> {
  const before = (allow: boolean, reason?: string) => (allow ? { allow } : { allow, reason: reason ?? "" });
  return {
    async gate_forbidden(req) {
      return inputText(req).toLowerCase().includes(WORDS.refuse) ? before(false, `blocked by ${product}`) : before(true);
    },
    async gate_timeout(req, ctx: HookContext) {
      if (inputText(req).toLowerCase().includes(WORDS.slow)) await sleep(SLOW_MS, undefined, { signal: ctx.signal });
      return before(true);
    },
    async gate_tag(req) {
      return { add: { [`${product}.tag`]: "checked", [`${product}.agent`]: req.call.caller.id } };
    },
    async gate_redact(req) {
      const output = req.phase === "after" ? (req.output as Json) : null;
      return { output: redact(output, WORDS.redact) };
    },
  } as Record<string, HookHandler>;
}

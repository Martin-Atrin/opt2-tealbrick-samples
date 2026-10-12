// Hook handlers (MANIFEST §8, BRIDGE §8.2). The bridge calls them for the operations the manifest `hooks[].match`
// names; which product and operation they gate is manifest data only. Each handler is a function of the hook request
// (and, for the C82 probe, of the app's own `deny_armed` table), so tests call them directly and the SDK route
// (`POST /tb/v1/hooks/<id>`) adds proof checks and the timeout.
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { Db, HookContext, HookHandler, HookRequest, Json } from "@opt2-tealbrick/miniapp-sdk";

/** Words the hooks react to in the gated call's input text. */
export const WORDS = { refuse: "forbidden", slow: "timeout", redact: "secret", hold: "hold", deny: "deny" } as const;
export const REDACTED = "[redacted]";
/** Longer than any hook timeout (MANIFEST: timeoutMs ≤ 2000): the bridge must refuse the call (fail closed). */
export const SLOW_MS = 2500;
/** Spine T8 (G1): the hold verdict of `gate_hold`. `policy` = a policy app decided (owner-editable held families do not apply). */
export const HOLD = { family: "policy", reason: "needs owner review" } as const;

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

// ── C82 probe: "refuse still wins after approval" ──
// A text with both "hold" and "deny" is HELD on its first call (gate_hold arms it here); every later call with that
// text is REFUSED by gate_forbidden. So the agent's retry after the owner approved the hold is refused at the bridge
// and the approved action never runs. Any other text with "deny" is refused at once.
const textKey = (text: string) => createHash("sha256").update(text).digest("hex");

export function isArmed(db: Db, text: string): boolean {
  return db.prepare("SELECT 1 FROM deny_armed WHERE text_sha256 = ?").get(textKey(text)) !== undefined;
}

export function arm(db: Db, text: string, now: number = Date.now()): void {
  db.prepare("INSERT OR IGNORE INTO deny_armed (text_sha256, armed_at) VALUES (?, ?)").run(textKey(text), now);
}

/** Builds the hook handlers for the product `product` (its id prefixes context keys and names it in refusals). */
export function makeHooks(product: string): Record<string, HookHandler> {
  const allow = () => ({ allow: true });
  const refuse = (reason: string) => ({ allow: false, reason });
  return {
    async gate_forbidden(req, ctx: HookContext) {
      const text = inputText(req);
      const lower = text.toLowerCase();
      if (lower.includes(WORDS.refuse)) return refuse(`blocked by ${product}`);
      if (lower.includes(WORDS.deny)) {
        const firstHold = lower.includes(WORDS.hold) && !isArmed(ctx.db, text);
        if (!firstHold) return refuse(`denied by ${product}`);
      }
      return allow();
    },
    // Order 15: after gate_forbidden. Spine T8: `{allow: false, hold}` (G1); the bridge forwards the call with the
    // verdict in the call proof (`hv`), the target app holds it, and the approved retry runs once.
    async gate_hold(req, ctx: HookContext) {
      const text = inputText(req);
      const lower = text.toLowerCase();
      if (!lower.includes(WORDS.hold)) return allow();
      if (lower.includes(WORDS.deny)) arm(ctx.db, text);
      return { allow: false, hold: { ...HOLD } };
    },
    async gate_timeout(req, ctx: HookContext) {
      if (inputText(req).toLowerCase().includes(WORDS.slow)) await sleep(SLOW_MS, undefined, { signal: ctx.signal });
      return allow();
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

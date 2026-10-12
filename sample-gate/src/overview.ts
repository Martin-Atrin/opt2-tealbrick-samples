// Spine T9 (G4, C82): the owner's overview of the calls that wait for approval in ALL apps. Sample Gate declares the
// wildcard companion `{product: "*", operations: ["tb.holds_pending"], crud: ["read"]}`; Core mints one companion grant
// per app only after the owner's consent, and lists those apps in the slice `companionTargets`. A plain function of its
// dependencies, so tests run it without a bridge. It copies only summary fields, never an input payload.
import type { CompanionResult, Json } from "@opt2-tealbrick/miniapp-sdk";

export const HOLDS_PENDING = "tb.holds_pending";
/** pages of 100 per app; more is not an overview */
export const MAX_PAGES = 5;
export const NO_CONSENT =
  'No app has granted Sample Gate access yet. The owner must give the consent "This app can see the pending approvals of all apps".';

export interface OverviewDeps {
  /** this app's product id (never a target of its own overview) */
  self: string;
  /** ctx.companionTargets(): the products this app holds a companion grant for */
  companionTargets(): string[];
  callApp(product: string, op: string, input: Json): Promise<CompanionResult>;
  /** ctx.ownerLink(path): `<portalUrl>/w/<ws>/open?product=<self>&path=<path>`, or null until the slice has portalUrl */
  ownerLink(path: string): string | null;
}

export interface OverviewItem {
  product: string;
  id: string;
  op: string;
  family: string;
  reason: string;
  heldBy: string | null;
  /** the hold's decision page inside its app (`/holds/<id>`) */
  decidePath: string;
  /** Portal launch link that opens `decidePath` in its app (launch ticket with path), or null */
  openUrl: string | null;
  createdAt: string;
}

export interface OverviewRefusal {
  /** the product, or "*" when no app has granted access (no consent yet, or consent revoked) */
  product: string;
  code: string;
  message: string;
}

export interface Overview {
  targets: string[];
  items: OverviewItem[];
  refused: OverviewRefusal[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The launch link for another product's path. SPEC-GAP: the SDK only builds links into its OWN product
 * (`ctx.ownerLink`); the GUI route `/w/<ws>/open?product=&path=` (C86) is the same for every product, so the link is
 * derived from it by swapping `product`.
 */
export function openUrlFor(deps: Pick<OverviewDeps, "self" | "ownerLink">, product: string, path: string): string | null {
  try {
    const own = deps.ownerLink(path);
    if (!own) return null;
    const url = new URL(own);
    if (url.searchParams.get("product") !== deps.self) return null;
    url.searchParams.set("product", product);
    return url.toString();
  } catch {
    return null;
  }
}

function toItem(deps: OverviewDeps, product: string, raw: unknown): OverviewItem | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const decidePath = str(raw.decidePath);
  if (!id || !decidePath.startsWith("/holds/")) return null;
  return {
    product,
    id,
    op: str(raw.op),
    family: str(raw.family),
    reason: str(raw.reason),
    heldBy: typeof raw.heldBy === "string" ? raw.heldBy : null,
    decidePath,
    openUrl: openUrlFor(deps, product, decidePath),
    createdAt: str(raw.createdAt),
  };
}

async function pendingOf(deps: OverviewDeps, product: string): Promise<OverviewItem[] | OverviewRefusal> {
  const items: OverviewItem[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await deps.callApp(product, HOLDS_PENDING, cursor ? { limit: 100, cursor } : { limit: 100 });
      if (r.status !== "ok") return { product, code: "held", message: `${product} held the request` };
      const out = r.output;
      if (!isObj(out) || !Array.isArray(out.items)) return { product, code: "output_invalid", message: `${product} answered without items` };
      for (const raw of out.items) {
        const item = toItem(deps, product, raw);
        if (item) items.push(item);
      }
      cursor = typeof out.nextCursor === "string" && out.nextCursor ? out.nextCursor : null;
      if (!cursor) break;
    }
    return items;
  } catch (e) {
    const err = e as { code?: unknown; message?: unknown };
    return { product, code: typeof err.code === "string" ? err.code : "error", message: typeof err.message === "string" ? err.message : String(e) };
  }
}

/**
 * Asks every granted app (slice `companionTargets`) plus the explicitly named `products` for its pending holds. An app
 * without a grant answers one refusal entry (`no_grant`); with no app at all the overview answers one `no_grant` entry
 * for "*" (the owner has not consented, or revoked the consent).
 */
export async function holdsOverview(deps: OverviewDeps, products: readonly string[] = []): Promise<Overview> {
  const targets = [...new Set([...deps.companionTargets(), ...products])].filter((p) => p !== deps.self).sort();
  if (targets.length === 0) return { targets, items: [], refused: [{ product: "*", code: "no_grant", message: NO_CONSENT }] };
  const results = await Promise.all(targets.map((p) => pendingOf(deps, p)));
  const items: OverviewItem[] = [];
  const refused: OverviewRefusal[] = [];
  for (const r of results) {
    if (Array.isArray(r)) items.push(...r);
    else refused.push(r);
  }
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.product.localeCompare(b.product) || a.id.localeCompare(b.id));
  return { targets, items, refused };
}

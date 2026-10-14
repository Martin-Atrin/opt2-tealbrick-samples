// App pages over the SDK client hooks (session) inside the ONE app shell, <AppShell> from @opt2-tealbrick/ui
// (SDK-API §14). Dev-only spine-test fixture: it has no mockup and its id has no kit colour, so it gets the template
// look (neutral header with the Tealbrick lockup) and the shared standard pages from ./standard.tsx.
// Holds are decided on the Holds page, one call at a time (C8). Spine T9: the "All approvals" page shows the pending
// approvals of all apps (person op gate_holds_overview, summaries only).
import { callOp, useSession } from "@opt2-tealbrick/miniapp-sdk/client";
import { AppShell, Button, EmptyState, Notice, STANDARD_PAGES, Swatch, Tag, TextLink } from "@opt2-tealbrick/ui";
import { useCallback, useEffect, useState } from "react";
import { AgentsPage, errorMessage, HoldsPage, portalHref, standardRoutes, useHoldList, useNav } from "./standard.tsx";

const NAME = "Sample Gate";

/** Shell page id → path under the base `/a/sample-gate/` (manifest `ui.launchPath` = holds, `ui.configurePath` = agents). */
const { holds: HOLDS_PATH, agents: AGENTS_PATH } = standardRoutes();
const ROUTES = { holds: HOLDS_PATH, agents: AGENTS_PATH, overview: "approvals" };
const PAGES = [...STANDARD_PAGES.filter((p) => p.id in ROUTES), { id: "overview", label: "All approvals" }];

interface OverviewItem {
  product: string;
  id: string;
  op: string;
  family: string;
  reason: string;
  heldBy: string | null;
  decidePath: string;
  openUrl: string | null;
  createdAt: string;
}
interface Overview {
  targets: string[];
  items: OverviewItem[];
  refused: { product: string; code: string; message: string }[];
}

function AllApprovals() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setError(null);
    setLoading(true);
    callOp<Overview>("gate_holds_overview", {})
      .then(setData)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  return (
    <section className="app-page" aria-label="All approvals">
      <div className="page-head">
        <h1>All approvals</h1>
        <p className="tb-lede">The calls that wait for your approval in the other apps.</p>
      </div>
      {error ? (
        <Notice tone="needs-you" role="alert">
          <span className="tb-row">
            <span>The overview failed. {error}</span>
            <Button size="sm" onClick={load} disabled={loading}>
              Try again
            </Button>
          </span>
        </Notice>
      ) : null}
      {data === null ? (
        error ? null : (
          <p className="tb-soft" role="status">
            Loading the approvals of all apps.
          </p>
        )
      ) : (
        <>
          <div className="toolbar">
            <Button onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
          {data.refused.map((r) => (
            <Notice key={r.product} tone="needs-you" role="alert">
              {r.product === "*" ? "No app" : r.product}: {r.code}. {r.message}
            </Notice>
          ))}
          {data.items.length === 0 ? (
            <EmptyState title="No calls wait for approval in the other apps." />
          ) : (
            <div className="ruled">
              {data.items.map((h) => (
                <div className="item" key={`${h.product}/${h.id}`}>
                  <Swatch className="is-needs-you" />
                  <h3>{h.product}</h3>
                  <p>{h.reason}</p>
                  <span className="meta">
                    <Tag status="needs-you">{h.op}</Tag>
                    <Tag>{h.family}</Tag>
                    {h.heldBy ? <Tag>{`held by ${h.heldBy}`}</Tag> : null}
                  </span>
                  <div className="side">
                    {h.openUrl ? (
                      <TextLink href={h.openUrl} target="_top" rel="noopener">
                        Open to decide
                      </TextLink>
                    ) : (
                      <code className="mono">{h.decidePath}</code>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function App() {
  const { principal, status, signOut } = useSession();
  const nav = useNav(ROUTES, "holds");
  const holds = useHoldList();
  const [notice, setNotice] = useState<string | null>(null);
  const [portal] = useState(portalHref);
  const pages = PAGES.map((p) => (p.id === "holds" ? { ...p, badge: holds.holds?.length || null } : p));
  const signedIn = status === "signed_in" && principal;
  return (
    <AppShell
      title={NAME}
      portalHref={portal}
      pages={pages}
      current={nav.page}
      onNavigate={nav.go}
      pageHref={nav.href}
      actions={
        signedIn ? (
          <Button
            size="sm"
            onClick={() => {
              setNotice(null);
              signOut().catch(() => setNotice("Couldn’t sign you out. Check your connection and try again."));
            }}
          >
            Sign out
          </Button>
        ) : (
          <Tag status={status === "loading" ? "busy" : "needs-you"}>{status === "loading" ? "Loading" : "Signed out"}</Tag>
        )
      }
      banner={
        status === "signed_out" ? (
          <Notice tone="needs-you" role="alert">
            Open this app from Portal to sign in.
          </Notice>
        ) : notice ? (
          <Notice tone="needs-you" role="alert">
            {notice}
          </Notice>
        ) : null
      }
    >
      {!signedIn ? null : nav.page === "agents" ? (
        <AgentsPage />
      ) : nav.page === "overview" ? (
        <AllApprovals />
      ) : (
        <HoldsPage list={holds} only={nav.hold} empty="No calls wait for your approval." />
      )}
    </AppShell>
  );
}

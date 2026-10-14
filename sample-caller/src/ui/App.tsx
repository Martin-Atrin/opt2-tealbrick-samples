// App pages over the SDK client hooks (session) inside the ONE app shell, <AppShell> from @opt2-tealbrick/ui
// (SDK-API §14). Dev-only spine-test fixture: it has no mockup and its id has no kit colour, so it gets the template
// look (neutral header with the Tealbrick lockup) and the shared standard pages from ./standard.tsx.
// Holds are decided on the Holds page, one call at a time (C8).
import { useSession } from "@opt2-tealbrick/miniapp-sdk/client";
import { AppShell, Button, Notice, STANDARD_PAGES, Tag } from "@opt2-tealbrick/ui";
import { useState } from "react";
import { AgentsPage, HoldsPage, portalHref, standardRoutes, useHoldList, useNav } from "./standard.tsx";

const NAME = "Sample Caller";

/** Shell page id → path under the base `/a/sample-caller/` (manifest `ui.launchPath` = holds, `ui.configurePath` = agents). */
const { holds: HOLDS_PATH, agents: AGENTS_PATH } = standardRoutes();
const ROUTES = { holds: HOLDS_PATH, agents: AGENTS_PATH };
const PAGES = STANDARD_PAGES.filter((p) => p.id in ROUTES);

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
      {!signedIn ? null : nav.page === "agents" ? <AgentsPage /> : <HoldsPage list={holds} only={nav.hold} empty="No calls wait for your approval." />}
    </AppShell>
  );
}

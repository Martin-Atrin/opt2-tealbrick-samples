# Sample Gate

A Teal Brick opt2 sample miniapp (product id `sample-gate`) for the spine test, built on `@opt2-tealbrick/miniapp-sdk`.

- Operations: `gate_note_write` (write, idempotency required) and `gate_notes_list` (read). Agents and companion apps write notes.
- Person operation `gate_holds_overview` (owner, "All approvals" page, spine T9): asks every app in the slice `companionTargets` for `tb.holds_pending` and lists the pending holds (product, id, op, family, reason, heldBy, decidePath, launch link). It never copies a payload or a summary. An app without a grant gives one refusal entry (`no_grant`); with no granted app at all the list is one `no_grant` entry for `*` (no consent yet, or consent revoked).
- Companion: the wildcard `{product: "*", operations: ["tb.holds_pending"], crud: ["read"]}` (M-CP-3). Core mints the per-app grants only after the owner's consent "This app can see the pending approvals of all apps".
- `requires.bridge: "0.1.17"`: the hook hold verdict (G1, C104).
- Hooks on another product's operation (manifest `hooks[].match`, data only), in chain order:
  - `gate_forbidden` (before, 10): refuses input text with "forbidden"; refuses text with "deny" (C82 probe, see below).
  - `gate_hold` (before, 15, spine T8): text with "hold" → `{allow: false, hold: {family: "policy", reason: "needs owner review"}}`.
  - `gate_timeout` (before, 20): sleeps past the 2 s hook limit for "timeout".
  - `gate_tag` (context): adds `sample-gate.tag` and `sample-gate.agent`.
  - `gate_redact` (after): replaces "secret" with "[redacted]".
- C82 probe ("refuse still wins after approval"): the FIRST call with a text that contains both "hold" and "deny" is held (`gate_hold` stores the sha256 of the text in `deny_armed`). Every later call with that text is refused by `gate_forbidden`, so the retry after the owner's approval is refused at the bridge and the approved call does not run.

`tealbrick.manifest.json` is the only description of the app. The SDK derives the routes, input and output
validation, OpenAPI, receipts, holds, idempotency, scopes, backups and status from it. You write handlers by
operation id (`src/app.ts`) and plain migrations (`migrations/`).

## Layout

| Path | Content |
|---|---|
| `tealbrick.manifest.json` | identity, `requires`, runtime (data + backup volumes), operations, hooks, wildcard companion, skills, backups, UI paths |
| `src/app.ts` | `defineApp`: one typed handler per operation (op ids and I/O types from `#kit`), one handler per hook |
| `src/notes.ts` | the app's table access (plain functions over the SDK `Db`) |
| `src/hooks.ts` | the hook handlers (functions of the hook request; the C82 probe reads/writes `deny_armed`) |
| `src/overview.ts` | `gate_holds_overview` over `ctx.companionTargets()` + `ctx.callApp(p, "tb.holds_pending")` (plain function, tested without a bridge) |
| `src/main.ts` | `startApp(app, process.env)` |
| `src/ui/` | React UI (`<TbProvider>` + `<AppShell>` from `@opt2-tealbrick/ui`): holds (also `/holds/<id>`), All approvals (`/approvals`), agents; built to `dist/ui` |
| `migrations/` | `0001_init.sql` (notes), `0002_deny_armed.sql` (C82 probe); forward-only, never edit a released file |
| `skills/use-sample-gate/SKILL.md` | the agent skill (frontmatter `name`, `description`) |
| `scripts/build-ui.ts` | UI build without a bundler (tsc output + vendored modules + import map) |
| `gen/` (not committed) | `tb-gen` output; `node --run kit` generates the kit and compiles it to `dist/kit` (`#kit` import) |
| `Dockerfile` | `node:24-slim` pinned by digest, pnpm build to `dist/`, non-root, `CMD ["node", "dist/main.js"]` |

## Develop

```sh
pnpm install          # commit pnpm-lock.yaml: CI installs with --frozen-lockfile
# typecheck, test, conformance, build and start first run `tb-gen kit` (op ids + I/O types from the manifest)
pnpm typecheck && pnpm lint && pnpm test
pnpm build            # server to dist/, UI to dist/ui
pnpm conformance      # SDK conformance suite against this app (--test-roots: test Portal Root Keys)
TB_STANDALONE=1 TB_DATA_DIR=.data pnpm start   # app-alone mode: person UI only, no agent calls
```

## Environment

The SDK reads only `TB_*` variables (SDK-API §13). The deploy recipe sets them: `TB_INSTANCE_ID`,
`TB_ENROL_CODE`, `TB_BRIDGE_URL`, `TB_PORTAL_KEYS`, `TB_KEK`, `TB_DATA_DIR` (the `data` volume mount, `/data`)
and `TB_BACKUP_DIR` (`/data/backup`: one volume per service). Optional: `TB_LOG_LEVEL`, `TB_RESTORE_FROM`,
`TB_STANDALONE`. The listen port is the manifest `runtime.port`.

## Release

1. Set the same version in `package.json` and `tealbrick.manifest.json`.
2. Tag `v<semver>` (for example `v0.1.0`) and push the tag.
3. CI builds and publishes the image, then writes the signed release record from the manifest.

This app lives in the `opt2-tealbrick-samples` repository: one CI pipeline at the repository root (`.woodpecker/ci.yaml`,
`tealbrick-ci.json` with `paths` for both apps and one image per app, `opt2-tealbrick-samples-gate`). One `v<semver>` tag
releases both apps, so both manifests carry the same version.

## Dependency pins and caching
- `pnpm-lock.yaml` carries the sha512 integrity of every GitHub-release tarball (ci-v8, ci-v9.3). After changing an `@opt2-tealbrick/*` dependency run `pnpm install`, then `node <opt2-tealbrick-platform>/ci/tb-ci.ts pin-tarballs <this app dir>` and `pnpm install --frozen-lockfile`, and commit the lockfile.
- `pnpm build` writes the UI to `dist/ui/index.html` + `dist/ui/assets-<content hash>/`; the SDK serves index.html `no-cache` and the hashed directory immutable, so a deploy is visible at once (C61).

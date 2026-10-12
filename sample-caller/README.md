# Sample Caller

A Teal Brick opt2 sample miniapp (product id `sample-caller`) for the spine test, built on `@opt2-tealbrick/miniapp-sdk`.

- Operation `caller_send` (write, idempotency required): returns the hook `context` it received and the result of writing the text as a note in its companion app (`ctx.callApp` through the bridge with the companion grant).
- Operation `caller_dm` (spine T10, C105): `effect: outward`, `holdFamily: first_contact`, receipt, idempotency required, input `{to, text}`. It "sends" by writing one row to its own `outbox` table (no network) and returns `{sent: true, id}`. On a default agent card (held ⊇ `DEFAULT_HELD_FAMILIES`) the SDK holds it; the approved retry runs once.
- Manifest `companions[]`: product `sample-gate`, operation `gate_note_write`, crud `create` (data only; `src/send.ts` reads it).
- UI: the holds page also opens one hold at `/holds/<id>` (the `decidePath` of `tb.holds_pending`), so Inbox and Sample Gate's "All approvals" links open the hold.

`tealbrick.manifest.json` is the only description of the app. The SDK derives the routes, input and output
validation, OpenAPI, receipts, holds, idempotency, scopes, backups and status from it. You write handlers by
operation id (`src/app.ts`) and plain migrations (`migrations/`).

## Layout

| Path | Content |
|---|---|
| `tealbrick.manifest.json` | identity, runtime (data + backup volumes), operations, companions, skills, backups, UI paths |
| `src/app.ts` | `defineApp`: one typed handler per operation (op ids and I/O types from `#kit`) |
| `src/send.ts` | the send flow: context echo + companion call (plain function, tested without a bridge) |
| `src/dm.ts` | `caller_dm`: one outbox row per run, hold view for the owner |
| `src/main.ts` | `startApp(app, process.env)` |
| `src/ui/` | React UI (`<TbProvider>` + `<AppShell>` from `@opt2-tealbrick/ui`), built to `dist/ui` |
| `migrations/` | `0001_init.sql` (baseline), `0002_outbox.sql` (`caller_dm` rows); forward-only, never edit a released file |
| `skills/use-sample-caller/SKILL.md` | the agent skill (frontmatter `name`, `description`) |
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
`tealbrick-ci.json` with `paths` for both apps and one image per app, `opt2-tealbrick-samples-caller`). One `v<semver>` tag
releases both apps, so both manifests carry the same version.

## Dependency pins and caching
- `pnpm-lock.yaml` carries the sha512 integrity of every GitHub-release tarball (ci-v8, ci-v9.3). After changing an `@opt2-tealbrick/*` dependency run `pnpm install`, then `node <opt2-tealbrick-platform>/ci/tb-ci.ts pin-tarballs <this app dir>` and `pnpm install --frozen-lockfile`, and commit the lockfile.
- `pnpm build` writes the UI to `dist/ui/index.html` + `dist/ui/assets-<content hash>/`; the SDK serves index.html `no-cache` and the hashed directory immutable, so a deploy is visible at once (C61).

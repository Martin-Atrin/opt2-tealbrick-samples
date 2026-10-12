# Sample Gate

A Teal Brick opt2 sample miniapp (product id `sample-gate`) for the spine test, built on `@opt2-tealbrick/miniapp-sdk`.

- Operations: `gate_note_write` (write, idempotency required) and `gate_notes_list` (read). Agents and companion apps write notes.
- Hooks on another product's operation (manifest `hooks[].match`, data only): `gate_forbidden` (before, refuses input text with "forbidden"), `gate_timeout` (before, sleeps past the 2 s hook limit for "timeout"), `gate_tag` (context, adds `sample-gate.tag` and `sample-gate.agent`), `gate_redact` (after, replaces "secret" with "[redacted]").

`tealbrick.manifest.json` is the only description of the app. The SDK derives the routes, input and output
validation, OpenAPI, receipts, holds, idempotency, scopes, backups and status from it. You write handlers by
operation id (`src/app.ts`) and plain migrations (`migrations/`).

## Layout

| Path | Content |
|---|---|
| `tealbrick.manifest.json` | identity, runtime (data + backup volumes), operations, hooks, skills, backups, UI paths |
| `src/app.ts` | `defineApp`: one typed handler per operation (op ids and I/O types from `#kit`), one handler per hook |
| `src/notes.ts` | the app's table access (plain functions over the SDK `Db`) |
| `src/hooks.ts` | the hook handlers (pure functions of the hook request) |
| `src/main.ts` | `startApp(app, process.env)` |
| `src/ui/` | React UI (`<TbProvider>` + `<AppShell>` from `@opt2-tealbrick/ui`), built to `dist/ui` |
| `migrations/0001_init.sql` | baseline; forward-only, never edit a released file |
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
pnpm conformance      # SDK conformance suite against this app
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
- `pnpm-lock.yaml` carries the sha512 integrity of every GitHub-release tarball (ci-v8). After changing an `@opt2-tealbrick/*` dependency run `pnpm install`, then `node <opt2-tealbrick-platform>/ci/tb-ci.ts pin-tarballs <this app dir>` and `pnpm install --frozen-lockfile`, and commit the lockfile.
- `pnpm build` writes the UI to `dist/ui/index.html` + `dist/ui/assets-<content hash>/`; the SDK serves index.html `no-cache` and the hashed directory immutable, so a deploy is visible at once (C61).

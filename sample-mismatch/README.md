# Sample Mismatch

**QA fixture — dev channel only, never in the default catalog.** QA fixture: deliberately serves a manifest different
from its release record.

A Teal Brick opt2 fixture miniapp (product id `sample-mismatch`), built on `@opt2-tealbrick/miniapp-sdk`.

- `src/app.ts` passes `defineApp` the released `tealbrick.manifest.json` with `summary` + `" (runtime)"`. The digest the
  app reports (health, status push) therefore differs from the release record's `manifestDigest` (CI signs the file).
- Expected live result: the bridge refuses the instance (`manifest_mismatch`; StatusReport rejected kind `manifest`).
  Core's C104 gate (`requires.bridge`) does not block the deploy: the manifest file is valid and needs no new bridge.
- One agent read op `mismatch_ping` (`{pong: true}`); an agent should never reach it.
- Catalog: the manifest has no field that keeps an app out of the default catalog (the channel is a release field,
  MANIFEST §1). The fixture is marked by `summary`, `description`, `discovery.category: developer` and the keyword
  `fixture`; release it on the `dev` channel only.
- Conformance: `pnpm conformance` runs against the SERVED manifest (`scripts/served-manifest.ts` writes
  `served.manifest.json`, not committed) and passes without a waiver. `pnpm conformance:release` runs against the
  released file and FAILS on purpose: the fake bridge refuses every claim with `manifest_mismatch` (120 checks cannot
  boot), the same refusal the live bridge gives.

## Layout

| Path | Content |
|---|---|
| `tealbrick.manifest.json` | the RELEASED manifest (identity, runtime, one op, skills, backups, UI paths) |
| `src/app.ts` | the served manifest (summary changed) and the one handler |
| `src/main.ts` | `startApp(app, process.env)` |
| `scripts/served-manifest.ts` | writes the served manifest for `pnpm conformance` |
| `src/ui/` | React UI (holds, agents), built to `dist/ui` |
| `migrations/0001_init.sql` | baseline (no app table) |
| `skills/use-sample-mismatch/SKILL.md` | the agent skill |
| `Dockerfile` | `node:24-slim` pinned by digest, pnpm build to `dist/`, non-root |

## Develop

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
pnpm build
pnpm conformance
```

Release: one `v<semver>` tag of this repository releases every app folder listed in `tealbrick-ci.json` (image
`opt2-tealbrick-samples-mismatch`).

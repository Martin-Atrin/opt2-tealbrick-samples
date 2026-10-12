# Sample Pay

**QA fixture — dev channel only, never in the default catalog.** Test fixture: records a pretend payment; no money moves.

A Teal Brick opt2 fixture miniapp (product id `sample-pay`), built on `@opt2-tealbrick/miniapp-sdk`. QA uses it for the
live check that money operations are always held and never adoptable (`draft_ref_money` at device approve; filtered
out at device lookup).

- Operation `pay_test`: `effect: money`, `holdFamily: money`, crud `create`, idempotency required, receipt, input
  `{amountCents: 1..100, memo}`. The SDK holds every call for the owner (money is always held, CORE §7). After the
  approval the same call runs once and records one row in `payments`. There is no payment provider, no key, no network.
- Operation `pay_list` (read): the newest pretend payments.
- Catalog: the manifest has no field that keeps an app out of the default catalog (the channel is a release field,
  MANIFEST §1). The fixture is marked by `summary`, `description`, `discovery.category: developer` and the keyword
  `fixture`; release it on the `dev` channel only.

## Layout

| Path | Content |
|---|---|
| `tealbrick.manifest.json` | identity, runtime (data + backup volumes), operations, skills, backups, UI paths |
| `src/app.ts` | `defineApp`: one typed handler per operation (op ids and I/O types from `#kit`) |
| `src/payments.ts` | the `payments` table access and the owner's hold view |
| `src/main.ts` | `startApp(app, process.env)` |
| `src/ui/` | React UI (holds, also `/holds/<id>`; agents), built to `dist/ui` |
| `migrations/0001_init.sql` | baseline; forward-only, never edit a released file |
| `skills/use-sample-pay/SKILL.md` | the agent skill |
| `scripts/build-ui.ts` | UI build without a bundler |
| `Dockerfile` | `node:24-slim` pinned by digest, pnpm build to `dist/`, non-root |

## Develop

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
pnpm build
pnpm conformance      # SDK conformance suite (A3.money: held even with grant.held = [])
```

Release: same version in `package.json` and the manifest; one `v<semver>` tag of this repository releases every app
folder listed in `tealbrick-ci.json` (image `opt2-tealbrick-samples-pay`). After changing an `@opt2-tealbrick/*`
dependency: `pnpm install`, `node <opt2-tealbrick-platform>/ci/tb-ci.ts pin-tarballs .`, `pnpm install --frozen-lockfile`.

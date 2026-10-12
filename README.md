# opt2-tealbrick-samples

Teal Brick opt2: sample miniapps for the spine test (sample-gate, sample-caller).

**Status: opt2 build (clean-room v2 of Teal Brick), work in progress.** This repository is part of the opt2 build and lives under `Martin-Atrin` during the build; it moves to the Teal Brick organisation as one clean commit when opt2 is released. It is not the current production system.

Owner lane: Lead · Specs & SDK.

## No secrets policy

This repository is public. It must never contain secrets or personal data:

- No API keys, tokens, passwords, private keys, deployment secrets, `.env` files or connection strings. Use `.env.example` with placeholder values only.
- Runtime secrets live in the deployment platform (Railway variables, Woodpecker secrets) and are copied between services without printing them.
- No personal names, private agent configurations or customer data.
- Every push runs a secret scan (`.woodpecker/secret-scan.yaml`, gitleaks). GitHub secret scanning with push protection is enabled. Optional local guard: `pre-commit install`.
- If a secret is committed anyway: rotate it first, then remove it from history.

## Layout

| Path | Content |
|---|---|
| `sample-gate/` | miniapp `sample-gate`: notes + before/context/after hooks on `sample-caller`'s `caller_send` |
| `sample-caller/` | miniapp `sample-caller`: `caller_send` echoes its hook context and writes a note in `sample-gate` (companion call) |

Each app is a full project of its own (package.json, pnpm-lock.yaml with tarball integrity, Dockerfile, manifest,
tests), scaffolded with `create-tealbrick-miniapp` 0.1.3. Product ids appear only as manifest data.

## CI

Woodpecker CI (shared opt2 pipeline template ci-v8 from `opt2-tealbrick-platform`): one `.woodpecker/ci.yaml` at the
root; `tealbrick-ci.json` lists both app folders in `paths` and one image per app
(`opt2-tealbrick-samples-gate`, `opt2-tealbrick-samples-caller`). Every stage (install, typecheck, lint, test,
conformance, build, gen, images) runs per app folder. One `v<semver>` tag releases both apps (equal manifest versions).

## Language

New code is TypeScript (Node 24+). Swift only where the macOS app requires it.

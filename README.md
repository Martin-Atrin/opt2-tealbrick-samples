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
| `sample-gate/` | miniapp `sample-gate`: notes + before/context/after hooks on `sample-caller`'s `caller_send` (refuse, hold, timeout, tag, redact); wildcard companion to `tb.holds_pending` and the owner page "All approvals" |
| `sample-caller/` | miniapp `sample-caller`: `caller_send` echoes its hook context and writes a note in `sample-gate` (companion call); `caller_dm` is an outward first-contact op |
| `sample-pay/` | QA fixture — dev channel only, never in the default catalog: `pay_test` is a money op (always held, never adoptable) that records a pretend payment; no money moves |
| `sample-mismatch/` | QA fixture — dev channel only, never in the default catalog: deliberately serves a manifest different from its release record (bridge refuses it, `manifest_mismatch`) |

Each app is a full project of its own (package.json, pnpm-lock.yaml with tarball integrity, Dockerfile, manifest,
tests), scaffolded with `create-tealbrick-miniapp` 0.1.3 and kept on the conventions of 0.1.8. Product ids appear only
as manifest data.

## Spine tests T8, T9, T10 (v0.2.0)

Deploy both apps in one workspace (bridge ≥ 0.1.17; `sample-gate` declares `requires.bridge: "0.1.17"`). The owner
approves a hold on the app's holds page `/holds/<id>`, opened with the Portal launch ticket (Inbox link or the
"All approvals" link in Sample Gate).

**T8, hold from a hook (G1, C82)**
1. The agent calls `sample-caller__caller_send` with a text that contains "hold". The answer is `held`, reason "needs owner review", family `policy`, held by `sample-gate/gate_hold`.
2. The owner approves the hold on Sample Caller's holds page.
3. The agent repeats the same call (same input, same key). It runs once. A different text with "hold" is held again.
4. Refuse after approval: the agent calls with a NEW text that contains "hold" and "deny". It is held. The owner approves it.
5. The agent repeats that call. The bridge refuses it ("denied by sample-gate"). The approved call does not run (no new note in Sample Gate).

**T9, holds of all apps (G4, C82 consent)**
1. Before consent: Sample Gate, page "All approvals", shows `no_grant`.
2. The owner gives the consent "This app can see the pending approvals of all apps". With a T8 hold open, the page lists Sample Caller's hold (product, op, family, reason, decide link). It shows no payload.
3. The owner revokes the consent. The page shows `no_grant` again.
4. An agent that calls Sample Caller's standard op `tb.holds_pending` sees only its own holds.

**T10, first contact on a default card (C105)**
1. Create a new agent card with the defaults only.
2. The agent calls `sample-caller__caller_dm` with `{to, text}`. The answer is `held`, family `first_contact`, no `heldBy`. Nothing is sent.
3. The owner approves the hold. The agent repeats the same call. It runs once: one outbox row, answer `{sent: true, id}`.
4. The same call with a new key is held again (C8). On a card where the owner removed `first_contact`, the call runs without a hold.

## CI

Woodpecker CI (shared opt2 pipeline template ci-v9.3 from `opt2-tealbrick-platform`; images are published by the
GitHub Actions release workflow `.github/workflows/opt2-release.yml`): one `.woodpecker/ci.yaml` at the
root; `tealbrick-ci.json` lists both app folders in `paths` and one image per app
(`opt2-tealbrick-samples-gate`, `opt2-tealbrick-samples-caller`). Every stage (install, typecheck, lint, test,
conformance, build, gen, images) runs per app folder. One `v<semver>` tag releases all four apps (equal manifest versions). CAUTION: tb-ci picks the channel from the version (`-` pre-release → `dev`, else `stable`), so a plain `v0.2.0` tag would also publish the two fixtures on `stable`. Release the fixtures only with a pre-release version, or keep them out of `tealbrick-ci.json` for a stable tag.

## Language

New code is TypeScript (Node 24+). Swift only where the macOS app requires it.

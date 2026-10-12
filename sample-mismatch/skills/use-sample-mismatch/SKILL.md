---
name: use-sample-mismatch
description: Sample Mismatch is a QA fixture that the bridge refuses; agents cannot use it.
---
# Using Sample Mismatch

{{agent.name}}, Sample Mismatch is a QA fixture. It serves a manifest that differs from its release record, so the bridge refuses it.

- `sample-mismatch__mismatch_ping` answers `{pong: true}` only if the bridge lets the call through. Expect a refusal.
- Do not retry a refused call.

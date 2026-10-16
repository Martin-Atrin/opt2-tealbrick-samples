# Tealbrick sample apps (spine test fixtures): architecture

State: verified against the repo on 2026-10-16. Claims cite paths in this repo. Anything not verified is marked UNVERIFIED. For the whole system see the system `ARCHITECTURE.md` and `SYSTEM-OVERVIEW.md`.

## 1. The four apps

| App | Operations | Purpose |
|---|---|---|
| `sample-gate` | `gate_note_write` (write), `gate_notes_list` (read), `gate_holds_overview` (person) | Hooks: `gate_forbidden` (before, refuses text containing "forbidden"), `gate_hold` (before, hold verdict family `policy` when text contains "hold"), `gate_timeout` (before, sleeps past 2 s to prove fail closed), `gate_tag` (context), `gate_redact` (after, redacts "secret"). Wildcard companion `tb.holds_pending`. `requires.bridge: 0.1.17` |
| `sample-caller` | `caller_send` (write), `caller_dm` (outward, first_contact) | Echoes hook context; writes a note in sample-gate through a declared companion |
| `sample-pay` | `pay_test` (money, always held, never adoptable), `pay_list` | Pretend payment. No money moves |
| `sample-mismatch` | `mismatch_ping` | Serves `served.manifest.json`, which differs from the release record. The bridge must refuse it (`manifest_mismatch`) |

## 2. Spine tests

T1 before-hook refuses "forbidden"; T2 hook timeout fails closed; T3 context hook fields reach the caller; T4 app-to-app companion call writes a note; T5 after-hook redaction; T6 zero platform change (no commit in portal-core, portal-gui or bridge mentions the samples); T7 owner can disable a hook subscription. T8 hold from a hook (approve, repeat once; a later refuse wins). T9 holds of all apps through the wildcard consent. T10 first contact on a default card. T1 to T7 passed live on qa1 on 2026-10-12, T8 to T10 on 2026-10-13.

## 3. Pins (old)

ui 0.2.3, miniapp-sdk 0.1.16, manifest 0.1.12, conformance 0.1.12. The samples do not exercise newer behaviour (hold view binding, idempotency reservation). Re-pin before using them to test those.
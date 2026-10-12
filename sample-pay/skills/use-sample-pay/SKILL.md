---
name: use-sample-pay
description: How to record and list test payments in Sample Pay (QA fixture, no money moves).
---
# Using Sample Pay

{{agent.name}}, Sample Pay is a QA fixture. It records pretend payments. No money moves.

- Call `sample-pay__pay_test` with `amountCents` (1 to 100) and a `memo`. Always send an idempotency key.
- Every `pay_test` call answers `held`: the owner must approve it. Poll `sample-pay__tb_hold_status` with the `holdId`, then repeat the same call with the same input and the same key. It runs once.
- Call `sample-pay__pay_list` to see the newest test payments.

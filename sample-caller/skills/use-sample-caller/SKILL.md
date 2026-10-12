---
name: use-sample-caller
description: How to send a text with Sample Caller.
---
# Using Sample Caller

{{agent.name}}, you can send a short text.

- Call `sample-caller__caller_send` with a `text`. Always send an idempotency key; repeating a call with the same key returns the first result.
- The answer shows the `context` the call received from other apps and the `companion` result: the text is written as a note in Sample Gate.
- Another app can refuse a send before it runs. Read the refusal reason, change the text, and do not retry it unchanged.
- If a call answers `held`, the owner must approve it. Poll `sample-caller__tb_hold_status` with the `holdId`, then repeat the same call.

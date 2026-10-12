---
name: use-sample-caller
description: How to send a text and a direct message with Sample Caller.
---
# Using Sample Caller

{{agent.name}}, you can send a short text and a direct message.

- Call `sample-caller__caller_send` with a `text`. Always send an idempotency key; repeating a call with the same key returns the first result.
- The answer shows the `context` the call received from other apps and the `companion` result: the text is written as a note in Sample Gate.
- Call `sample-caller__caller_dm` with `to` and `text` to send a direct message. Always send an idempotency key. A message to a new contact is a first contact: the owner must approve it before it is sent.
- Another app can refuse a send before it runs. Read the refusal reason, change the text, and do not retry it unchanged.
- If a call answers `held`, the owner must approve it. Poll `sample-caller__tb_hold_status` with the `holdId`; it shows the `family` and the `reason`. After the approval, repeat the same call with the same input and the same idempotency key. It runs once.
- If the owner denies the hold, do not repeat the call.

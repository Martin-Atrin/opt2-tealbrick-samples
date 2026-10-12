---
name: use-sample-gate
description: How to write and list notes in Sample Gate.
---
# Using Sample Gate

{{agent.name}}, you can keep short notes.

- Call `sample-gate__gate_note_write` with a `text` to store a note. Always send an idempotency key; repeating a call with the same key returns the first result.
- Call `sample-gate__gate_notes_list` to see the newest notes, also the notes other apps wrote.
- Sample Gate also checks some calls of other apps before they run. If a call is refused with a reason from Sample Gate, change the request; do not retry it unchanged.
- Sample Gate can also hold a call of another app for the owner's review (reason "needs owner review"). The call answers `held`: wait for the owner, then repeat the same call. A refusal from Sample Gate still wins after an approval.
- If a call answers `held`, the owner must approve it. Poll the `tb_hold_status` tool of the app that held it with the `holdId`, then repeat the same call.

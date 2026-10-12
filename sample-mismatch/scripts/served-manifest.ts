// Writes the manifest this fixture SERVES (src/app.ts: the released file with `summary` changed) to
// served.manifest.json (generated, not committed). `pnpm conformance` runs against it: the suite then checks the app as
// what it is at run time. Against the released tealbrick.manifest.json the fake bridge refuses every claim with
// `manifest_mismatch`, which is the deliberate defect this fixture exists for (covered live by QA, and by test/app.test.ts).
import { writeFileSync } from "node:fs";
import { manifest } from "../src/app.ts";

writeFileSync(new URL("../served.manifest.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);

/**
 * Every mark built with `createMark` declares a channel map: the options it
 * infers from data (`size`, `pos`, `color`, `raw`, `dims`). Its descriptor in
 * gofish-ir must type exactly those fields as channels (`carriesChannel`), and
 * no others. The Python generator wraps a callable as an accessor exactly
 * where the descriptor says channel, so this agreement is what makes a Python
 * lambda work exactly where a JS per-datum accessor does.
 *
 * Run: `tsx src/tests/markChannels.test.ts` (wired as
 * `pnpm test:mark-channels`).
 */

import "../lib";
import { Frontend } from "gofish-ir";
import { MARK_CHANNELS } from "../ast/withGoFish";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("# createMark channel maps agree with the descriptors");
check(
  "every createMark mark is registered",
  ["rect", "circle", "ellipse", "petal", "text", "image", "polygon", "blank"]
    .every((t) => MARK_CHANNELS.has(t)),
  JSON.stringify([...MARK_CHANNELS.keys()])
);
for (const [type, channels] of MARK_CHANNELS) {
  const fields = Frontend.acceptedFields("leaf-mark", type);
  if (fields === undefined) {
    check(`${type} has a leaf-mark descriptor`, false);
    continue;
  }
  const declared = Object.entries(fields)
    .filter(([, spec]) => Frontend.carriesChannel(spec.type))
    .map(([key]) => key)
    .sort();
  const js = Object.keys(channels).sort();
  check(
    `${type}: channel map === descriptor channel fields`,
    JSON.stringify(js) === JSON.stringify(declared),
    JSON.stringify({
      onlyInJS: js.filter((k) => !declared.includes(k)),
      onlyInDescriptor: declared.filter((k) => !js.includes(k)),
    })
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

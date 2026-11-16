/**
 * A color channel given a function accessor. The function reads a value off
 * each row, as a field name does, so what it returns is a data value that the
 * color scale maps. A `literal(...)` it returns is a constant color, as a
 * `literal(...)` in the channel itself is: it is drawn as given, and it is
 * no value of the scale, so it gets no legend entry.
 *
 * Run: `tsx src/tests/colorAccessor.test.ts` (wired as
 * `pnpm test:color-accessor`).
 */

import { chart, spread, rect, literal } from "../lib";
import { inferColor } from "../ast/channels";
import { isValue } from "../ast/data";

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

const rows = [
  { k: "a", v: 3 },
  { k: "b", v: 5 },
  { k: "c", v: 2 },
];

/** The fills of the drawn rects and the texts, in draw order. */
async function drawn(fill: unknown): Promise<{
  fills: string[];
  texts: string[];
}> {
  const doc = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "v", fill: fill as any }))
    .toDisplayList({ w: 300, h: 200 });
  const fills: string[] = [];
  const texts: string[] = [];
  const walk = (it: any) => {
    if (it.kind === "rect") fills.push(it.style?.fill ?? it.fill);
    if (it.kind === "text") texts.push(String(it.text));
    (it.children ?? []).forEach(walk);
  };
  doc.items.forEach(walk);
  return { fills, texts };
}

async function main() {
  console.log("\n# a function accessor's result");

  const read = inferColor((d: any) => d.k, rows);
  check("a plain result is a data value", isValue(read), String(read));

  check(
    "a literal(...) result is a constant color",
    inferColor(() => literal("steelblue"), rows) === "steelblue"
  );

  console.log("\n# drawn");

  const highlight = (d: any) =>
    d.k === "b" ? literal("#f58518") : literal("steelblue");
  const lit = await drawn(highlight);
  check(
    "literal results are drawn as given",
    JSON.stringify(lit.fills) ===
      JSON.stringify(["steelblue", "#f58518", "steelblue"]),
    JSON.stringify(lit.fills)
  );
  check(
    "literal results add no legend",
    lit.texts.length === 0,
    JSON.stringify(lit.texts)
  );

  // The same colors written in the channel itself, for comparison: a literal
  // in the channel and a literal from the function draw alike.
  const constant = await drawn(literal("steelblue"));
  check(
    "a literal in the channel is drawn as given",
    constant.fills.every((f) => f === "steelblue") &&
      constant.texts.length === 0,
    JSON.stringify(constant)
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

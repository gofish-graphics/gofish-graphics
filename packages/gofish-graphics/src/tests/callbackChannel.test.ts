/**
 * A function in a channel returns, for each row, a value that means what it
 * would mean written in the channel itself, as if a conditional in the
 * function were erased. For `fill: (d) => d.k === "b" ? "orange" :
 * "steelblue"`, the mark of row b is drawn as with `fill: "orange"` and the
 * others as with `fill: "steelblue"`: literal colors, with no legend. A
 * string that names a field reads that field, `v(...)` is a data value the
 * color scale maps, and `literal(...)` is a constant (`firstRowValue` in
 * channels.ts).
 *
 * Run: `tsx src/tests/callbackChannel.test.ts` (wired as
 * `pnpm test:callback-channel`).
 */

import { chart, spread, rect, text, literal, v } from "../lib";
import { check, items, report, textsOf } from "./testHelpers";

declare const process: { exit(code: number): never };

const rows = [
  { k: "a", v: 3 },
  { k: "b", v: 5 },
  { k: "c", v: 2 },
];

/** The fills of the drawn rects and the texts, in draw order. */
async function drawn(fill: unknown) {
  const doc = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "v", fill: fill as any }))
    .toDisplayList({ w: 300, h: 200 });
  const fills = items(doc)
    .filter((it) => it.kind === "rect")
    .map((it) => it.style?.fill ?? it.fill);
  return { fills, texts: textsOf(doc) };
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

async function main() {
  console.log("\n# a function's value means what it means in the channel");

  const highlight = await drawn((d: any) =>
    d.k === "b" ? "orange" : "steelblue"
  );
  check(
    "a color name is a literal color, with no legend",
    same(highlight, {
      fills: ["steelblue", "orange", "steelblue"],
      texts: [],
    }),
    JSON.stringify(highlight)
  );

  const byField = await drawn("k");
  check(
    "a string that names a field reads it, as the field name does",
    same(await drawn(() => "k"), byField),
    JSON.stringify(byField)
  );
  check(
    "v(...) is a data value the color scale maps, as the field name does",
    same(await drawn((d: any) => v(d.k)), byField)
  );
  check(
    "literal(...) is a constant color",
    same(await drawn(() => literal("red")), {
      fills: ["red", "red", "red"],
      texts: [],
    })
  );

  console.log("\n# a mix of data and literals");

  // The scale's domain is the data values alone (a, c), so the literal
  // row takes no color of the palette and no legend entry.
  const mixed = await drawn((d: any) => (d.k === "b" ? "orange" : v(d.k)));
  check(
    "the literal row is drawn as given, and only the data rows are in the legend",
    mixed.fills[1] === "orange" &&
      mixed.fills[0] !== mixed.fills[2] &&
      !["a", "c", "orange"].includes(mixed.fills[0]) &&
      same(mixed.texts, ["a", "c"]),
    JSON.stringify(mixed)
  );

  console.log("\n# a text channel");

  const doc = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(text({ text: (d: any) => `${d.v}%` }))
    .toDisplayList({ w: 300, h: 200 });
  check(
    "a function's string is the text, as it is written",
    same(textsOf(doc), ["3%", "5%", "2%"]),
    JSON.stringify(textsOf(doc))
  );

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

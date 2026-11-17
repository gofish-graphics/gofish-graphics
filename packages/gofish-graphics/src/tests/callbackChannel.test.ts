/**
 * A function in a channel gives, for each row, a value that means what it
 * would mean written in the channel itself, as if a conditional in the
 * function were erased (`directValue` in channels.ts). Every channel kind
 * takes the same step: a color, a text, a size, a position, and the paint
 * of a connector. `undefined` gives no value, so the mark keeps its
 * default; `null` is a missing data value. `v(...)` is always data and
 * `literal(...)` always a constant, whatever the channel does with a plain
 * string.
 *
 * Run: `tsx src/tests/callbackChannel.test.ts` (wired as
 * `pnpm test:callback-channel`).
 */

import {
  chart,
  spread,
  scatter,
  group,
  rect,
  text,
  line,
  literal,
  field,
  v,
} from "../lib";
import { check, items, report, textsOf } from "./testHelpers";

declare const process: { exit(code: number): never };

type Row = { k: string; count: number };
const rows: Row[] = [
  { k: "a", count: 3 },
  { k: "b", count: 5 },
  { k: "c", count: 2 },
];

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** The bars of a spread of `rows` by `k`, drawn with `bar`. */
async function bars(bar: ReturnType<typeof rect<Row>>) {
  const doc = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(bar)
    .toDisplayList({ w: 300, h: 200 });
  const marks = items(doc)
    .filter((it) => it.kind === "rect")
    .slice(0, rows.length);
  return {
    fills: marks.map((it) => it.style?.fill ?? it.fill),
    heights: marks.map((it) => Math.round(it.h ?? 0)),
    xs: marks.map((it) => Math.round(it.x ?? 0)),
    texts: textsOf(doc),
  };
}

async function main() {
  console.log("\n# a color");

  const highlight = await bars(
    rect({
      h: "count",
      fill: (d: Row) => (d.k === "b" ? "orange" : "steelblue"),
    })
  );
  check(
    "a color name is that color, with no legend",
    same(highlight.fills, ["steelblue", "orange", "steelblue"]) &&
      highlight.texts.length === 0,
    JSON.stringify(highlight)
  );
  const byField = await bars(rect({ h: "count", fill: "k" }));
  check(
    "a string that names a field reads it, as the field name does",
    same(await bars(rect({ h: "count", fill: () => "k" })), byField)
  );
  check(
    "v(...) is data the color scale maps, as the field is",
    same(await bars(rect({ h: "count", fill: (d: Row) => v(d.k) })), byField)
  );
  check(
    "literal(...) is a constant",
    same((await bars(rect({ h: "count", fill: () => literal("k") }))).fills, [
      "k",
      "k",
      "k",
    ])
  );
  const mixed = await bars(
    rect({ h: "count", fill: (d: Row) => (d.k === "b" ? "orange" : v(d.k)) })
  );
  check(
    "a mix: the literal row is drawn as given, the data rows are in the legend",
    mixed.fills[1] === "orange" &&
      mixed.fills[0] !== mixed.fills[2] &&
      same(mixed.texts, ["a", "c"]),
    JSON.stringify(mixed)
  );
  const plain = await bars(rect({ h: "count" }));
  check(
    "undefined gives no value, so the mark keeps its default",
    same(
      (
        await bars(
          rect({
            h: "count",
            fill: (d: Row) => (d.k === "b" ? "red" : undefined),
          })
        )
      ).fills,
      [plain.fills[0], "red", plain.fills[2]]
    )
  );

  console.log("\n# a size");

  check(
    "a number is pixels, as h: 40 is",
    same((await bars(rect({ h: () => 40 }))).heights, [40, 40, 40])
  );
  check(
    "literal(...) is pixels too",
    same((await bars(rect({ h: () => literal(40) }))).heights, [40, 40, 40])
  );
  const byCount = await bars(rect({ h: "count" }));
  check(
    "v(...) is data, as the field name is",
    same(
      (await bars(rect({ h: (d: Row) => v(d.count) }))).heights,
      byCount.heights
    )
  );
  check(
    "a field name reads the field",
    same((await bars(rect({ h: () => "count" }))).heights, byCount.heights)
  );
  const nulls = await bars(
    rect({ h: (d: Row) => (d.k === "b" ? null : v(d.count)) })
  );
  check(
    "null is a missing value, so its mark is not drawn",
    nulls.heights.length === 2,
    JSON.stringify(nulls.heights)
  );

  console.log("\n# a position");

  const xsOf = async (x: any) => {
    const d = await chart(rows, { axes: false })
      .flow(spread({ by: "k", dir: "y" }))
      .mark(rect({ w: 10, h: 10, x }))
      .toDisplayList({ w: 300, h: 200 });
    return items(d)
      .filter((it) => it.kind === "rect")
      .map((it) => Math.round(it.x ?? 0));
  };
  check(
    "v(...) is data, as the field name is",
    same(await xsOf((d: Row) => v(d.count)), await xsOf("count")),
    JSON.stringify(await xsOf("count"))
  );

  console.log("\n# a text");

  const doc = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(text({ text: (d: Row) => `${d.count}%` }))
    .toDisplayList({ w: 300, h: 200 });
  check(
    "a string that names no field is the text",
    same(textsOf(doc), ["3%", "5%", "2%"]),
    JSON.stringify(textsOf(doc))
  );
  const own = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(text({ text: () => "constructor" }))
    .toDisplayList({ w: 300, h: 200 });
  check(
    "a name only the row's prototype has is not a field",
    same(textsOf(own), ["constructor", "constructor", "constructor"]),
    JSON.stringify(textsOf(own))
  );

  const wrapped = await chart(rows, { axes: false })
    .flow(spread({ by: "k", dir: "x" }))
    .mark(text({ text: (d: Row) => (d.k === "b" ? literal("count") : v(d.k)) }))
    .toDisplayList({ w: 300, h: 200 });
  check(
    "v(...) is the value and literal(...) the text, though it names a field",
    same(textsOf(wrapped), ["a", "count", "c"]),
    JSON.stringify(textsOf(wrapped))
  );

  console.log("\n# a connector's paint");

  const points = [
    { g: "a", x: 1, y: 1 },
    { g: "a", x: 2, y: 3 },
    { g: "b", x: 1, y: 2 },
    { g: "b", x: 2, y: 1 },
  ];
  const strokes = async (stroke: any) => {
    const d = await chart(points, { axes: false })
      .flow(group({ by: "g" }), scatter({ by: "x", x: "x", y: "y" }))
      .mark(line({ stroke }))
      .toDisplayList({ w: 200, h: 200 });
    return {
      strokes: items(d)
        .filter((it) => it.kind === "path")
        .map((it) => it.style?.stroke),
      texts: textsOf(d),
    };
  };
  check(
    "literal(...) is a constant, with no legend",
    same(await strokes(() => literal("red")), {
      strokes: ["red", "red"],
      texts: [],
    }),
    JSON.stringify(await strokes(() => literal("red")))
  );
  check(
    "v(...) is data, as the field name is",
    same(
      await strokes((d: (typeof points)[number]) => v(d.g)),
      await strokes("g")
    )
  );
  check(
    "an empty string names no field, so it is a literal",
    same((await strokes(() => "")).strokes, ["", ""]),
    JSON.stringify(await strokes(() => ""))
  );
  check(
    "field(...) reads its field, as the field name does",
    same(await strokes(field("g")), await strokes("g")),
    JSON.stringify(await strokes(field("g")))
  );
  check(
    "a missing value in every row is no color, as undefined is",
    same(await strokes(() => null), await strokes(() => undefined)),
    JSON.stringify(await strokes(() => null))
  );

  console.log("\n# one mark of several rows");

  const oneMark = (h: any) =>
    chart(rows, { axes: false })
      .mark(rect({ w: 10, h }))
      .toDisplayList({ w: 300, h: 200 });
  let threw = "";
  try {
    await oneMark((d: Row) => (d.k === "a" ? 3 : "3"));
  } catch (e) {
    threw = String(e);
  }
  check(
    "3 and \"3\" are two values, so a mark of both rows throws",
    threw.includes("not constant"),
    threw
  );

  console.log("\n# an operator's channel");

  const scatterXs = async (x: any) => {
    const d = await chart(rows, { axes: false })
      .flow(scatter({ by: "k", x }))
      .mark(rect({ w: 10, h: 10 }))
      .toDisplayList({ w: 300, h: 200 });
    return items(d)
      .filter((it) => it.kind === "rect")
      .map((it) => Math.round(it.x ?? 0));
  };
  check(
    "a field name of a category places the entries as the name does",
    same(await scatterXs(() => "k"), await scatterXs("k")),
    JSON.stringify(await scatterXs("k"))
  );

  console.log("\n# a row with a getter");

  class Bar {
    constructor(
      readonly k: string,
      private readonly n: number
    ) {}
    get count() {
      return this.n;
    }
  }
  const classBars = await chart(
    rows.map((r) => new Bar(r.k, r.count)),
    { axes: false }
  )
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "count" }))
    .toDisplayList({ w: 300, h: 200 });
  check(
    "a field its class gives it is a field",
    same(
      items(classBars)
        .filter((it) => it.kind === "rect")
        .map((it) => Math.round(it.h ?? 0)),
      byCount.heights
    )
  );

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

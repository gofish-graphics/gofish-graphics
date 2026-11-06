/**
 * `circle` (#851): an ellipse locked to a 1:1 aspect ratio. Its one size is
 * the diameter, set by at most one of `r`, `w`, or `h`. `r` is a radius for
 * every channel kind: a number, a field name, a `field(...)` expression, and
 * an accessor all give a diameter of `2r`, on both axes. A data `w` or `h`
 * is set on its own axis; the aspect lock gives the other axis the same data
 * length when the claims are read (#1087).
 *
 * The unit checks read the built node's `dims` (the ellipse's box sizes before
 * layout). The rendered checks read the ellipses back from a display list.
 *
 * Run: `pnpm build && tsx src/tests/circle.test.ts` (wired as
 * `pnpm test:circle`). The rendering checks import from `dist` for the same
 * lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { chart, spread, circle, field, datum } = GoFish as any;

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

/** The message `run` throws, or "" when it does not. */
const errorOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

/** The size the built ellipse asks for on each axis: a number (pixels) or a
 *  data value `{ datum, measure }` (`measure`: its quantity's name). */
const sizesOf = async (mark: any, rows: unknown) => {
  const node = await mark(rows);
  return node.args.dims.map((d: any) =>
    d.size !== null && typeof d.size === "object"
      ? { datum: d.size.datum, measure: d.size.quantity?.name }
      : d.size
  );
};

const rows = [{ v: 3 }, { v: 4 }];

console.log("# circle: the diameter is 2r for every channel kind");
{
  const literal = await sizesOf(circle({ r: 5 }), rows);
  check(
    "a number r is a pixel radius",
    literal[0] === 10 && literal[1] === 10,
    JSON.stringify(literal)
  );

  const cases: [string, unknown][] = [
    ["a field name", "v"],
    ["a field(...) expression", field("v")],
    ["an accessor", (d: { v: number }) => d.v],
  ];
  for (const [label, r] of cases) {
    const sizes = await sizesOf(circle({ r }), rows);
    check(
      `${label} r: diameter = 2 x the summed radius, on both axes`,
      sizes.every((s: any) => s?.datum === 14),
      JSON.stringify(sizes)
    );
  }

  const fieldSizes = await sizesOf(circle({ r: "v" }), rows);
  check(
    "a field r keeps its field's measure",
    fieldSizes.every((s: any) => s.measure === "v"),
    JSON.stringify(fieldSizes)
  );

  const wrapped = await sizesOf(circle({ r: datum(6) }), rows);
  check(
    "a datum(...) r doubles too",
    wrapped.every((s: any) => s.datum === 12),
    JSON.stringify(wrapped)
  );
}

console.log("# circle: w or h sets the diameter");
{
  for (const key of ["w", "h"]) {
    const px = await sizesOf(circle({ [key]: 8 }), rows);
    check(
      `${key}: 8 is an 8 px diameter on both axes`,
      px[0] === 8 && px[1] === 8,
      JSON.stringify(px)
    );
    const data = await sizesOf(circle({ [key]: "v" }), rows);
    const own = key === "w" ? 0 : 1;
    check(
      `${key}: "v" is a data diameter on its own axis only (not doubled)`,
      data[own]?.datum === 7 && data[1 - own] === undefined,
      JSON.stringify(data)
    );
  }

  const none = await sizesOf(circle({}), rows);
  check(
    "with no size the circle fills its space",
    none[0] === undefined && none[1] === undefined,
    JSON.stringify(none)
  );

  const message = await errorOf(() => circle({ r: 3, h: 4 })(rows));
  check(
    "two of r, w, h is an error",
    message.includes("pass one of r, area, w, or h"),
    message
  );
}

/** Every display-list item whose kind is one of `kinds`, depth first. */
const kindsOf = (dl: any, kinds: readonly string[]): any[] => {
  const out: any[] = [];
  const walk = (it: any) => {
    if (kinds.includes(it.kind)) out.push(it);
    (it.children ?? []).forEach(walk);
  };
  dl.items.forEach(walk);
  return out;
};

/** Every ellipse in a display list. */
type Dot = { cx: number; cy: number; rx: number; ry: number };
const ellipsesOf = (dl: any): Dot[] =>
  kindsOf(dl, ["ellipse"]).map(({ cx, cy, rx, ry }) => ({ cx, cy, rx, ry }));

console.log("# circle: rendered");
{
  const data = [
    { k: "a", v: 1 },
    { k: "b", v: 2 },
    { k: "c", v: 3 },
  ];
  // No axes: an axis titled by a field takes room an accessor's does not
  // (#1032), and these checks are about the circles.
  const render = (mark: unknown) =>
    chart(data, { axes: false })
      .flow(spread({ by: "k", dir: "x", spacing: 0 }))
      .mark(mark)
      .toDisplayList({ w: 300, h: 300 });

  const byR = ellipsesOf(await render(circle({ r: "v" })));
  check("one ellipse per row", byR.length === 3, `${byR.length}`);
  check(
    "a data r draws round circles",
    byR.every((e) => Math.abs(e.rx - e.ry) < 1e-6),
    JSON.stringify(byR)
  );
  check(
    "a data r draws radii in proportion to the data",
    Math.abs(byR[1].rx / byR[0].rx - 2) < 1e-6 &&
      Math.abs(byR[2].rx / byR[0].rx - 3) < 1e-6,
    JSON.stringify(byR)
  );
  const byFn = ellipsesOf(
    await render(circle({ r: (d: { v: number }) => d.v }))
  );
  check(
    "an accessor r draws the same circles as a field r",
    byFn.every(
      (e, i) =>
        Math.abs(e.rx - byR[i].rx) < 1e-6 && Math.abs(e.ry - byR[i].ry) < 1e-6
    ),
    JSON.stringify(byFn)
  );
  const byH = ellipsesOf(await render(circle({ h: "v" })));
  check(
    "a data h draws round circles",
    byH.every((e) => Math.abs(e.rx - e.ry) < 1e-6),
    JSON.stringify(byH)
  );
}

console.log("# a data center (cx/cy) positions the circle (#1099)");
{
  // A data center stays a center: the ellipse places itself by it, so the
  // center goes through the scale and half the size comes off in pixels.
  const node = await circle({ r: 5, cy: "v" })(rows);
  const dy = node.args.dims[1];
  check(
    'cy: "v" keeps the mean of v as the center, with no derived min',
    dy.center?.datum === 3.5 && dy.min === undefined,
    JSON.stringify(dy)
  );

  const data = [
    { k: "a", v: 20 },
    { k: "b", v: 80 },
    { k: "c", v: 50 },
  ];
  const centers = (mark: unknown) =>
    chart(data, { axes: true })
      .flow(spread({ by: "k", dir: "x" }))
      .mark(mark)
      .toDisplayList({ w: 300, h: 300 })
      .then(ellipsesOf);
  const dots = await centers(circle({ r: 5, cy: "v" }));
  check("one dot per row", dots.length === 3, `${dots.length}`);
  // The centers sit on one linear scale of v: c is halfway between a and b.
  const mid = (dots[0].cy + dots[1].cy) / 2;
  check(
    "each dot's center sits at its value on the value axis",
    Math.abs(dots[2].cy - mid) < 1e-6 && dots[0].cy !== dots[1].cy,
    JSON.stringify(dots)
  );
  check(
    "the dot keeps its pixel radius",
    dots.every((d) => Math.abs(d.rx - 5) < 1e-9),
    JSON.stringify(dots)
  );
}

console.log("# area: the circle's area is proportional to the value (#972)");
{
  // A number is square pixels: the disc of exactly that area.
  const px = await sizesOf(circle({ area: 100 * Math.PI }), rows);
  check(
    "a number area is square pixels (area 100π is a 20 px diameter)",
    Math.abs(px[0] - 20) < 1e-9 && Math.abs(px[1] - 20) < 1e-9,
    JSON.stringify(px)
  );

  // Data is summed, as a size is (areas add up), then rooted by the
  // channel: 3 + 4 = 7 gives a diameter of (2/√π)·√7, on both axes.
  const want = (2 / Math.sqrt(Math.PI)) * Math.sqrt(7);
  const cases: [string, unknown][] = [
    ["a field name", "v"],
    ["a field(...) expression", field("v")],
    ["an accessor", (d: { v: number }) => d.v],
  ];
  for (const [label, area] of cases) {
    const sizes = await sizesOf(circle({ area }), rows);
    check(
      `${label} area: diameter = (2/√π)·√(summed area), on both axes`,
      sizes.every((s: any) => Math.abs(s?.datum - want) < 1e-9),
      JSON.stringify(sizes)
    );
  }

  const fieldSizes = await sizesOf(circle({ area: "v" }), rows);
  check(
    "a field area is a length in the square root of its field's measure",
    fieldSizes.every((s: any) => s.measure === "√v"),
    JSON.stringify(fieldSizes)
  );

  const wrapped = await sizesOf(circle({ area: datum(9) }), rows);
  check(
    "a datum(...) area is an area too: it is rooted",
    wrapped.every(
      (s: any) => Math.abs(s.datum - (2 / Math.sqrt(Math.PI)) * 3) < 1e-9
    ),
    JSON.stringify(wrapped)
  );

  for (const other of ["r", "w", "h"]) {
    const message = await errorOf(() =>
      circle({ area: "v", [other]: 3 })(rows)
    );
    check(
      `area and ${other} together is an error`,
      message.includes("pass one of r, area, w, or h"),
      message
    );
  }

  const negative = await errorOf(() => circle({ area: -4 })(rows));
  check(
    "a negative area is an error",
    negative.includes("at least 0"),
    negative
  );

  // Rendered in a spread, the one σ that fits the row scales every circle's
  // side, so area / value is one constant and the radii go as √value.
  const data = [
    { k: "a", v: 1 },
    { k: "b", v: 4 },
    { k: "c", v: 9 },
  ];
  const dots = ellipsesOf(
    await chart(data, { axes: false })
      .flow(spread({ by: "k", dir: "x", spacing: 0 }))
      .mark(circle({ area: "v" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  check("one ellipse per row", dots.length === 3, `${dots.length}`);
  check(
    "an area draws round circles",
    dots.every((e) => Math.abs(e.rx - e.ry) < 1e-6),
    JSON.stringify(dots)
  );
  const perValue = dots.map((e, i) => (Math.PI * e.rx * e.rx) / data[i].v);
  check(
    "each circle's area is proportional to its value",
    perValue.every((a) => Math.abs(a / perValue[0] - 1) < 1e-9),
    JSON.stringify(perValue)
  );
  check(
    "the row of circles fills the width it is given",
    Math.abs(2 * dots.reduce((s, e) => s + e.rx, 0) - 300) < 1e-6,
    JSON.stringify(dots)
  );
}

console.log("# area: a square root does not add up (#972, #1197)");
{
  const { stack, Unit, Trait } = GoFish as any;
  const revenue = [
    { k: "a", revenue: 10 },
    { k: "b", revenue: 20 },
  ];
  // √(a + b) is not √a + √b, so √USD has no CanSum, whether USD's own
  // traits are known (summable) or unknown (its name alone).
  for (const [label, unit] of [
    ["a summable unit", Unit("USD", { traits: [Trait.summable()] })],
    ["a unit known by its name alone", "USD"],
  ] as const) {
    const message = await errorOf(() =>
      chart(revenue, { schema: { revenue: unit } })
        .flow(stack({ by: "k", dir: "y" }))
        .mark(circle({ area: "revenue" }))
        .toDisplayList({ w: 300, h: 300 })
    );
    check(
      `${label}: a stack of area circles is refused (√USD cannot be summed)`,
      message.includes('"√USD", the square root of "USD"') &&
        message.includes("Square roots do not add up"),
      message
    );
  }
  const spreadMessage = await errorOf(() =>
    chart(revenue, {
      schema: { revenue: Unit("USD", { traits: [Trait.summable()] }) },
    })
      .flow(spread({ by: "k", dir: "y" }))
      .mark(circle({ area: "revenue" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  check(
    "a spread of area circles in √USD sums nothing, so it draws",
    spreadMessage === "",
    spreadMessage
  );
}

console.log("# #1087: an aspect lock ties its data unit's σ on both axes");
{
  const data = [
    { k: "A", v: 30 },
    { k: "B", v: 80 },
    { k: "C", v: 45 },
  ];
  for (const mark of [
    ["circle({ r })", circle({ r: "v" })],
    ["circle({ h })", circle({ h: "v" })],
    ["circle({ w })", circle({ w: "v" })],
    [
      "ellipse({ h, aspectRatio: 1 })",
      GoFish.ellipse({ h: "v", aspectRatio: 1 }),
    ],
  ] as const) {
    const dots = ellipsesOf(
      await chart(data, { axes: false })
        .flow(spread({ by: "k", dir: "x", spacing: 0 }))
        .mark(mark[1])
        .toDisplayList({ w: 400, h: 300 })
    );
    const right = Math.max(...dots.map((e) => e.cx + e.rx));
    const bottom = Math.max(...dots.map((e) => e.cy + e.ry));
    check(
      `${mark[0]} in a spread fits the width (σ = min(H / max v, W / Σv))`,
      right <= 400 + 1e-6 && bottom <= 300 + 1e-6,
      JSON.stringify(dots)
    );
    check(
      `${mark[0]}: the row fills the binding axis, x`,
      Math.abs(2 * dots.reduce((s, e) => s + e.rx, 0) - 400) < 1e-6,
      JSON.stringify(dots)
    );
  }
}

console.log("# #1087: rect's aspect lock follows the same rules as circle's");
{
  const { rect, scatter } = GoFish as any;
  // A rect's aspect lock is the circle's (`elaborateOwnDims`): the derived
  // axis takes the given data size, so a row of locked rects lays out as a
  // row of circles of the same sizes does.
  const boxesOf = (dl: any) =>
    kindsOf(dl, ["rect", "ellipse"]).map((it) =>
      it.kind === "rect"
        ? [it.x, it.y, it.w ?? it.width, it.h ?? it.height]
        : [it.cx - it.rx, it.cy - it.ry, 2 * it.rx, 2 * it.ry]
    );
  const same = (a: number[][], b: number[][]) =>
    a.length === b.length &&
    a.every((r, i) => r.every((v, j) => Math.abs(v - b[i][j]) < 1e-6));
  const spreadData = [
    { k: "A", v: 30 },
    { k: "B", v: 80 },
    { k: "C", v: 45 },
  ];
  const inSpread = (mark: unknown) =>
    chart(spreadData, { axes: false })
      .flow(spread({ by: "k", dir: "x", spacing: 0 }))
      .mark(mark)
      .toDisplayList({ w: 400, h: 300 })
      .then(boxesOf);
  for (const key of ["w", "h"]) {
    const boxes = await inSpread(rect({ [key]: "v", aspectRatio: 1 }));
    const circles = await inSpread(circle({ [key]: "v" }));
    check(
      `rect({ ${key}, aspectRatio: 1 }) in a spread lays out as circle({ ${key} })`,
      same(boxes, circles),
      JSON.stringify({ boxes, circles })
    );
  }
  const years = [
    { year: 2000, value: 10 },
    { year: 2001, value: 40 },
    { year: 2002, value: 20 },
  ];
  const atYears = (mark: unknown) =>
    chart(years, { axes: false })
      .flow(scatter({ by: "year", x: "year" }))
      .mark(mark)
      .toDisplayList({ w: 300, h: 300 })
      .then(boxesOf);
  for (const key of ["w", "h"]) {
    const boxes = await atYears(rect({ [key]: "value", aspectRatio: 1 }));
    const circles = await atYears(circle({ [key]: "value" }));
    check(
      `rect({ ${key}, aspectRatio: 1 }) placed on x only lays out as circle({ ${key} })`,
      same(boxes, circles),
      JSON.stringify({ boxes, circles })
    );
  }
}

console.log("# #972: a glyph size is a scale of its own");
{
  const { scatter, partition, Bin, Coord } = GoFish as any;
  const rows = [
    { a: 1, b: 10, n: 4 },
    { a: 3, b: 30, n: 9 },
    { a: 9, b: 90, n: 1 },
  ];
  // At a point, the unit's widest glyph spans the glyph range (30 px, a
  // placeholder until chart options set it), whatever the axes' scales.
  const dots = ellipsesOf(
    await chart(rows)
      .flow(scatter({ by: "a", x: "a", y: "b" }))
      .mark(circle({ area: "n" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  check(
    "a scatter's largest bubble is the glyph range across",
    Math.abs(Math.max(...dots.map((e) => 2 * e.rx)) - 30) < 1e-6,
    JSON.stringify(dots)
  );
  check(
    "a bubble's area is proportional to its value",
    dots.every(
      (e, i) => Math.abs((e.rx * e.rx) / rows[i].n / ((15 * 15) / 9) - 1) < 1e-9
    ),
    JSON.stringify(dots)
  );

  // In a cell, the unit's σ is the largest at which every glyph fits its
  // cell: k = min_i(cell_i / d_i).
  const cells = ellipsesOf(
    await chart(rows)
      .flow(
        partition({
          by: {
            x: field("a").bin(Bin.step(1)),
            y: field("b").bin(Bin.step(10)),
          },
        })
      )
      .mark(circle({ area: field("a").count() }))
      .toDisplayList({ w: 300, h: 300 })
  ).filter((e) => e.rx > 0);
  // The first two rows are two cells apart on both axes.
  const cellPx = Math.min(
    Math.abs(cells[1].cx - cells[0].cx) / 2,
    Math.abs(cells[1].cy - cells[0].cy) / 2
  );
  check(
    "a 2D histogram's largest circle fits its cell exactly",
    Math.abs(Math.max(...cells.map((e) => 2 * e.rx)) - cellPx) < 1e-6,
    JSON.stringify({ cells, cellPx })
  );

  // A coordinate transform warps a length of its space, not a glyph.
  const kinds = async (flow: unknown) =>
    kindsOf(
      await chart(rows, { coord: Coord.polar() })
        .flow(flow)
        .mark(circle({ area: "n" }))
        .toDisplayList({ w: 300, h: 300 }),
      ["ellipse", "path"]
    ).map((it) => it.kind);
  const bubbles = await kinds(scatter({ by: "a", x: "a", y: "b" }));
  check(
    "in polar, a scatter's bubbles stay round",
    bubbles.length === 3 && bubbles.every((k) => k === "ellipse"),
    JSON.stringify(bubbles)
  );
  const warped = await kinds(spread({ by: "a", dir: "x" }));
  check(
    "in polar, a spread's circles are lengths of the space, so they warp",
    warped.length === 3 && warped.every((k) => k === "path"),
    JSON.stringify(warped)
  );

  // Glyph status is per axis: a histogram bar is placed in a bin cell on x,
  // but its height is not in x's unit and it has no datum position on y, so
  // the height is a length of y. The tallest bar fills the plot's height.
  const { rect } = GoFish as any;
  const bars = kindsOf(
    await chart([{ v: 1 }, { v: 1.2 }, { v: 2.5 }, { v: 3 }, { v: 3.1 }], {
      axes: true,
      w: 300,
      h: 200,
    })
      .flow(partition({ by: field("v").bin(Bin.step(1)), dir: "x" }))
      .mark(rect({ h: field("v").count(), inset: 0.5 }))
      .toDisplayList(),
    ["rect"]
  );
  check(
    "a histogram bar's height is a length of y, not a glyph",
    Math.abs(Math.max(...bars.map((b) => Math.abs(b.h ?? b.height))) - 200) <
      1e-6,
    JSON.stringify(bars)
  );
}

console.log(
  "# #972: an aspect lock's derived size follows the size it is given"
);
{
  const { scatter, Coord } = GoFish as any;
  const years = [
    { year: 2000, value: 10 },
    { year: 2001, value: 40 },
    { year: 2002, value: 20 },
  ];
  const draw = (mark: unknown, opts: object = { axes: false }) =>
    chart(years, opts)
      .flow(scatter({ by: "year", x: "year" }))
      .mark(mark)
      .toDisplayList({ w: 300, h: 300 });
  // `h` is given on y, where nothing places the circle at a datum, so it is
  // a length of y: the tallest circle fills the plot's height, as a
  // histogram bar does. The width follows it in pixels and claims nothing on
  // x, where the circle sits at a year: the years span the whole width.
  const byH = ellipsesOf(await draw(circle({ h: "value" })));
  check(
    "circle({ h }) placed on x only is a length of y: the tallest fills the height",
    Math.abs(Math.max(...byH.map((e) => 2 * e.ry)) - 300) < 1e-6 &&
      byH.every((e) => Math.abs(e.rx - e.ry) < 1e-9),
    JSON.stringify(byH)
  );
  check(
    "its derived width claims nothing on x: the years span the width",
    Math.abs(byH[0].cx - 0) < 1e-6 && Math.abs(byH[2].cx - 300) < 1e-6,
    JSON.stringify(byH)
  );
  // A length of the space warps in polar, as a histogram bar's height does.
  const kinds = async (mark: unknown) =>
    kindsOf(await draw(mark, { coord: Coord.polar() }), [
      "ellipse",
      "path",
    ]).map((it) => it.kind);
  const warped = await kinds(circle({ h: "value" }));
  check(
    "in polar, circle({ h }) placed on x only warps (a length of r)",
    warped.length === 3 && warped.every((k) => k === "path"),
    JSON.stringify(warped)
  );
  // `w` is given on x, where the circle sits at a year: a glyph, and its
  // derived height is the same glyph size.
  const byW = ellipsesOf(await draw(circle({ w: "value" })));
  check(
    "circle({ w }) placed on x is a glyph: the widest is the glyph range",
    Math.abs(Math.max(...byW.map((e) => 2 * e.rx)) - 30) < 1e-6 &&
      byW.every((e) => Math.abs(e.rx - e.ry) < 1e-9),
    JSON.stringify(byW)
  );
  const round = await kinds(circle({ w: "value" }));
  check(
    "in polar, circle({ w }) placed on x stays round",
    round.length === 3 && round.every((k) => k === "ellipse"),
    JSON.stringify(round)
  );
}

console.log("# a dims option takes a datum only in a slot");
{
  // Each channel kind reads a wrapped value itself; a dims bag is axis
  // names, so one datum for the whole bag is an error, not a mark with no
  // value (which would not be drawn) or a bag keyed by the datum's fields.
  const message = await errorOf(() => circle({ r: 5, dims: datum(5) })(rows));
  check(
    "dims: datum(5) is an error naming the slot form",
    message.includes("A dims option takes axis names"),
    message
  );
  const drawn = ellipsesOf(
    await chart(rows)
      .mark(circle({ r: 5, dims: { y: datum(5) } }))
      .toDisplayList({ w: 100, h: 100 })
  );
  check(
    "dims: { y: datum(5) } is drawn",
    drawn.length === 1 && drawn[0].rx === 5,
    JSON.stringify(drawn)
  );
}

console.log("# #972: a glyph unit's σ with no room to bound it");
{
  const { scatter } = GoFish as any;
  const radii = async (ns: number[]) =>
    ellipsesOf(
      await chart(ns.map((n, i) => ({ a: i, b: i, n })))
        .flow(scatter({ by: "a", x: "a", y: "b" }))
        .mark(circle({ area: "n" }))
        .toDisplayList({ w: 300, h: 300 })
    ).map((e) => e.rx);
  // Every value 0: the unit's widest glyph is 0 wide, so no room bounds σ,
  // and every glyph is drawn 0 wide at any σ.
  const zero = await radii([0, 0]);
  check(
    "areas that are all 0 draw circles 0 wide",
    zero.length === 2 && zero.every((r) => r === 0),
    JSON.stringify(zero)
  );
  const equal = await radii([5, 5]);
  check(
    "equal areas each fill the glyph range",
    equal.every((r) => Math.abs(2 * r - 30) < 1e-9),
    JSON.stringify(equal)
  );
  const some = await radii([0, 4]);
  check(
    "a 0 area beside another draws 0 wide, and the other fills the range",
    some[0] === 0 && Math.abs(2 * some[1] - 30) < 1e-9,
    JSON.stringify(some)
  );
}

console.log("# #972: glyph sizes lay out in linear time");
{
  const { scatter } = GoFish as any;
  // Each glyph's room comes from its parent's sharing plan, and its unit's
  // σ from bounds built once before the claim walk, so a bubble scatter's layout
  // grows with its points, not their square (5k points took ~9 s when each
  // glyph rescanned every constraint and room).
  const n = 5000;
  const points = Array.from({ length: n }, (_, i) => ({
    id: i,
    a: (i * 37) % 101,
    b: (i * 53) % 97,
    n: 1 + (i % 7),
  }));
  const start = performance.now();
  const bubbles = ellipsesOf(
    await chart(points)
      .flow(scatter({ by: "id", x: "a", y: "b" }))
      .mark(circle({ area: "n" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  const ms = performance.now() - start;
  check(
    `a ${n}-point bubble scatter lays out in under 4 s (${Math.round(ms)} ms)`,
    bubbles.length === n && ms < 4000,
    `${bubbles.length} bubbles in ${Math.round(ms)} ms`
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

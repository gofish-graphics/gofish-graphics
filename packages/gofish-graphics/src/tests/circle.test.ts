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

  let message: string | undefined;
  try {
    await circle({ r: 3, h: 4 })(rows);
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "two of r, w, h is an error",
    message?.includes("pass one of r, area, w, or h") === true,
    message
  );
}

/** Every ellipse in a display list, with its center. */
const ellipsesAt = (dl: any): { cy: number; rx: number }[] => {
  const out: { cy: number; rx: number }[] = [];
  const walk = (it: any) => {
    if (it.kind === "ellipse") out.push({ cy: it.cy, rx: it.rx });
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

/** Every ellipse in a display list. */
type Dot = { cx: number; cy: number; rx: number; ry: number };
const ellipsesOf = (dl: any): Dot[] => {
  const out: Dot[] = [];
  const walk = (it: any) => {
    if (it.kind === "ellipse")
      out.push({ cx: it.cx, cy: it.cy, rx: it.rx, ry: it.ry });
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

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
    "cy: \"v\" keeps the mean of v as the center, with no derived min",
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
      .then((dl: any) => ellipsesAt(dl));
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
    let message: string | undefined;
    try {
      await circle({ area: "v", [other]: 3 })(rows);
    } catch (e) {
      message = (e as Error).message;
    }
    check(
      `area and ${other} together is an error`,
      message?.includes("pass one of r, area, w, or h") === true,
      message
    );
  }

  let negative: string | undefined;
  try {
    await circle({ area: -4 })(rows);
  } catch (e) {
    negative = (e as Error).message;
  }
  check(
    "a negative area is an error",
    negative?.includes("at least 0") === true,
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

console.log("# #1087: an aspect lock ties its data unit's σ on both axes");
{
  const data = [
    { k: "A", v: 30 },
    { k: "B", v: 80 },
    { k: "C", v: 45 },
  ];
  for (const mark of [
    ["circle({ h })", circle({ h: "v" })],
    ["circle({ w })", circle({ w: "v" })],
    ["ellipse({ h, aspectRatio: 1 })", GoFish.ellipse({ h: "v", aspectRatio: 1 })],
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
      (e, i) =>
        Math.abs((e.rx * e.rx) / rows[i].n / ((15 * 15) / 9) - 1) < 1e-9
    ),
    JSON.stringify(dots)
  );

  // In a cell, the unit's σ is the largest at which every glyph fits its
  // cell: k = min_i(cell_i / d_i).
  const cells = ellipsesOf(
    await chart(rows)
      .flow(
        partition({
          by: { x: field("a").bin(Bin.step(1)), y: field("b").bin(Bin.step(10)) },
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
  const kinds = async (flow: unknown) => {
    const out: string[] = [];
    const walk = (it: any) => {
      if (it.kind === "ellipse" || it.kind === "path") out.push(it.kind);
      (it.children ?? []).forEach(walk);
    };
    (
      await chart(rows, { coord: Coord.polar() })
        .flow(flow)
        .mark(circle({ area: "n" }))
        .toDisplayList({ w: 300, h: 300 })
    ).items.forEach(walk);
    return out;
  };
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
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

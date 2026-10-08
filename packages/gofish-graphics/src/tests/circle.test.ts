/**
 * `circle` (#851): an ellipse locked to a 1:1 aspect ratio. Its one size is
 * the diameter, set by at most one of `r`, `w`, or `h`. `r` is a radius for
 * every channel kind: a number, a field name, a `field(...)` expression, and
 * an accessor all give a diameter of `2r`, on both axes. A data `w` or `h`
 * sizes only its own axis; the aspect lock derives the other.
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
 *  data value `{ datum, measure }`. */
const sizesOf = async (mark: any, rows: unknown) => {
  const node = await mark(rows);
  return node.args.dims.map((d: any) =>
    d.size !== null && typeof d.size === "object"
      ? { datum: d.size.datum, measure: d.size.measure }
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
    message?.includes("pass one of r, w, or h") === true,
    message
  );
}

/** Every ellipse in a display list. */
const ellipsesOf = (dl: any): { rx: number; ry: number }[] => {
  const out: { rx: number; ry: number }[] = [];
  const walk = (it: any) => {
    if (it.kind === "ellipse") out.push({ rx: it.rx, ry: it.ry });
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
  const render = (mark: unknown) =>
    chart(data)
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

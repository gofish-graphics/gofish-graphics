/**
 * Axis names (#838): a mark's `dims` option and an operator's `dir` name axes
 * the way the enclosing coordinate space does. `x`/`y` mean axis 0/1 in every
 * space; a space adds the names it declares in its transform's `aliases`
 * (polar `theta`/`r`, geo `lon`/`lat`), and those are the only other names.
 *
 * Covers: the named spelling renders exactly like the x/y spelling (polar
 * rose, spread/stack `dir`), geo's lon/lat reach the marks and the scatter,
 * circle's own `r` stays its radius under a polar scatter, and the errors (an
 * undeclared name, an axis anchor set twice).
 *
 * Run: `pnpm build && tsx src/tests/axisDims.test.ts` (wired as
 * `pnpm test:axis-dims`). Imports from `dist` for the same lodash-ESM reason as
 * `displayListEmit.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { check, items, report } from "./testHelpers";

const {
  chart,
  spread,
  stack,
  scatter,
  group,
  treemap,
  rect,
  circle,
  layer,
  datum,
  field,
  Coord,
} = GoFish as any;

declare const process: { exit(code: number): never };

/** Run `build` and return the thrown error's message, or undefined. */
async function errorOf(build: () => Promise<unknown>): Promise<string> {
  try {
    await build();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
}

const SIZE = { w: 300, h: 300 };
const WINDOW = { lon: [-170, -30], lat: [-60, 75] };
// Display-list node ids come from a global counter, so compare without them.
const withoutIds = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (k, x) => (k === "id" ? undefined : x)));
const same = (a: unknown, b: unknown) =>
  JSON.stringify(withoutIds(a)) === JSON.stringify(withoutIds(b));

const rose = [
  { month: "Jan", value: 3 },
  { month: "Feb", value: 7 },
  { month: "Mar", value: 5 },
  { month: "Apr", value: 9 },
];

const places = [
  { name: "north", lon: -100, lat: 40 },
  { name: "south", lon: -60, lat: -10 },
];

async function main() {
  console.log("\n# dims: the named spelling renders like the x/y spelling");
  {
    const roseWith = (mark: any, dir = "x") =>
      chart(rose, { coord: Coord.polar() })
        .flow(spread({ by: "month", dir, spacing: 0 }))
        .mark(mark)
        .toDisplayList(SIZE);

    const xy = await roseWith(
      rect({ w: 0.9, h: "value", emX: true, emY: true, fill: "month" })
    );
    const named = await roseWith(
      rect({
        dims: { theta: { size: 0.9 }, r: { size: "value" } },
        emX: true,
        emY: true,
        fill: "month",
      })
    );
    check(
      "polar rose: dims {theta, r} sizes ≡ w/h",
      same(xy.items, named.items)
    );
    const xyNamed = await roseWith(
      rect({
        dims: { x: { size: 0.9 }, y: { size: "value" } },
        emX: true,
        emY: true,
        fill: "month",
      })
    );
    check(
      "polar rose: dims {x, y} (always legal) ≡ w/h",
      same(xy.items, xyNamed.items)
    );
    const thetaDir = await roseWith(
      rect({ w: 0.9, h: "value", emX: true, emY: true, fill: "month" }),
      "theta"
    );
    check(
      'spread dir: "theta" ≡ dir: "x" under polar',
      same(xy.items, thetaDir.items)
    );
  }

  console.log("\n# dir resolves against the enclosing coordinate space");
  {
    const stacked = (dir: string) =>
      chart(rose, { coord: Coord.polar() })
        .flow(stack({ by: "month", dir }))
        .mark(rect({ w: "value", h: 40, emX: true, emY: true, fill: "month" }))
        .toDisplayList(SIZE);
    check(
      'stack dir: "theta" ≡ dir: "x" under polar',
      same((await stacked("x")).items, (await stacked("theta")).items)
    );
    const lonSpread = (dir: string) =>
      chart(places, { coord: Coord.geo("equalEarth", WINDOW) })
        .flow(spread({ by: "name", dir, spacing: 5 }))
        .mark(rect({ w: 10, h: 10, fill: "name" }))
        .toDisplayList(SIZE);
    check(
      'spread dir: "lon" ≡ dir: "x" under geo',
      same((await lonSpread("x")).items, (await lonSpread("lon")).items)
    );

    const undeclared = await errorOf(() =>
      chart(rose, { coord: Coord.polar() })
        .flow(spread({ by: "month", dir: "lon" }))
        .mark(rect({ w: 0.9, h: "value" }))
        .toDisplayList(SIZE)
    );
    check(
      "an undeclared dir name throws, listing the declared names",
      undeclared.includes('"lon"') && undeclared.includes("theta, r"),
      undeclared
    );
    const outside = await errorOf(() =>
      chart(rose)
        .flow(spread({ by: "month", dir: "theta" }))
        .mark(rect({ w: 10, h: "value" }))
        .toDisplayList(SIZE)
    );
    check(
      "a coord name outside any declaring coord throws",
      outside.includes('"theta"') && outside.includes("x, y"),
      outside
    );
  }

  console.log("\n# geo: lon/lat reach marks and scatter");
  {
    const doc = await chart(places, { coord: Coord.geo("equalEarth", WINDOW) })
      .flow(
        scatter({
          by: "name",
          dims: { lon: { center: "lon" }, lat: { center: "lat" } },
        })
      )
      .mark(circle({ r: 4 }))
      .toDisplayList(SIZE);
    const dots = doc.items.filter((it: any) => it.kind === "ellipse");
    const ys = dots.map((d: any) => d.cy);
    check(
      "scatter dims {lon, lat}: two dots",
      dots.length === 2,
      `${dots.length}`
    );
    check(
      "scatter dims {lon, lat}: lat 40 and lat -10 get different y",
      dots.length === 2 && Math.abs(ys[0] - ys[1]) > 1,
      JSON.stringify(ys)
    );
    const xy = await chart(places, { coord: Coord.geo("equalEarth", WINDOW) })
      .flow(scatter({ by: "name", cx: "lon", cy: "lat" }))
      .mark(circle({ r: 4 }))
      .toDisplayList(SIZE);
    check(
      "scatter dims {lon, lat} centers ≡ scatter {cx, cy}",
      same(xy.items, doc.items)
    );

    const rectsWith = (mark: any) =>
      chart(places, { coord: Coord.geo("equalEarth", WINDOW) })
        .flow(group({ by: "name" }))
        .mark(mark)
        .toDisplayList(SIZE);
    const rects = await rectsWith(
      rect({ dims: { lon: "lon", lat: "lat" }, w: 4, h: 4 })
    );
    const boxes = rects.items.filter((it: any) => it.kind === "rect");
    check(
      "rect dims {lon, lat}: lat 40 and lat -10 get different y",
      boxes.length === 2 && Math.abs(boxes[0].y - boxes[1].y) > 1,
      JSON.stringify(boxes.map((b: any) => b.y))
    );
    const rectsXY = await rectsWith(rect({ x: "lon", y: "lat", w: 4, h: 4 }));
    check(
      "rect dims {lon, lat} ≡ rect {x, y}",
      same(rects.items, rectsXY.items)
    );
  }

  console.log("\n# circle in polar: its own r stays its radius");
  {
    const doc = await chart(rose, { coord: Coord.polar() })
      .flow(
        scatter({
          by: "month",
          dims: { theta: { center: "value" }, r: { center: "value" } },
        })
      )
      .mark(circle({ r: 4 }))
      .toDisplayList(SIZE);
    const dots = doc.items.filter((it: any) => it.kind === "ellipse");
    check("four dots", dots.length === 4, `${dots.length}`);
    check(
      "every dot keeps radius 4",
      dots.every(
        (d: any) => Math.abs(d.rx - 4) < 1e-9 && Math.abs(d.ry - 4) < 1e-9
      ),
      JSON.stringify(dots.map((d: any) => [d.rx, d.ry]))
    );
  }

  console.log("\n# errors");
  {
    const bar = (opts: any, coord = Coord.polar()) =>
      chart(rose, { coord })
        .flow(spread({ by: "month", dir: "x" }))
        .mark(rect(opts))
        .toDisplayList(SIZE);

    const both = await errorOf(() => bar({ dims: { x: 1, theta: 2 }, h: 5 }));
    check(
      "dims {x, theta} (both axis 0) throws",
      both.includes("set twice"),
      both
    );
    const sizeTwice = await errorOf(() =>
      bar({ w: 1, dims: { theta: { size: 2 } }, h: 5 })
    );
    check(
      "w with dims.theta.size throws, naming w",
      sizeTwice.includes("set twice") && sizeTwice.includes("by w"),
      sizeTwice
    );
    const fine = await errorOf(() =>
      bar({ x: 0, dims: { theta: { size: 2 } }, h: 5 })
    );
    check("x with dims.theta.size is fine", fine === "", fine);
    const unknown = await errorOf(() =>
      bar({ dims: { lon: { size: 2 } }, h: 5 })
    );
    check(
      "dims name the coord does not declare throws, listing the names",
      unknown.includes('"lon"') && unknown.includes("x, y, theta, r"),
      unknown
    );
    const badKey = await errorOf(() =>
      bar({ dims: { theta: { width: 2 } }, h: 5 })
    );
    check(
      "an interval with a non-anchor key throws",
      badKey.includes('unknown key "width"'),
      badKey
    );
    const nested = await errorOf(() =>
      chart(places, { coord: Coord.geo("equalEarth", WINDOW) })
        .flow(spread({ by: "name", dir: "x" }))
        .mark(
          layer({ coord: Coord.polar() }, [
            rect({ dims: { lon: { size: 1 } }, h: 5 }),
          ])
        )
        .toDisplayList(SIZE)
    );
    check(
      "the innermost declaring coord wins (lon is not visible inside polar)",
      nested.includes('"lon"') && nested.includes("theta, r"),
      nested
    );
    const scatterSize = await errorOf(() =>
      chart(rose, { coord: Coord.polar() })
        .flow(scatter({ by: "month", dims: { theta: { size: "value" } } }))
        .mark(circle({ r: 3 }))
        .toDisplayList(SIZE)
    );
    check(
      "scatter dims with a size throws",
      scatterSize.includes("not a scatter placement"),
      scatterSize
    );
    const scatterTwice = await errorOf(() =>
      chart(rose, { coord: Coord.polar() })
        .flow(
          scatter({
            by: "month",
            cx: "value",
            dims: { theta: { center: "value" } },
          })
        )
        .mark(circle({ r: 3 }))
        .toDisplayList(SIZE)
    );
    check(
      "scatter cx with dims.theta.center throws",
      scatterTwice.includes("by cx"),
      scatterTwice
    );
  }

  console.log("\n# every coord establishes its own axis-name scope");
  {
    // wavy declares no names, so polar's theta is not visible inside it.
    const inClock = await errorOf(() =>
      chart(rose, { coord: Coord.polar() })
        .flow(spread({ by: "month", dir: "x" }))
        .mark(
          layer({ coord: Coord.wavy() }, [
            rect({ dims: { theta: { size: 1 } }, h: 5 }),
          ])
        )
        .toDisplayList(SIZE)
    );
    check(
      "theta is not visible inside a wavy space nested in polar",
      inClock.includes('"theta"') && inClock.includes("x, y"),
      inClock
    );
  }

  console.log("\n# a hook is cleared only once it has run");
  {
    const bad = await rect({ dims: { theta: { size: 1 } }, h: 5 })();
    const good = await rect({ dims: { x: { size: 7 } }, h: 5 })();
    const root = await layer([bad, good])();
    const first = await errorOf(() => root.resolveAliases());
    check(
      "the throwing hook reports its error",
      first.includes('"theta"'),
      first
    );
    check(
      "a hook queued after the throw is kept for a rerun",
      good._elaborateInAxisScope !== undefined
    );
    const again = await errorOf(() => root.resolveAliases());
    check(
      "a rerun meets the same error instead of skipping the hook",
      again.includes('"theta"'),
      again
    );
  }

  console.log("\n# scatter dims slots infer like their top-level options");
  {
    const rows = [
      { k: "a", angle: 1, lo: 1, hi: 2, name: "p" },
      { k: "b", angle: 2, lo: 2, hi: 4, name: "q" },
      { k: "c", angle: 3, lo: 3, hi: 5, name: "r" },
    ];
    // The two ends of a span: two columns with no declared unit, which
    // unify on one axis.
    const lo = field("lo");
    const hi = field("hi");
    const dots = async (opts: any, coord?: any) =>
      (
        await chart(rows, coord ? { coord } : {})
          .flow(scatter({ by: "k", ...opts }))
          .mark(circle({ r: 3 }))
          .toDisplayList(SIZE)
      ).items.filter((it: any) => it.kind === "ellipse");

    // A datum is already a value: every slot passes it through, one per
    // entry, as the top-level channel does. (A constant position is a
    // degenerate domain, so only equality with the top-level spelling is
    // checked here.)
    const dimsDatum = await errorOf(() =>
      dots({ dims: { x: datum(5), y: "angle" } })
    );
    check("dims {x: datum(5)} renders", dimsDatum === "", dimsDatum);
    check(
      "dims {x: datum(5)} ≡ x: datum(5)",
      same(
        await dots({ dims: { x: datum(5), y: "angle" } }),
        await dots({ x: datum(5), y: "angle" })
      )
    );
    check(
      "dims {x: {min, max}} ≡ x/x2",
      same(
        await dots({ dims: { x: { min: lo, max: hi } }, y: "angle" }),
        await dots({ x: lo, x2: hi, y: "angle" })
      )
    );
    // `x`, `cx` and `x2` are one kind of channel: each is discrete for a
    // non-numeric field, and each `dims` slot infers as the key it stands
    // for.
    for (const [slot, key] of [
      ["bare", "x"],
      ["min", "x"],
      ["center", "cx"],
      ["max", "x2"],
    ] as const) {
      const entry = slot === "bare" ? "name" : { [slot]: "name" };
      const viaDims = await errorOf(() =>
        dots({ dims: { x: entry }, y: "angle" })
      );
      check(
        `dims {x: ${slot} <non-numeric field>} renders`,
        viaDims === "",
        viaDims
      );
      check(
        `dims {x: ${slot} <non-numeric field>} ≡ ${key} (discrete)`,
        same(
          await dots({ dims: { x: entry }, y: "angle" }),
          await dots({ [key]: "name", y: "angle" })
        )
      );
    }
    // A non-numeric span has no data interval: either end over a
    // non-numeric field is a discrete position, which a span cannot end at,
    // and every spelling throws the same error.
    const spanErrors: string[] = [];
    for (const [spelling, opts] of [
      ["dims {x: {min, max}}", { dims: { x: { min: "name", max: "name" } } }],
      ["x/x2", { x: "name", x2: "name" }],
      ["x <non-numeric> with x2 <numeric>", { x: "name", x2: hi }],
      ["x <numeric> with x2 <non-numeric>", { x: lo, x2: "name" }],
    ] as const) {
      const err = await errorOf(() => dots({ ...opts, y: "angle" }));
      spanErrors.push(err);
      check(
        `${spelling} over a non-numeric field throws: a span takes no discrete position`,
        err.includes("not discrete positions"),
        err
      );
    }
    check(
      "every non-numeric span throws the same error, whichever end",
      spanErrors.every((e) => e === spanErrors[0]),
      JSON.stringify(spanErrors)
    );

    const mixed = await errorOf(() =>
      dots({ x: lo, dims: { x: { max: hi } }, y: "angle" })
    );
    check("x with dims.x.max is a span", mixed === "", mixed);
    check(
      "x with dims.x.max ≡ x/x2",
      same(
        await dots({ x: lo, dims: { x: { max: hi } }, y: "angle" }),
        await dots({ x: lo, x2: hi, y: "angle" })
      )
    );
    check(
      "dims.x.min with x2 ≡ x/x2",
      same(
        await dots({ dims: { x: { min: lo } }, x2: hi, y: "angle" }),
        await dots({ x: lo, x2: hi, y: "angle" })
      )
    );
    check(
      "a bare dims.x with x2 ≡ x/x2",
      same(
        await dots({ dims: { x: lo }, x2: hi, y: "angle" }),
        await dots({ x: lo, x2: hi, y: "angle" })
      )
    );
    const twice = await errorOf(() =>
      dots({ x: lo, x2: hi, dims: { x: { min: lo } }, y: "angle" })
    );
    check(
      "x and dims.x.min both setting the start throws",
      twice.includes("dims.x") && twice.includes("set twice"),
      twice
    );
    const centerTwice = await errorOf(() =>
      dots({ cx: lo, dims: { x: { center: lo } }, y: "angle" })
    );
    check(
      "cx and dims.x.center both setting the center throws",
      centerTwice.includes("dims.x") && centerTwice.includes("by cx"),
      centerTwice
    );
    const three = await errorOf(() =>
      dots({ x: lo, cx: lo, x2: hi, y: "angle" })
    );
    check(
      "x, cx and x2 on one axis throws, naming all three",
      three.includes("x, cx, x2") && three.includes("at most two"),
      three
    );
    const loneX2 = await errorOf(() => dots({ x2: "hi", y: "angle" }));
    check("a lone x2 renders", loneX2 === "", loneX2);
    check(
      "a lone dims.x.max ≡ x2",
      same(
        await dots({ dims: { x: { max: lo } }, y: "angle" }),
        await dots({ x2: lo, y: "angle" })
      )
    );
    check(
      "a lone dims.x.min ≡ x",
      same(
        await dots({ dims: { x: { min: lo } }, y: "angle" }),
        await dots({ x: lo, y: "angle" })
      )
    );
    // The removed spelling: with nothing else placing x, the scatter
    // places no axis by a field but y, so the old options name nothing.
    const old = await errorOf(() => dots({ xMin: "lo", xMax: "hi" }));
    check(
      "the removed xMin/xMax spelling alone is an error",
      old.includes("requires at least one of x or y"),
      old
    );
  }

  console.log("\n# scatter places the anchor each key names");
  {
    // A layer of two scatters shares one frame: big squares placed by the
    // keys under test, and a dot centered on each data point.
    const vs = [0, 10, 20];
    const at = (v: number[]) => v.map((n) => datum(n));
    const placed = async (opts: any, square: any = rect({ w: 40, h: 40 })) => {
      const doc = await layer([
        scatter(
          opts,
          vs.map(() => square)
        ),
        scatter(
          { cx: at(vs), cy: at(vs) },
          vs.map(() => circle({ r: 2 }))
        ),
      ]).toDisplayList(SIZE);
      const all = items(doc);
      return {
        boxes: all.filter((it: any) => it.kind === "rect"),
        dots: all.filter((it: any) => it.kind === "ellipse"),
      };
    };
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    // Each box's [left, center, right] on x and [bottom, center, top] on y
    // (y grows upward, so the start edge is the bottom).
    const xs = (b: any) => [b.x, b.x + b.w / 2, b.x + b.w];
    const ys = (b: any) => [b.y + b.h, b.y + b.h / 2, b.y];
    const lands = async (
      label: string,
      opts: any,
      ix: number,
      iy: number,
      square?: any
    ) => {
      const { boxes, dots } = await placed(opts, square);
      check(
        label,
        boxes.length === 3 &&
          dots.length === 3 &&
          boxes.every(
            (b: any, i: number) =>
              near(xs(b)[ix], dots[i].cx) && near(ys(b)[iy], dots[i].cy)
          ),
        JSON.stringify({ boxes, dots })
      );
    };
    await lands("cx/cy centers each child on its point", { cx: at(vs), cy: at(vs) }, 1, 1);
    await lands("a lone x/y puts each child's start edges on its point", { x: at(vs), y: at(vs) }, 0, 0);
    await lands("a lone x2/y2 puts each child's end edges on its point", { x2: at(vs), y2: at(vs) }, 2, 2);
    await lands("cx with y: center across, start edge along y", { cx: at(vs), y: at(vs) }, 1, 0);
    await lands(
      "dims bare / center / max read as x / cx / x2",
      { dims: { x: { center: at(vs) }, y: { max: at(vs) } } },
      1,
      2
    );
    // Two anchors fix the size: dims.x {center, max} is a true center and
    // a true end, so the child is twice as wide as center to end.
    const { boxes, dots } = await placed(
      { dims: { x: { center: at(vs), max: at(vs.map((v) => v + 2)) } }, cy: at(vs) },
      rect({ h: 20 })
    );
    const unit = (dots[1].cx - dots[0].cx) / 10;
    check(
      "dims.x {center, max}: the center is on the point and the end at max",
      boxes.length === 3 &&
        boxes.every(
          (b: any, i: number) =>
            near(b.x + b.w / 2, dots[i].cx) &&
            near(b.x + b.w, dots[i].cx + 2 * unit)
        ),
      JSON.stringify({ boxes, dots, unit })
    );
  }

  console.log("\n# treemap takes dims");
  {
    const rows = [
      { k: "a", v: 1 },
      { k: "b", v: 3 },
    ];
    const tm = async (opts: any) =>
      (
        await chart(rows)
          .flow(treemap({ by: "k", size: "v", ...opts }))
          .mark(rect({ fill: "k" }))
          .toDisplayList(SIZE)
      ).items.filter((it: any) => it.kind === "rect");
    const wh = await tm({ w: 120, h: 80 });
    const named = await tm({ dims: { x: { size: 120 }, y: { size: 80 } } });
    const full = await tm({});
    check("treemap dims {x, y} sizes ≡ w/h", same(wh, named));
    check(
      "treemap dims is not dropped (differs from no size)",
      !same(wh, full)
    );
  }

  console.log(
    "\n# a constant or empty domain renders with the default axes (#1107)"
  );
  {
    // One row: each position axis has a one-value domain, so no σ fits it to
    // the box. Its value maps to the middle of the plot (as d3 and Vega-Lite
    // map a zero-width linear domain), and its axis has one tick there. With
    // no axes the plot is the whole 300 x 300 canvas, so its middle is at 150
    // on each axis. With axes the plot is what the axes leave (#1032), and
    // each axis's one tick sits at the point.
    const mid = (n: number) => n / 2;
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    const labels = (all: any[], label: string) =>
      all.filter((it) => it.kind === "text" && it.text === label);
    // An x tick is a 1 x 4 px rect, a y tick a 4 x 1 px rect.
    const xTicks = (all: any[]) =>
      all.filter((it) => it.kind === "rect" && it.w === 1 && it.h === 4);
    const yTicks = (all: any[]) =>
      all.filter((it) => it.kind === "rect" && it.w === 4 && it.h === 1);
    const ellipses = (all: any[]) =>
      all.filter((it) => it.kind === "ellipse");
    const onePointChart = (axes: boolean) =>
      chart([{ id: 0, a: 1, b: 2 }], { axes })
        .flow(scatter({ by: "id", cx: "a", cy: "b" }))
        .mark(circle({ r: 3 }))
        .toDisplayList(SIZE);
    let onePoint: any[] = [];
    const onePointErr = await errorOf(async () => {
      onePoint = items(await onePointChart(true));
    });
    check(
      "a one-point chart renders with axes",
      onePointErr === "",
      onePointErr
    );
    const bare = ellipses(items(await onePointChart(false)));
    check(
      "the one point is at the middle of the box",
      bare.length === 1 &&
        near(bare[0].cx, mid(SIZE.w)) &&
        near(bare[0].cy, mid(SIZE.h)),
      JSON.stringify(bare)
    );
    const [dot] = ellipses(onePoint);
    const [xTick] = xTicks(onePoint);
    const [yTick] = yTicks(onePoint);
    check(
      "each axis has one tick, at the point",
      labels(onePoint, "1").length === 1 &&
        labels(onePoint, "2").length === 1 &&
        xTicks(onePoint).length === 1 &&
        yTicks(onePoint).length === 1 &&
        near(xTick.x + 0.5, dot?.cx) &&
        near(yTick.y + 0.5, dot?.cy),
      JSON.stringify({ dot, xTick, yTick })
    );

    // A constant datum position across several rows.
    const constantChart = (axes: boolean) =>
      chart(
        [
          { k: "a", v: 1 },
          { k: "b", v: 2 },
        ],
        { axes }
      )
        .flow(scatter({ by: "k", cx: datum(5), cy: "v" }))
        .mark(circle({ r: 3 }))
        .toDisplayList(SIZE);
    let constant: any[] = [];
    const constErr = await errorOf(async () => {
      constant = items(await constantChart(true));
    });
    check("a constant datum x renders with axes", constErr === "", constErr);
    const bareDots = ellipses(items(await constantChart(false)));
    const dots = ellipses(constant);
    const fives = xTicks(constant);
    check(
      "the constant x is at the middle of the box, with one tick there",
      bareDots.length === 2 &&
        bareDots.every((d) => near(d.cx, mid(SIZE.w))) &&
        dots.length === 2 &&
        labels(constant, "5").length === 1 &&
        fives.length === 1 &&
        dots.every((d) => near(d.cx, fives[0].x + 0.5)),
      JSON.stringify({ bareDots, dots, fives })
    );

    // No rows at all.
    const emptyErr = await errorOf(() =>
      chart([])
        .flow(spread({ by: "c", dir: "x" }))
        .mark(rect({ w: 10, h: "v" }))
        .toDisplayList(SIZE)
    );
    check("an empty chart renders with axes", emptyErr === "", emptyErr);
  }

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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

const {
  chart,
  spread,
  stack,
  scatter,
  group,
  treemap,
  rect,
  circle,
  polar,
  wavy,
  geo,
  layer,
  datum,
  field,
} = GoFish as any;

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
      chart(rose, { coord: polar() })
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
      chart(rose, { coord: polar() })
        .flow(stack({ by: "month", dir }))
        .mark(rect({ w: "value", h: 40, emX: true, emY: true, fill: "month" }))
        .toDisplayList(SIZE);
    check(
      'stack dir: "theta" ≡ dir: "x" under polar',
      same((await stacked("x")).items, (await stacked("theta")).items)
    );
    const lonSpread = (dir: string) =>
      chart(places, { coord: geo("equalEarth", WINDOW) })
        .flow(spread({ by: "name", dir, spacing: 5 }))
        .mark(rect({ w: 10, h: 10, fill: "name" }))
        .toDisplayList(SIZE);
    check(
      'spread dir: "lon" ≡ dir: "x" under geo',
      same((await lonSpread("x")).items, (await lonSpread("lon")).items)
    );

    const undeclared = await errorOf(() =>
      chart(rose, { coord: polar() })
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
    const doc = await chart(places, { coord: geo("equalEarth", WINDOW) })
      .flow(scatter({ by: "name", dims: { lon: "lon", lat: "lat" } }))
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
    const xy = await chart(places, { coord: geo("equalEarth", WINDOW) })
      .flow(scatter({ by: "name", x: "lon", y: "lat" }))
      .mark(circle({ r: 4 }))
      .toDisplayList(SIZE);
    check(
      "scatter dims {lon, lat} ≡ scatter {x, y}",
      same(xy.items, doc.items)
    );

    const rectsWith = (mark: any) =>
      chart(places, { coord: geo("equalEarth", WINDOW) })
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
    const doc = await chart(rose, { coord: polar() })
      .flow(scatter({ by: "month", dims: { theta: "value", r: "value" } }))
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
    const bar = (opts: any, coord = polar()) =>
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
      chart(places, { coord: geo("equalEarth", WINDOW) })
        .flow(spread({ by: "name", dir: "x" }))
        .mark(
          layer({ coord: polar() }, [
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
      chart(rose, { coord: polar() })
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
      chart(rose, { coord: polar() })
        .flow(scatter({ by: "month", x: "value", dims: { theta: "value" } }))
        .mark(circle({ r: 3 }))
        .toDisplayList(SIZE)
    );
    check(
      "scatter x with dims.theta throws",
      scatterTwice.includes("by x"),
      scatterTwice
    );
  }

  console.log("\n# every coord establishes its own axis-name scope");
  {
    // wavy declares no names, so polar's theta is not visible inside it.
    const inClock = await errorOf(() =>
      chart(rose, { coord: polar() })
        .flow(spread({ by: "month", dir: "x" }))
        .mark(
          layer({ coord: wavy() }, [
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
    // The two ends of a span share one measure.
    const lo = field("lo", "span");
    const hi = field("hi", "span");
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
      "dims {x: {min, max}} ≡ xMin/xMax",
      same(
        await dots({ dims: { x: { min: lo, max: hi } }, y: "angle" }),
        await dots({ xMin: lo, xMax: hi, y: "angle" })
      )
    );
    // `x` is discrete for a non-numeric field; `xMin`/`xMax` are not.
    check(
      "dims {x: <non-numeric field>} ≡ x (both discrete)",
      same(
        await dots({ dims: { x: "name" }, y: "angle" }),
        await dots({ x: "name", y: "angle" })
      )
    );
    const minDims = await dots({
      dims: { x: { min: "name", max: "name" } },
      y: "angle",
    });
    const minTop = await dots({ xMin: "name", xMax: "name", y: "angle" });
    check(
      "dims {x: {min: <non-numeric>}} ≡ xMin (neither discrete)",
      same(minDims, minTop),
      JSON.stringify([minDims, minTop])
    );

    const mixed = await errorOf(() =>
      dots({ xMin: lo, dims: { x: { max: hi } }, y: "angle" })
    );
    check("xMin with dims.x.max is a span", mixed === "", mixed);
    check(
      "xMin with dims.x.max ≡ xMin/xMax",
      same(
        await dots({ xMin: lo, dims: { x: { max: hi } }, y: "angle" }),
        await dots({ xMin: lo, xMax: hi, y: "angle" })
      )
    );
    const lone = await errorOf(() => dots({ xMin: "lo", y: "angle" }));
    check(
      "a lone top-level xMin throws, naming it",
      lone.includes("xMin") && lone.includes("both ends"),
      lone
    );
    const loneDims = await errorOf(() =>
      dots({ dims: { x: { min: "lo" } }, y: "angle" })
    );
    check(
      "a lone dims.x.min throws, naming it",
      loneDims.includes("dims.x") && loneDims.includes("both ends"),
      loneDims
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

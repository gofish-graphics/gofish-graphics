import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  Color,
  Coord,
  derive,
  Domain,
  field,
  group,
  line,
  partition,
  Bin,
  rect,
  circle,
  ribbon,
  scatter,
  selectAll,
  spread,
  stack,
  Trait,
  Unit,
} from "../../src/lib";
import { seafood } from "../../src/data/catch";
import { streamgraphData } from "../../src/data/streamgraphData";
import { penguins } from "../../src/data/penguins";
import { titanic } from "../../src/data/titanic";
import { newCarColors } from "../../src/data/newCarColors";

/**
 * THROWAWAY prototype stories for the stacking design-space matrix
 * (proposals/stacking/NOTES-matrix.md). Every story uses today's public API;
 * none is a gallery example. They render the chart types that are new
 * relative to the croissant-sampling constraints grid (#1332).
 */
const meta: Meta = { title: "Proposals/Stacking Matrix" };
export default meta;

const W = 420;
const H = 240;

const render = (build: (c: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

// ---------------------------------------------------------------------------
// Stacked bars vs grouped bars: the same rows, the same mark, two flows.

export const StackedBars = render((c) =>
  chart(seafood, { w: W, h: H })
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ w: 32, h: "count", fill: "species" }))
    .render(c)
);

export const GroupedBars = render((c) =>
  chart(seafood, { w: W, h: H })
    .flow(
      spread({ by: "lake", dir: "x", spacing: 12 }),
      spread({ by: "species", dir: "x", spacing: 0 })
    )
    .mark(rect({ w: 7, h: "count", fill: "species" }))
    .render(c)
);

// The morph between them, as d3's stacked-to-grouped does it: both layouts
// are computed in data (y0/y1 and an x offset per bar), and a frame at time
// t interpolates the data. No operator morphs; the rows do.
const LAKES = [...new Set(seafood.map((d) => d.lake))];
const SPECIES = [...new Set(seafood.map((d) => d.species))];
const morphRows = (t: number) => {
  const run = new Map<string, number>();
  return seafood.map((d) => {
    const i = LAKES.indexOf(d.lake);
    const j = SPECIES.indexOf(d.species);
    const y0 = run.get(d.lake) ?? 0;
    run.set(d.lake, y0 + d.count);
    const lerp = (a: number, b: number) => a + (b - a) * t;
    return {
      ...d,
      id: `${d.lake}/${d.species}`,
      px: lerp(i * 6 + 2, i * 6 + j),
      lo: lerp(y0, 0),
      hi: lerp(y0 + d.count, d.count),
    };
  });
};
const morph = (t: number) =>
  render((c) =>
    chart(morphRows(t), { w: W, h: H })
      .flow(scatter({ by: "id", x: "px", yMin: "lo", yMax: "hi" }))
      .mark(rect({ w: 9, fill: "species" }))
      .render(c)
  );
export const MorphT0 = morph(0);
export const MorphT05 = morph(0.5);
export const MorphT1 = morph(1);

// ---------------------------------------------------------------------------
// Diverging stacked bar (Likert): the stack's origin is the midpoint of an
// ordered, diverging `by` column (the gallery Likert, smaller).
const LEVELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
const survey = [
  ["Docs are clear", [12, 22, 38, 86, 42]],
  ["API is easy", [26, 48, 50, 54, 22]],
  ["Errors help", [58, 64, 36, 30, 12]],
  ["Fast enough", [8, 18, 44, 80, 50]],
].flatMap(([question, counts]) =>
  (counts as number[]).map((count, i) => ({ question, response: LEVELS[i], count }))
);
export const Likert = render((c) =>
  chart(survey, {
    schema: {
      response: Unit({ domain: Domain.discrete(LEVELS), traits: [Trait.diverging()] }),
    },
    color: Color.palette({
      "Strongly disagree": "#ca0020",
      Disagree: "#f4a582",
      Neutral: "#d9d9d9",
      Agree: "#92c5de",
      "Strongly agree": "#0571b0",
    }),
    w: W,
    h: H,
  })
    .flow(spread({ by: "question", dir: "y" }), stack({ by: "response", dir: "x" }))
    .mark(rect({ h: 24, w: "count", fill: "response" }))
    .render(c)
);

// Population pyramid: a Likert with two levels. The midpoint of the order
// [Male, Female] is the boundary between them, so each age's stack is
// centered there and both parts are counts.
const AGES = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"];
const male = [52, 55, 60, 58, 50, 44, 30, 16];
const female = [50, 53, 59, 59, 52, 47, 35, 24];
const pyramidRows = AGES.flatMap((age, i) => [
  { age, sex: "Male", people: male[i] },
  { age, sex: "Female", people: female[i] },
]);
export const PopulationPyramid = render((c) =>
  chart(pyramidRows, {
    schema: {
      sex: Unit({ domain: Domain.discrete(["Male", "Female"]), traits: [Trait.diverging()] }),
    },
    w: W,
    h: H,
  })
    .flow(spread({ by: "age", dir: "y", spacing: 2, reverse: true }), stack({ by: "sex", dir: "x" }))
    .mark(rect({ h: 24, w: "people", fill: "sex" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Waterfall: each step starts where the one before ended. A stack along y
// (signed parts as vectors, #773) whose parts are also placed along x.
const steps = [
  { step: "Start", i: 0, delta: 120 },
  { step: "Sales", i: 1, delta: 60 },
  { step: "Refunds", i: 2, delta: -25 },
  { step: "Costs", i: 3, delta: -70 },
  { step: "Grants", i: 4, delta: 30 },
];
export const WaterfallStackPinnedX = render((c) =>
  chart(steps, { w: W, h: H })
    .flow(stack({ by: "step", dir: "y" }))
    .mark(rect({ x: "i", w: 30, h: "delta", fill: "step" }))
    .render(c)
);
// The same in data: running sums in derive, then intervals.
const waterfallRows = (() => {
  let at = 0;
  return steps.map((s) => {
    const lo = Math.min(at, at + s.delta);
    const hi = Math.max(at, at + s.delta);
    at += s.delta;
    return { ...s, lo, hi };
  });
})();
export const WaterfallDerive = render((c) =>
  chart(waterfallRows, { w: W, h: H })
    .flow(scatter({ by: "step", x: "i", yMin: "lo", yMax: "hi" }))
    .mark(rect({ w: 30, fill: "step" }))
    .render(c)
);

// Gantt with dependencies: each task starts when the one before ends. The
// same diagonal stack, along x this time.
const tasks = [
  { task: "Design", row: 3, days: 5 },
  { task: "Build", row: 2, days: 9 },
  { task: "Test", row: 1, days: 4 },
  { task: "Ship", row: 0, days: 2 },
];
export const GanttStack = render((c) =>
  chart(tasks, { w: W, h: 160 })
    .flow(stack({ by: "task", dir: "x" }))
    .mark(rect({ y: "row", h: 20, w: "days", fill: "task" }))
    .render(c)
);
const ganttRows = (() => {
  let at = 0;
  return tasks.map((t) => {
    const r = { ...t, start: at, end: at + t.days };
    at += t.days;
    return r;
  });
})();
export const GanttIntervals = render((c) =>
  chart(ganttRows, { w: W, h: 160 })
    .flow(spread({ by: "task", dir: "y", spacing: 6 }), scatter({ by: "task", xMin: "start", xMax: "end" }))
    .mark(rect({ h: 20, fill: "task" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Cumulative line: a running sum along x. In data today.
const cumRows = (() => {
  let at = 0;
  return streamgraphData
    .filter((d) => d.c === 0)
    .map((d) => ({ ...d, total: (at += d.y) }));
})();
export const CumulativeLine = render((c) =>
  chart(cumRows, { w: W, h: H })
    .flow(scatter({ by: "x", x: "x", y: "total" }))
    .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
    .render(c)
);

// The cumulative line as a stack: the waterfall's parts, hidden, with a line
// through their heads. One stack along y whose parts are placed along x.
export const CumulativeStack = render((c) =>
  chart(
    streamgraphData.filter((d) => d.c === 0),
    { w: W, h: H }
  )
    .flow(stack({ by: "x", dir: "y" }))
    .mark(rect({ x: "x", w: 2, h: "y", fill: "#ccc" }).name("steps"))
    .layer(
      chart(selectAll("steps")).mark(
        line({
          stroke: "steelblue",
          strokeWidth: 2,
          source: { y: "end" },
          target: { y: "end" },
        })
      )
    )
    .render(c)
);

// ---------------------------------------------------------------------------
// Nested stacks: a stack of stacks along one axis is one stack (associative),
// and a spread of stacks along the same axis keeps a gap between segments.
export const StackOfStacks = render((c) =>
  chart(seafood, { w: 120, h: H })
    .flow(stack({ by: "lake", dir: "y" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ w: 40, h: "count", fill: "species" }))
    .render(c)
);
export const SpreadOfStacks = render((c) =>
  chart(seafood, { w: 120, h: H })
    .flow(spread({ by: "lake", dir: "y", spacing: 4 }), stack({ by: "species", dir: "y" }))
    .mark(rect({ w: 40, h: "count", fill: "species" }))
    .render(c)
);
// Stacked-grouped: species stacked, inside lakes grouped by a region.
const region = (lake: string) => (lake < "Lake D" ? "North" : "South");
export const StackedGrouped = render((c) =>
  chart(
    seafood.map((d) => ({ ...d, region: region(d.lake) })),
    { w: W, h: H }
  )
    .flow(
      spread({ by: "region", dir: "x", spacing: 24 }),
      spread({ by: "lake", dir: "x", spacing: 4 }),
      stack({ by: "species", dir: "y" })
    )
    .mark(rect({ w: 24, h: "count", fill: "species" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Icicle and sunburst: one row per node per depth, then a spread of depths
// and a stack of the nodes at each depth. Every depth sums to the same
// total, so the columns line up without a constraint between them.
const hierarchyRows = (() => {
  const levels: (keyof (typeof titanic)[0])[] = ["class", "sex", "survived"];
  const rows: { depth: number; node: string; top: string; count: number }[] = [];
  for (let k = 0; k < levels.length; k++) {
    const sums = new Map<string, number>();
    for (const d of titanic) {
      const path = levels
        .slice(0, k + 1)
        .map((l) => d[l])
        .join("/");
      sums.set(path, (sums.get(path) ?? 0) + d.count);
    }
    for (const [node, count] of [...sums].sort(([a], [b]) => (a < b ? -1 : 1)))
      rows.push({ depth: k, node, top: node.split("/")[0], count });
  }
  return rows;
})();
export const Icicle = render((c) =>
  chart(hierarchyRows, { w: W, h: H })
    .flow(spread({ by: "depth", dir: "x", spacing: 2 }), stack({ by: "node", dir: "y" }))
    .mark(rect({ w: 60, h: "count", fill: "top", stroke: "white", strokeWidth: 1 }))
    .render(c)
);
export const Sunburst = render((c) =>
  chart(hierarchyRows, { coord: Coord.clock(), w: 300, h: 300, axes: false })
    .flow(spread({ by: "depth", dir: "y", spacing: 2 }), stack({ by: "node", dir: "x" }))
    .mark(rect({ h: 40, w: "count", fill: "top" }))
    .render(c)
);
export const SunburstStroked = render((c) =>
  chart(hierarchyRows, { coord: Coord.clock(), w: 300, h: 300, axes: false })
    .flow(spread({ by: "depth", dir: "y", spacing: 2 }), stack({ by: "node", dir: "x" }))
    .mark(rect({ h: 40, w: "count", fill: "top", stroke: "white", strokeWidth: 1 }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Stacked histogram: partition cells along x, a stack of species in each.
const mass = penguins.filter((p) => p["Body Mass (g)"] != null);
export const StackedHistogram = render((c) =>
  chart(mass, { w: W, h: H })
    .flow(
      partition({ by: field("Body Mass (g)").bin(Bin.step(250)), dir: "x" }),
      stack({ by: "Species", dir: "y" })
    )
    .mark(rect({ h: field("Species").count(), fill: "Species" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Densities on a shared grid, one per species (a Gaussian KDE).
const kde = (xs: number[], bw: number) => (v: number) =>
  xs.reduce((s, x) => s + Math.exp(-0.5 * ((v - x) / bw) ** 2), 0) /
  (xs.length * bw * Math.sqrt(2 * Math.PI));
const SPEC = ["Adelie", "Chinstrap", "Gentoo"];
const grid = Array.from({ length: 67 }, (_, i) => 2500 + i * 60);
const densityRows = SPEC.flatMap((s) => {
  const xs = mass.filter((p) => p.Species === s).map((p) => p["Body Mass (g)"] as number);
  const f = kde(xs, 250);
  // weight by group size so the stack is the density of all penguins
  return grid.map((v) => ({ Species: s, v, density: f(v) * xs.length * 1000 }));
});

export const StackedDensity = render((c) =>
  chart(densityRows, { w: W, h: H })
    .flow(scatter({ by: "v", x: "v" }), stack({ by: "Species", dir: "y" }))
    .mark(ribbon({ h: "density", fill: "Species" }))
    .render(c)
);

// Conditional density (ggplot's position = "fill"): at each x the stack is
// divided by share, so every slice has the same height.
export const ConditionalDensity = render((c) =>
  chart(densityRows, { w: W, h: H })
    .flow(
      scatter({ by: "v", x: "v", h: 200 }),
      stack({ by: "Species", dir: "y", size: field("density").normalize() })
    )
    .mark(ribbon({ fill: "Species" }))
    .render(c)
);

// The same flow, drawn in two tiers: invisible pieces, then a ribbon per
// species through them (the fused form above fails).
export const ConditionalDensityTwoTier = render((c) =>
  chart(densityRows, { w: W, h: H })
    .flow(
      scatter({ by: "v", x: "v", h: 160 }),
      stack({ by: "Species", dir: "y", size: field("density").normalize() })
    )
    .mark(rect({ w: 0.1, fill: "Species" }).name("pts"))
    .layer(
      chart(selectAll("pts"))
        .flow(group({ by: "Species" }))
        .mark(ribbon({ fill: "Species" }))
    )
    .render(c)
);

// Violin: one density mirrored about its middle. A point y centers each
// slice, so the ribbon of h = density is symmetric.
export const Violin = render((c) =>
  chart(densityRows, { w: W, h: H })
    .flow(
      spread({ by: "Species", dir: "y", spacing: 12 }),
      scatter({ by: "v", x: "v", y: 0 })
    )
    .mark(ribbon({ h: "density", fill: "Species" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Horizon chart: one series cut into bands of height B along y, each band
// moved down to the baseline and overlaid. A divide by cells along y, then
// a re-layout of the pieces (an overlay, not a stack).
const B = 30;
const series = streamgraphData.filter((d) => d.c === 0);
const horizonRows = [0, 1, 2].flatMap((band) =>
  series.map((d) => ({
    x: d.x,
    band,
    v: Math.max(0, Math.min(B, d.y - band * B)),
  }))
);
export const Horizon = render((c) =>
  chart(horizonRows, {
    w: W,
    h: 80,
    color: Color.palette({ 0: "#c6dbef", 1: "#6baed6", 2: "#08519c" }),
  })
    .flow(group({ by: "band" }), scatter({ by: "x", x: "x" }))
    .mark(ribbon({ h: "v", fill: "band" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Two series sampled on different x grids. "For each x, stack" (F5) stacks
// only the rows that share an x, so each band drops to the baseline at the
// other series' samples. A stack of whole functions would add f + g at
// every x (each read between its samples), which needs a shared domain.
const gridA = [0, 2, 4, 6, 8].map((x) => ({ x, y: 20 + 10 * Math.sin(x), c: "A" }));
const gridB = [1, 3, 5, 7, 9].map((x) => ({ x, y: 15 + 8 * Math.cos(x), c: "B" }));
export const MismatchedGrids = render((c) =>
  chart([...gridA, ...gridB], { w: W, h: H })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
    .render(c)
);
// The same rows resampled to the union of the grids (linear interpolation
// in derive): now each x has both series, and the stack is right.
const lerpAt = (pts: { x: number; y: number }[], x: number) => {
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  const i = pts.findIndex((p) => p.x >= x);
  const a = pts[i - 1];
  const b = pts[i];
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
};
export const MismatchedGridsResampled = render((c) =>
  chart(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((x) => [
      { x, c: "A", y: lerpAt(gridA, x) },
      { x, c: "B", y: lerpAt(gridB, x) },
    ]),
    { w: W, h: H }
  )
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
    .render(c)
);

// Ridgelines spaced by box edges: spread's "edge" spacing reads each
// ridge's box (its peak), so no two ridges overlap, but the gaps are as big
// as the tallest point of each ridge. A contour (profile) spacing would let
// the ridges nest, as a tidy tree's subtrees do; the engine has no profile
// extent today.
export const RidgelineBoxSpaced = render((c) =>
  chart(
    streamgraphData.filter((d) => d.c < 4),
    { w: W, h: H }
  )
    .flow(spread({ by: "c", dir: "y", spacing: 0 }), scatter({ by: "x", x: "x" }))
    .mark(ribbon({ h: "y", fill: "c", stroke: "white", strokeWidth: 1 }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Radial stacked area: the flow of a stacked area in polar coordinates.
export const RadialStackedArea = render((c) =>
  chart(streamgraphData, { coord: Coord.polar(), w: 300, h: 300, axes: false })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c" }))
    .render(c)
);

// ---------------------------------------------------------------------------
// Error band: a ribbon placed by an interval at each x. Nothing stacks.
const bandRows = series.map((d) => ({ x: d.x, mean: d.y, lo: d.y * 0.8, hi: d.y * 1.2 }));
export const ErrorBand = render((c) =>
  chart(bandRows, { w: W, h: H })
    .flow(scatter({ by: "x", x: "x", yMin: "lo", yMax: "hi" }))
    .mark(ribbon({ fill: "#9ecae1", opacity: 0.6 }))
    .layer(
      chart(bandRows)
        .flow(scatter({ by: "x", x: "x", y: "mean" }))
        .mark(line({ stroke: "#08519c", strokeWidth: 2 }))
    )
    .render(c)
);

// ---------------------------------------------------------------------------
// Bump chart: the ribbon chart's structure with spread instead of stack.
// Ranks are slots, not amounts; nothing adds up.
const years = [2000, 2003, 2006, 2009, 2012, 2015];
const bumpRows = newCarColors.filter((d) => years.includes(d.Year) && d.Rank <= 6);
export const Bump = render((c) =>
  chart(bumpRows, { w: W, h: H })
    .flow(
      spread({ by: "Year", dir: "x", spacing: 56 }),
      spread({ by: field("Color").sort("Rank"), dir: "y", spacing: 12, reverse: true })
    )
    .mark(circle({ r: 5, fill: "Color" }).name("dots"))
    .layer(
      chart(selectAll("dots"))
        .flow(group({ by: "Color" }))
        .mark(line({ stroke: "Color", strokeWidth: 2 }))
    )
    .render(c)
);

// ---------------------------------------------------------------------------
// Slope chart: two positions per series joined by a line. Pinned y, no stack.
const slopeRows = ["Lake A", "Lake B", "Lake C", "Lake D"].flatMap((lake) =>
  ["Bass", "Trout"].map((species, k) => ({
    lake,
    species,
    when: k === 0 ? "before" : "after",
    count: seafood.find((d) => d.lake === lake && d.species === species)!.count,
  }))
);
export const Slope = render((c) =>
  chart(slopeRows, { w: 240, h: H })
    .flow(spread({ by: "when", dir: "x", spacing: 140 }), scatter({ by: "lake", y: "count" }))
    .mark(line({ stroke: "lake", strokeWidth: 2 }))
    .render(c)
);

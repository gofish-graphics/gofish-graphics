/**
 * `.tooltip()` (#1395): the focus behaviors on hand-built frames, the
 * content of the box, the number format, where the box sits, the static
 * `<title>`, and the wire. The interaction (hover, re-runs) is in
 * `tooltipInteraction.test.ts`.
 *
 * Run: `tsx src/tests/tooltip.test.ts` (wired as `pnpm test:tooltip`).
 */
import {
  chart,
  circle,
  Coord,
  fun,
  group,
  line,
  rect,
  scatter,
  spread,
  stack,
  Serialize,
  Unit,
} from "../lib";
import { Frontend } from "gofish-ir";
import {
  defaultFocus,
  Focus,
  type Candidate,
  type Frame,
} from "../interaction/focus";
import {
  candidatesOf,
  pathSegments,
  positionAxes,
  TooltipFocus,
  type FocusMark,
} from "../interaction/tooltipFocus";
import { runLayout } from "../ast/gofish";
import { breadthFirst } from "../ast/_node";
import { InteractionRuntime } from "../interaction/runtime";
import { UNDEFINED } from "../ast/underlyingSpace";
import { formatValue } from "../ast/tooltip/content";
import { tooltipSeat } from "../ast/tooltip/place";
import { rowsKey } from "../ast/tooltip/request";
import { check, items, report } from "./testHelpers";
import { catchLocationsArray, seafood } from "../data/catch";

/* --------------------------------- focus --------------------------------- */

/** A bar drawn from `x0` to `x1` at row `y`, 20 px tall: placed on y only. */
const bar = (key: string, x1: number, y: number): Candidate => {
  const box = { x0: 0, y0: y - 10, x1, y1: y + 10 };
  return {
    key,
    datum: [],
    box,
    position: { y },
    outline: [{ box, round: false }],
  };
};
const bars = [bar("long", 300, 10), bar("short", 40, 40), bar("mid", 150, 70)];
const frame = (
  x: number,
  y: number,
  current?: Candidate,
  candidates = bars
): Frame => ({ pointer: { x, y }, candidates, current, clicked: false });
const pick = (f: Frame) => defaultFocus(f).choice?.key;

console.log("# focus: a hit wins");
check("inside the long bar", pick(frame(100, 12)) === "long");
check("inside the short bar", pick(frame(20, 40)) === "short");

console.log("# focus: the row decides, right of a short bar");
// Right of the short bar, in its row: its row (y) is the nearest position,
// though the long bar's box is nearer.
check("right of the short bar", pick(frame(200, 40)) === "short");
check("Focus.closest alone ignores x", Focus.closest()(frame(250, 69)).choice?.key === "mid");

console.log("# focus: stickiness");
// Halfway between two rows, 1 px nearer the long bar: a fresh pointer takes
// the long one, the current (short) one keeps it with its 4 px head start.
check("fresh: the nearer row", pick(frame(200, 24)) === "long");
check("current: the 4 px head start", pick(frame(200, 24, bars[1])) === "short");
check(
  "more than 4 px nearer another row moves it",
  pick(frame(200, 18, bars[1])) === "long"
);

console.log("# focus: the hull limit and its hysteresis");
// The hull of the bars spans x 0..300, y 0..80.
check("8 px past the hull: a choice", pick(frame(308, 10)) === "long");
check("9 px past the hull: none", pick(frame(309, 10)) === undefined);
check("with a focus, 12 px: still a choice", pick(frame(312, 10, bars[0])) === "long");
check("with a focus, 13 px: none", pick(frame(313, 10, bars[0])) === undefined);
check("no pointer: none", defaultFocus({ ...frame(0, 0), pointer: undefined }).choice === undefined);

console.log("# focus: a mark placed on no axis is as near as its outline");
{
  const seg = (key: string, y: number): Candidate => {
    const a = { x: 0, y };
    const b = { x: 100, y };
    const box = { x0: 0, y0: y, x1: 100, y1: y };
    return { key, datum: [], box, position: {}, outline: [{ box, round: false, segment: [a, b] }] };
  };
  const lines = [seg("top", 0), seg("bottom", 50)];
  check("nearest line", pick(frame(50, 30, undefined, lines)) === "bottom");
  check("pathSegments: M L L", JSON.stringify(pathSegments("M0,0L10,0L10,5")) ===
    JSON.stringify([[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 10, y: 0 }, { x: 10, y: 5 }]]),
    pathSegments("M0,0L10,0L10,5"));
  check("pathSegments: relative and h/v", JSON.stringify(pathSegments("m1 1 h4 v2 z").map(([, b]) => b)) ===
    JSON.stringify([{ x: 5, y: 1 }, { x: 5, y: 3 }, { x: 1, y: 1 }]),
    pathSegments("m1 1 h4 v2 z"));
}

console.log("# focus: a line is as near as its drawn path");
{
  /** A polyline through `pts`, drawn across its data: no position. */
  const poly = (key: string, pts: [number, number][]): Candidate => {
    const outline = pts.slice(1).map(([x, y], i) => {
      const a = { x: pts[i][0], y: pts[i][1] };
      const b = { x, y };
      const box = {
        x0: Math.min(a.x, b.x),
        y0: Math.min(a.y, b.y),
        x1: Math.max(a.x, b.x),
        y1: Math.max(a.y, b.y),
      };
      return { box, round: false, segment: [a, b] as const };
    });
    const box = {
      x0: Math.min(...outline.map((p) => p.box.x0)),
      y0: Math.min(...outline.map((p) => p.box.y0)),
      x1: Math.max(...outline.map((p) => p.box.x1)),
      y1: Math.max(...outline.map((p) => p.box.y1)),
    };
    return { key, datum: [], box, position: {}, outline };
  };
  // Two rising lines, `upper` 40 px above `lower` at every x.
  const upper = poly("upper", [[0, 60], [100, 20], [200, 0]]);
  const lower = poly("lower", [[0, 100], [100, 60], [200, 40]]);
  const two = [upper, lower];
  check("between them, nearer the upper", pick(frame(50, 45, undefined, two)) === "upper");
  check("between them, nearer the lower", pick(frame(50, 75, undefined, two)) === "lower");
  check("on the lower line", pick(frame(150, 50, undefined, two)) === "lower");
  // Their boxes overlap (y 20-60 is in both), so a box measure could not
  // tell them apart there; the path can.
  check("where the boxes overlap: upper", pick(frame(150, 25, undefined, two)) === "upper");
  check("where the boxes overlap: lower", pick(frame(150, 45, undefined, two)) === "lower");
  // A crossing: `rise` and `fall` meet at (100, 50).
  const rise = poly("rise", [[0, 100], [200, 0]]);
  const fall = poly("fall", [[0, 0], [200, 100]]);
  const cross = [rise, fall];
  check("left of the crossing, above: fall", pick(frame(40, 25, undefined, cross)) === "fall");
  check("left of the crossing, below: rise", pick(frame(40, 75, undefined, cross)) === "rise");
  check("right of the crossing, above: rise", pick(frame(160, 25, undefined, cross)) === "rise");
  // 1 px below the crossing both are as near: the current one stays.
  check("by the crossing, current fall stays", pick(frame(100, 51, fall, cross)) === "fall");
  check("by the crossing, current rise stays", pick(frame(100, 51, rise, cross)) === "rise");
  // One line's box holds the other line: a flat line inside a tall zigzag's
  // box is still picked near it.
  const zig = poly("zig", [[0, 0], [50, 100], [100, 0], [150, 100], [200, 0]]);
  const flat = poly("flat", [[60, 50], [90, 50]]);
  check("inside another line's box: the nearer path", pick(frame(65, 54, undefined, [zig, flat])) === "flat");
  // A thin line needs no exact aim: 3 px off its stroke is the line.
  check("3 px off the stroke", pick(frame(100, 23, undefined, two)) === "upper");
}

console.log("# focus: on a line drawn through rows, the nearest row");
{
  /** A line through rows at `pts`: its path, and a point per row. */
  const through = (key: string, pts: [number, number][]): Candidate => {
    const outline = pts.slice(1).map(([x, y], i) => {
      const a = { x: pts[i][0], y: pts[i][1] };
      const b = { x, y };
      const box = {
        x0: Math.min(a.x, b.x),
        y0: Math.min(a.y, b.y),
        x1: Math.max(a.x, b.x),
        y1: Math.max(a.y, b.y),
      };
      return { box, round: false, segment: [a, b] as const };
    });
    const box = {
      x0: Math.min(...pts.map((p) => p[0])),
      y0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      y1: Math.max(...pts.map((p) => p[1])),
    };
    const points = pts.map(([x, y], i): Candidate => {
      const b = { x0: x, y0: y, x1: x, y1: y };
      return {
        key: `${key}#${i}`,
        datum: [{ i }],
        box: b,
        position: { x, y },
        outline: [{ box: b, round: true }],
      };
    });
    return { key, datum: [], box, position: {}, outline, points };
  };
  // Five rows 100 px apart; `low` runs 60 px under `high`.
  const xs = [0, 100, 200, 300, 400];
  const high = through("high", xs.map((x) => [x, 40] as [number, number]));
  const low = through("low", xs.map((x) => [x, 100] as [number, number]));
  const lines = [high, low];
  const at = (x: number, y: number, current?: Candidate) =>
    defaultFocus(frame(x, y, current, lines)).choice?.key;
  const pointOf = (key: string | undefined) =>
    lines.flatMap((l) => l.points!).find((p) => p.key === key);
  check("on a row's point: that row", at(100, 40) === "high#1");
  check("between two rows, nearer the second", at(160, 42) === "high#2");
  check("between two rows, nearer the first", at(140, 42) === "high#1");
  check("past the last row: the last row", at(405, 40) === "high#4");
  check("before the first row: the first row", at(-5, 40) === "high#0");
  check("nearer the low line: its row", at(210, 90) === "low#2");
  // The current point keeps a 4 px head start over its neighbor.
  check("by the middle, the current row stays", at(152, 40, pointOf("high#1")) === "high#1");
  check("past the head start, the next row", at(155, 40, pointOf("high#1")) === "high#2");
  // The current point counts as its line when the lines are chosen.
  check(
    "between the lines, the current line stays",
    at(100, 71, pointOf("high#1")) === "high#1" &&
      at(100, 71, pointOf("low#1")) === "low#1"
  );
  // A sweep along a line: the focus changes exactly when the nearest row
  // does, once per row.
  let current: Candidate | undefined;
  let changes = 0;
  for (let x = 0; x <= 400; x += 5) {
    const choice = defaultFocus(frame(x, 41, current, lines)).choice;
    if (choice?.key !== current?.key) changes++;
    current = choice;
  }
  check(`a sweep along five rows: five changes of focus (${changes})`, changes === 5, changes);
  check("far from the lines: none", at(200, 300) === undefined);
}

console.log("# candidates: long paths and many marks");
{
  /** A stand-in for a mark's node: its uid, no children, no parent, no
   *  data extent on either axis. */
  const fakeNode = (uid: string) =>
    ({
      uid,
      children: [],
      parent: undefined,
      yFrame: { direction: 1, inCoord: false },
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
    }) as unknown as FocusMark["node"];
  // One line of 150,000 segments: more parts than a call takes arguments.
  const n = 150_000;
  let d = "M0 0";
  for (let i = 1; i <= n; i++) d += ` L${i / 100} ${i % 2}`;
  const long = { kind: "path", id: "long", d, style: { fill: "none" } } as any;
  let threw: unknown;
  let got: ReturnType<typeof candidatesOf> = [];
  try {
    got = candidatesOf([long], [{ key: "k", node: fakeNode("long"), rows: [] }]);
  } catch (e) {
    threw = e;
  }
  check("150,000 segments: no stack overflow", threw === undefined, String(threw));
  check(
    "150,000 segments: one candidate, its box",
    got.length === 1 &&
      got[0].outline.length === n &&
      got[0].box.x1 === n / 100 &&
      got[0].box.y1 === 1,
    got[0]?.box
  );
  // 5,000 marks with one key: one candidate, its box the union, in time
  // linear in the marks.
  const k = 5_000;
  const items = Array.from({ length: k }, (_, i) => ({
    kind: "rect",
    id: `m${i}`,
    x: i,
    y: 0,
    w: 1,
    h: 1 + (i % 3),
  })) as any[];
  const marks = items.map((it) => ({
    key: "same",
    node: fakeNode(it.id),
    rows: [{ i: it.x }],
  }));
  const t0 = performance.now();
  const one = candidatesOf(items, marks);
  const ms = performance.now() - t0;
  check(
    "5,000 marks, one key: one candidate, the union box",
    one.length === 1 &&
      one[0].outline.length === k &&
      JSON.stringify(one[0].box) === JSON.stringify({ x0: 0, y0: 0, x1: k, y1: 3 }) &&
      one[0].datum.length === k,
    one[0]?.box
  );
  check(`5,000 marks, one key: fast (${ms.toFixed(0)} ms)`, ms < 200, ms);
}

console.log("# a filled path is a region");
{
  const fakeNode = (uid: string) =>
    ({
      uid,
      children: [],
      parent: undefined,
      yFrame: { direction: 1, inCoord: false },
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
    }) as unknown as FocusMark["node"];
  /** The closed polyline through `pts`. */
  const closedPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
  /** The points of an arc around (100, 100) of radius `r`, from angle `a0`
   *  to `a1` (radians, 0 at 3 o'clock, y down), in 16 steps. */
  const arc = (r: number, a0: number, a1: number): [number, number][] =>
    Array.from({ length: 17 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / 16;
      return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
    });
  const q = Math.PI / 2;
  // A pie wedge, the quarter from 3 to 6 o'clock.
  const wedge = closedPath([[100, 100], ...arc(80, 0, q)]);
  // A donut wedge, the quarter from 6 to 9 o'clock, radii 40 to 80.
  const donut = closedPath([...arc(80, q, 2 * q), ...arc(40, 2 * q, q)]);
  // An area under a top line from (0, 50) to (200, 20), down to y 190.
  const areaD = closedPath([[0, 50], [100, 30], [200, 20], [200, 190], [0, 190]]);
  // The same top line, stroked only: a line.
  const lineD = "M0 50 L100 30 L200 20";
  const path = (id: string, d: string, fill: string) =>
    ({ kind: "path", id, d, style: { fill } }) as any;
  const regions = candidatesOf(
    [path("wedge", wedge, "#4190c5"), path("donut", donut, "#f2cf57")],
    [
      { key: "wedge", node: fakeNode("wedge"), rows: [] },
      { key: "donut", node: fakeNode("donut"), rows: [] },
    ]
  );
  const [area] = candidatesOf(
    [path("area", areaD, "#4190c5")],
    [{ key: "area", node: fakeNode("area"), rows: [] }]
  );
  const [stroked] = candidatesOf(
    [path("line", lineD, "none")],
    [{ key: "line", node: fakeNode("line"), rows: [] }]
  );
  const hit = (x: number, y: number, cs: Candidate[]) =>
    Focus.hit()(frame(x, y, undefined, cs)).choice?.key;
  check("inside the wedge, by its center", hit(140, 140, regions) === "wedge");
  check("inside the wedge, near its tip", hit(105, 104, regions) === "wedge");
  check("outside the wedge, past its arc", hit(165, 165, regions) === undefined);
  check("inside the donut wedge", hit(60, 140, regions) === "donut");
  check("in the donut's hole: not the donut wedge", hit(80, 110, regions) === undefined);
  check("outside the donut wedge", hit(30, 175, regions) === undefined);
  check("inside the area, under its top line", hit(100, 100, [area]) === "area");
  check("inside the area, just under its top line", hit(150, 28, [area]) === "area");
  check("above the area's top line: outside", hit(100, 20, [area]) === undefined);
  check("below the area: outside", hit(100, 195, [area]) === undefined);
  check(
    "a region is one part, its edge",
    area.outline.length === 1 && area.outline[0].region !== undefined
  );
  check(
    "a stroked path is its segments",
    stroked.outline.every((p) => p.segment !== undefined)
  );
  check("under a stroked line: not on it", hit(100, 100, [stroked]) === undefined);
}

console.log("# positions in a coordinate space");
{
  /** The marks of a rose (bars of `count` per species, around a circle),
   *  or of the same bars, laid out. */
  const wedges = async (coord: boolean) => {
    const node = await chart(seafood, {
      w: 200,
      h: 200,
      ...(coord ? { coord: Coord.polar() } : {}),
    })
      .flow(spread({ by: "species", dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }))
      .resolve();
    // The marks, not the legend's swatches the layout adds.
    const marks = [...breadthFirst(node)].filter((n) => n.type === "rect");
    await runLayout({ w: 200, h: 200, axes: false }, node);
    return marks;
  };
  const rose = await wedges(true);
  check(
    "a rose's wedges: positioned on both screen axes",
    rose.length === 5 && rose.every((n) => positionAxes(n).join() === "true,true"),
    [rose.length, rose.map((n) => positionAxes(n))]
  );
  const bars = await wedges(false);
  check(
    "the same bars: positioned along the spread only",
    bars.length === 5 && bars.every((n) => positionAxes(n).join() === "true,false"),
    [bars.length, bars.map((n) => positionAxes(n))]
  );
}

console.log("# a disposed chart's focus lets go");
{
  const runtime = new InteractionRuntime();
  const focus = new TooltipFocus();
  focus.read(runtime);
  focus.use([{ key: "k", node: { uid: "a", children: [] } as any, rows: [] }]);
  focus.key = "k";
  runtime.dispose();
  check(
    "dispose: no key, no marks, no reader",
    focus.key === undefined &&
      (focus as any).marks.length === 0 &&
      focus.specReaders[0].size === 0
  );
}

/* -------------------------------- format --------------------------------- */

console.log("# format");
check("grouping", formatValue(11902) === "11,902", formatValue(11902));
check("four digits: no separator", formatValue(2018) === "2018", formatValue(2018));
check("four digits and a fraction", formatValue(9811.25) === "9811.25", formatValue(9811.25));
check("a negative four-digit number", formatValue(-4120) === "-4120", formatValue(-4120));
check("seven digits", formatValue(1234567) === "1,234,567", formatValue(1234567));
check("two fraction digits", formatValue(0.1300001) === "0.13", formatValue(0.1300001));
check("an integer stays bare", formatValue(5) === "5");
check(
  "a small number keeps three significant digits",
  formatValue(0.0119056) === "0.0119",
  formatValue(0.0119056)
);
check("zero", formatValue(0) === "0", formatValue(0));
check("a negative small number", formatValue(-0.004567) === "-0.00457", formatValue(-0.004567));
check("a string", formatValue("VO→VO") === "VO→VO");
check(
  "a date",
  formatValue(new Date(Date.UTC(2024, 0, 15))) === "Jan 15, 2024",
  formatValue(new Date(Date.UTC(2024, 0, 15)))
);
{
  // 2024-01-15 03:00 UTC is still the 14th in New York, as its axis reads it.
  const t = Date.UTC(2024, 0, 15, 3);
  const ny = "America/New_York";
  check(
    "a date in a zone: that zone's day and time",
    formatValue(new Date(t), ny) === "Jan 14, 2024, 10:00 PM",
    formatValue(new Date(t), ny)
  );
  check(
    "midnight in the zone: its day alone",
    formatValue(new Date(Date.UTC(2024, 0, 15, 5)), ny) === "Jan 15, 2024",
    formatValue(new Date(Date.UTC(2024, 0, 15, 5)), ny)
  );
  check(
    "epoch ms in a column with a zone: an instant",
    formatValue(t, ny) === "Jan 14, 2024, 10:00 PM",
    formatValue(t, ny)
  );
  // Through a chart: the column's Unit.time({ zone }) decides the zone.
  const dl = await chart([{ day: t, n: 1 }], {
    w: 100,
    h: 100,
    schema: { day: Unit.time({ zone: ny }) },
  })
    .flow(spread({ by: "day", dir: "x" }))
    .mark(rect({ h: "n" }).tooltip(["day", "n"]))
    .toDisplayList({});
  check(
    "a chart's time column in New York: the tooltip reads New York's day",
    items(dl).some((i: any) => i.title === "day: Jan 14, 2024, 10:00 PM\nn: 1"),
    items(dl).map((i: any) => i.title).filter(Boolean)
  );
}

/* --------------------------------- seat ---------------------------------- */

console.log("# where the box sits");
{
  const frameSpans: any = [{ min: 0, max: 400 }, { min: 0, max: 200 }];
  const at = (x0: number, x1: number, y0: number, y1: number) =>
    tooltipSeat([{ min: x0, max: x1 }, { min: y0, max: y1 }] as any, frameSpans, [100, 40], 8);
  check("right of a short bar, centered", JSON.stringify(at(0, 50, 0, 20)) === JSON.stringify([58, 0]), at(0, 50, 0, 20));
  check("left when the right is full", JSON.stringify(at(300, 390, 80, 100)) === JSON.stringify([192, 70]), at(300, 390, 80, 100));
  check("under a full-width bar, at its tip", JSON.stringify(at(0, 400, 0, 20)) === JSON.stringify([300, 28]), at(0, 400, 0, 20));
  check("above a full-width bar at the bottom", JSON.stringify(at(0, 400, 180, 200)) === JSON.stringify([300, 132]), at(0, 400, 180, 200));
}

/* -------------------------------- content -------------------------------- */

const titles = (dl: any) =>
  items(dl)
    .filter((i: any) => i.title !== undefined)
    .map((i: any) => i.title);
const paths = [
  { path: "VO→VO", n: 11902, share: 0.1300001 },
  { path: "INF→INF", n: 9811, share: 0.107 },
];
const barChart = (m: any) =>
  chart(paths).flow(spread({ by: "path", dir: "y", spacing: 4 })).mark(m);

console.log("# content: one row per field with one value");
{
  const dl = await barChart(rect({ w: "share" }).tooltip()).toDisplayList({});
  check(
    "every field, formatted",
    JSON.stringify(titles(dl)) ===
      JSON.stringify(["path: VO→VO\nn: 11,902\nshare: 0.13", "path: INF→INF\nn: 9811\nshare: 0.107"]),
    titles(dl)
  );
}

console.log("# content: an aggregated mark shows the value it draws");
{
  const catches = [
    { lake: "L1", species: "s1", count: 3, note: "a" },
    { lake: "L1", species: "s1", count: 4, note: "b" },
    { lake: "L1", species: "s2", count: 4, note: "c" },
  ];
  const dl = await chart(catches)
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ h: "count", fill: "species" }).tooltip())
    .toDisplayList({});
  check(
    "a summed count; a field with two values is left out",
    JSON.stringify(titles(dl)) ===
      JSON.stringify(["lake: L1\nspecies: s1\ncount: 7", "lake: L1\nspecies: s2\ncount: 4\nnote: c"]),
    titles(dl)
  );
}

console.log("# content: a field list, in order");
{
  const dl = await barChart(rect({ w: "share" }).tooltip(["share", "path"])).toDisplayList({});
  check(
    "exactly those fields",
    JSON.stringify(titles(dl)) ===
      JSON.stringify(["share: 0.13\npath: VO→VO", "share: 0.107\npath: INF→INF"]),
    titles(dl)
  );
}

console.log("# content: a field list on a line drawn through rows");
{
  const budget = [2018, 2019, 2020].flatMap((year, i) => [
    { series: "Revenue", year, value: 1.6 + i * 0.3 },
    { series: "Cost", year, value: 1.2 + i * 0.2 },
  ]);
  const lines = (fields: string[]) =>
    chart(budget, { w: 400, h: 260 })
      .flow(group({ by: "series" }))
      .mark(line({ x: "year", y: "value", stroke: "series" }).tooltip(fields));
  // The title describes the whole line: of the listed fields, those with
  // one value on it.
  const yv = await lines(["year", "value"]).toDisplayList({});
  check("[year, value]: no title, since both vary along the line", titles(yv).length === 0, titles(yv));
  const sv = await lines(["series", "value"]).toDisplayList({});
  check(
    "[series, value]: the title is the series",
    JSON.stringify(titles(sv)) === JSON.stringify(["series: Revenue", "series: Cost"]),
    titles(sv)
  );
  let message = "";
  try {
    await lines(["year", "price"]).toDisplayList({});
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "an unknown field: the error names it and the rows' fields",
    message.includes('"price" is not a field') &&
      message.includes('"series", "year", "value"'),
    message
  );
  // A line drawn from a function has no rows to show one of: the mark-level
  // rule holds there.
  const wave = fun((t: number) => 1 + Math.sin(t), { domain: [0, 3] });
  let fnMessage = "";
  try {
    await chart([{ name: "w", k: 1 }, { name: "w", k: 2 }])
      .mark(line({ x: wave.domain(), y: wave }).tooltip(["k"]))
      .toDisplayList({});
  } catch (e) {
    fnMessage = (e as Error).message;
  }
  check(
    "a line from a function: a field with more than one value is an error",
    fnMessage.includes('"k" has more than one value'),
    fnMessage
  );
}

console.log("# a bare string for the fields is an error");
{
  // As in Python: a string is a list of its letters, not the list of one
  // field, so it is a TypeError that shows the list, at the call.
  let error: unknown;
  try {
    (rect({ w: "share" }) as any).tooltip("path");
  } catch (e) {
    error = e;
  }
  check(
    "a TypeError that shows the list of one",
    error instanceof TypeError && error.message.includes('["path"]'),
    String(error)
  );
}

console.log("# content: an unknown field is an error");
{
  let message = "";
  try {
    await barChart(rect({ w: "share" }).tooltip(["count"])).toDisplayList({});
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    "names the field and the fields there are",
    message.includes('"count"') && message.includes('"path", "n", "share"'),
    message
  );
}

console.log("# a scatter and a line");
{
  const pts = [
    { x: 1, y: 2, name: "a" },
    { x: 3, y: 1, name: "b" },
  ];
  const dl = await chart(pts)
    .flow(scatter({ by: "name", x: "x", y: "y" }))
    .mark(circle({ r: 4 }).tooltip(["name", "x"]))
    .toDisplayList({});
  check("one title per dot", JSON.stringify(titles(dl)) === JSON.stringify(["name: a\nx: 1", "name: b\nx: 3"]), titles(dl));
  const series = [
    { t: 1, v: 2, s: "A" },
    { t: 2, v: 3, s: "A" },
  ];
  const lineDl = await chart(series)
    .flow(scatter({ by: "t", x: "t", y: "v" }))
    .mark(circle({ r: 0 }).name("pts"))
    .layer(chart(series).mark(line({ x: "t", y: "v" }).tooltip(["s"])))
    .toDisplayList({});
  check("the line's own title", titles(lineDl).includes("s: A"), titles(lineDl));
  const grouped = await chart([...series, { t: 1, v: 1, s: "B" }, { t: 2, v: 4, s: "B" }])
    .flow(group({ by: "s" }))
    .mark(line({ x: "t", y: "v", stroke: "s" }).tooltip())
    .toDisplayList({});
  check(
    "a line's x and y read each row: not averaged into its box",
    JSON.stringify(titles(grouped)) === JSON.stringify(["s: A", "s: B"]),
    titles(grouped)
  );
}

/* ---------------------------- static rendering ---------------------------- */

console.log("# with no focus, nothing but the titles changes");
{
  // Requirement 8: a chart with `.tooltip()` and no focus draws exactly the
  // chart without it, apart from the marks' `title`s. An item's `id` is its
  // node's uid, minted fresh by each build, so it differs between any two
  // builds and is left out.
  const strip = (dl: any) =>
    JSON.stringify(dl, (k, v) => (k === "title" || k === "id" ? undefined : v));
  const tip = (m: any, on: boolean, fields?: string[]) =>
    on ? m.tooltip(fields) : m;
  const budget = [2018, 2019, 2020].flatMap((year, i) => [
    { series: "Revenue", year, value: 1.6 + i * 0.3 },
    { series: "Cost", year, value: 1.2 + i * 0.2 },
  ]);
  const specs: [string, (on: boolean) => any][] = [
    ["the bar chart story", (on) =>
      chart(paths, { w: 520, h: 400 })
        .flow(spread({ by: "path", dir: "y", spacing: 4 }))
        .mark(tip(rect({ w: "share", fill: "#4c78a8" }), on))],
    ["the stacked bars story, with a legend", (on) =>
      chart(seafood, { w: 400, h: 300 })
        .flow(spread({ by: "lake", dir: "x", spacing: 8 }), stack({ by: "species", dir: "y" }))
        .mark(tip(rect({ h: "count", fill: "species" }), on))],
    ["the scatter story", (on) =>
      chart(catchLocationsArray, { w: 400, h: 400 })
        .flow(scatter({ by: "lake", x: "x", y: "y" }))
        .mark(tip(circle({ r: 6, fill: "#4c78a8" }), on, ["lake", "x", "y"]))],
    ["the line chart story", (on) =>
      chart(budget, { w: 400, h: 260 })
        .flow(group({ by: "series" }))
        .mark(tip(line({ x: "year", y: "value", stroke: "series", strokeWidth: 2 }), on))],
    ["the line chart story, [series, value]", (on) =>
      chart(budget, { w: 400, h: 260 })
        .flow(group({ by: "series" }))
        .mark(tip(line({ x: "year", y: "value", stroke: "series", strokeWidth: 2 }), on, ["series", "value"]))],
    ["labeled bars", (on) =>
      chart(paths, { w: 300, h: 200 })
        .flow(spread({ by: "path", dir: "y", spacing: 4 }))
        .mark(tip(rect({ w: "share" }).label("n"), on))],
    ["a chart nested per group, with labels and a legend", (on) =>
      chart(seafood, { w: 500, h: 300 })
        .flow(spread({ by: "lake", dir: "x", spacing: 12 }))
        .mark((rows: any[]) =>
          chart(rows)
            .flow(stack({ by: "species", dir: "y" }))
            .mark(tip(rect({ h: "count", fill: "species" }).label("count"), on))
        )],
  ];
  for (const [name, spec] of specs) {
    const plain = await spec(false).toDisplayList({});
    const tipped = await spec(true).toDisplayList({});
    const [a, b] = [strip(plain), strip(tipped)];
    let at = 0;
    while (at < a.length && a[at] === b[at]) at++;
    check(
      `${name}: the same display list`,
      a === b && titles(tipped).length > 0,
      a === b ? "no titles" : [a.slice(at - 80, at + 80), b.slice(at - 80, at + 80)]
    );
  }
}

/* --------------------------------- keys ---------------------------------- */

console.log("# keys");
check("equal rows, equal keys", rowsKey([{ a: 1 }]) === rowsKey([{ a: 1 }]));
check("other rows, other keys", rowsKey([{ a: 1 }]) !== rowsKey([{ a: 2 }]));
check(
  "a date by its instant",
  rowsKey([{ d: new Date(0) }]) !== rowsKey([{ d: new Date(1) }])
);
{
  const row: any = { a: 1 };
  row.self = row;
  check("a cycle does not throw", typeof rowsKey([row]) === "string");
}

/* --------------------------------- wire ---------------------------------- */

console.log("# the wire");
{
  const all = await Serialize.toJSON(barChart(rect({ w: "share" }).tooltip()));
  const some = await Serialize.toJSON(barChart(rect({ w: "share" }).tooltip(["n"])));
  check("tooltip: true", (all.root as any).mark.tooltip === true, (all.root as any).mark);
  check("tooltip: a list", JSON.stringify((some.root as any).mark.tooltip) === '["n"]');
  check("validates", Frontend.validate(some).valid, Frontend.validate(some));
  const rebuilt = await Serialize.buildIR(some).toDisplayList({});
  check(
    "rebuilt, it writes the same titles",
    JSON.stringify(titles(rebuilt)) === JSON.stringify(["n: 11,902", "n: 9811"]),
    titles(rebuilt)
  );
  const bad = { ...some, root: { ...(some.root as any), mark: { ...(some.root as any).mark, tooltip: 3 } } };
  check("a number is not a tooltip", !Frontend.validate(bad).valid);
}

report();

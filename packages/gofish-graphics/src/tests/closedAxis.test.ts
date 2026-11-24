/**
 * A chain's ends, and the glued axis that sets their default. A spread
 * keeps `ends` room before its first part and after its last, a multiple
 * of its gap (CSS space-around at 0.5, space-evenly at 1, d3's band and
 * point scale outer padding), on any axis. The angle of a full-turn polar
 * space is periodic and laid out over one whole period, so its end is its
 * start: a spread that fills it has default ends that sum to one gap, so it
 * leaves n gaps between n parts (d3.pie's and d3.chord's `padAngle`), and
 * its data sizes fit what the n gaps leave. `ends: 0` there is a seam. A
 * partial sweep is an open interval, as a cartesian axis is, and its
 * default ends are 0. A chain nested in a part of a glued chain does not
 * fill the axis, so its default ends are 0 too.
 *
 * Run: `tsx src/tests/closedAxis.test.ts` (wired as `pnpm test:closed-axis`).
 */
import * as GoFish from "../lib";
import { check, items, report } from "./testHelpers";

const { chart, spread, stack, rect, layer, Coord, Spacing, fr } =
  GoFish as any;

type Pt = [number, number];
const TAU = 2 * Math.PI;
const pointsOf = (d: string): Pt[] => {
  const nums = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
};
const key = ([x, y]: Pt) => `${x.toFixed(3)},${y.toFixed(3)}`;

/** Each filled wedge's angular span [from, to], counter-clockwise from 3
 *  o'clock (`Coord.polar()`), in paint order, unwrapped so that the spans
 *  increase from the first. The center is the one point every wedge
 *  shares. */
async function wedgeSpans(builder: any): Promise<[number, number][]> {
  const dl = await builder.toDisplayList({ w: 200, h: 200 });
  const paths = items(dl)
    .filter((it) => it.kind === "path")
    .map((it: any) => pointsOf(it.d));
  const shared = paths
    .map((ps: Pt[]) => new Set(ps.map(key)))
    .reduce(
      (a: Set<string>, b: Set<string>) =>
        new Set([...a].filter((k) => b.has(k)))
    );
  const [cx, cy] = [...shared][0].split(",").map(Number);
  let floor = 0;
  return paths.map((ps: Pt[]) => {
    const rim = ps.filter(([x, y]) => Math.hypot(x - cx, y - cy) > 1);
    const angles = rim
      .map(([x, y]) => (Math.atan2(-(y - cy), x - cx) + TAU) % TAU)
      .sort((a, b) => a - b);
    // The wedge is the circle less the largest gap between its angles.
    let gapEnd = angles[0];
    let gap = angles[0] + TAU - angles[angles.length - 1];
    for (let i = 1; i < angles.length; i++) {
      if (angles[i] - angles[i - 1] > gap) {
        gap = angles[i] - angles[i - 1];
        gapEnd = angles[i];
      }
    }
    let from = gapEnd;
    while (from < floor - 1e-3) from += TAU;
    if (from > TAU - 1e-3 && floor === 0) from -= TAU;
    const span: [number, number] = [from, from + TAU - gap];
    floor = span[1];
    return span;
  });
}

const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;
const gapsOf = (spans: [number, number][]) =>
  spans.slice(1).map((s, i) => s[0] - spans[i][1]);
const wrapGap = (spans: [number, number][], period = TAU) =>
  spans[0][0] + period - spans[spans.length - 1][1];

const rows = [
  { k: "a", v: 1 },
  { k: "b", v: 2 },
  { k: "c", v: 3 },
];
const pie = (coord: any, spacing: any) =>
  chart(rows, { coord, axes: false })
    .flow(spread({ by: "k", dir: "x", spacing }))
    .mark(rect({ w: "v" }));

/** The bars of a cartesian spread, sorted by x: [x, w]. */
async function barsOf(builder: any, w = 300): Promise<[number, number][]> {
  const dl = await builder.toDisplayList({ w, h: 100 });
  return items(dl)
    .filter((it) => it.kind === "rect")
    .sort((a, b) => a.x! - b.x!)
    .map((r) => [r.x!, r.w!]);
}
const bars = (spacing: any, w = 300) =>
  barsOf(
    chart(rows, { w, h: 100, axes: false })
      .flow(spread({ by: "k", dir: "x", spacing }))
      .mark(rect({ w: "v", h: 20 })),
    w
  );

async function main() {
  console.log("\n# a full turn is glued: n gaps, half a gap at each end");
  {
    const spans = await wedgeSpans(pie(Coord.polar(), 0.1));
    const gaps = gapsOf(spans);
    check(
      "the gaps between neighbors are 0.1",
      gaps.every((g) => near(g, 0.1)),
      gaps
    );
    check(
      "the last slice and the first are 0.1 apart too",
      near(wrapGap(spans), 0.1),
      { spans, wrap: wrapGap(spans) }
    );
    check(
      "the first slice starts half a gap past angle 0",
      near(spans[0][0], 0.05),
      spans
    );
    // The data sizes fit what three gaps leave: (2π - 0.3) / 6 per unit.
    const unit = (TAU - 0.3) / 6;
    check(
      "the data sizes fit 2π less three gaps",
      spans.every(([a, b], i) => near(b - a, rows[i].v * unit)),
      spans.map(([a, b]) => b - a)
    );
  }

  console.log("\n# ends: 0 on a full turn is a seam: n - 1 gaps");
  {
    const spans = await wedgeSpans(
      pie(Coord.polar(), Spacing.box(0.1, { ends: 0 }))
    );
    const unit = (TAU - 0.2) / 6;
    check(
      "the last slice ends where the first starts, at angle 0",
      gapsOf(spans).every((g) => near(g, 0.1)) &&
        near(wrapGap(spans), 0) &&
        near(spans[0][0], 0),
      { spans, wrap: wrapGap(spans) }
    );
    check(
      "the data sizes fit 2π less two gaps",
      spans.every(([a, b], i) => near(b - a, rows[i].v * unit)),
      spans.map(([a, b]) => b - a)
    );
  }

  console.log("\n# explicit ends override the default on a full turn");
  {
    // None at the start and a whole gap at the end: d3.pie's and
    // d3.chord's angles.
    const spans = await wedgeSpans(
      pie(Coord.polar(), Spacing.box(0.1, { ends: [0, 1] }))
    );
    check(
      "ends [0, 1]: the first slice at 0, one gap after the last",
      near(spans[0][0], 0) && near(wrapGap(spans), 0.1),
      spans
    );
    // Ends of 1 at both: two gaps where the turn meets itself.
    const two = await wedgeSpans(
      pie(Coord.polar(), Spacing.box(0.1, { ends: 1 }))
    );
    const unit = (TAU - 0.4) / 6;
    check(
      "ends 1: a double gap at the seam, sizes fit 2π less four gaps",
      near(wrapGap(two), 0.2) &&
        near(two[0][0], 0.1) &&
        two.every(([a, b], i) => near(b - a, rows[i].v * unit)),
      two
    );
  }

  console.log("\n# a minimum gap on a full turn also closes");
  {
    const spans = await wedgeSpans(pie(Coord.polar(), Spacing.atLeast(0.1)));
    check(
      "n gaps of 0.1",
      gapsOf(spans).every((g) => near(g, 0.1)) && near(wrapGap(spans), 0.1),
      { spans, wrap: wrapGap(spans) }
    );
  }

  console.log("\n# a stack glues its parts: no gap, closed or not");
  {
    const spans = await wedgeSpans(
      chart(rows, { coord: Coord.polar(), axes: false })
        .flow(stack({ by: "k", dir: "x" }))
        .mark(rect({ w: "v" }))
    );
    check(
      "the slices fill the turn end to end",
      gapsOf(spans).every((g) => near(g, 0)) && near(wrapGap(spans), 0),
      spans
    );
  }

  console.log("\n# a partial sweep is open: n - 1 gaps");
  {
    const spans = await wedgeSpans(
      pie(Coord.polar({ centralAngle: Math.PI }), 0.1)
    );
    const unit = (Math.PI - 0.2) / 6;
    check(
      "the gaps between neighbors are 0.1",
      gapsOf(spans).every((g) => near(g, 0.1)),
      spans
    );
    check(
      "the last slice ends at the end of the sweep",
      near(spans[2][1], Math.PI),
      spans
    );
    check(
      "the data sizes fit the sweep less two gaps",
      spans.every(([a, b], i) => near(b - a, rows[i].v * unit)),
      spans.map(([a, b]) => b - a)
    );
    // Ends on an open sweep are room at its two ends, as on a line.
    const around = await wedgeSpans(
      pie(
        Coord.polar({ centralAngle: Math.PI }),
        Spacing.box(0.1, { ends: 0.5 })
      )
    );
    check(
      "ends 0.5 on a half turn: half a gap at 0 and at π",
      near(around[0][0], 0.05) && near(around[2][1], Math.PI - 0.05),
      around
    );
  }

  console.log("\n# an fr gap on a full turn is one of n shares");
  for (const [ends, first] of [
    [undefined, 0.5],
    [[0, 1], 0],
  ] as const) {
    const spans = await wedgeSpans(
      chart(rows, { coord: Coord.polar(), axes: false })
        .flow(
          spread({
            by: "k",
            dir: "x",
            spacing: ends === undefined ? fr(1) : Spacing.box(fr(1), { ends }),
          })
        )
        .mark(rect({ w: fr(2) }))
    );
    // Three slices of two shares and three gaps of one: 2π / 9 a share.
    const share = TAU / 9;
    check(
      `(ends ${JSON.stringify(ends ?? "default")}) slices are two shares and the three gaps one share each`,
      spans.every(([a, b]) => near(b - a, 2 * share)) &&
        gapsOf(spans).every((g) => near(g, share)) &&
        near(wrapGap(spans), share) &&
        near(spans[0][0], first * share),
      spans
    );
  }

  console.log("\n# a pitch of fr(1) on a full turn has n steps");
  // Measured from each slice's start with `ends: [0, 1]` (the first slice
  // at angle 0), and from each slice's middle with the default ends, half a
  // step at each end (the first middle an eighth of a turn past 0). The
  // ends are measured from the pitched point, so the default on a full
  // turn suits `at: "middle"`: from `"start"` a slice as wide as its step
  // reaches half a step past the room the end keeps, and the turn holds
  // 4.5 steps, not 4.
  for (const mode of ["[0, 1]", "default"] as const) {
    const same = [
      { k: "a", v: 1 },
      { k: "b", v: 1 },
      { k: "c", v: 1 },
      { k: "d", v: 1 },
    ];
    const spans = await wedgeSpans(
      chart(same, { coord: Coord.polar(), axes: false })
        .flow(
          spread({
            by: "k",
            dir: "x",
            spacing:
              mode === "default"
                ? Spacing.pitch(fr(1), { at: "middle" })
                : Spacing.pitch(fr(1), { at: "start", ends: [0, 1] }),
          })
        )
        // A pitch pins one point of each slice, so a slice with a literal
        // width would keep it as ink; an unsized slice is a wedge itself.
        .mark(rect({}))
    );
    // Four steps of one share make the whole turn, the fourth from the
    // last slice back to the first.
    const points = spans.map(([a, b]) =>
      mode === "default" ? (a + b) / 2 : a
    );
    const steps = [...points.slice(1), points[0] + TAU].map(
      (s, i) => s - points[i]
    );
    check(
      `(ends ${mode}) the slices are a quarter turn apart, all the way around`,
      steps.every((s) => near(s, TAU / 4)) &&
        near(points[0], mode === "default" ? TAU / 8 : 0),
      { steps, spans }
    );
  }

  console.log("\n# a chain nested in a part of a glued chain stays open");
  {
    const nested = [
      { g: "p", k: "a", v: 1 },
      { g: "p", k: "b", v: 1 },
      { g: "q", k: "a", v: 1 },
      { g: "q", k: "b", v: 1 },
    ];
    const spans = await wedgeSpans(
      chart(nested, { coord: Coord.polar(), axes: false })
        .flow(
          spread({ by: "g", dir: "x", spacing: 0.2 }),
          spread({ by: "k", dir: "x", spacing: 0.1 })
        )
        .mark(rect({ w: "v" }))
    );
    const gaps = gapsOf(spans);
    // Inner gaps 0.1 (one per group), outer gaps 0.2 (two, the second
    // closing the circle): four units fill 2π - 0.6.
    const unit = (TAU - 0.6) / 4;
    check(
      "inner gap, outer gap, inner gap, closing outer gap",
      near(gaps[0], 0.1) &&
        near(gaps[1], 0.2) &&
        near(gaps[2], 0.1) &&
        near(wrapGap(spans), 0.2),
      { gaps, wrap: wrapGap(spans) }
    );
    check(
      "the data sizes fit 2π less two inner and two outer gaps",
      spans.every(([a, b]) => near(b - a, unit)),
      spans.map(([a, b]) => b - a)
    );
  }

  console.log("\n# cartesian: no ends by default, n - 1 gaps");
  {
    const rs = await bars(10);
    const total = rs.reduce((s, r) => s + r[1], 0);
    check(
      "the bars fill the width less two gaps",
      rs.length === 3 && near(total, 280, 1e-2),
      rs
    );
    check(
      "the first bar starts at 0, the last ends at the width",
      near(rs[0][0], 0, 1e-2) && near(rs[2][0] + rs[2][1], 300, 1e-2),
      rs
    );
  }

  console.log("\n# cartesian ends: around (0.5), evenly (1), [0, 1]");
  {
    const around = await bars(Spacing.box(10, { ends: 0.5 }));
    check(
      "ends 0.5: 5 px at each end, the bars fit 300 less 30",
      near(around[0][0], 5, 1e-2) &&
        near(around[2][0] + around[2][1], 295, 1e-2) &&
        near(
          around.reduce((s, r) => s + r[1], 0),
          270,
          1e-2
        ),
      around
    );
    const evenly = await bars(Spacing.box(10, { ends: 1 }));
    check(
      "ends 1: 10 px at each end, the bars fit 300 less 40",
      near(evenly[0][0], 10, 1e-2) &&
        near(evenly[2][0] + evenly[2][1], 290, 1e-2) &&
        near(
          evenly.reduce((s, r) => s + r[1], 0),
          260,
          1e-2
        ),
      evenly
    );
    const lopsided = await bars(Spacing.box(10, { ends: [0, 1] }));
    check(
      "ends [0, 1]: none at the start, 10 px at the end",
      near(lopsided[0][0], 0, 1e-2) &&
        near(lopsided[2][0] + lopsided[2][1], 290, 1e-2),
      lopsided
    );
  }

  console.log("\n# cartesian ends with fr: a band scale");
  {
    // Three bars of fr(4), gaps of fr(1), ends of half a gap: 15 shares of
    // 20 px, d3.scaleBand().paddingInner(0.2).paddingOuter(0.1) * ... each
    // bar 80 px.
    const rs = await barsOf(
      chart(rows, { w: 300, h: 100, axes: false })
        .flow(
          spread({
            by: "k",
            dir: "x",
            spacing: Spacing.box(fr(1), { ends: 0.5 }),
          })
        )
        .mark(rect({ w: fr(4), h: 20 }))
    );
    check(
      "bars at 10, 110, 210, each 80 wide",
      rs.length === 3 &&
        rs.every(
          ([x, w], i) => near(x, 10 + 100 * i, 1e-2) && near(w, 80, 1e-2)
        ),
      rs
    );
  }

  console.log("\n# a pitch with ends is d3's point scale");
  {
    // Four points a pitch of fr(1) apart, at their middles, with half a
    // step at each end: d3.scalePoint().padding(0.5) on [0, 300] puts them
    // at 37.5, 112.5, 187.5, 262.5.
    const same = ["a", "b", "c", "d"].map((k) => ({ k, v: 1 }));
    const rs = await barsOf(
      chart(same, { w: 300, h: 100, axes: false })
        .flow(
          spread({
            by: "k",
            dir: "x",
            spacing: Spacing.pitch(fr(1), { at: "middle", ends: 0.5 }),
          })
        )
        .mark(rect({ w: 10, h: 20 }))
    );
    check(
      "middles at 37.5, 112.5, 187.5, 262.5",
      rs.length === 4 &&
        rs.every(([x, w], i) => near(x + w / 2, 37.5 + 75 * i, 1e-2)),
      rs
    );
  }

  console.log("\n# a mark that spans the whole turn has no ends");
  {
    // Its start edge is its end edge, so its outline is its edges along
    // the angle, each a loop of its own (its own subpath), and nothing is
    // drawn along the seam: every subpath lies on one circle. A mark that
    // spans 0.99 of the turn keeps its two radial ends. Both drawings of a
    // rect are checked: both axes embedded (an area) and the angle alone
    // (a band with a pixel thickness along the radius).
    const subpathsOf = async (sweep: number, y: number, emY: boolean) => {
      const dl = await layer({ coord: Coord.polar() }, [
        rect({ x: 0, w: sweep, y, h: 30, emX: true, emY, stroke: "white" }),
      ]).toDisplayList({ w: 200, h: 200 });
      const [path] = items(dl).filter((it) => it.kind === "path") as any[];
      return (path?.d ?? "")
        .split("M")
        .filter((s: string) => s.trim() !== "")
        .map((s: string) => pointsOf("M" + s));
    };
    const radiusSpread = (ps: Pt[], c: Pt) => {
      const rs = ps.map(([x, y]) => Math.hypot(x - c[0], y - c[1]));
      return Math.max(...rs) - Math.min(...rs);
    };
    /** The center: the middle of a loop's points, which go round it. */
    const centerOf = (ps: Pt[]): Pt => {
      const xs = ps.map((p) => p[0]);
      const ys = ps.map((p) => p[1]);
      return [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
      ];
    };
    for (const emY of [true, false]) {
      const drawing = emY ? "area" : "band";
      const ring = await subpathsOf(TAU, 20, emY);
      const c = centerOf(ring[ring.length - 1] ?? []);
      check(
        `${drawing}, ring over the whole turn: two loops, each on one circle`,
        // Within a pixel: the spline's control points sit just off it.
        ring.length === 2 && ring.every((ps: Pt[]) => radiusSpread(ps, c) < 1),
        ring.map((ps: Pt[]) => radiusSpread(ps, c))
      );
      const disc = await subpathsOf(TAU, 0, emY);
      check(
        `${drawing}, disc over the whole turn: one loop, its rim`,
        disc.length === 1 && radiusSpread(disc[0], centerOf(disc[0])) < 1,
        disc.map((ps: Pt[]) => [ps.length, radiusSpread(ps, centerOf(ps))])
      );
      const almost = await subpathsOf(0.99 * TAU, 20, emY);
      check(
        `${drawing}, ring over 0.99 of the turn: one loop with its radial ends`,
        almost.length === 1 && radiusSpread(almost[0], c) > 29,
        almost.length
      );
    }
  }

  report();
}

main();

/**
 * A closed axis: the angle of a full-turn polar space is periodic and laid
 * out over one whole period, so its end is its start. A spread that fills
 * it leaves n gaps between n parts, the last between the last part and the
 * first (d3.pie's and d3.chord's `padAngle`), and its data sizes fit what
 * the n gaps leave. A partial sweep is an open interval and keeps n - 1
 * gaps, as a cartesian axis does. A chain nested in a part of a closed
 * chain does not fill the axis, so it stays open.
 *
 * Run: `tsx src/tests/closedAxis.test.ts` (wired as `pnpm test:closed-axis`).
 */
import * as GoFish from "../lib";
import { check, items, report } from "./testHelpers";

const { chart, spread, stack, rect, Coord, Spacing, fr } = GoFish as any;

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

async function main() {
  console.log("\n# a full turn is closed: n gaps");
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
    check("the first slice starts at angle 0", near(spans[0][0], 0), spans);
    // The data sizes fit what three gaps leave: (2π - 0.3) / 6 per unit.
    const unit = (TAU - 0.3) / 6;
    check(
      "the data sizes fit 2π less three gaps",
      spans.every(([a, b], i) => near(b - a, rows[i].v * unit)),
      spans.map(([a, b]) => b - a)
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
  }

  console.log("\n# an fr gap on a full turn is one of n shares");
  {
    const spans = await wedgeSpans(
      chart(rows, { coord: Coord.polar(), axes: false })
        .flow(spread({ by: "k", dir: "x", spacing: fr(1) }))
        .mark(rect({ w: fr(2) }))
    );
    // Three slices of two shares and three gaps of one: 2π / 9 a share.
    const share = TAU / 9;
    check(
      "slices are two shares and the three gaps one share each",
      spans.every(([a, b]) => near(b - a, 2 * share)) &&
        gapsOf(spans).every((g) => near(g, share)) &&
        near(wrapGap(spans), share),
      spans
    );
  }

  console.log("\n# a pitch of fr(1) on a full turn has n steps");
  {
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
            spacing: Spacing.pitch(fr(1), { at: "start" }),
          })
        )
        .mark(rect({ w: 0.5 }))
    );
    // Four steps of one share make the whole turn, the fourth from the
    // last slice back to the first.
    const starts = spans.map(([a]) => a);
    const steps = [...starts.slice(1), starts[0] + TAU].map(
      (s, i) => s - starts[i]
    );
    check(
      "the slices start a quarter turn apart, all the way around",
      steps.every((s) => near(s, TAU / 4)),
      steps
    );
  }

  console.log("\n# a chain nested in a part of a closed chain stays open");
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

  console.log("\n# cartesian is unchanged: n - 1 gaps");
  {
    const dl = await chart(rows, { w: 300, h: 100, axes: false })
      .flow(spread({ by: "k", dir: "x", spacing: 10 }))
      .mark(rect({ w: "v", h: 20 }))
      .toDisplayList({ w: 300, h: 100 });
    const rs = items(dl)
      .filter((it) => it.kind === "rect")
      .sort((a, b) => a.x! - b.x!);
    const total = rs.reduce((s, r) => s + r.w!, 0);
    check(
      "the bars fill the width less two gaps",
      rs.length === 3 && near(total, 280, 1e-2),
      rs.map((r) => [r.x, r.w])
    );
    check(
      "the last bar ends at the end of the width",
      near(rs[2].x! + rs[2].w! - rs[0].x!, 300, 1e-2),
      rs.map((r) => [r.x, r.w])
    );
  }

  report();
}

main();

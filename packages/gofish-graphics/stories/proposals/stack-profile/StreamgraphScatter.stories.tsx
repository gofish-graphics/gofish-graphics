import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, derive, rect, ribbon, scatter, stack } from "../../../src/lib";
import { streamgraphData } from "../../../src/data/streamgraphData";

/**
 * THROWAWAY prototype stories for the croissant-sampling proposal (#1332):
 * a streamgraph on a continuous x, written with `scatter` instead of
 * `spread`, and the candidate places for its centering.
 *
 *   .flow(scatter({ by: "x", x: "x", alignment }), stack({ by: "c", dir: "y" }))
 *   .mark(ribbon({ h: "y", fill: "c" }))
 */
const meta: Meta = { title: "Proposals/Stack Profile/Streamgraph Scatter" };
export default meta;

const W = 480;
const H = 260;

// The explicit form. FAILS TODAY: the align is dropped (a point position on x
// sends the layer to the default union in compose.ts, so each stack counts as
// placed by its own data), and this draws the stacked area of ScatterDefault.
export const ScatterMiddle: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(
        scatter({ by: "x", x: "x", alignment: "middle" }),
        stack({ by: "c", dir: "y" })
      )
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// The same flow with rects: does the scatter center each stack?
export const ScatterMiddleRects: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(
        scatter({ by: "x", x: "x", alignment: "middle" }),
        stack({ by: "c", dir: "y" })
      )
      .mark(rect({ w: 12, h: "y", fill: "c" }))
      .render(container);
    return container;
  },
};

// (c) a y position for each slice: a point position centers its child on
// the datum, so `y: 0` puts the middle of every x slice's stack at 0.
export const ScatterY0: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(scatter({ by: "x", x: "x", y: 0 }), stack({ by: "c", dir: "y" }))
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// The same with no alignment (scatter's default, "baseline"): a stacked area.
export const ScatterDefault: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// alignment: "end": the stacks hang from a common top line.
export const ScatterEnd: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(
        scatter({ by: "x", x: "x", alignment: "end" }),
        stack({ by: "c", dir: "y" })
      )
      .mark(ribbon({ h: "y", fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// ---------------------------------------------------------------------------
// Offsets computed in `derive`, as d3's stackOffset* do. Each row gets its
// band's interval [y0, y1] in data units; a scatter places each piece there.

type Row = { x: number; y: number; c: number };

/** Stack the rows at each x on a per-x baseline, as d3.stack does. */
const offsetRows = (
  rows: Row[],
  baseline: (xs: number[], byX: Map<number, Row[]>) => Map<number, number>
) => {
  const byX = new Map<number, Row[]>();
  for (const r of rows) {
    if (!byX.has(r.x)) byX.set(r.x, []);
    byX.get(r.x)!.push(r);
  }
  for (const g of byX.values()) g.sort((a, b) => a.c - b.c);
  const xs = [...byX.keys()].sort((a, b) => a - b);
  const g0 = baseline(xs, byX);
  return xs.flatMap((x) => {
    let acc = g0.get(x)!;
    return byX.get(x)!.map((r) => {
      const y0 = acc;
      acc += r.y;
      return { ...r, y0, y1: acc };
    });
  });
};

const total = (g: Row[]) => g.reduce((s, r) => s + r.y, 0);

/** d3.stackOffsetSilhouette: the baseline is minus half the total. */
const silhouette = (xs: number[], byX: Map<number, Row[]>) =>
  new Map(xs.map((x) => [x, -total(byX.get(x)!) / 2]));

/**
 * d3.stackOffsetWiggle (Byron and Wattenberg 2008): the baseline moves to
 * minimize the weighted slope of every band. Ported from d3-shape.
 */
const wiggle = (xs: number[], byX: Map<number, Row[]>) => {
  const g0 = new Map<number, number>([[xs[0], 0]]);
  let y = 0;
  for (let j = 1; j < xs.length; j++) {
    const cur = byX.get(xs[j])!;
    const prev = byX.get(xs[j - 1])!;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < cur.length; i++) {
      let s3 = (cur[i].y - prev[i].y) / 2;
      for (let k = 0; k < i; k++) s3 += cur[k].y - prev[k].y;
      s1 += cur[i].y;
      s2 += s3 * cur[i].y;
    }
    if (s1) y -= s2 / s1;
    g0.set(xs[j], y);
  }
  return g0;
};

// (c) emulated: each band's interval computed in derive (silhouette), placed
// by a scatter's yMin / yMax. No stack, no alignment.
export const DeriveSilhouette: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(
        derive((rows: Row[]) => offsetRows(rows, silhouette)),
        scatter({ by: "x", x: "x" }),
        scatter({ by: "c", yMin: "y0", yMax: "y1" })
      )
      .mark(ribbon({ fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

// (d) emulated: the wiggle offset computed in derive.
export const DeriveWiggle: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(streamgraphData, { w: W, h: H })
      .flow(
        derive((rows: Row[]) => offsetRows(rows, wiggle)),
        scatter({ by: "x", x: "x" }),
        scatter({ by: "c", yMin: "y0", yMax: "y1" })
      )
      .mark(ribbon({ fill: "c", opacity: 0.8 }))
      .render(container);
    return container;
  },
};

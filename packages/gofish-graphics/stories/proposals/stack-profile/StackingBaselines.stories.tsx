import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import {
  chart,
  circle,
  Curve,
  derive,
  field,
  group,
  line,
  polygon,
  rect,
  ribbon,
  scatter,
  selectAll,
  spread,
  stack,
} from "../../../src/lib";
import {
  alignUnion,
  boundaryBands,
  coarse,
  curveOrderDifference,
  curveThenSum,
  densityRows,
  orderInsideOut,
  orderRankPerX,
  sampled,
  sampledByX,
  curveOrderThickness,
  samples,
  seafoodRows,
  stackRows,
  topics,
  topicsSigned,
  type Offset,
  type Order,
  type Row,
} from "./stackingBaselines";

/**
 * THROWAWAY prototype stories for the stacking-baselines proposal: stack
 * offsets, stack orders, sampling alignment and densities, all on one
 * dataset. Offsets, orders, alignment and densities are emulated in
 * `derive` with the helpers in `stackingBaselines.ts`; each band's interval
 * [y0, y1] is placed by a scatter's yMin / yMax.
 */
const meta: Meta = { title: "Proposals/Stack Profile/Stacking Baselines" };
export default meta;

const W = 480;
const H = 260;

const show = (build: (container: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

/** The shared spec: stack in derive, then a scatter per x and per band. */
const stacked = (rows: Row[], offset: Offset, order?: (r: Row[]) => Order) =>
  chart(rows, { w: W, h: H })
    .flow(
      derive((rows: Row[]) =>
        stackRows(rows, { offset, order: order?.(rows) })
      ),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(ribbon({ fill: "c" }));

// ---------------------------------------------------------------------------
// Baselines (offsets), same data, same order.

export const BZero = show((el) => stacked(topics, "zero").render(el));
export const BSilhouette = show((el) =>
  stacked(topics, "silhouette").render(el)
);
export const BWiggle = show((el) => stacked(topics, "wiggle").render(el));
export const BWeightedWiggle = show((el) =>
  stacked(topics, "weightedWiggle").render(el)
);
export const BExpand = show((el) => stacked(topics, "expand").render(el));
export const BDiverging = show((el) =>
  stacked(topicsSigned, "diverging").render(el)
);

// ---------------------------------------------------------------------------
// Orders, with the wiggle baseline.

export const OGiven = show((el) => stacked(topics, "wiggle").render(el));
export const OInsideOut = show((el) =>
  stacked(topics, "wiggle", orderInsideOut).render(el)
);

// Re-sorted at each x, drawn as one band per series: the bands jump.
export const OPerXRankArea = show((el) =>
  stacked(topics, "wiggle", () => orderRankPerX).render(el)
);

// Re-sorted at each x, drawn as pieces then connect (the ribbon chart).
export const OPerXRankRibbons = show((el) =>
  chart(topics, { w: W, h: H })
    .flow(
      derive((rows: Row[]) =>
        stackRows(rows, { offset: "wiggle", order: orderRankPerX })
      ),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(rect({ w: 7, fill: "c" }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(group({ by: "c" }))
        .mark(ribbon({ fill: "c", opacity: 0.45, curve: Curve.linear }))
    )
    .render(el)
);

// ---------------------------------------------------------------------------
// Sampling alignment: Maps every 1.0, Sports every 1.5, Games jittered.

// The samples themselves, as dots.
export const SSamples = show((el) =>
  chart(sampled, { w: W, h: H })
    .flow(group({ by: "c" }), scatter({ by: "x", x: "x", y: "y" }))
    .mark(circle({ r: 2.5, fill: "c" }))
    .render(el)
);

// What today's flow does: a slice per x, a stack inside each. The rows are
// sorted by x first.
export const SNaive = show((el) =>
  chart(sampledByX, { w: W, h: H })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c", curve: Curve.linear }))
    .render(el)
);

// The same with the rows grouped by series (Maps' rows, then Sports', then
// Games'): the ribbon threads the slices in the order their x first appears.
export const SNaiveUnsorted = show((el) =>
  chart(sampled, { w: W, h: H })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c", curve: Curve.linear }))
    .render(el)
);

// ggplot2 stat_align: every series read at the union of all x, then stacked.
export const SUnionLinear = show((el) =>
  chart(sampled, { w: W, h: H })
    .flow(
      derive((rows: Row[]) => stackRows(alignUnion(rows), {})),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(ribbon({ fill: "c", curve: Curve.linear }))
    .render(el)
);

// Boundary functions: each band a polygon between B_{k-1} and B_k, each
// boundary on its own sample points. The dots are each boundary's points.
export const SBoundaryFunctions = show((el) => {
  const { boundaries } = boundaryBands(sampled);
  const dots = boundaries
    .slice(1)
    .flatMap((b, k) =>
      b.map(([x, y], i) => ({ id: `${k}-${i}`, x, y, k: `B${k + 1}` }))
    );
  chart(sampled, { w: W, h: H })
    .flow(derive((rows: Row[]) => boundaryBands(rows).bands))
    .mark(polygon({ points: "ring", fill: "c" }))
    .layer(
      chart(dots)
        .flow(scatter({ by: "id", x: "x", y: "y" }))
        .mark(circle({ r: 1.6, fill: "black" }))
    )
    .render(el);
});

// The same polygons, with no dots.
export const SBoundaryFunctionsPlain = show((el) =>
  chart(sampled, { w: W, h: H })
    .flow(derive((rows: Row[]) => boundaryBands(rows).bands))
    .mark(polygon({ points: "ring", fill: "c" }))
    .render(el)
);

// Curve order (a): stack the points, then the ribbon curves each boundary.
export const SCurveStackThenCurve = show((el) =>
  chart(coarse, { w: W, h: H })
    .flow(
      derive((rows: Row[]) => stackRows(rows, {})),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(ribbon({ fill: "c", curve: Curve.monotone }))
    .render(el)
);

// Curve order (b): curve each series, sample densely, then sum.
export const SCurveCurveThenSum = show((el) =>
  chart(coarse, { w: W, h: H })
    .flow(
      derive((rows: Row[]) => stackRows(curveThenSum(rows), {})),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(ribbon({ fill: "c", curve: Curve.linear }))
    .render(el)
);

// Overlay: (a)'s boundaries as solid lines, (b)'s as dashed.
export const SCurveOverlay = show((el) =>
  chart(coarse, { w: W, h: H })
    .flow(
      derive((rows: Row[]) => stackRows(rows, {})),
      group({ by: "c" }),
      scatter({ by: "x", x: "x", y: "y1" })
    )
    .mark(line({ stroke: "c", strokeWidth: 1.5, curve: Curve.monotone }))
    .layer(
      chart(stackRows(curveThenSum(coarse), {}))
        .flow(group({ by: "c" }), scatter({ by: "x", x: "x", y: "y1" }))
        .mark(
          line({
            stroke: "black",
            strokeWidth: 1,
            strokeDasharray: "3 2",
            curve: Curve.linear,
          })
        )
    )
    .render(el)
);

// The difference (a) minus (b) for each band's top boundary.
export const SCurveDifference = show((el) =>
  chart(coarse, { w: W, h: H })
    .flow(
      derive((rows: Row[]) => curveOrderDifference(rows)),
      group({ by: "c" }),
      scatter({ by: "x", x: "x", y: "y" })
    )
    .mark(line({ stroke: "c", strokeWidth: 1.5, curve: Curve.linear }))
    .render(el)
);

// The top band's thickness (Games): (a) can go below zero, (b) cannot.
export const SCurveThickness = show((el) =>
  chart(coarse, { w: W, h: H })
    .flow(
      derive((rows: Row[]) => curveOrderThickness(rows)),
      group({ by: "c" }),
      scatter({ by: "x", x: "x", y: "y" })
    )
    .mark(line({ stroke: "c", strokeWidth: 1.5, curve: Curve.linear }))
    .render(el)
);

// ---------------------------------------------------------------------------
// Densities.

const density = (offset: Offset) =>
  chart(samples, { w: W, h: H })
    .flow(
      derive((rows: { g: string; v: number }[]) =>
        stackRows(densityRows(rows), { offset })
      ),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(ribbon({ fill: "c" }));

export const DStackedDensity = show((el) => density("zero").render(el));
export const DConditionalDensity = show((el) => density("expand").render(el));

export const DRidgeline = show((el) =>
  chart(samples, { w: W, h: H })
    .flow(
      derive((rows: { g: string; v: number }[]) =>
        densityRows(rows, { weighted: false })
      ),
      spread({ by: "c", dir: "y", anchor: "baseline", spacing: 70 }),
      scatter({ by: "x", x: "x" })
    )
    .mark(ribbon({ h: "y", fill: "c", opacity: 0.85 }))
    .render(el)
);

// ---------------------------------------------------------------------------
// Which wiggle: deviation (local), weighted wiggle (d3's wiggle), SineStream.

export const WDeviation = show((el) => stacked(topics, "deviation").render(el));
export const WWeighted = show((el) => stacked(topics, "wiggle").render(el));
export const WSineStream = show((el) =>
  stacked(topics, "sineStream").render(el)
);

// ---------------------------------------------------------------------------
// Where the baseline lives: stacked bars.

// Today: each lake's stack centered by the outer spread. Real, no emulation.
export const RCenteredBars = show((el) =>
  chart(seafood, { w: W, h: H })
    .flow(
      spread({ by: "lake", dir: "x", alignment: "middle" }),
      stack({ by: "species", dir: "y" })
    )
    .mark(rect({ w: 32, h: "count", fill: "species" }))
    .render(el)
);

// Proposed Align.wiggle() on the outer spread, emulated: the lakes are the
// x sequence, and each lake's stack is offset by the weighted wiggle.
const LAKES = [...new Set(seafood.map((d) => d.lake))];
const wiggleBars = (w = 32, spacing?: number, order?: Order) =>
  chart(seafoodRows(seafood), { w: W, h: H })
    .flow(
      derive((rows: Row[]) =>
        stackRows(rows, { offset: "wiggle", order }).map((r) => ({
          ...r,
          lake: LAKES[r.x],
        }))
      ),
      spread({ by: "lake", dir: "x", spacing }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(rect({ w, fill: "c" }).name("bars"));

export const RWiggleBars = show((el) => wiggleBars().render(el));

// The ribbon chart with a wiggle baseline: each lake's stack sorted by count
// (smallest at the bottom, as field("species").sort("count") does), offset
// by the weighted wiggle, and the pieces joined by translucent ribbons.
const byCountAscending: Order = (_x, at) =>
  [...at.keys()].sort((a, b) => at.get(a)! - at.get(b)!);
export const RWiggleBarsRibbons = show((el) =>
  wiggleBars(24, 48, byCountAscending)
    .layer(
      chart(selectAll("bars"))
        .flow(group({ by: "c" }))
        .mark(ribbon({ fill: "c", opacity: 0.5 }))
    )
    .render(el)
);

// The ribbon chart spec on the page, exactly as written: a zero baseline.
export const RRibbonChartZero = show((el) =>
  chart(seafood)
    .flow(
      spread({ by: "lake", dir: "x", spacing: 48 }),
      stack({ by: field("species").sort("count"), dir: "y" })
    )
    .mark(rect({ w: 24, h: "count", fill: "species" }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(group({ by: "species" }))
        .mark(ribbon({ fill: "species", opacity: 0.5 }))
    )
    .render(el)
);

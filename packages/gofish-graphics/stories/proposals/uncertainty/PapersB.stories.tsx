import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  Color,
  field,
  group,
  layer,
  line,
  rect,
  ribbon,
  scatter,
  spread,
  table,
} from "../../../src/lib";
import {
  activityCores,
  activityEnds,
  activityOrder,
  activitySlices,
  curveDraws,
  equalArea,
  equalPeak,
  depthBands,
  depthMedian,
  depthOutliers,
  fieldDraws,
  pointwiseBands,
  pointwiseMedian,
} from "./papers-b-data";

/**
 * Prototypes for the #980 uncertainty proposal, drawn with today's GoFish
 * from examples in recent IEEE VIS papers. Every draw, quantile, depth and
 * density is precomputed in `papers-b-data.ts`.
 */
const meta: Meta = { title: "Proposals/Uncertainty/Papers B" };
export default meta;

/** Two panels side by side, each with a small title. */
const panels = (titles: string[]) => {
  const container = initializeContainer();
  container.style.display = "flex";
  container.style.gap = "24px";
  container.style.fontFamily = "sans-serif";
  container.style.fontSize = "13px";
  return titles.map((title) => {
    const cell = document.createElement("div");
    const heading = document.createElement("div");
    heading.textContent = title;
    heading.style.margin = "0 0 4px 40px";
    cell.appendChild(heading);
    container.appendChild(cell);
    return { container, cell };
  });
};

// ---------------------------------------------------------------------------
// 1. Depth band vs pointwise ribbon for a line ensemble
// ---------------------------------------------------------------------------

const BLUES = Color.palette({
  "90%": "#c6dbef",
  "50%": "#6baed6",
  "max non-outlier": "#c6dbef",
});

export const DepthBandVsPointwise: StoryObj = {
  render: () => {
    const [a, b] = panels([
      "(a) Pointwise 50% and 90% quantiles",
      "(b) Depth band (functional boxplot)",
    ]);

    // (a) At each x, the quantiles of the 50 values there.
    layer({ w: 360, h: 260 }, [
      chart(curveDraws)
        .flow(group({ by: "curve" }), scatter({ x: "x", y: "y" }))
        .mark(line({ stroke: "#999", strokeWidth: 0.5, opacity: 0.4 })),
      chart(pointwiseBands, { color: BLUES })
        .flow(group({ by: "level" }), scatter({ by: "x", x: "x" }))
        .mark(rect({ w: 0, y: "lo", y2: "hi", fill: "level" }))
        .layer(ribbon({ along: "x", fill: "level" })),
      chart(pointwiseMedian)
        .flow(scatter({ x: "x", y: "y" }))
        .mark(line({ stroke: "#08306b", strokeWidth: 2 })),
    ]).render(a.cell, { axes: true });

    // (b) The envelope of the deepest half of the curves, ordered by
    // modified band depth; the deepest curve; the outliers.
    layer({ w: 360, h: 260 }, [
      chart(curveDraws)
        .flow(group({ by: "curve" }), scatter({ x: "x", y: "y" }))
        .mark(line({ stroke: "#999", strokeWidth: 0.5, opacity: 0.4 })),
      chart(depthBands, { color: BLUES })
        .flow(group({ by: "level" }), scatter({ by: "x", x: "x" }))
        .mark(rect({ w: 0, y: "lo", y2: "hi", fill: "level" }))
        .layer(ribbon({ along: "x", fill: "level" })),
      chart(depthMedian)
        .flow(scatter({ x: "x", y: "y" }))
        .mark(line({ stroke: "#08306b", strokeWidth: 2 })),
      chart(depthOutliers)
        .flow(group({ by: "curve" }), scatter({ x: "x", y: "y" }))
        .mark(
          line({ stroke: "#d62728", strokeWidth: 1, strokeDasharray: "4 2" })
        ),
    ]).render(b.cell, { axes: true });

    return a.container;
  },
};

// ---------------------------------------------------------------------------
// 2. Correlated field draws, small multiples
// ---------------------------------------------------------------------------

export const CorrelatedFieldDraws: StoryObj = {
  render: () => {
    const container = initializeContainer();

    chart(fieldDraws, { color: Color.gradient("viridis"), w: 748, h: 292 })
      .flow(
        table({ by: { x: "col", y: "row" }, spacing: 12 }),
        table({ by: { x: "j", y: "i" }, spacing: 0 })
      )
      .mark(rect({ fill: "value" }))
      .render(container, { axes: false });

    return container;
  },
};

// ---------------------------------------------------------------------------
// 3. Density slabs: shared scale vs per-curve rescaling
// ---------------------------------------------------------------------------

const densities = (rows: typeof equalArea) =>
  chart(rows, { w: 340, h: 200 })
    .flow(group({ by: "curve" }), scatter({ by: "x", x: "x" }))
    .mark(ribbon({ h: "density", fill: "curve", opacity: 0.45 }));

export const DensityScaling: StoryObj = {
  render: () => {
    const [a, b] = panels([
      "(a) Equal area: one density scale",
      "(b) Equal peak: each curve rescaled",
    ]);
    densities(equalArea).render(a.cell, { axes: true });
    densities(equalPeak).render(b.cell, { axes: true });
    return a.container;
  },
};

// ---------------------------------------------------------------------------
// 4. Timeline with uncertain start and end times
// ---------------------------------------------------------------------------

const ROWS = field("activity").sort(activityOrder);
const BAR = "#3b6ea8";

export const UncertainTimeline: StoryObj = {
  render: () => {
    const [a, b] = panels([
      "(a) Fade: shade = P(activity is on)",
      "(b) Dashed: the 95% range of each end",
    ]);

    // (a) One rect per slice, shaded by the chance the activity is on. On a
    // white page a white-to-blue scale reads as opacity.
    chart(activitySlices, {
      w: 420,
      h: 240,
      color: Color.gradient(["#ffffff", BAR]),
    })
      .flow(spread({ by: ROWS, dir: "y", spacing: 8 }), group({ by: "slice" }))
      .mark(rect({ x: "x", x2: "x2", fill: "alpha" }))
      .render(a.cell, { axes: true, legend: false });

    // (b) Each bar is a thick line: solid across its core, dashed across
    // each uncertain end. Lines are used because rect has no dash option.
    layer({ w: 420, h: 240 }, [
      chart(activityCores)
        .flow(
          spread({ by: ROWS, dir: "y", spacing: 34 }),
          scatter({ by: "x", x: "x" })
        )
        .mark(line({ along: "x", stroke: BAR, strokeWidth: 26 })),
      chart(activityEnds)
        .flow(
          spread({ by: ROWS, dir: "y", spacing: 34 }),
          group({ by: "end" }),
          scatter({ by: "x", x: "x" })
        )
        .mark(
          line({
            along: "x",
            stroke: BAR,
            strokeWidth: 26,
            strokeDasharray: "3 3",
          })
        ),
    ]).render(b.cell, { axes: true });

    return a.container;
  },
};

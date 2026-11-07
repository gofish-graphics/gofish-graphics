import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  Bin,
  blank,
  chart,
  circle,
  Coord,
  Curve,
  field,
  group,
  line,
  Overlap,
  partition,
  polygon,
  rect,
  ribbon,
  scatter,
  spread,
  stack,
} from "../../src/lib";
import { topics } from "./stackingBaselines";
import {
  dodgeDots,
  dotValues,
  LINK,
  linkCenter,
  linkNodes,
  lineStack,
  ridgeRows,
  ringRows,
  strands,
} from "./stackingKinds";

/**
 * THROWAWAY prototype stories for the stacking proposal: the kinds of
 * stacking. Box stacking and interval stacking are today's `stack`; the
 * others are emulated in `derive` with the helpers in `stackingKinds.ts`.
 */
const meta: Meta = { title: "Proposals/Stacking Kinds" };
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

// ---------------------------------------------------------------------------
// 1. Box stacking: each child is a box, and the stack adds their heights.
export const BoxStack = show((el) =>
  chart(seafood, { w: W, h: H })
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ w: 32, h: "count", fill: "species" }))
    .render(el)
);

// 2. Interval stacking: each child is an interval at each x.
const topicsByX = [...topics].sort((a, b) => a.x - b.x);
export const IntervalStack = show((el) =>
  chart(topicsByX, { w: W, h: H })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c" }))
    .render(el)
);

// 3. NOT PART OF THE PROPOSAL (dropped: thick lines are not stacked).
// Line stacking: each line's interval is its stroke. Emulated: the
// center of line k is the baseline plus the widths below it plus half its
// own, in pixels (the y scale is one data unit per pixel).
const COLORS = ["#4269d0", "#efb118", "#ff725c", "#6cc5b0", "#a463f2"];

/** A chart whose y scale is one data unit per pixel: two invisible anchor
 *  points at y = 0 and y = H, with the axes off. */
const pixelChart = (xMax = 30) =>
  chart(
    [
      { x: 0, y: 0, k: "lo" },
      { x: xMax, y: H, k: "hi" },
    ],
    { w: W, h: H, axes: false, legend: false }
  )
    .flow(scatter({ by: "k", x: "x", y: "y" }))
    .mark(blank());

/** One line per series, each in its own layer with its own stroke width. */
const strokes = (rows: { x: number; y: number; c: string; w: number }[]) =>
  [...new Set(rows.map((r) => r.c))].reduce(
    (ch, c, k) =>
      ch.layer(
        chart(rows.filter((r) => r.c === c))
          .flow(scatter({ by: "x", x: "x", y: "y" }))
          .mark(
            line({
              stroke: COLORS[k % COLORS.length],
              strokeWidth: rows.find((r) => r.c === c)!.w,
              curve: Curve.monotone,
            })
          )
      ),
    pixelChart()
  );

export const LineStack = show((el) =>
  strokes(lineStack("vertical")).render(el)
);
export const LineStackSection = show((el) =>
  strokes(lineStack("section")).render(el)
);

// ---------------------------------------------------------------------------
// 4. Contact stacking of rigid shapes: the amounts do not add.

// A Wilkinson dot plot: values binned, equal circles stacked in each bin.
// Today's API, no emulation.
export const DotplotEqual = show((el) =>
  chart(dotValues, { w: W })
    .flow(
      partition({ by: field("v").bin(Bin.step(0.4)), dir: "x", alignment: "end" }),
      stack({ by: "id", dir: "y", axes: false })
    )
    .mark(circle({ r: 7, fill: "#4269d0" }))
    .render(el)
);

// Circles of varied radius dodged up from a line with Overlap.separate
// (today's API, no emulation): each circle nests into the gaps between the
// circles below it.
export const DodgeVaried = show((el) =>
  chart(dodgeDots, { w: W })
    .flow(
      scatter({ x: "v", alignment: "end", overlap: Overlap.separate() })
    )
    .mark((d: typeof dodgeDots) =>
      circle({ r: d[0].r, fill: "#4269d0", stroke: "white", strokeWidth: 1 })(d)
    )
    .render(el)
);

// The same circles box-stacked per cluster (today's API): each column is
// the sum of its diameters. Same pixel scale as DodgeVaried.
export const DodgeBoxStack = show((el) =>
  chart(dodgeDots, { w: W })
    .flow(
      scatter({ by: "g", x: "gv", alignment: "end" }),
      stack({ dir: "y" })
    )
    .mark((d: typeof dodgeDots) =>
      circle({ r: d[0].r, fill: "#999", stroke: "white", strokeWidth: 1 })(d)
    )
    .render(el)
);

// Ridgelines, one band [y0, y1] per point, emulated in derive.
const ridges = (kind: "fixed" | "contact" | "sum") =>
  chart(ridgeRows(kind), { w: 300, h: H })
    .flow(
      group({ by: "c" }),
      scatter({ by: "x", x: "x", yMin: "y0", yMax: "y1" })
    )
    .mark(
      ribbon({ fill: "c", stroke: "white", strokeWidth: 1, opacity: 0.9 })
    );
export const RidgeFixed = show((el) => ridges("fixed").render(el));
export const ContactRidgeline = show((el) => ridges("contact").render(el));
export const RidgeSum = show((el) => ridges("sum").render(el));

// ---------------------------------------------------------------------------
// 5. Stacking along a curve's normal or vertically. Pixels.

const nodes = () =>
  chart(linkNodes).mark(polygon({ points: "ring", fill: "#555" }));
const bands = (rows: ReturnType<typeof strands>, opacity = 1) =>
  chart(rows).mark(
    polygon({
      points: "ring",
      fill: "c",
      opacity,
      stroke: "white",
      strokeWidth: 1,
    })
  );

// (a) a stroke of width 40 along the centerline, blue; (b) a band of
// vertical height 40 at each x, orange outline.
export const NormalVsVertical = show((el) =>
  pixelChart(W)
    .layer(nodes())
    .layer(
      chart(linkCenter)
        .flow(scatter({ by: "i", x: "x", y: "y" }))
        .mark(
          line({
            stroke: "#4269d0",
            strokeWidth: LINK.width,
            opacity: 0.5,
            curve: Curve.linear,
          })
        )
    )
    .layer(
      chart(strands([LINK.width], "vertical")).mark(
        polygon({
          points: "ring",
          fill: "none",
          stroke: "#ff725c",
          strokeWidth: 2,
        })
      )
    )
    .render(el)
);
export const StrandsNormal = show((el) =>
  pixelChart(W)
    .layer(nodes())
    .layer(bands(strands([10, 20, 10], "normal")))
    .render(el)
);
export const StrandsVertical = show((el) =>
  pixelChart(W)
    .layer(nodes())
    .layer(bands(strands([10, 20, 10], "vertical")))
    .render(el)
);

// ---------------------------------------------------------------------------
// 6. Concentric rings in Coord.clock: radial thickness dr from derive.
const rings = (kind: "area" | "radius") =>
  chart(
    ringRows(kind).flatMap((r) => [0, 1].map((half) => ({ ...r, half }))),
    {
    coord: Coord.clock(),
    w: H,
    h: H,
    axes: false,
    legend: false,
    }
  )
    .flow(spread({ by: "c", dir: "y", spacing: 0 }), stack({ by: "half", dir: "x" }))
    .mark((d: (ReturnType<typeof ringRows>[0] & { half: number })[]) =>
      rect({ w: "one", h: d[0].px, fill: "c" })(d)
    );
export const ConcentricArea = show((el) => rings("area").render(el));
export const ConcentricRadius = show((el) => rings("radius").render(el));

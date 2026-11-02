import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  circle,
  enclose,
  filter,
  pack,
  project,
  scatter,
  selectAll,
  Color,
  Shape,
} from "../../src/lib";
import { gapminderCountries } from "../../src/data/gapminderCountries";
import {
  countryPopulations,
  type CountryPopulation,
} from "../../src/data/countryPopulations";
import { ARCS_PROTOTYPE } from "../../src/ast/graphicalOperators/enclose/arcs";

// SCRATCH (not for merge): Shape.blob vs Shape.arcs on the ChartAccent chart
// and on the bubble treemap. No gallery tags.
const meta: Meta = { title: "Scratch/Enclose Shape Compare" };
export default meta;

const REGION_COLORS = {
  America: "#5aa3b8",
  "East Asia & Pacific": "#9cb850",
  "Europe & Central Asia": "#f2b45c",
  "Middle East & North Africa": "#a99bc0",
  "South Asia": "#e07b9b",
  "Sub-Saharan Africa": "#47b8a0",
};

/** The ChartAccent Sub-Saharan Africa chart with `shape` and `padding`. */
const chartAccent = (shape: Shape.Shape, padding = 6): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(gapminderCountries, {
      axes: true,
      w: 520,
      h: 320,
      color: Color.palette(REGION_COLORS),
    })
      .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
      .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
      .layer(
        chart(selectAll("countries"))
          .flow(
            filter(
              (country: any) =>
                project(country, "Region") === "Sub-Saharan Africa"
            )
          )
          .mark(
            enclose({
              shape,
              padding,
              fill: "#47b8a0",
              stroke: "#47b8a0",
              fillOpacity: 0.3,
            })
          )
      )
      .render(container);
    return container;
  },
});

// (a) the current gallery story
export const CA_Blob = chartAccent(Shape.blob({ convexity: 0.1, neck: 0.6 }));
// (b) arcs, default radius 12
export const CA_Arcs12 = chartAccent(Shape.arcs());
// (c) arcs, other settings
export const CA_Arcs24 = chartAccent(Shape.arcs({ radius: 24 }));
export const CA_Arcs40 = chartAccent(Shape.arcs({ radius: 40 }));
export const CA_Arcs80 = chartAccent(Shape.arcs({ radius: 80 }));
export const CA_Arcs24Pad10 = chartAccent(Shape.arcs({ radius: 24 }), 10);

// Bubble treemap with the blob instead of arcs (reverse comparison).
const country = (d: CountryPopulation[]) =>
  circle({ r: 1.6 * Math.sqrt(d[0].pop), fill: "continent" })(d);

const bubble = (outer: Shape.Shape, inner: Shape.Shape): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(countryPopulations)
      .flow(
        pack({ by: "continent", spacing: 4 }),
        enclose({
          shape: outer,
          padding: 4,
          fill: "none",
          stroke: "#333",
          strokeWidth: 1.5,
        }),
        pack({ by: "region", spacing: 4 }),
        enclose({ shape: inner, padding: 4, fill: "none", stroke: "#999" }),
        pack()
      )
      .mark(country)
      .render(container, { w: 720, h: 600 });
    return container;
  },
});

export const BT_Arcs = bubble(
  Shape.arcs({ radius: 12 }),
  Shape.arcs({ radius: 8 })
);
export const BT_Blob = bubble(Shape.blob(), Shape.blob());
export const BT_BlobConvex1 = bubble(
  Shape.blob({ convexity: 1, neck: 1 }),
  Shape.blob({ convexity: 1, neck: 1 })
);

// (d) PROTOTYPE: arcs over the members plus their spanning tree (a "spine"
// of thin segment links), so the closing stays in one piece like the blob.
// The flag is a module global in arcs.ts; each story renders in its own
// iframe, so setting it here does not leak into the other stories.
const withSpine = (w: number, story: StoryObj): StoryObj => ({
  render: (...args: any[]) => {
    ARCS_PROTOTYPE.spine = w;
    return (story.render as any)(...args);
  },
});
export const CA_Proto_ArcsSpine12 = withSpine(0, chartAccent(Shape.arcs()));
export const CA_Proto_ArcsSpine24 = withSpine(
  0,
  chartAccent(Shape.arcs({ radius: 24 }))
);
export const CA_Proto_ArcsSpine24W4 = withSpine(
  4,
  chartAccent(Shape.arcs({ radius: 24 }))
);

// (e) PROTOTYPE: candidates against the "bumps" over single padded dots in
// CA_Proto_ArcsSpine24 (see scratch-bumps/ and arcsSmooth.ts).
const withProto = (
  proto: typeof ARCS_PROTOTYPE,
  story: StoryObj
): StoryObj => ({
  render: (...args: any[]) => {
    ARCS_PROTOTYPE.spine = proto.spine;
    ARCS_PROTOTYPE.smooth = proto.smooth;
    return (story.render as any)(...args);
  },
});
const ca = (radius: number) => chartAccent(Shape.arcs({ radius }));
export const CA_Bump_NoSpine24 = withProto({}, ca(24));
export const CA_Bump_Spine7R24 = withProto({ spine: 7 }, ca(24));
export const CA_Bump_Spine0R40 = withProto({ spine: 0 }, ca(40));
export const CA_Bump_Spine0R60 = withProto({ spine: 0 }, ca(60));
export const CA_Bump_Relax6 = withProto(
  { spine: 0, smooth: { kind: "relax", sigma: 6, iters: 3 } },
  ca(24)
);
export const CA_Bump_Outward6 = withProto(
  { spine: 0, smooth: { kind: "outward", sigma: 6, iters: 3 } },
  ca(24)
);
export const CA_Bump_Field4 = withProto(
  { spine: 0, smooth: { kind: "field", sigma: 4 } },
  ca(24)
);
export const CA_Bump_Field8 = withProto(
  { spine: 0, smooth: { kind: "field", sigma: 8 } },
  ca(24)
);
export const CA_Bump_Blur4 = withProto(
  { spine: 0, smooth: { kind: "blur", sigma: 4 } },
  ca(24)
);
export const CA_Bump_Blur6 = withProto(
  { spine: 0, smooth: { kind: "blur", sigma: 6 } },
  ca(24)
);
export const CA_Bump_Blur6Local20 = withProto(
  { spine: 0, smooth: { kind: "blur", sigma: 6, local: 20 } },
  ca(24)
);
export const CA_Bump_Blur8 = withProto(
  { spine: 0, smooth: { kind: "blur", sigma: 8 } },
  ca(24)
);

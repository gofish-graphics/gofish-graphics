import type { Meta, StoryObj } from "@storybook/html";
import * as Shapes from "../EncloseShapes.stories";
import { ENCLOSE_PROTOTYPE } from "../../src/ast/graphicalOperators/enclose";
import { ARCS_PROTOTYPE } from "../../src/ast/graphicalOperators/enclose/arcs";
import type { UnifiedOptions } from "../../src/ast/graphicalOperators/enclose/unified";
import { initializeContainer } from "../helper";
import {
  chart,
  circle,
  enclose,
  filter,
  group,
  layer,
  position,
  project,
  scatter,
  selectAll,
  Color,
  Shape,
} from "../../src/lib";
import { gapminderCountries } from "../../src/data/gapminderCountries";
import { penguins } from "../../src/data/penguins";

// SCRATCH (not for merge): round 4 of the unified enclose outline:
// convexity above 1 (rounder than the hull, toward Shape.oval() at 2), and
// the spine links as tubes as wide as their members (`neck`). No gallery tags.
const meta: Meta = { title: "Scratch/Enclose Round4" };
export default meta;

const wrap = (story: StoryObj, overrides?: Partial<UnifiedOptions>, unified = true): StoryObj => ({
  render: (...args: any[]) => {
    ARCS_PROTOTYPE.spine = undefined;
    ARCS_PROTOTYPE.smooth = undefined;
    ENCLOSE_PROTOTYPE.unified = unified;
    ENCLOSE_PROTOTYPE.arcs = undefined;
    ENCLOSE_PROTOTYPE.overrides = overrides;
    ENCLOSE_PROTOTYPE.dump = undefined;
    ENCLOSE_PROTOTYPE.dumpEl = undefined;
    return (story.render as any)(...args) as HTMLElement;
  },
});

type Pt = [number, number];
// The U-shaped cloud of round 3.
const U: Pt[] = (() => {
  const path: Pt[] = [
    [35, 22],
    [35, 150],
    [190, 150],
    [190, 22],
  ];
  const out: Pt[] = [];
  for (let s = 0; s < 3; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
    const k = Math.round(L / 26);
    for (let i = s === 0 ? 0 : 1; i <= k; i++) {
      const t = i / k,
        jit = ((i * 7 + s * 3) % 5) - 2;
      for (const side of [-1, 1])
        out.push([
          a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit,
          a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit,
        ]);
    }
  }
  return out;
})();
const uStory = (shape: Shape.Shape): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    // margin so a rounder outline is not cut off at the top-left
    layer(
      U.map(([x, y], i) =>
        position({ x: x + 25, y: y + 25 }, [
          circle({ r: 5, fill: "#3366aa" }).name(`u${i}`),
        ])
      )
    )
      .relate((names: any) => [
        enclose(
          {
            shape,
            padding: 8,
            fill: "#3366aa",
            stroke: "#3366aa",
            fillOpacity: 0.25,
          },
          U.map((_, i) => names[`u${i}`])
        ),
      ])
      .render(container);
    return container;
  },
});
const REGION_COLORS = {
  America: "#5aa3b8",
  "East Asia & Pacific": "#9cb850",
  "Europe & Central Asia": "#f2b45c",
  "Middle East & North Africa": "#a99bc0",
  "South Asia": "#e07b9b",
  "Sub-Saharan Africa": "#47b8a0",
};
const caStory = (shape: Shape.Shape): StoryObj => ({
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
              padding: 6,
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
const beaks = penguins.filter(
  (d) => d["Beak Length (mm)"] != null && d["Beak Depth (mm)"] != null
);
const pgStory = (shape: Shape.Shape): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(beaks, { axes: true, w: 420, h: 320 })
      .flow(scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
      .mark(circle({ r: 2.5, fill: "Species" }).name("points"))
      .layer(
        chart(selectAll("points"))
          .flow(group({ by: "Species" }))
          .mark(
            enclose({
              shape,
              padding: 6,
              fill: "Species",
              stroke: "Species",
              fillOpacity: 0.2,
            })
          )
      )
      .render(container);
    return container;
  },
});

const blob = (convexity: number) => Shape.blob({ convexity });

// ── convexity sweeps, 0 to 2 ────────────────────────────────────────────────
export const ConvU_000 = wrap(uStory(blob(0)));
export const ConvU_050 = wrap(uStory(blob(0.5)));
export const ConvU_100 = wrap(uStory(blob(1)));
export const ConvU_125 = wrap(uStory(blob(1.25)));
export const ConvU_150 = wrap(uStory(blob(1.5)));
export const ConvU_175 = wrap(uStory(blob(1.75)));
export const ConvU_200 = wrap(uStory(blob(2)));
export const ConvU_Oval = wrap(uStory(Shape.oval()));
export const ConvPG_000 = wrap(pgStory(blob(0)));
export const ConvPG_050 = wrap(pgStory(blob(0.5)));
export const ConvPG_100 = wrap(pgStory(blob(1)));
export const ConvPG_125 = wrap(pgStory(blob(1.25)));
export const ConvPG_150 = wrap(pgStory(blob(1.5)));
export const ConvPG_175 = wrap(pgStory(blob(1.75)));
export const ConvPG_200 = wrap(pgStory(blob(2)));
export const ConvPG_Oval = wrap(pgStory(Shape.oval()));
export const ConvCA_000 = wrap(caStory(blob(0)));
export const ConvCA_050 = wrap(caStory(blob(0.5)));
export const ConvCA_100 = wrap(caStory(blob(1)));
export const ConvCA_125 = wrap(caStory(blob(1.25)));
export const ConvCA_150 = wrap(caStory(blob(1.5)));
export const ConvCA_175 = wrap(caStory(blob(1.75)));
export const ConvCA_200 = wrap(caStory(blob(2)));
export const ConvCA_Oval = wrap(caStory(Shape.oval()));

// ── alternatives at 1.5 and 2 ───────────────────────────────────────────────
const alts = ["circle", "corner", "firey"] as const;
const altStories: Record<string, StoryObj> = {};
for (const a of alts)
  for (const c of [1.5, 2])
    for (const [k, mk] of [
      ["U", uStory],
      ["PG", pgStory],
      ["CA", caStory],
    ] as const)
      altStories[`Alt_${a}_${k}_${Math.round(c * 100)}`] = wrap(mk(blob(c)), {
        beyond: a,
      });
export const Alt_circle_U_150 = altStories.Alt_circle_U_150;
export const Alt_circle_U_200 = altStories.Alt_circle_U_200;
export const Alt_circle_PG_150 = altStories.Alt_circle_PG_150;
export const Alt_circle_PG_200 = altStories.Alt_circle_PG_200;
export const Alt_circle_CA_150 = altStories.Alt_circle_CA_150;
export const Alt_circle_CA_200 = altStories.Alt_circle_CA_200;
export const Alt_corner_U_150 = altStories.Alt_corner_U_150;
export const Alt_corner_U_200 = altStories.Alt_corner_U_200;
export const Alt_corner_PG_150 = altStories.Alt_corner_PG_150;
export const Alt_corner_PG_200 = altStories.Alt_corner_PG_200;
export const Alt_corner_CA_150 = altStories.Alt_corner_CA_150;
export const Alt_corner_CA_200 = altStories.Alt_corner_CA_200;
export const Alt_firey_U_150 = altStories.Alt_firey_U_150;
export const Alt_firey_U_200 = altStories.Alt_firey_U_200;
export const Alt_firey_PG_150 = altStories.Alt_firey_PG_150;
export const Alt_firey_PG_200 = altStories.Alt_firey_PG_200;
export const Alt_firey_CA_150 = altStories.Alt_firey_CA_150;
export const Alt_firey_CA_200 = altStories.Alt_firey_CA_200;

// ── neck: the spine links as wide as their members ──────────────────────────
const S = Shapes as any;
export const Neck_Munkres_100 = wrap(S.MunkresFigure, { neck: 1 });
export const Neck_Munkres_060 = wrap(S.MunkresFigure, { neck: 0.6 });
export const Neck_ChartAccent_100 = wrap(S.ChartAccentSubSaharanAfrica, {
  neck: 1,
});
export const Neck_ChartAccent_060 = wrap(S.ChartAccentSubSaharanAfrica, {
  neck: 0.6,
});

// The bubble treemap as the proposal page spells it: Shape.fillet({ radius:
// 12 }) around each continent, Shape.fillet({ radius: 0 }) around each region
// (Shape.arcs routed through the unified fillet).
import { pack } from "../../src/lib";
import { countryPopulations } from "../../src/data/countryPopulations";
export const BubbleFillet0: StoryObj = {
  render: () => {
    ARCS_PROTOTYPE.spine = undefined;
    ARCS_PROTOTYPE.smooth = undefined;
    ENCLOSE_PROTOTYPE.unified = true;
    ENCLOSE_PROTOTYPE.arcs = true;
    ENCLOSE_PROTOTYPE.overrides = undefined;
    ENCLOSE_PROTOTYPE.dump = undefined;
    ENCLOSE_PROTOTYPE.dumpEl = undefined;
    const container = initializeContainer();
    chart(countryPopulations)
      .flow(
        pack({ by: "continent", spacing: 4 }),
        enclose({ shape: Shape.arcs({ radius: 12 }), padding: 4, fill: "none", stroke: "#333", strokeWidth: 1.5 }),
        pack({ by: "region", spacing: 4 }),
        enclose({ shape: Shape.arcs({ radius: 0 }), padding: 4, fill: "none", stroke: "#999" }),
        pack()
      )
      .mark((d: any) => circle({ r: 1.6 * Math.sqrt(d[0].pop), fill: "continent" })(d))
      .render(container, { w: 720, h: 600 });
    return container;
  },
};

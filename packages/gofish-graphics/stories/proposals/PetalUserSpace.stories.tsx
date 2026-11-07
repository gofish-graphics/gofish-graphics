// Throwaway prototypes for the #1331 proposal (proposals/petal-user-space).
// Not a gallery story. Delete once the design is decided.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood, catchLocations } from "../../src/data/catch";
import { color } from "../../src/color";
import {
  chart,
  scatter,
  layer,
  rect,
  Constraint,
  stack,
  petal,
  polygon,
  derive,
  Coord,
} from "../../src/lib";
// PROTOTYPE (#1331): the local-frame glyph mark, not exported from lib.ts.
import { glyph } from "../../src/ast/shapes/glyph";

const meta: Meta = { title: "Proposals/Petal User Space" };
export default meta;

const R = 90;
const lakeA = seafood.filter((d) => d.lake === "Lake A");

// Josh's petal: under B the coord bends the whole outline.
const FAVORITE = "M0 0 L0 .468 Q.451 .809 .5 1 Q.549 .809 1 .468 L1 0 Z";
// Today's leaf in the unit box, as a C glyph: straight to the shoulders at
// half height, then two quadratics to the tip.
const LEAF = "M.5 0 L0 .5 Q0 .75 .5 1 Q1 .75 1 .5 Z";
const PIE = "M0 0 L0 1 L1 1 L1 0 Z";

const today = () => petal({ w: "count", fill: "species" });
const bent = (d: string) => polygon({ w: "count", d, fill: "species" } as any);
const flat = (d: string) => glyph({ w: "count", d, fill: "species" });

// Approach A, writable today: compute each ring in data space (angle in
// count units, radius 0..1) and let polygon's data-bound points go through
// the polar warp. The user does the stacking by hand.
const PETAL: [number, number][] = [
  [0, 0],
  [0, 0.5],
  [0.5, 1],
  [1, 0.5],
  [1, 0],
];
export const DataRing: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(lakeA, { coord: Coord.polar(), axes: false, w: 220, h: 220 })
      .flow(
        derive((rows) => {
          let at = 0;
          return rows.map((d) => {
            const a = at;
            at += d.count;
            return {
              ...d,
              ring: PETAL.map(([u, v]) => [a + u * d.count, v]),
            };
          });
        })
      )
      .mark(polygon({ points: "ring", fill: "species" }))
      .render(container);
    return container;
  },
};

// The front-page flower chart, with the petal mark swapped.
const stemData = seafood.map((d) => ({
  ...d,
  x: catchLocations[d.lake as keyof typeof catchLocations].x,
}));
const flowerChart = (petalMark: any) => {
  const container = initializeContainer();
  const flower = chart({ coord: Coord.polar(), axes: false })
    .flow(stack({ by: "species", dir: "x", h: 40 }))
    .mark(petalMark);
  chart(stemData, { axes: false, w: 400, h: 400 })
    .flow(scatter({ by: "lake", x: "x" }))
    .mark(
      layer([
        rect({ w: 4, h: "count", fill: color.green[5] }).name("stem"),
        flower.name("flower"),
      ]).relate(({ stem, flower }) => [
        Constraint.align({ x: "middle", y: ["end", "middle"] }, [stem, flower]),
      ])
    )
    .render(container);
  return container;
};
export const FlowerToday: StoryObj = { render: () => flowerChart(today()) };
export const FlowerLeafGlyph: StoryObj = {
  render: () => flowerChart(flat(LEAF)),
};
export const FlowerFavoriteBent: StoryObj = {
  render: () => flowerChart(bent(FAVORITE)),
};
export const FlowerFavoriteGlyph: StoryObj = {
  render: () => flowerChart(flat(FAVORITE)),
};

// One head: Lake F has the widest slot (192 degrees).
const lakeF = stemData.filter((d) => d.lake === "Lake F");
const head = (data: any[], mark: any, coord: any = Coord.polar()) => {
  const container = initializeContainer();
  chart(data, { coord, axes: false, w: 220, h: 220 })
    .flow(stack({ by: "species", dir: "x", h: R }))
    .mark(mark)
    .render(container);
  return container;
};
export const WideToday: StoryObj = { render: () => head(lakeF, today()) };
export const WideLeafGlyph: StoryObj = {
  render: () => head(lakeF, flat(LEAF)),
};
export const WideFavoriteBent: StoryObj = {
  render: () => head(lakeF, bent(FAVORITE)),
};
export const WideFavoriteGlyph: StoryObj = {
  render: () => head(lakeF, flat(FAVORITE)),
};
// A box outline under B draws a true pie.
export const PieSlice: StoryObj = { render: () => head(lakeA, bent(PIE)) };

// A harder coord: clock (12 o'clock, clockwise) with a donut hole.
const donut = () => Coord.clock({ innerRadius: 0.4 });
export const DonutToday: StoryObj = {
  render: () => head(lakeA, today(), donut()),
};
export const DonutLeafGlyph: StoryObj = {
  render: () => head(lakeA, flat(LEAF), donut()),
};
export const DonutFavoriteBent: StoryObj = {
  render: () => head(lakeA, bent(FAVORITE), donut()),
};
export const DonutFavoriteGlyph: StoryObj = {
  render: () => head(lakeA, flat(FAVORITE), donut()),
};

// No coord: a stacked bar of petals.
const bars = (mark: any) => {
  const container = initializeContainer();
  chart(lakeA, { axes: false, w: 300, h: 120 })
    .flow(stack({ by: "species", dir: "x", h: 100 }))
    .mark(mark)
    .render(container);
  return container;
};
export const BarsToday: StoryObj = {
  render: () => bars(petal({ w: "count", h: 100, fill: "species" } as any)),
};
export const BarsLeafGlyph: StoryObj = {
  render: () => bars(glyph({ w: "count", h: 100, d: LEAF, fill: "species" })),
};
export const BarsFavoriteBent: StoryObj = {
  render: () =>
    bars(
      polygon({ w: "count", h: 100, d: FAVORITE, fill: "species" } as any)
    ),
};
export const BarsFavoriteGlyph: StoryObj = {
  render: () =>
    bars(glyph({ w: "count", h: 100, d: FAVORITE, fill: "species" })),
};

// Measurement: one radius-40 head per slot angle (the petal under test, then
// a filler petal for the rest of the circle).
const SLOTS = [16, 42, 90, 108, 127, 162, 192];
const measure = (mark: () => any) => {
  const container = initializeContainer();
  for (const a of SLOTS) {
    const div = document.createElement("div");
    container.appendChild(div);
    chart(
      [
        { s: "a", count: a },
        { s: "b", count: 360 - a },
      ],
      { coord: Coord.polar(), axes: false, w: 100, h: 100 }
    )
      .flow(stack({ by: "s", dir: "x", h: 40 }))
      .mark(mark())
      .render(div);
  }
  return container;
};
export const MeasureToday: StoryObj = {
  render: () => measure(() => petal({ w: "count", fill: "s" })),
};
export const MeasureLeafGlyph: StoryObj = {
  render: () => measure(() => glyph({ w: "count", d: LEAF, fill: "s" })),
};

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, polygon, group } from "../../../src/lib";
import {
  zoomed,
  afterPaint,
  readPaths,
  measure,
  polyInterior,
  boxInterior,
  draw,
  insideColor,
  type Pt,
} from "./place";
import { takeLegend } from "./Areas.stories";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

// Four non-convex regions (a floor plan's wings), each 4×4 units with
// 1.4-unit-thick arms, laid out in a row 1 unit apart.
const T = 1.4;
const shift = (ring: Pt[], dx: number): Pt[] => ring.map(([x, y]) => [x + dx, y]);
export const regions = [
  {
    name: "West Wing", // C: opens to the right
    ring: [[0, 0], [4, 0], [4, T], [T, T], [T, 4 - T], [4, 4 - T], [4, 4], [0, 4]] as Pt[],
  },
  {
    name: "Cloister", // U: opens upward
    ring: shift([[0, 0], [4, 0], [4, 4], [4 - T, 4], [4 - T, T], [T, T], [T, 4], [0, 4]], 5),
  },
  {
    name: "Annex", // L
    ring: shift([[0, 0], [4, 0], [4, T], [T, T], [T, 4], [0, 4]], 10),
  },
  {
    name: "Gallery", // V / chevron
    ring: shift([[0, 4], [2, 0], [4, 4], [4 - T * 0.9, 4], [2, 1.7], [T * 0.9, 4]], 15),
  },
];

const regionsChart = (labeled: boolean) => {
  const mark = polygon({ points: "ring", fill: "name", opacity: 0.85 });
  return chart(regions, { axes: false }).flow(group({ by: "name" })).mark(
    labeled ? mark.label("name", { position: "center" }) : mark
  );
};

// TODAY (real API):
//   chart(regions, { axes: false }).flow(group({ by: "name" }))
//     .mark(polygon({ points: "ring", fill: "name" }).label("name", { position: "center" }))
export const PolygonToday: StoryObj = {
  name: "polygon-today",
  render: () => {
    const container = zoomed(initializeContainer(), 1.15);
    regionsChart(true).render(container, { w: 880, h: 200 });
    return container;
  },
};

const interiorStory = (name: string, how: "polylabel" | "box"): StoryObj => ({
  name,
  render: () => {
    const container = zoomed(initializeContainer(), 1.15);
    regionsChart(false).render(container, { w: 880, h: 200 });
    afterPaint(container, (svg) => {
      const legend = takeLegend(svg);
      const shapes = readPaths(svg, (el) => legend.has(el.getAttribute("fill") ?? ""), 4);
      draw(
        svg,
        shapes.map((s) => {
          const text = legend.get(s.fill)!;
          const style = { fontSize: 12, fill: insideColor(s.fill) };
          const size = measure(svg, text, style);
          return how === "polylabel"
            ? polyInterior(s.pts, text, size, style)
            : boxInterior(s.pts, text, size, style);
        })
      );
    });
    return container;
  },
});

// PROPOSED (pole of inaccessibility, polylabel):
//   chart(regions, { axes: false }).flow(group({ by: "name" }))
//     .mark(polygon({ points: "ring", fill: "name" }).label("name", { position: Place.interior() }))
export const PolygonInterior = interiorStory("polygon-interior", "polylabel");

// VARIANT: same spelling, but interior() picks where the label's own box can
// grow largest (area-interior's band rule, generalized to any polygon).
export const PolygonInteriorBox = interiorStory("polygon-interior-box", "box");

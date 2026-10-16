import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, scatter, circle } from "../../../src/lib";
import { loadCountries } from "./data";
import {
  zoomed,
  afterPaint,
  readCircles,
  measure,
  around,
  chooseFirstFit,
  draw,
  outsideColor,
  type Obstacle,
} from "./place";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

const W = 640,
  H = 440;

// TODAY (real API):
//   chart(countries)
//     .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
//     .mark(circle({ r: 4 }).label("country"))
export const PointToday: StoryObj = {
  name: "point-today",
  loaders: [async () => ({ countries: await loadCountries() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.6);
    chart(ctx.loaded.countries)
      .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
      .mark(circle({ r: 4 }).label("country"))
      .render(container, { w: W, h: H });
    return container;
  },
};

/** The plot region: right of the y-axis, above the x-axis. */
export function plotBounds(svg: SVGSVGElement) {
  const rects = [...svg.querySelectorAll("rect")].map((r) => ({
    x: +r.getAttribute("x")!,
    y: +r.getAttribute("y")!,
    w: +r.getAttribute("width")!,
    h: +r.getAttribute("height")!,
  }));
  const xAxis = rects.filter((r) => r.h === 1).sort((a, b) => b.w - a.w)[0];
  const yAxis = rects.filter((r) => r.w === 1).sort((a, b) => b.h - a.h)[0];
  return {
    x0: yAxis ? yAxis.x + 2 : 0,
    y0: 0,
    x1: +svg.getAttribute("width")!,
    y1: xAxis ? xAxis.y - 1 : +svg.getAttribute("height")!,
  };
}

/** Place.around() over every circle in the chart, avoiding all circles plus
 *  `extra` obstacles. Rows and circles are in the same (data) order. */
export function labelAround(
  svg: SVGSVGElement,
  names: string[],
  extra: Obstacle[] = []
) {
  const circles = readCircles(svg);
  const dots: Obstacle[] = circles.map((c) => ({
    kind: "circle",
    cx: c.cx,
    cy: c.cy,
    r: c.r + 1,
  }));
  const reqs = circles.map((c, i) => {
    const style = { fontSize: 11, fill: outsideColor(c.fill) };
    return { candidates: around(c, names[i], measure(svg, names[i], style), style) };
  });
  const out = chooseFirstFit(reqs, [...dots, ...extra], plotBounds(svg));
  draw(svg, out);
  return out;
}

// PROPOSED:
//   chart(countries)
//     .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
//     .mark(circle({ r: 4 }).label("country", { position: Place.around() }))
export const PointAround: StoryObj = {
  name: "point-around",
  loaders: [async () => ({ countries: await loadCountries() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.6);
    const rows = ctx.loaded.countries as any[];
    chart(rows)
      .flow(scatter({ by: "country", x: "fertility", y: "life_expect" }))
      .mark(circle({ r: 4 }))
      .render(container, { w: W, h: H });
    afterPaint(container, (svg) => {
      const out = labelAround(svg, rows.map((r) => r.country));
      console.error(
        "point-around hidden:",
        rows.filter((_, i) => !out[i]).map((r) => r.country).join(", ")
      );
    });
    return container;
  },
};

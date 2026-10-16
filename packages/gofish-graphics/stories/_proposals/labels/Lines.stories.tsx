import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, scatter, group, line, Schema } from "../../../src/lib";
import { loadStocks, loadYearlyStocks } from "./data";
import {
  zoomed,
  afterPaint,
  readPaths,
  measure,
  endLabels,
  along,
  chooseFirstFit,
  draw,
  outsideColor,
  type Obstacle,
} from "./place";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

const W = 560,
  H = 320;

const stocksChart = (rows: any[], withLabel: boolean) => {
  const mark = line({ stroke: "symbol", strokeWidth: 2 });
  return chart(rows, { schema: { date: Schema.time() } })
    .flow(group({ by: "symbol" }), scatter({ by: "date", x: "date", y: "price" }))
    .mark(withLabel ? mark.label("symbol") : mark);
};

// TODAY (real API):
//   chart(stocks, { schema: { date: Schema.time() } })
//     .flow(group({ by: "symbol" }), scatter({ by: "date", x: "date", y: "price" }))
//     .mark(line({ stroke: "symbol", strokeWidth: 2 }).label("symbol"))
export const LineToday: StoryObj = {
  name: "line-today",
  loaders: [async () => ({ stocks: await loadYearlyStocks() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.7);
    stocksChart(ctx.loaded.stocks, true).render(container, { w: W, h: H });
    return container;
  },
};

/** The five series lines, in legend order, with their symbols. */
function seriesLines(svg: SVGSVGElement, rows: any[]) {
  const symbols = [...new Set(rows.map((r) => r.symbol as string))];
  const paths = readPaths(
    svg,
    (el) => el.getAttribute("fill") === "none" && +(el.getAttribute("stroke-width") ?? 0) >= 2
  );
  return paths.map((p, i) => ({ ...p, symbol: symbols[i] }));
}

// PROPOSED:
//   .mark(line({ stroke: "symbol", strokeWidth: 2 })
//     .label("symbol", { position: Place.end() }))
export const LineEnd: StoryObj = {
  name: "line-end",
  loaders: [async () => ({ stocks: await loadYearlyStocks() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.7);
    const rows = ctx.loaded.stocks;
    stocksChart(rows, false).render(container, { w: W, h: H, legend: false } as any);
    afterPaint(container, (svg) => {
      const lines = seriesLines(svg, rows);
      const labels = endLabels(
        lines.map((l) => {
          const style = { fontSize: 11, fill: outsideColor(l.stroke) };
          return { pts: l.pts, text: l.symbol, style, size: measure(svg, l.symbol, style) };
        }),
        "end"
      );
      svg.setAttribute("width", String(+svg.getAttribute("width")! + 40));
      draw(svg, labels);
    });
    return container;
  },
};

const alongStory = (name: string, monthly: boolean): StoryObj => ({
  name,
  loaders: [async () => ({ stocks: monthly ? await loadStocks() : await loadYearlyStocks() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.7);
    const rows = ctx.loaded.stocks;
    stocksChart(rows, false).render(container, { w: W, h: H, legend: false } as any);
    afterPaint(container, (svg) => {
      const lines = seriesLines(svg, rows);
      const all: Obstacle[] = lines.map((l) => ({ kind: "polyline", pts: l.pts }));
      const reqs = lines.map((l, i) => {
        const style = { fontSize: 11, fontWeight: 600, fill: outsideColor(l.stroke), halo: true };
        return {
          candidates: along(
            l.pts, l.symbol, measure(svg, l.symbol, style), style, 0.6, true
          ),
          // the other series' lines are obstacles; a label sits on its own line
          ownObstacles: all.filter((_, j) => j !== i),
        };
      });
      draw(svg, chooseFirstFit(reqs, []));
    });
    return container;
  },
});

// PROPOSED (`at` = fraction of arc length, as TikZ `pos`):
//   .mark(line({ stroke: "symbol", strokeWidth: 2 })
//     .label("symbol", { position: Place.along({ at: 0.6, sloped: true }) }))
export const LineAlong = alongStory("line-along", false);

// The same spec on the raw MONTHLY prices: on a spiky line the only stretches
// straight enough for a sloped label are the steep ones.
export const LineAlongMonthly = alongStory("line-along-monthly", true);

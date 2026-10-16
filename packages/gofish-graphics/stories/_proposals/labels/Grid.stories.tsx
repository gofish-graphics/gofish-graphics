import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  scatter,
  circle,
  line,
  group,
  spread,
  stack,
  ribbon,
  polygon,
} from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import {
  zoomed,
  afterPaint,
  readCircles,
  readPaths,
  measure,
  around,
  endLabels,
  along,
  bandInterior,
  polyInterior,
  chooseFirstFit,
  draw,
  outsideColor,
  insideColor,
  type Obstacle,
} from "./place";
import { takeLegend } from "./Areas.stories";
import { regions } from "./Polygons.stories";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

const PW = 150,
  PH = 100;

const cities = [
  { n: "Oslo", a: 1.0, b: 3.0 },
  { n: "Bergen", a: 1.25, b: 3.15 },
  { n: "Drammen", a: 1.1, b: 2.55 },
  { n: "Tromsø", a: 2.5, b: 4.0 },
  { n: "Bodø", a: 2.2, b: 1.4 },
  { n: "Ålesund", a: 3.0, b: 2.3 },
];

const series = (() => {
  const v: Record<string, number[]> = {
    Alpha: [2, 3, 2.6, 4, 4.6, 5.2],
    Beta: [1, 1.6, 2.8, 3.4, 4.4, 4.9],
    Gamma: [4, 3.4, 2.2, 1.8, 2.2, 2.0],
  };
  return Object.entries(v).flatMap(([s, ys]) => ys.map((y, x) => ({ s, x, y })));
})();

function panel(grid: HTMLElement, title: string): HTMLElement {
  const cell = document.createElement("div");
  cell.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  const t = document.createElement("div");
  t.textContent = title;
  t.style.cssText =
    "font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color:#333;";
  const c = document.createElement("div");
  c.style.cssText = "padding: 4px 30px 4px 36px;";
  cell.append(t, c);
  grid.append(c.parentElement!);
  return c;
}

const dots = (c: HTMLElement, today?: boolean) => {
  const m = circle({ r: 4 });
  chart(cities, { axes: false })
    .flow(scatter({ by: "n", x: "a", y: "b" }))
    .mark(today ? m.label("n", { position: "outset-top" }) : m)
    .render(c, { w: PW, h: PH });
};

const lines = (c: HTMLElement) =>
  chart(series, { axes: false })
    .flow(group({ by: "s" }), scatter({ by: "x", x: "x", y: "y" }))
    .mark(line({ stroke: "s", strokeWidth: 2 }))
    .render(c, { w: PW, h: PH, legend: false } as any);

const lineGeoms = (svg: SVGSVGElement) => {
  const names = ["Alpha", "Beta", "Gamma"];
  return readPaths(svg, (el) => el.getAttribute("fill") === "none").map((p, i) => ({
    ...p,
    text: names[i],
  }));
};

export const StrategyGrid: StoryObj = {
  name: "strategy-grid",
  render: () => {
    const container = zoomed(initializeContainer(), 1.25);
    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid;grid-template-columns:repeat(4, 222px);gap:18px 10px;background:white;padding:8px;";
    container.append(grid);

    // 1. today's box positions (REAL .label render)
    dots(panel(grid, 'Place.box("outset-top")'), true);

    // 2. around
    {
      const c = panel(grid, "Place.around()");
      dots(c);
      afterPaint(c, (svg) => {
        const cs = readCircles(svg);
        const obs: Obstacle[] = cs.map((d) => ({ kind: "circle", cx: d.cx, cy: d.cy, r: d.r + 1 }));
        const reqs = cs.map((d, i) => {
          const style = { fontSize: 11, fill: outsideColor(d.fill) };
          return { candidates: around(d, cities[i].n, measure(svg, cities[i].n, style), style) };
        });
        draw(svg, chooseFirstFit(reqs, obs));
      });
    }

    // 3/4. start, end
    for (const which of ["start", "end"] as const) {
      const c = panel(grid, `Place.${which}()`);
      lines(c);
      afterPaint(c, (svg) => {
        const ls = lineGeoms(svg);
        draw(
          svg,
          endLabels(
            ls.map((l) => {
              const style = { fontSize: 11, fill: outsideColor(l.stroke) };
              return { pts: l.pts, text: l.text, style, size: measure(svg, l.text, style) };
            }),
            which
          )
        );
      });
    }

    // 5/6. along, flat and sloped
    for (const sloped of [false, true]) {
      const c = panel(grid, sloped ? "Place.along({ at: 0.5, sloped: true })" : "Place.along({ at: 0.5 })");
      lines(c);
      afterPaint(c, (svg) => {
        const ls = lineGeoms(svg);
        const all: Obstacle[] = ls.map((l) => ({ kind: "polyline", pts: l.pts }));
        const reqs = ls.map((l, i) => {
          const style = { fontSize: 11, fontWeight: 600, fill: outsideColor(l.stroke), halo: true };
          return {
            candidates: along(l.pts, l.text, measure(svg, l.text, style), style, 0.5, sloped),
            ownObstacles: all.filter((_, j) => j !== i),
          };
        });
        draw(svg, chooseFirstFit(reqs, []));
      });
    }

    // 7. interior on bands
    {
      const c = panel(grid, "Place.interior()  (band)");
      chart(seafood, { axes: false })
        .flow(
          spread({ by: "lake", dir: "x", spacing: 34, alignment: "middle" }),
          stack({ by: "species", dir: "y" })
        )
        .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }))
        .render(c, { w: PW, h: PH });
      afterPaint(c, (svg) => {
        const legend = takeLegend(svg);
        const bands = readPaths(svg, (el) => legend.has(el.getAttribute("fill") ?? ""));
        draw(
          svg,
          bands.map((b) => {
            const text = legend.get(b.fill)!;
            const style = { fontSize: 11, fill: insideColor(b.fill) };
            return bandInterior(b.pts, text, measure(svg, text, style), style, 2);
          })
        );
      });
    }

    // 8. interior on a C polygon
    {
      const c = panel(grid, "Place.interior()  (polygon)");
      chart([regions[0]], { axes: false })
        .flow(group({ by: "name" }))
        .mark(polygon({ points: "ring", fill: "#5ea2d0" }))
        .render(c, { w: PW, h: PH });
      afterPaint(c, (svg) => {
        const shapes = readPaths(svg, (el) => el.getAttribute("fill") === "#5ea2d0", 2);
        draw(
          svg,
          shapes.map((s) => {
            const text = "Wing A";
            const style = { fontSize: 11, fill: insideColor(s.fill) };
            return polyInterior(s.pts, text, measure(svg, text, style), style);
          })
        );
      });
    }
    return container;
  },
};

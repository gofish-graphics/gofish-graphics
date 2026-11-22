import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, rect } from "../../src/lib";
import { drawn, all } from "./defs";

const meta: Meta = { title: "Proposals Theming/Scoped Theme" };
export default meta;

const DARK_PAGE = "#16161d";
const DARK_INK = "#c9c9d3";
// default palette (src/color.ts color6) -> brightened for the dark page
const BRIGHTER: Record<string, string> = {
  "#4190c5": "#5aa9e0",
  "#f2cf57": "#f7dc7a",
  "#a181c8": "#b99ae0",
  "#ff9666": "#ffab85",
  "#43b780": "#5fd09a",
};
const SVG = "http://www.w3.org/2000/svg";

// Proposed:
//   chart(data).flow(spread({ by: "lake", dir: "x" }), spread({ by: "species", dir: "x" }))
//     .mark(rect({ h: "count", fill: "species" }))
//   with the "Lake B" facet wrapped in theme(Theme.dark(), ...) / .theme(...)
export const ScopedTheme: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "8px";
    const data = seafood.filter((d) =>
      ["Lake A", "Lake B", "Lake C"].includes(d.lake)
    );
    await chart(data, { w: 480, h: 200 })
      .flow(
        spread({ by: "lake", dir: "x", spacing: 36 }),
        spread({ by: "species", dir: "x", spacing: 3 })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(container);
    const [svg] = await drawn(container);

    const s = svg.getBoundingClientRect();
    const bx = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
    };
    const bars = all(svg, "rect")
      .filter(
        (r) =>
          BRIGHTER[r.getAttribute("fill") ?? ""] &&
          Number(r.getAttribute("width")) > 12
      )
      .sort((a, b) => bx(a).x - bx(b).x);
    const mid = bars.slice(5, 10);
    const x0 = bx(mid[0]).x - 16;
    const x1 = bx(mid[4]).x + bx(mid[4]).w + 16;
    const inMid = (el: Element) => {
      const b = bx(el);
      const cx = b.x + b.w / 2;
      return cx > x0 && cx < x1;
    };
    // Drop the per-bar species labels (the legend names them) and the "lake"
    // axis title (the facet labels name the lakes): keeps the panels clean.
    const species = new Set(data.map((d) => d.species));
    for (const t of all(svg, "text")) {
      const v = t.textContent?.trim() ?? "";
      const isLegend = bx(t).x > bx(bars[14]).x + 20;
      if ((species.has(v as any) && !isLegend) || v === "lake") t.remove();
      // close the gap the species row leaves under the bars
      if (v.startsWith("Lake "))
        t.setAttribute("y", String(Number(t.getAttribute("y")) - 18));
    }
    svg.setAttribute("height", String(Number(svg.getAttribute("height")) - 22));
    // the facet's own texts: everything centered in its x range (below the plot)
    const texts = all(svg, "text").filter(inMid);
    const bottom = Math.max(...texts.map((t) => bx(t).y + bx(t).h)) + 8;

    const bg = document.createElementNS(SVG, "rect");
    bg.setAttribute("x", String(x0));
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(x1 - x0));
    bg.setAttribute("height", String(bottom));
    bg.setAttribute("rx", "4");
    bg.setAttribute("fill", DARK_PAGE);
    svg.insertBefore(bg, svg.firstChild);

    for (const r of mid) {
      const c = BRIGHTER[r.getAttribute("fill")!];
      r.setAttribute("fill", c);
      r.setAttribute("stroke", c);
    }
    for (const t of texts) t.setAttribute("fill", DARK_INK);
    // the facet's own baseline, in the dark theme's axis ink
    const base = document.createElementNS(SVG, "rect");
    const b0 = bx(mid[0]);
    base.setAttribute("x", String(x0 + 8));
    base.setAttribute("y", String(b0.y + b0.h));
    base.setAttribute("width", String(x1 - x0 - 16));
    base.setAttribute("height", "1");
    base.setAttribute("fill", DARK_INK);
    svg.appendChild(base);
    return container;
  },
};

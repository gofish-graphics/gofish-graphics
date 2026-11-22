import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, spread, rect } from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { lines, drawn, all, thinTicks } from "./defs";

const meta: Meta = { title: "Proposals Theming/Color And Pattern" };
export default meta;

// GoFish's default palette, in order (src/color.ts color6).
const SPECIES_COLOR: Record<string, string> = {
  Adelie: "#4190c5",
  Chinstrap: "#f2cf57",
  Gentoo: "#a181c8",
};

// mean body mass by species and sex
const rows = Object.keys(SPECIES_COLOR).flatMap((species) =>
  ["Female", "Male"].map((sex) => {
    const ms = penguins
      .filter(
        (p) =>
          p.Species === species &&
          p.Sex === sex.toUpperCase() &&
          p["Body Mass (g)"] != null
      )
      .map((p) => p["Body Mass (g)"] as number);
    return {
      species,
      sex,
      "body mass (g)": Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    };
  })
);

const SVG = "http://www.w3.org/2000/svg";
const el = (
  tag: string,
  attrs: Record<string, string | number>,
  text?: string
) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
};

// Proposed:
//   chart(rows, { color: Color.palette(...) })   // default palette
//     .flow(spread({ by: "species", dir: "x" }), spread({ by: "sex", dir: "x" }))
//     .mark(rect({ h: "mass", fill: "species", pattern: "sex" }))
//   with pattern: Pattern.palette([Pattern.solid(), Pattern.lines()])
export const ColorAndPattern: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "8px";
    const defs = Object.entries(SPECIES_COLOR).map(([s, c]) =>
      lines(`hatch-${s}`, { color: c, gap: 6, width: 1.6 })
    );
    await chart(rows, { w: 330, h: 260 })
      .flow(
        spread({ by: "species", dir: "x", spacing: 28 }),
        spread({ by: "sex", dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "body mass (g)", fill: "species" }))
      .render(container, { defs });
    const [svg] = await drawn(container);
    thinTicks(svg, 1000);

    // Swap the male bars to hatching in the species color + outline.
    const dataRects = all(svg, "rect").filter((r) =>
      Object.values(SPECIES_COLOR).includes(r.getAttribute("fill") ?? "")
    );
    // the legend swatches are also species-colored: they are the 10x10 ones
    const bars = dataRects.filter((r) => Number(r.getAttribute("width")) > 12);
    bars.forEach((r, i) => {
      const row = rows[i];
      const c = SPECIES_COLOR[row.species];
      r.setAttribute("stroke", c);
      r.setAttribute("stroke-width", "1.5");
      if (row.sex === "Male")
        r.setAttribute("fill", `url(#hatch-${row.species})`);
    });

    // A second legend entry for sex, under the species entry.
    const swatches = dataRects.filter(
      (r) => Number(r.getAttribute("width")) === 10
    );
    const last = swatches[swatches.length - 1];
    const lx = Number(last.getAttribute("x"));
    let ly = Number(last.getAttribute("y")) + 30;
    for (const [label, fill] of [
      ["Female", "#777"],
      ["Male", "url(#hatch-gray)"],
    ]) {
      svg.appendChild(
        el("rect", {
          x: lx,
          y: ly,
          width: 10,
          height: 10,
          fill,
          stroke: "#777",
          "stroke-width": 1,
        })
      );
      svg.appendChild(
        el(
          "text",
          {
            x: lx + 15,
            y: ly + 9,
            fill: "gray",
            "font-size": 10,
            "font-family": "system-ui, sans-serif",
          },
          label
        )
      );
      ly += 20;
    }
    // gray hatch for the legend
    const defsEl =
      svg.querySelector("defs") ??
      svg.insertBefore(el("defs", {}), svg.firstChild);
    const p = el("pattern", {
      id: "hatch-gray",
      patternUnits: "userSpaceOnUse",
      width: 4,
      height: 4,
      patternTransform: "rotate(-45)",
    });
    p.appendChild(el("rect", { width: 4, height: 4, fill: "white" }));
    p.appendChild(
      el("line", {
        x1: -1,
        y1: 2,
        x2: 5,
        y2: 2,
        stroke: "#777",
        "stroke-width": 1.2,
      })
    );
    defsEl.appendChild(p);
    // widen the svg so the legend fits
    svg.setAttribute("width", String(Number(svg.getAttribute("width")) + 10));
    return container;
  },
};

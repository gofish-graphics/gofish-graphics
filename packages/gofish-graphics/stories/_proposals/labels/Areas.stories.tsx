import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, stack, ribbon } from "../../../src/lib";
import { seafood } from "../../../src/data/catch";
import {
  zoomed,
  afterPaint,
  readPaths,
  measure,
  bandInterior,
  draw,
  insideColor,
} from "./place";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

const SPACING = 96;

const stream = (labeled: boolean) => {
  const mark = ribbon({ h: "count", fill: "species", opacity: 0.8 });
  return chart(seafood)
    .flow(
      spread({ by: "lake", dir: "x", spacing: SPACING, alignment: "middle" }),
      stack({ by: "species", dir: "y" })
    )
    .mark(labeled ? mark.label("species") : mark);
};

// TODAY (real API):
//   chart(seafood)
//     .flow(
//       spread({ by: "lake", dir: "x", spacing: 96, alignment: "middle" }),
//       stack({ by: "species", dir: "y" })
//     )
//     .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 }).label("species"))
export const AreaToday: StoryObj = {
  name: "area-today",
  render: () => {
    const container = zoomed(initializeContainer(), 1.8);
    stream(true).render(container, { w: 520, h: 360 });
    return container;
  },
};

/** Legend swatch fill -> legend text, read off the rendered legend, which is
 *  then removed (a directly labeled chart has no legend). */
export function takeLegend(svg: SVGSVGElement): Map<string, string> {
  const map = new Map<string, string>();
  const texts = [...svg.querySelectorAll("text")];
  const swatches = [...svg.querySelectorAll("rect")].filter(
    (r) => r.getAttribute("width") === "10" && r.getAttribute("height") === "10"
  );
  let minX = Infinity;
  for (const s of swatches) {
    const x = +s.getAttribute("x")!,
      y = +s.getAttribute("y")!;
    const t = texts.find(
      (t) =>
        Math.abs(+t.getAttribute("x")! - (x + 15)) < 1 &&
        Math.abs(+t.getAttribute("y")! - (y + 9)) < 1.5
    );
    if (!t) continue;
    map.set(s.getAttribute("fill")!, t.textContent!.trim());
    minX = Math.min(minX, x);
    s.remove();
    t.remove();
  }
  if (isFinite(minX)) svg.setAttribute("width", String(Math.ceil(minX)));
  return map;
}

// PROPOSED:
//   .mark(ribbon({ h: "count", fill: "species", opacity: 0.8 })
//     .label("species", { position: Place.interior() }))
export const AreaInterior: StoryObj = {
  name: "area-interior",
  render: () => {
    const container = zoomed(initializeContainer(), 1.8);
    stream(false).render(container, { w: 520, h: 360 });
    afterPaint(container, (svg) => {
      const legend = takeLegend(svg);
      const bands = readPaths(svg, (el) => legend.has(el.getAttribute("fill") ?? ""));
      const out = bands.map((b) => {
        const text = legend.get(b.fill)!;
        const style = { fontSize: 12, fill: insideColor(b.fill) };
        return bandInterior(b.pts, text, measure(svg, text, style), style);
      });
      draw(svg, out);
    });
    return container;
  },
};

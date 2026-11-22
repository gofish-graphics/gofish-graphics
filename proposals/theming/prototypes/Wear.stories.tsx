import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { themed } from "./Themes.stories";
import { applyWear, type Wear as SvgWear } from "./scan";
import { replaceWithScan } from "./raster";

type Wear = SvgWear | "raster";

const meta: Meta = { title: "Proposals Theming/Wear" };
export default meta;

// Proposed: chart(...).render(el, { theme: Theme.cogra(), effects: [...] })
const CAPTION: Record<Wear, string> = {
  none: "no effect",
  roughen: "Filter.roughen()",
  scan: "[Filter.roughen(), Filter.threshold()]",
  xerox: "[Filter.roughen(), Filter.threshold(), Filter.grain()]",
  raster: "Filter.scan()",
  pixel: "SVG pixelate trick, 1 CSS px cell (experiment)",
};

async function worn(
  wear: Wear,
  size?: { w: number; h: number },
  caption = true
): Promise<HTMLElement> {
  const panel = await themed("cogra", size);
  const svg = panel.querySelector("svg") as SVGSVGElement;
  if (wear === "raster") await replaceWithScan(svg);
  else applyWear(svg, wear);
  const cap = panel.lastElementChild as HTMLElement;
  if (caption) {
    cap.textContent = CAPTION[wear];
    cap.style.color = "black";
    cap.style.fontSize = "12px";
  } else cap.remove();
  return panel;
}

const one = (
  wear: Wear,
  size?: { w: number; h: number },
  caption = true
): StoryObj => ({
  render: async () => {
    const container = initializeContainer();
    container.style.cssText += "display:inline-block;background:white;";
    container.appendChild(await worn(wear, size, caption));
    return container;
  },
});

export const CograWearRoughen = one("roughen");
export const CograWearScan = one("scan");
export const CograWearXerox = one("xerox");
export const CograScanRaster = one("raster");
export const CograScanSvgPixelate = one("pixel");
export const CograScanRasterLarge = one("raster", { w: 420, h: 320 }, false);
export const CograScanLarge = one("scan", { w: 420, h: 320 }, false);

export const CograWearSteps: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.cssText +=
      "display:inline-grid;grid-template-columns:auto auto;gap:10px;background:white;padding:8px;";
    for (const w of ["none", "roughen", "scan", "raster"] as Wear[])
      container.appendChild(await worn(w));
    return container;
  },
};

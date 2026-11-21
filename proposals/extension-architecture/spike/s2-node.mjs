// S2 (Node half): paint each S1 display list with a non-Solid painter.
//  1. gofish-ir's pure-string `DisplayList.displayListToSVG` (already in the repo).
//  2. resvg-js rasterizes the SVG string to PNG at 2x, with the same font file
//     the S1 opentype measurer read, so measured and painted text agree.
// Usage: node s2-node.mjs [s1 output dir = opentype-arial]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Resvg } from "@resvg/resvg-js";
import { displayListToSVG } from "../../../packages/gofish-ir/dist/display-list/index.js";

const mode = process.argv[2] ?? "opentype-arial";
// resvg-js 2.6 cannot use the variable SFNS.ttf (no glyphs drawn), so the
// DOM-free path measures and paints with Arial.
const FONT =
  process.env.GOFISH_FONT ?? "/System/Library/Fonts/Supplemental/Arial.ttf";
const img = new URL("../img/", import.meta.url);
mkdirSync(new URL(`./out/svg-${mode}/`, import.meta.url), { recursive: true });

for (const name of ["bars", "scatter", "lines", "polar", "geo"]) {
  const dl = JSON.parse(
    readFileSync(new URL(`./out/${mode}/${name}.json`, import.meta.url), "utf8")
  );
  const t0 = performance.now();
  // A white background, as the browser page has.
  const svg = displayListToSVG(dl).replace(
    /(<svg[^>]*>)/,
    `$1<rect width="100%" height="100%" fill="white"/>`
  );
  const t1 = performance.now();
  writeFileSync(new URL(`./out/svg-${mode}/${name}.svg`, import.meta.url), svg);
  const png = new Resvg(svg, {
    font: {
      fontFiles: [FONT],
      loadSystemFonts: false,
      defaultFontFamily: "Arial",
      sansSerifFamily: "Arial",
    },
    fitTo: { mode: "zoom", value: 2 },
  })
    .render()
    .asPng();
  const t2 = performance.now();
  const suffix = mode === "opentype-arial" ? "" : `-${mode}`;
  writeFileSync(new URL(`s2-${name}-node${suffix}.png`, img), png);
  console.log(
    `${name}: svg ${(svg.length / 1024).toFixed(0)} KiB in ${(t1 - t0).toFixed(1)} ms, png in ${(t2 - t1).toFixed(0)} ms`
  );
}

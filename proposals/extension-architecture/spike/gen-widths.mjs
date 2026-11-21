// Per-character advance table (em units) for the embedded engine's measurer:
// SFNS.ttf through fontkit with opsz = 10 (the axis-label size). A host could
// build the same table with fontTools; this is "the measurer as data".
import * as fontkit from "fontkit";
import { writeFileSync, mkdirSync } from "node:fs";

const base = fontkit.openSync(
  process.env.GOFISH_FONT ?? "/System/Library/Fonts/SFNS.ttf"
);
const f =
  "opsz" in (base.variationAxes ?? {}) ? base.getVariation({ opsz: 10 }) : base;
const widths = {};
for (let c = 32; c < 127; c++) {
  const ch = String.fromCharCode(c);
  widths[ch] = f.layout(ch).positions[0].xAdvance / f.unitsPerEm;
}
const table = {
  ascent: f.ascent / f.unitsPerEm,
  descent: f.descent / f.unitsPerEm,
  fallback: widths["n"],
  widths,
};
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./out/charwidths.json", import.meta.url),
  JSON.stringify(table)
);
console.log(
  "chars",
  Object.keys(widths).length,
  "ascent",
  table.ascent.toFixed(3),
  "descent",
  table.descent.toFixed(3)
);

// S2: compare text widths Chrome's canvas measureText gives for
// "10px system-ui, sans-serif" (and 12px) with the opentype.js measurers.
import { chromium } from "playwright-core";
import opentype from "opentype.js";
import { readFileSync } from "node:fs";

const words = [
  "0",
  "130",
  "drizzle",
  "count",
  "month",
  "Jan",
  "Dec",
  "GOOG",
  "2000",
  "550",
  "price",
  "date",
];
const load = (p) => {
  const b = readFileSync(p);
  return opentype.parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  );
};
const sf = load("/System/Library/Fonts/SFNS.ttf");
const arial = load("/System/Library/Fonts/Supplemental/Arial.ttf");

const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];
for (const size of [10, 12]) {
  const chrome = await page.evaluate(
    ([ws, s]) => {
      const c = document.createElement("canvas").getContext("2d");
      c.font = `${s}px system-ui, sans-serif`;
      return ws.map((w) => c.measureText(w).width);
    },
    [words, size]
  );
  words.forEach((w, i) =>
    rows.push({
      size,
      text: w,
      chrome: +chrome[i].toFixed(2),
      sfOpentype: +sf.getAdvanceWidth(w, size).toFixed(2),
      arialOpentype: +arial.getAdvanceWidth(w, size).toFixed(2),
      stub06: +(w.length * size * 0.6).toFixed(2),
    })
  );
}
console.table(rows);
await browser.close();

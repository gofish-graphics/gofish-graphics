// S2 (browser half): the normal Solid render of each spec in headless
// Chromium, plus the Node display list (SF measurer) painted as an SVG string
// in the same Chromium, then pixel diffs against the Node PNGs.
//
//   s2-<name>-browser.png        normal render(): Solid painter, canvas measureText
//   s2-<name>-node-chromium-<m>.png  S1 display list (SF measured by opentype or fontkit) -> displayListToSVG -> Chromium raster
//   s2-<name>-node.png           (from s2-node.mjs) S1 display list (opentype Arial) -> resvg
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { displayListToSVG } from "../../../packages/gofish-ir/dist/display-list/index.js";

const here = (p) => new URL(p, import.meta.url);
const img = (p) => here(`../img/${p}`);
const VD = here(
  "../../../packages/gofish-graphics/node_modules/vega-datasets/data/"
);
const csv = (name) => {
  const [head, ...lines] = readFileSync(new URL(name, VD), "utf8")
    .trim()
    .split("\n");
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(",");
    const row = {};
    cols.forEach(
      (c, i) => (row[c] = isNaN(+v[i]) || v[i] === "" ? v[i] : +v[i])
    );
    return row;
  });
};
const csvData = {
  weather: csv("seattle-weather.csv"),
  stocks: csv("stocks.csv"),
};

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { width: 900, height: 900 },
});
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.setContent(
  `<!doctype html><html><body style="margin:0;background:white"><div id="root" style="display:inline-block"></div></body></html>`
);
await page.addScriptTag({
  path: new URL("./out/browser/browser.js", import.meta.url).pathname,
});

const shot = async (file) => {
  const el = await page.$("#root svg");
  const buf = await el.screenshot({ omitBackground: false });
  writeFileSync(img(file), buf);
  return buf;
};

const diff = (a, b, out) => {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  const w = Math.min(A.width, B.width);
  const h = Math.min(A.height, B.height);
  const crop = (P) => {
    const o = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++)
      P.data.copy(o.data, y * w * 4, y * P.width * 4, y * P.width * 4 + w * 4);
    return o;
  };
  const d = new PNG({ width: w, height: h });
  const n = pixelmatch(crop(A).data, crop(B).data, d.data, w, h, {
    threshold: 0.1,
  });
  if (out) writeFileSync(img(out), PNG.sync.write(d));
  return {
    sizes: `${A.width}x${A.height} vs ${B.width}x${B.height}`,
    diffPx: n,
    pct: +((100 * n) / (w * h)).toFixed(2),
  };
};

const results = {};
for (const name of ["bars", "scatter", "lines", "polar", "geo"]) {
  const t0 = Date.now();
  await page.evaluate(([n, d]) => window.renderSpec(n, d), [name, csvData]);
  await page.waitForSelector("#root svg");
  const renderMs = Date.now() - t0;
  const browserPng = await shot(`s2-${name}-browser.png`);

  // The Node display list painted as an SVG string in the same Chromium, for
  // two DOM-free measurers over SFNS.ttf (what Chrome uses for system-ui):
  // opentype.js (default instance only) and fontkit (opsz = font size).
  const layout = {};
  for (const m of ["opentype", "fontkit"]) {
    const dl = JSON.parse(
      readFileSync(here(`./out/${m}/${name}.json`), "utf8")
    );
    await page.evaluate(
      (s) => (document.getElementById("root").innerHTML = s),
      displayListToSVG(dl)
    );
    const png = await shot(`s2-${name}-node-chromium-${m}.png`);
    layout[`browser vs node-chromium-${m} (layout parity)`] = diff(
      browserPng,
      png,
      `s2-${name}-diff-${m}.png`
    );
  }

  const nodeResvg = readFileSync(img(`s2-${name}-node.png`));
  results[name] = {
    renderMs,
    ...layout,
    "browser vs node (resvg+Arial, fully DOM-free)": diff(
      browserPng,
      nodeResvg,
      `s2-${name}-diff-resvg.png`
    ),
  };
}
console.log(JSON.stringify(results, null, 2));
const interesting = logs.filter((l) => !l.startsWith("debug"));
if (interesting.length) console.log("console:", interesting.slice(0, 10));
await browser.close();

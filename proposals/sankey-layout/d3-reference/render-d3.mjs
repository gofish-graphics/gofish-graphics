// Renders d3-sankey 0.12.3 reference images for the sankey-layout proposal.
// Usage: node render-d3.mjs <repo-root>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const here = path.dirname(new URL(import.meta.url).pathname);
const req = createRequire(path.join(here, "pkg", "package.json"));
const { sankey, sankeyLinkHorizontal, sankeyJustify } = req("d3-sankey");
const { chromium } = createRequire(path.join(root, "tests", "package.json"))(
  "playwright"
);

const src = fs.readFileSync(
  path.join(root, "packages/gofish-graphics/src/data/energy.ts"),
  "utf8"
);
const literal = src
  .slice(src.indexOf("energy: Energy = {") + 17)
  .trim()
  .replace(/;\s*$/, "");
const energy = Function(`return (${literal})`)();

const small = {
  nodes: [
    "Gas",
    "Solar",
    "Wind",
    "Grid",
    "Storage",
    "Transport",
    "Export",
    "Homes",
    "Losses",
    "Industry",
  ].map((name) => ({ name })),
  links: [
    ["Solar", "Storage", 6],
    ["Solar", "Grid", 2],
    ["Wind", "Grid", 7],
    ["Wind", "Storage", 1],
    ["Gas", "Grid", 5],
    ["Gas", "Losses", 4],
    ["Grid", "Industry", 6],
    ["Grid", "Export", 3],
    ["Grid", "Homes", 5],
    ["Storage", "Homes", 4],
    ["Storage", "Transport", 3],
  ].map(([source, target, value]) => ({ source, target, value })),
};

const palette = [
  "#4190c5",
  "#f2cf57",
  "#f39b72",
  "#58b38a",
  "#a98bd6",
  "#e56f8a",
  "#7fc3d6",
  "#c0a26b",
];

function svg(data, { w, h, padding, byName, iterations = 6 }) {
  const layout = sankey()
    .nodeWidth(12)
    .nodePadding(padding)
    .nodeAlign(sankeyJustify)
    .iterations(iterations)
    .extent([
      [1, 1],
      [w - 160, h - 1],
    ]);
  if (byName) layout.nodeId((d) => d.name);
  const g = layout({
    nodes: data.nodes.map((d) => ({ ...d })),
    links: data.links.map((d) => ({ ...d })),
  });
  const color = (n) => palette[n.index % palette.length];
  const links = g.links
    .map(
      (l) =>
        `<path d="${sankeyLinkHorizontal()(l)}" stroke="${color(l.source)}" stroke-opacity="0.4" stroke-width="${Math.max(1, l.width)}" fill="none"/>`
    )
    .join("");
  const nodes = g.nodes
    .map(
      (n) =>
        `<rect x="${n.x0}" y="${n.y0}" width="${n.x1 - n.x0}" height="${Math.max(0.5, n.y1 - n.y0)}" fill="#555"/>` +
        `<text x="${n.x1 + 4}" y="${(n.y0 + n.y1) / 2}" dy="0.35em" font-size="10" font-family="sans-serif">${n.name}</text>`
    )
    .join("");
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="background:white">${links}${nodes}</svg>`,
    g,
  };
}

const out = path.join(root, "tests/tmp/sankey-proposal/out");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [name, data, opts] of [
  ["d3-energy", energy, { w: 960, h: 600, padding: 10 }],
  ["d3-small", small, { w: 480, h: 300, padding: 10, byName: true }],
  [
    "d3-energy-no-relax",
    energy,
    { w: 960, h: 600, padding: 10, iterations: 0 },
  ],
  [
    "d3-small-no-relax",
    small,
    { w: 480, h: 300, padding: 10, byName: true, iterations: 0 },
  ],
]) {
  const { svg: s, g } = svg(data, opts);
  fs.writeFileSync(path.join(out, `${name}.svg`), s);
  fs.writeFileSync(
    path.join(out, `${name}.json`),
    JSON.stringify(
      g.nodes.map((n) => ({
        name: n.name,
        layer: n.layer,
        x0: n.x0,
        y0: n.y0,
        y1: n.y1,
      })),
      null,
      1
    )
  );
  await page.setViewportSize({ width: opts.w, height: opts.h });
  await page.setContent(`<html><body style="margin:0">${s}</body></html>`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log("wrote", name);
}
await browser.close();

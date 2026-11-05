// Round 2: d3.tree (Reingold–Tilford / Walker) and d3.cluster references for
// the flare subset, at the same node size, gap and column pitch as the
// GoFish stories (8 px nodes, 6 px gap, 128 px per layer, separation 1).
// Usage: node r2-render-d3-tree.mjs <repo-root>
// (needs d3-hierarchy + d3-shape in tests/tmp/sankey-proposal/pkg)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const req = createRequire(
  path.join(root, "tests/tmp/sankey-proposal/pkg/package.json")
);
const { hierarchy, tree, cluster } = req("d3-hierarchy");
const { linkHorizontal } = req("d3-shape");
const { chromium } = createRequire(path.join(root, "tests", "package.json"))(
  "playwright"
);

// read the flare subset from the stories' data.ts (via tsx, so it stays one source)
const flare = JSON.parse(
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      'import { flare } from "./stories/_proposals/sankey-layout/data"; console.log(JSON.stringify(flare))',
    ],
    {
      cwd: path.join(root, "packages/gofish-graphics"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }
  )
);

const SIZE = 8,
  GAP = 6,
  PITCH = 128,
  W = 640;
const svg = (layout, name) => {
  const r = layout.nodeSize([SIZE + GAP, PITCH]).separation(() => 1)(
    hierarchy(flare)
  );
  const nodes = r.descendants();
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x));
  const h = maxX - minX + SIZE;
  const X = (n) => n.y + SIZE / 2 + 20;
  const Y = (n) => n.x - minX + SIZE / 2;
  const link = linkHorizontal().x(X).y(Y);
  const links = r
    .links()
    .map(
      (l) => `<path d="${link(l)}" fill="none" stroke="#aaa" stroke-width="1"/>`
    )
    .join("");
  const marks = nodes
    .map(
      (n) =>
        `<rect x="${X(n) - SIZE / 2}" y="${Y(n) - SIZE / 2}" width="${SIZE}" height="${SIZE}" fill="#4682b4"/>` +
        `<text x="${X(n) + SIZE / 2 + 3}" y="${Y(n)}" dy="0.35em" font-size="8" font-family="sans-serif" fill="#1f4e79">${n.data.name}</text>`
    )
    .join("");
  fs.writeFileSync(
    path.join(root, `tests/tmp/sankey-proposal/out/${name}.json`),
    JSON.stringify(Object.fromEntries(nodes.map((n) => [n.data.name, Y(n)])))
  );
  return {
    h,
    s: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" style="background:white">${links}${marks}</svg>`,
  };
};

const out = path.join(root, "tests/tmp/sankey-proposal/out");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, layout] of [
  ["d3-tree", tree()],
  ["d3-cluster", cluster()],
]) {
  const { h, s } = svg(layout, name);
  await page.setViewportSize({ width: W, height: Math.ceil(h) });
  await page.setContent(`<html><body style="margin:0">${s}</body></html>`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(name, "breadth", h);
}
await browser.close();

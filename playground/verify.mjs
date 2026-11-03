// SCRATCH: check the playground's outline against the round-4 story renders at convexity
// 0, 0.5, 1, 1.5 and 2 (ChartAccent, penguins, U). Prints each outline's box and area in pixels,
// the playground's beside the story's.   node playground/verify.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const store = join(here, "../node_modules/.pnpm");
const pw = readdirSync(store)
  .filter((d) => d.startsWith("playwright@"))
  .sort()
  .at(-1);
const { chromium } = await import(
  pathToFileURL(join(store, pw, "node_modules/playwright/index.mjs")).href
);
const R4 = join(here, "../tests/tmp/iterate/scratch");

const ringsOf = (d) =>
  d
    .split(/Z/i)
    .filter((s) => s.trim())
    .map((s) =>
      [...s.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]])
    );
const stats = (rings) => {
  const pts = rings.flat();
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  let area = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const [a, b] = [r[i], r[(i + 1) % r.length]];
      area += (a[0] * b[1] - b[0] * a[1]) / 2;
    }
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    x: Math.min(...xs),
    y: Math.min(...ys),
    area: Math.abs(area),
  };
};
const fmt = (s) =>
  `x ${s.x.toFixed(1)} y ${s.y.toFixed(1)} w ${s.w.toFixed(1)} h ${s.h.toFixed(1)} area ${s.area.toFixed(0)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// DIST=<file>: check another build (e.g. an older commit's), for a before/after diff
await page.goto(
  pathToFileURL(process.env.DIST ?? join(here, "dist/index.html")).href
);
await page.waitForFunction(() => document.getElementById("status")?.dataset.ms);
const CASES = [
  ["chartaccent", "ca", 6],
  ["penguins", "pg", 6],
  ["u", "u", 8],
];
for (const [ds, key, padding] of CASES)
  for (const c of [0, 0.5, 1, 1.5, 2]) {
    await page.evaluate((p) => window.__playground.set(p), {
      dataset: ds,
      convexity: c,
      neck: 1,
      holes: false,
      shape: "blob",
      reach: Infinity,
      means: "area",
      seal: "jump",
      smooth: true,
      padding,
      compare: false,
    });
    const ours = await page.evaluate(() =>
      [...document.querySelectorAll("#outlines path")].map((p) => ({
        d: p.getAttribute("d"),
        t: p.getAttribute("transform"),
      }))
    );
    const file = join(
      R4,
      `enclose-round4--conv-${key}-${String(c * 100).padStart(3, "0")}.html`
    );
    const html = readFileSync(file, "utf8");
    const theirs = [
      ...html.matchAll(/<path d="([^"]*)" fill="(#[0-9a-f]+)" fill-opacity/g),
    ].map((m) => m[1]);
    ours.forEach((o, i) => {
      const [, , , f, tx, ty] = o.t.match(/[-\d.]+/g).map(Number);
      const rings = ringsOf(o.d).map((r) =>
        r.map(([x, y]) => [x + tx, f * y + ty])
      );
      const a = stats(rings),
        b = stats(ringsOf(theirs[i]));
      console.log(
        `${ds} c=${c} set ${i}\n  playground ${fmt(a)}\n  round4     ${fmt(b)}`
      );
    });
  }
await browser.close();

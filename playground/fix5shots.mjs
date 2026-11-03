// SCRATCH: the states of the fix-5 bugs, screenshotted (the stage only, 2x) for a before/after
// pair, with each set's area printed.   DIST=<html> node playground/fix5shots.mjs <outdir> <tag>
import { readdirSync, mkdirSync } from "node:fs";
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
const out = process.argv[2];
const tag = process.argv[3] ?? "after";
mkdirSync(out, { recursive: true });
const url = pathToFileURL(
  process.env.DIST ?? join(here, "dist/index.html")
).href;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: process.env.DARK ? "dark" : "light",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => document.getElementById("status")?.dataset.ms);
// the reach option was called join before the rename; set both
const R = (v) => ({ join: v, reach: v });
const CASES = [
  ["u-join0-c200", { dataset: "u", convexity: 2, ...R(0) }],
  ["u-join0-c195", { dataset: "u", convexity: 1.95, ...R(0) }],
  ["u-join0-c100", { dataset: "u", convexity: 1, ...R(0) }],
  [
    "chartaccent-avoid-c050",
    {
      dataset: "chartaccent",
      convexity: 0.5,
      ...R(Infinity),
      avoidOn: { chartaccent: true },
    },
  ],
  [
    "chartaccent-avoid-c000",
    {
      dataset: "chartaccent",
      convexity: 0,
      ...R(Infinity),
      avoidOn: { chartaccent: true },
    },
  ],
  [
    "chartaccent-avoid-c100",
    {
      dataset: "chartaccent",
      convexity: 1,
      ...R(Infinity),
      avoidOn: { chartaccent: true },
    },
  ],
  [
    "chartaccent-join15-c200",
    {
      dataset: "chartaccent",
      convexity: 2,
      ...R(1.5),
      avoidOn: { chartaccent: false },
    },
  ],
  [
    "penguins-avoid-c050",
    {
      dataset: "penguins",
      convexity: 0.5,
      ...R(Infinity),
      avoidOn: { penguins: true },
    },
  ],
  [
    "penguins-avoid-c100",
    {
      dataset: "penguins",
      convexity: 1,
      ...R(Infinity),
      avoidOn: { penguins: true },
    },
  ],
  [
    "penguins-join15-c200",
    {
      dataset: "penguins",
      convexity: 2,
      ...R(1.5),
      avoidOn: { penguins: false },
    },
  ],
  [
    "penguins-join15-c195",
    {
      dataset: "penguins",
      convexity: 1.95,
      ...R(1.5),
      avoidOn: { penguins: false },
    },
  ],
  [
    "penguins-join15-c100",
    {
      dataset: "penguins",
      convexity: 1,
      ...R(1.5),
      avoidOn: { penguins: false },
    },
  ],
];
const area = (d) => {
  let a = 0;
  for (const s of d.split(/Z/i).filter((x) => x.trim())) {
    const p = [...s.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
      +m[1],
      +m[2],
    ]);
    for (let i = 0; i < p.length; i++) {
      const [u, v] = [p[i], p[(i + 1) % p.length]];
      a += (u[0] * v[1] - v[0] * u[1]) / 2;
    }
  }
  return Math.abs(a);
};
for (const [name, p] of CASES) {
  await page.evaluate(async (p) => {
    const P = window.__playground;
    if (p.dataset) await P.set({ dataset: p.dataset });
    await P.set(p);
  }, p);
  const ds = await page.evaluate(() =>
    [...document.querySelectorAll("#outlines path")].map((e) =>
      e.getAttribute("d")
    )
  );
  console.log(`${name}: areas ${ds.map((d) => area(d).toFixed(0)).join(" ")}`);
  await page
    .locator("#stage")
    .screenshot({ path: join(out, `${name}-${tag}.png`) });
}
console.log(
  errors.length ? errors.slice(0, 5).join("\n") : "no console errors"
);
await browser.close();

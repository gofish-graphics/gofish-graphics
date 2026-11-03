// SCRATCH: screenshots for the discrete join on the HDBSCAN tree: join ∞ with the links shown
// (before/after the tree change), and the page with the barcode on ChartAccent and penguins at
// a couple of joins (typical × reach).   node playground/join4shots.mjs <outdir> [inf-only]
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
const infOnly = process.argv[3] === "inf-only";
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(here, "dist/index.html")).href;
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    errors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => document.getElementById("status")?.dataset.ms);
const set = (patch) => page.evaluate((p) => window.__playground.set(p), patch);
const BASE = {
  shape: "blob",
  convexity: 0.5,
  neck: 1,
  holes: false,
  smooth: true,
  means: "blend",
  seal: "jump",
  compare: false,
  compareModes: false,
  showMembers: false,
  joinRange: "inf",
  joinMeasure: "typical",
  joinDistance: "reach",
  joinCore: 4,
};
const caption = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".bc-cap")]
      .map((c) => c.textContent)
      .join(" | ")
  );
// join ∞ with the links drawn, every dataset
for (const ds of ["chartaccent", "penguins", "u", "hyperedges", "holes"]) {
  await set({ dataset: ds, ...BASE, join: Infinity, showLinks: true });
  await page
    .locator("#stage-wrap")
    .screenshot({ path: join(out, `inf-${ds}.png`) });
}
if (!infOnly) {
  for (const [ds, joins] of [
    ["chartaccent", [1, 1.695]],
    ["penguins", [1.5, 2.397]],
  ])
    for (const j of joins) {
      await set({ dataset: ds, ...BASE, join: j, showLinks: false });
      console.log(`${ds} ${j}: ${await caption()}`);
      await page.screenshot({
        path: join(out, `page-${ds}-${j}.png`),
        fullPage: true,
      });
      await page
        .locator("#join-field")
        .screenshot({ path: join(out, `barcode-${ds}-${j}.png`) });
    }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

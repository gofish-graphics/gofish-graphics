// SCRATCH: the per-bay blend, old (1 px grid, ?blend=grid) vs new (mesh): the stage per
// dataset at c = 0.25 and 0.5, plus side-by-side pairs and an edge close-up crop.
//   node playground/blendshots.mjs <outdir>
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
const out = process.argv[2] ?? join(here, "blendshots");
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(here, "dist/index.html")).href;
const browser = await chromium.launch();
const errors = [];
const BASE = {
  neck: 1,
  holes: false,
  connected: true,
  smooth: true,
  compare: false,
  showLinks: false,
  showMembers: false,
  compareModes: false,
  means: "blend",
  seal: "jump",
};
const pages = {};
for (const solver of ["grid", "mesh"]) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${solver} ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${solver} pageerror: ${e.message}`));
  await page.goto(url + (solver === "grid" ? "?blend=grid" : ""));
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.ms
  );
  pages[solver] = page;
}
const set = (page, patch) =>
  page.evaluate((p) => window.__playground.set(p), patch);
const DS = (process.env.DS ?? "chartaccent,u,penguins,hyperedges")
  .split(",")
  .filter(Boolean);
for (const ds of DS)
  for (const c of [0.25, 0.5])
    for (const solver of ["grid", "mesh"]) {
      const page = pages[solver];
      await set(page, { dataset: ds, ...BASE, convexity: c });
      await page.locator("#stage").screenshot({
        path: join(
          out,
          `${ds}-c${c * 100}-${solver === "grid" ? "old" : "new"}.png`
        ),
      });
    }
// the close-up: one crop of the stage (CSS px from its corner) at 8x, unsmoothed and smoothed
const CROP = JSON.parse(process.env.CROP ?? "null");
if (CROP)
  for (const solver of ["grid", "mesh"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 8,
    });
    await page.goto(url + (solver === "grid" ? "?blend=grid" : ""));
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.ms
    );
    for (const smooth of [false, true]) {
      await set(page, {
        dataset: CROP.ds,
        ...BASE,
        smooth,
        showMembers: true,
        convexity: CROP.c,
      });
      const box = await page.locator("#stage").boundingBox();
      await page.screenshot({
        path: join(
          out,
          `closeup-${CROP.ds}-c${CROP.c * 100}-${smooth ? "smoothed" : "unsmoothed"}-${solver === "grid" ? "old" : "new"}.png`
        ),
        clip: {
          x: box.x + CROP.x,
          y: box.y + CROP.y,
          width: CROP.w,
          height: CROP.h,
        },
      });
    }
    await page.close();
  }
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

// SCRATCH: one state, a region of the stage at 6x.   DIST=<html> node playground/zoom.mjs
//   '<json state>' x y w h <out.png>    (x y w h in stage css px)
import { readdirSync } from "node:fs";
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
const [st, x, y, w, h, out] = process.argv.slice(2);
const url = pathToFileURL(
  process.env.DIST ?? join(here, "dist/index.html")
).href;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: +(process.env.SCALE ?? 6),
});
await page.goto(url);
await page.waitForFunction(() => document.getElementById("status")?.dataset.ms);
const p = JSON.parse(st, (k, v) => (v === "Infinity" ? Infinity : v));
await page.evaluate(async (p) => {
  if (p.dataset) await window.__playground.set({ dataset: p.dataset });
  await window.__playground.set(p);
}, p);
const b = await page.locator("#stage").boundingBox();
await page.screenshot({
  path: out,
  clip: { x: b.x + +x, y: b.y + +y, width: +w, height: +h },
});
await browser.close();

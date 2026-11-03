// SCRATCH: screenshots of the join barcode and the pieces measure: the page with the barcode
// (ChartAccent, penguins), each dataset at a piece count in plain vs mutual reachability,
// a hovered bar, dark mode and the phone layout.   node playground/barcodeshots.mjs <outdir>
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
const out = process.argv[2] ?? join(here, "barcodeshots");
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(here, "dist/index.html")).href;
const browser = await chromium.launch();
const errors = [];
const open = async (opts = {}) => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    ...opts,
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.ms
  );
  return page;
};
const set = (page, patch) =>
  page.evaluate((p) => window.__playground.set(p), patch);
const BASE = {
  shape: "blob",
  convexity: 0.25,
  holes: false,
  smooth: true,
  means: "blend",
  seal: "jump",
  compare: false,
  compareModes: false,
  showMembers: false,
  showLinks: false,
  joinRange: "inf",
  joinMeasure: "pieces",
  joinCore: 4,
};
const CASES = JSON.parse(
  process.env.CASES ??
    JSON.stringify({
      chartaccent: { neck: 0.6, k: 4 },
      penguins: { neck: 1, k: 3 },
    })
);
const caption = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".bc-cap")]
      .map((c) => c.textContent)
      .join(" | ")
  );
let page = await open();
for (const [ds, { neck, k }] of Object.entries(CASES)) {
  for (const dist of ["plain", "reach"]) {
    await set(page, {
      dataset: ds,
      ...BASE,
      neck,
      join: k,
      joinDistance: dist,
    });
    console.log(`${ds} k ${k} ${dist}: ${await caption(page)}`);
    await page.locator("#stage-wrap").screenshot({
      path: join(out, `${ds}-k${k}-${dist}.png`),
    });
    await page.locator("#join-field").screenshot({
      path: join(out, `${ds}-k${k}-${dist}-barcode.png`),
    });
  }
  await set(page, {
    dataset: ds,
    ...BASE,
    neck,
    join: k,
    joinDistance: "reach",
  });
  await page.screenshot({ path: join(out, `page-${ds}.png`), fullPage: true });
}
// typical gap on each distance, at the join the n-sensitivity bench (joinsens) picks for it
const TYPICAL = {
  chartaccent: { neck: 0.6, plain: 3.39, reach: 1.695 },
  penguins: { neck: 1, plain: 3.805, reach: 2.397 },
};
for (const [ds, c] of Object.entries(TYPICAL))
  for (const dist of ["plain", "reach"]) {
    await set(page, {
      dataset: ds,
      ...BASE,
      neck: c.neck,
      joinMeasure: "typical",
      join: c[dist],
      joinDistance: dist,
    });
    console.log(`${ds} typical ${c[dist]} ${dist}: ${await caption(page)}`);
    await page.locator("#stage-wrap").screenshot({
      path: join(out, `${ds}-typical-${dist}.png`),
    });
    await page.locator("#join-field").screenshot({
      path: join(out, `${ds}-typical-${dist}-barcode.png`),
    });
    if (dist === "reach")
      await page.screenshot({
        path: join(out, `page-${ds}-typical-reach.png`),
        fullPage: true,
      });
  }
// the relative measure the maintainer found dead over 0..1: typical gap at 0.8
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  neck: 0.6,
  joinMeasure: "typical",
  join: 0.8,
  joinDistance: "plain",
});
await page.locator("#join-field").screenshot({
  path: join(out, `chartaccent-typical-0.8-barcode.png`),
});
// a hovered bar
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  neck: 0.6,
  join: 4,
  joinDistance: "reach",
});
await page.locator('#barcode .bar[data-set="0"][data-bar="0"]').hover();
await page.screenshot({
  path: join(out, "hover-chartaccent.png"),
  fullPage: true,
});
await page.close();
page = await open({ colorScheme: "dark" });
await set(page, {
  dataset: "penguins",
  ...BASE,
  neck: 1,
  joinMeasure: "typical",
  join: 2.397,
  joinDistance: "reach",
});
await page.screenshot({ path: join(out, "page-dark.png"), fullPage: true });
await page.locator(".panel").screenshot({ path: join(out, "panel-dark.png") });
await page.close();
page = await open({ viewport: { width: 390, height: 844 } });
await set(page, {
  dataset: "penguins",
  ...BASE,
  neck: 1,
  joinMeasure: "typical",
  join: 2.397,
  joinDistance: "reach",
});
await page.screenshot({ path: join(out, "page-phone.png"), fullPage: true });
await page
  .locator("#join-field")
  .screenshot({ path: join(out, "phone-barcode.png") });
await page.close();
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

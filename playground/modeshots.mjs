// SCRATCH: screenshots of the convexity modes: per dataset, each mode (and seal treatment) at
// c = 0.1, 0.25, 0.5, 0.75 (the stage only), plus the compare-modes small multiples, dark mode
// and phone width; prints per-mode timings and console errors.
//   node playground/modeshots.mjs <outdir>      (DS=u,chartaccent to scope)
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
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
const out = process.argv[2] ?? join(here, "modeshots");
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
const BASE = {
  neck: 1,
  holes: false,
  shape: "blob",
  reach: Infinity,
  smooth: true,
  compare: false,
  showLinks: false,
  showMembers: false,
  compareModes: false,
};
const set = (page, patch) =>
  page.evaluate((p) => window.__playground.set(p), patch);
const DS = (
  process.env.DS ?? "chartaccent,u,hyperedges,penguins,holes,bubble,munkres"
).split(",");
const MODES = [
  ["area-jump", { means: "area", seal: "jump" }],
  ["area-lid", { means: "area", seal: "lid" }],
  ["radius-jump", { means: "radius", seal: "jump" }],
  ["radius-lid", { means: "radius", seal: "lid" }],
  ["blend", { means: "blend", seal: "jump" }],
];
const CS = [0.1, 0.25, 0.5, 0.75];
const timing = {};
let page = await open();
for (const ds of DS) {
  const row = (timing[ds] = {});
  for (const [name, m] of MODES) {
    // warm the cache, then time each convexity
    await set(page, { dataset: ds, ...BASE, ...m, convexity: 0.4 });
    const ms = [];
    for (const c of CS) {
      ms.push(+(+(await set(page, { ...m, convexity: c }))).toFixed(1));
      await page.locator("#stage").screenshot({
        path: join(
          out,
          `${ds}-${name}-c${String(c * 100).padStart(3, "0")}.png`
        ),
      });
    }
    row[name] = ms;
  }
  for (const c of [0.25, 0.5]) {
    await set(page, {
      dataset: ds,
      ...BASE,
      means: "area",
      seal: "lid",
      convexity: c,
      compareModes: true,
    });
    await page
      .locator("#multiples")
      .screenshot({ path: join(out, `${ds}-compare-lid-c${c * 100}.png`) });
    await set(page, { seal: "jump" });
    await page
      .locator("#multiples")
      .screenshot({ path: join(out, `${ds}-compare-jump-c${c * 100}.png`) });
  }
}
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  means: "radius",
  seal: "lid",
  convexity: 0.3,
  compareModes: true,
});
await page.screenshot({ path: join(out, "00-page.png"), fullPage: true });
const nan = await page.evaluate(() =>
  /NaN|undefined/.test(document.querySelector("main").innerText)
);
console.log("NaN on page?", nan);
console.log(JSON.stringify(timing, null, 1));
writeFileSync(join(out, "timing.json"), JSON.stringify(timing, null, 1));
await page.close();
page = await open({ colorScheme: "dark" });
await set(page, {
  ...BASE,
  means: "blend",
  convexity: 0.3,
  compareModes: true,
});
await page.screenshot({ path: join(out, "01-dark.png"), fullPage: true });
await page.close();
page = await open({ viewport: { width: 390, height: 844 } });
await set(page, {
  ...BASE,
  means: "radius",
  seal: "lid",
  convexity: 0.3,
  compareModes: true,
});
await page.screenshot({ path: join(out, "02-phone.png"), fullPage: true });
await page.close();
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

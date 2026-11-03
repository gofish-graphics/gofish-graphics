// SCRATCH: screenshots of the four join measures: ChartAccent (~6 pieces) and penguins
// (~12 pieces) at convexity 0.25, each measure at the join giving about that many pieces
// (BENCH=joinpick), with and without the links view, plus the page (typical gap, 0..1 range;
// nearby gaps; dark; phone).   node playground/joinmodeshots.mjs <outdir>
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
const out = process.argv[2] ?? join(here, "joinmodeshots");
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
  joinRange: "inf",
};
const CASES = {
  chartaccent: {
    neck: 0.6,
    joins: { px: 24.25, share: 0.88, typical: 2.54, local: 1.903 },
  },
  penguins: {
    neck: 1,
    joins: { px: 16, share: 0.97, typical: 3.592, local: 2.136 },
  },
};
let page = await open();
for (const [ds, { neck, joins }] of Object.entries(CASES))
  for (const [m, j] of Object.entries(joins))
    for (const links of [false, true]) {
      const ms = await set(page, {
        dataset: ds,
        ...BASE,
        neck,
        reachMeasure: m,
        reach: j,
        showLinks: links,
      });
      const pieces = await page.evaluate(
        () =>
          document.querySelector("#stats .stat:nth-child(2) .v")?.textContent
      );
      console.log(
        `${ds} ${m} ${j} links ${links}: ${(+ms).toFixed(0)} ms, pieces/holes ${pieces}`
      );
      await page.locator("#stage-wrap").screenshot({
        path: join(out, `${ds}-c025-${m}${links ? "-links" : ""}.png`),
      });
    }
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  neck: 0.6,
  reachMeasure: "typical",
  joinRange: "unit",
  reach: 2.54,
  showLinks: true,
});
await page.screenshot({
  path: join(out, "page-typical-unit.png"),
  fullPage: true,
});
await set(page, {
  dataset: "penguins",
  ...BASE,
  neck: 1,
  reachMeasure: "local",
  reach: 2.136,
  showLinks: true,
});
await page.screenshot({ path: join(out, "page-local.png"), fullPage: true });
await page.close();
page = await open({ colorScheme: "dark" });
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  neck: 0.6,
  reachMeasure: "share",
  reach: 0.88,
});
await page.screenshot({ path: join(out, "page-dark.png"), fullPage: true });
await page.close();
page = await open({ viewport: { width: 390, height: 844 } });
await set(page, {
  dataset: "penguins",
  ...BASE,
  neck: 1,
  reachMeasure: "typical",
  reach: 3.592,
});
await page.screenshot({ path: join(out, "page-phone.png"), fullPage: true });
await page.close();
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

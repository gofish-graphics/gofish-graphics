// SCRATCH: screenshots of the join range: per dataset, join = 0, small, medium and ∞ at
// convexity 0.25 (per-bay blend), with the links view on, plus the page itself (light, dark,
// phone, arcs shape, compare modes).   node playground/joinshots.mjs <outdir>
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
const out = process.argv[2] ?? join(here, "joinshots");
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
};
// small and medium per dataset, from the join sweep (BENCH=join)
const CASES = {
  chartaccent: { neck: 0.6, joins: [0, 8, 24, Infinity] },
  penguins: { neck: 1, joins: [0, 6, 16, Infinity] },
  bubble: { neck: 1, joins: [0, 4, 12, Infinity] },
  u: { neck: 1, joins: [0, 8, 24, Infinity] },
};
const name = (j) => (j === Infinity ? "inf" : String(j).padStart(3, "0"));
let page = await open();
for (const [ds, { neck, joins }] of Object.entries(CASES))
  for (const j of joins)
    for (const links of [false, true]) {
      const ms = await set(page, {
        dataset: ds,
        ...BASE,
        neck,
        join: j,
        showLinks: links,
      });
      const pieces = await page.evaluate(
        () =>
          document.querySelector("#stats .stat:nth-child(2) .v")?.textContent
      );
      console.log(
        `${ds} join ${j} links ${links}: ${(+ms).toFixed(0)} ms, pieces/holes ${pieces}`
      );
      await page.locator("#stage-wrap").screenshot({
        path: join(
          out,
          `${ds}-c025-join${name(j)}${links ? "-links" : ""}.png`
        ),
      });
    }
// collisions: high convexity, where the pieces' own hulls and ovals would overlap
for (const [ds, neck, j] of [
  ["chartaccent", 0.6, 8],
  ["penguins", 1, 6],
  ["u", 1, 0],
])
  for (const c of [0.5, 1, 2]) {
    const ms = await set(page, {
      dataset: ds,
      ...BASE,
      convexity: c,
      neck,
      join: j,
      showLinks: false,
    });
    console.log(`${ds} join ${j} c ${c}: ${(+ms).toFixed(0)} ms`);
    await page.locator("#stage-wrap").screenshot({
      path: join(
        out,
        `collide-${ds}-join${name(j)}-c${String(c * 100).padStart(3, "0")}.png`
      ),
    });
  }
// the page: blob with a finite join, links on; arcs; compare modes; dashed comparison
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  neck: 0.6,
  join: 24,
  showLinks: true,
});
await page.screenshot({
  path: join(out, "page-blob-join24.png"),
  fullPage: true,
});
await set(page, {
  dataset: "bubble",
  ...BASE,
  shape: "arcs",
  radius: 8,
  smooth: false,
  showLinks: false,
  compare: true,
});
await page.screenshot({
  path: join(out, "page-arcs-bubble.png"),
  fullPage: true,
});
await set(page, {
  dataset: "penguins",
  ...BASE,
  neck: 1,
  join: 16,
  compareModes: true,
  compare: true,
  showLinks: false,
});
await page.screenshot({
  path: join(out, "page-compare-modes.png"),
  fullPage: true,
});
await page.close();
page = await open({ colorScheme: "dark" });
await set(page, {
  dataset: "chartaccent",
  ...BASE,
  neck: 0.6,
  join: 8,
  showLinks: true,
});
await page.screenshot({ path: join(out, "page-dark.png"), fullPage: true });
await page.close();
page = await open({ viewport: { width: 390, height: 844 } });
await set(page, { dataset: "penguins", ...BASE, neck: 1, join: 6 });
await page.screenshot({ path: join(out, "page-phone.png"), fullPage: true });
await page.close();
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

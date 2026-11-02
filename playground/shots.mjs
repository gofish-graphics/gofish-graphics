// SCRATCH: open dist/index.html headlessly, screenshot a set of states, print timings and
// console errors.   node playground/shots.mjs <outdir>
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
const out = process.argv[2] ?? join(here, "shots");
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
  convexity: 0.5,
  neck: 1,
  holes: false,
  connected: true,
  smooth: true,
  radius: 12,
  compare: false,
  showLinks: false,
  showMembers: false,
};
const set = (page, patch) =>
  page.evaluate((p) => window.__playground.set(p), patch);
const nan = (page) =>
  page.evaluate(() =>
    /NaN|undefined/.test(document.querySelector("main").innerText)
  );

let page = await open();
await page.screenshot({ path: join(out, "00-default.png"), fullPage: true });
console.log("default NaN?", await nan(page));

const DS = [
  "chartaccent",
  "u",
  "penguins",
  "munkres",
  "hyperedges",
  "holes",
  "bubble",
];
const VARIANTS = [
  ["c000", { convexity: 0 }],
  ["c050", { convexity: 0.5 }],
  ["c100", { convexity: 1 }],
  ["c150", { convexity: 1.5 }],
  ["c200", { convexity: 2 }],
  ["neck060", { convexity: 0.5, neck: 0.6 }],
  ["arcs", { connected: false, smooth: false, radius: 12 }],
  [
    "debug",
    { convexity: 0.3, showLinks: true, showMembers: true, compare: true },
  ],
];
const timing = {};
for (const ds of DS) {
  const row = (timing[ds] = {});
  for (const [name, patch] of VARIANTS) {
    const ms = await set(page, { dataset: ds, ...BASE, ...patch });
    row[name] = +(+ms).toFixed(1);
    await page
      .locator(".layout")
      .screenshot({ path: join(out, `${ds}-${name}.png`) });
    if (await nan(page)) console.log("NaN in", ds, name);
  }
  // avoiding on (where the dataset has keep-outs)
  const avoidable = await page.evaluate(
    () => !document.getElementById("avoid-field").hidden
  );
  if (avoidable) {
    const avoidOn = {
      ...(await page.evaluate(() => window.__playground.state().avoidOn)),
      [ds]: true,
    };
    for (const [name, patch] of [
      ["avoid-c000", { convexity: 0 }],
      ["avoid-c050", { convexity: 0.5 }],
      ["avoid-c050-nosmooth", { convexity: 0.5, smooth: false }],
      ["avoid-c100", { convexity: 1 }],
    ]) {
      const ms = await set(page, { dataset: ds, ...BASE, ...patch, avoidOn });
      row[name] = +(+ms).toFixed(1);
      await page
        .locator(".layout")
        .screenshot({ path: join(out, `${ds}-${name}.png`) });
    }
  }
}
console.log(JSON.stringify(timing, null, 1));
await page.close();

// dark mode and phone width
page = await open({ colorScheme: "dark" });
await page.screenshot({ path: join(out, "01-dark.png"), fullPage: true });
await page.close();
page = await open({ viewport: { width: 390, height: 844 } });
await page.screenshot({ path: join(out, "02-phone.png"), fullPage: true });
await page.close();
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");

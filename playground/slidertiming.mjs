// SCRATCH: every slider of the playground, timed in the page (headless Chromium). Per dataset:
// open it, wait for the idle warm-up, then step each slider over its range, each step one full
// recompute and redraw (__playground.set, wall time around it). "first" is the first sweep (what
// a first drag sees), "again" the same steps once more (warm). Reports median and max per sweep.
//   node playground/slidertiming.mjs            (DS=<ids>, DIST=<html> for another build)
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
const url = pathToFileURL(
  process.env.DIST ?? join(here, "dist/index.html")
).href;
const IDS = (process.env.DS ?? "penguins,chartaccent,u").split(",");
const browser = await chromium.launch();
const st = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return `${s[s.length >> 1].toFixed(1)} / ${s.at(-1).toFixed(0)}`;
};
console.log(
  "| dataset | slider | open→ready | first sweep median / max ms | again median / max |\n|---|---|---|---|---|"
);
for (const ds of IDS) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.ms
  );
  const t0 = Date.now();
  const openMs = await page.evaluate((ds) => {
    const t = performance.now();
    return Promise.resolve(window.__playground.set({ dataset: ds })).then(
      () => performance.now() - t
    );
  }, ds);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.warm === "1",
    null,
    { timeout: 300000 }
  );
  const warmS = (Date.now() - t0) / 1000;
  const pad0 = await page.evaluate(() => window.__playground.state().padding);
  const joins = [
    Infinity,
    ...Array.from(
      { length: 99 },
      (_, k) => +(0.05 * 2 ** ((98 - k) / 12)).toFixed(3)
    ),
    0,
  ];
  const seqs = [
    [
      "convexity",
      Array.from({ length: 51 }, (_, k) => ({ convexity: (2 * k) / 50 })),
      { convexity: 0.5 },
    ],
    [
      "join",
      joins.map((join) => ({ join, reach: join })),
      { join: Infinity, reach: Infinity },
    ],
    [
      "neck",
      Array.from({ length: 48 }, (_, k) => ({
        neck: +(1 - 0.02 * k).toFixed(2),
      })),
      { neck: 1 },
    ],
    [
      "padding",
      Array.from({ length: 13 }, (_, k) => ({ padding: pad0 + 0.5 * k })),
      { padding: pad0 },
    ],
    [
      "holes",
      [{ holes: true }, { holes: false }, { holes: true }, { holes: false }],
      {},
    ],
    [
      "avoid",
      [true, false, true, false].map((on) => ({ avoidOn: { [ds]: on } })),
      {},
    ],
    [
      "clearance (avoid on)",
      Array.from({ length: 13 }, (_, k) => ({
        avoidOn: { [ds]: true },
        clearance: 4 + 0.5 * k,
      })),
      { avoidOn: { [ds]: false }, clearance: 4 },
    ],
  ];
  console.log(
    `| ${ds} | open | ${openMs.toFixed(0)} ms, warm-up done ${warmS.toFixed(1)} s | | |`
  );
  for (const [name, seq, reset] of seqs) {
    const run = () =>
      page.evaluate(
        async ([seq, DRAG]) => {
          const P = window.__playground;
          const ms = [];
          for (const p of seq) {
            const t = performance.now();
            await P.set({ ...p, drag: DRAG });
            ms.push(performance.now() - t);
          }
          return ms;
        },
        [seq, !!process.env.DRAG]
      );
    const first = await run();
    const again = await run();
    console.log(`| ${ds} | ${name} | | ${st(first)} | ${st(again)} |`);
    await page.evaluate((r) => window.__playground.set(r), reset);
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.warm === "1",
      null,
      { timeout: 300000 }
    );
  }
  if (errs.length)
    console.log(`errors on ${ds}: ${errs.slice(0, 5).join("; ")}`);
  await page.close();
}
await browser.close();

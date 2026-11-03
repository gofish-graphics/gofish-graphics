// SCRATCH: join and convexity drags in the page (headless Chromium): per dataset, the page's
// opening settings, the join slider stepped over all 101 positions (∞ → 0) and convexity over
// 0..1 in 0.02 steps, each step one full recompute (__playground.set). "cold": right after the
// dataset opens, in one task (the idle warm-up cannot run in between); "warm": after the
// idle warm-up has filled the cache for every join position.   node playground/join4timing.mjs
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
const url = pathToFileURL(join(here, "dist/index.html")).href;
const browser = await chromium.launch();
const stats = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return `mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} · p90 ${s[Math.floor(0.9 * s.length)].toFixed(1)} · max ${s.at(-1).toFixed(0)}`;
};
const sweep = (page, kind) =>
  page.evaluate(async (kind) => {
    const P = window.__playground;
    const out = [];
    const js = [
      Infinity,
      ...Array.from(
        { length: 99 },
        (_, k) => +(0.05 * 2 ** ((98 - k) / 12)).toFixed(3)
      ),
      0,
    ];
    if (kind === "join")
      for (const j of js) out.push(await P.set({ reach: j }));
    else
      for (let k = 0; k <= 50; k++)
        out.push(await P.set({ convexity: k / 50 }));
    return out;
  }, kind);
console.log(
  "| dataset | drag | cold (first sweep, ms/step) | warm (after idle warm-up) |\n|---|---|---|---|"
);
for (const ds of ["chartaccent", "u", "penguins", "hyperedges", "holes"]) {
  for (const kind of ["join", "convexity"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url + "?ds=" + ds);
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.ms
    );
    const t0 = Date.now();
    // open the dataset and sweep at once (no idle time in between)
    const cold = await page.evaluate(
      async ([ds, kind]) => {
        const P = window.__playground;
        await P.set({ dataset: ds, convexity: 0.5, reach: Infinity });
        const out = [];
        const js = [
          Infinity,
          ...Array.from(
            { length: 99 },
            (_, k) => +(0.05 * 2 ** ((98 - k) / 12)).toFixed(3)
          ),
          0,
        ];
        if (kind === "join")
          for (const j of js) out.push(await P.set({ reach: j }));
        else
          for (let k = 0; k <= 50; k++)
            out.push(await P.set({ convexity: k / 50, reach: Infinity }));
        return out;
      },
      [ds, kind]
    );
    // back to the opening state, let the idle warm-up finish, sweep again
    await page.evaluate(() =>
      window.__playground.set({ convexity: 0.5, reach: Infinity })
    );
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.warm === "1",
      null,
      { timeout: 120000 }
    );
    const warmMs = Date.now() - t0;
    const warm = await sweep(page, kind);
    console.log(
      `| ${ds} | ${kind} | ${stats(cold.slice(1))} | ${stats(warm)} (warm-up done ${(warmMs / 1000).toFixed(1)} s after open) |`
    );
    await page.close();
  }
}
await browser.close();

// Drive real pointer drags on the standalone bundle (test.html) with
// Playwright, offline, and save filmstrip frames + measured numbers.
// Run from the repo root: `node proposals/dragology/demo/drive.mjs [demo] [--idle]`.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(here, "../../../tests/package.json")
);
const { chromium } = require("playwright");
const img = path.resolve(here, "../img");
const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith("--"));
const idle = args.includes("--idle");

// Each drag: grab point and path in panel px; `frames` are the path indices
// shot mid-drag. Points chosen from the idle renders.
const DRAGS = JSON.parse(
  fs.readFileSync(path.join(here, "drags.json"), "utf8")
);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1100, height: 900 },
});
// Offline: only file:// requests are allowed.
await ctx.route("**/*", (r) =>
  r.request().url().startsWith("file:") ? r.continue() : r.abort()
);
const results = {};
for (const [name, spec] of Object.entries(DRAGS)) {
  if (only && name !== only) continue;
  for (const variant of spec.variants ?? [{}]) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const q = new URLSearchParams({
      demo: name,
      ...(variant.debug ? { debug: "1" } : {}),
      precompute: variant.precompute ?? "lazy",
    });
    await page.goto(pathToFileURL(path.join(here, "test.html")).href + "?" + q);
    await page.evaluate((n) => window.handles[n].ready, name);
    const panel = page.locator(`#demo-${name} > div`);
    const pbox = await panel.boundingBox();
    const box = await page.locator(`#demo-${name} svg`).first().boundingBox();
    const slug = name + (variant.suffix ?? "");
    // Crop every frame of a filmstrip to the idle chart's ink (plus a margin),
    // inside the panel, so all four frames share one size.
    const ink = await page.evaluate((n) => {
      const b = window.handles[n].svg.getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, name);
    const M = 10;
    const cx0 = Math.max(pbox.x, box.x + ink.x - M),
      cy0 = Math.max(pbox.y, box.y + ink.y - M);
    const cx1 = Math.min(pbox.x + pbox.width, box.x + ink.x + ink.w + M),
      cy1 = Math.min(pbox.y + pbox.height, box.y + ink.y + ink.h + M);
    const clip = { x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0 };
    const shot = (n) =>
      page.screenshot({ path: path.join(img, `${slug}-${n}.png`), clip });
    if (idle) {
      await shot("idle");
      await page.close();
      continue;
    }
    const initial = await page.evaluate((n) => window.handles[n].rows(), name);
    if (!variant.noShots) await shot(1);
    const at = ([x, y]) => [box.x + x, box.y + y];
    await page.mouse.move(...at(spec.grab));
    await page.mouse.down();
    // Wait for the candidates to be laid out (lazy mode).
    await page.waitForFunction(
      (n) => window.handles[n].stats.pointerDownMs.length > 0,
      name
    );
    let k = 2;
    for (let i = 0; i < spec.path.length; i++) {
      await page.mouse.move(...at(spec.path[i]), { steps: 8 });
      await page.waitForTimeout(50);
      if (spec.frames.includes(i) && !variant.noShots) await shot(k++);
    }
    await page.mouse.up();
    await page.evaluate((n) => window.handles[n].settled(), name);
    await page.waitForTimeout(300);
    if (!variant.noShots) await shot(k);
    const stats = await page.evaluate((n) => {
      const h = window.handles[n];
      return { ...h.stats, rows: h.rows() };
    }, name);
    const avg = (xs) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    results[slug] = {
      errors,
      layouts: stats.layouts,
      msPerLayout: +avg(stats.layoutMs).toFixed(1),
      candidatesPerDrag: stats.candidatesPerDrag,
      pointerDownMs: stats.pointerDownMs.map((x) => +x.toFixed(0)),
      eagerMs: stats.eagerMs.map((x) => +x.toFixed(0)),
      blendErrPx: stats.blendErrPx,
      layoutMsAll: stats.layoutMs.map((x) => +x.toFixed(1)),
      frames: stats.frameMs.length,
      frameMsAvg: +avg(stats.frameMs).toFixed(2),
      frameMsMax: +Math.max(...stats.frameMs).toFixed(2),
      changedRows: stats.rows.filter(
        (r) => !initial.some((s) => JSON.stringify(s) === JSON.stringify(r))
      ),
    };
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(
  path.join(here, only ? `results-${only}.json` : "results.json"),
  JSON.stringify(results, null, 1)
);
console.log(JSON.stringify(results, null, 1));

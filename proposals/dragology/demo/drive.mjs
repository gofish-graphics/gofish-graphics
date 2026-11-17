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

// Each demo: one drag (`grab`, `path`, `frames` = path indices shot
// mid-drag), or a sequence of `steps`, each a drag whose `grab` is a point
// or `{ "chip": text }`, with `shots` (path index -> frame number) and
// `after` (frame shot once the drop settles). Points are in canvas px,
// chosen from the idle renders.
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
    const svgL = page.locator(`#demo-${name} svg`).first();
    const box = await svgL.boundingBox();
    const pbox = await svgL.evaluate((s) => {
      const r = s.parentElement.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const slug = name + (variant.suffix ?? "");
    let clip;
    if (spec.crop === "demo") {
      // The palette, the chart panel and the spec panel.
      const d = await page.locator(`#demo-${name}`).boundingBox();
      clip = {
        x: d.x - 4,
        y: d.y - 4,
        width: d.width + 8,
        height: d.height + 8,
      };
    } else {
      // Crop every frame of a filmstrip to the idle chart's ink (plus a
      // margin), inside the panel, so all four frames share one size.
      const ink = await page.evaluate((n) => {
        const b = window.handles[n].svg.getBBox();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      }, name);
      const M = 10;
      const cx0 = Math.max(pbox.x, box.x + ink.x - M),
        cy0 = Math.max(pbox.y, box.y + ink.y - M);
      const cx1 = Math.min(pbox.x + pbox.width, box.x + ink.x + ink.w + M),
        cy1 = Math.min(pbox.y + pbox.height, box.y + ink.y + ink.h + M);
      clip = { x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0 };
    }
    const shot = (n) =>
      !variant.noShots &&
      page.screenshot({ path: path.join(img, `${slug}-${n}.png`), clip });
    if (idle) {
      await shot("idle");
      await page.close();
      continue;
    }
    const before = await page.evaluate((n) => window.handles[n].state(), name);
    await shot(1);
    const at = ([x, y]) => [box.x + x, box.y + y];
    const steps = spec.steps ?? [
      {
        grab: spec.grab,
        path: spec.path,
        shots: Object.fromEntries(spec.frames.map((f, i) => [f, i + 2])),
        after: spec.frames.length + 2,
      },
    ];
    const states = [];
    for (const step of steps) {
      const n0 = await page.evaluate(
        (n) => window.handles[n].stats.pointerDownMs.length,
        name
      );
      const g = step.grab.chip
        ? await page.evaluate(
            ([n, c]) => {
              const r = window.handles[n].chips[c].getBoundingClientRect();
              return [r.x + r.width / 2, r.y + r.height / 2];
            },
            [name, step.grab.chip]
          )
        : at(step.grab);
      await page.mouse.move(...g);
      await page.mouse.down();
      // Wait for the candidates to be laid out (lazy mode).
      await page.waitForFunction(
        ([n, k]) => window.handles[n].stats.pointerDownMs.length > k,
        [name, n0]
      );
      for (let i = 0; i < step.path.length; i++) {
        await page.mouse.move(...at(step.path[i]), { steps: 8 });
        await page.waitForTimeout(step.wait ?? 50);
        if (step.shots?.[i] !== undefined) await shot(step.shots[i]);
      }
      await page.mouse.up();
      await page.evaluate((n) => window.handles[n].settled(), name);
      await page.waitForTimeout(300);
      if (step.after !== undefined) await shot(step.after);
      states.push(await page.evaluate((n) => window.handles[n].state(), name));
    }
    const stats = await page.evaluate((n) => window.handles[n].stats, name);
    const after = states.at(-1);
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
      ...(before.rows
        ? {
            orderBefore: before.order,
            orderAfter: after.order,
            changedRows: after.rows.filter(
              (r) =>
                !before.rows.some(
                  (s) => JSON.stringify(s) === JSON.stringify(r)
                )
            ),
          }
        : { statesAfterEachStep: states }),
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

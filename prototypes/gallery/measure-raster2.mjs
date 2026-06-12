// Throwaway raster/compositor trace for the gallery glide-tearing diagnosis.
//
// The velocity gate already fixed MAIN-THREAD churn (measure-glide.mjs). Tearing
// during a fast glide is a COMPOSITOR/RASTER-thread problem that rAF deltas can't
// see: when the giant scroll layer's newly-exposed tiles can't be rasterized at
// glide speed the compositor presents CHECKERBOARDED frames (un-rastered tiles) —
// exactly the banding the user reports. So we capture a Chrome devtools trace and
// count checkerboarded / missing-content / dropped compositor frames DURING the
// sweep (the tearing window), plus raster cost, at retina DPR=2.
//
// NOTE: headless Chromium on Mac uses the SOFTWARE renderer (SwiftShader), so
// absolute raster ms differ from a real M-series GPU — but checkerboard/missing-
// content frame COUNTS and the textured-vs-flat A/B are valid relative signals.
//
// Run: node measure-raster.mjs <file> [dpr]
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);

const file = process.argv[2] || "index.html";
const dpr = parseFloat(process.argv[3] || "2"); // retina by default
const url = "file://" + join(here, file) + "?n=150";

const browser = await chromium.launch({
  args: [
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
  ],
});
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: dpr,
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
await page
  .waitForFunction(() => window.__galleryReady, null, { timeout: 15000 })
  .catch(() => {});
await page.evaluate(() => {
  document.getElementById("hall").scrollLeft = 0;
});
await page.waitForTimeout(500);

const client = await page.context().newCDPSession(page);
const events = [];
client.on("Tracing.dataCollected", (d) => {
  for (const e of d.value) events.push(e);
});
await client.send("Tracing.start", {
  transferMode: "ReportEvents",
  traceConfig: {
    includedCategories: [
      "blink.user_timing", // performance.mark window markers
      "disabled-by-default-devtools.timeline", // RasterTask
      "cc",
      "benchmark",
      "viz", // PipelineReporter (checkerboard / dropped)
    ],
  },
});

// glide to the far wall, bracketing the transit window with performance.marks
// (which land as blink.user_timing trace events on the same clock as RasterTask /
// PipelineReporter). GLIDE_END fires when scrollLeft holds still for 6 frames.
// Bracket the ACTUAL sweep: mark GLIDE_START at the first frame the viewport has
// really moved (>50px from origin — an ease-in glide creeps sub-pixel at first,
// which a naive 2px-stillness test mistakes for "stopped"), and GLIDE_END only
// after it has traveled a good distance (>4000px) and then held still 6 frames.
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const hall = document.getElementById("hall");
      hall.focus();
      const origin = hall.scrollLeft;
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      );
      let last = hall.scrollLeft,
        still = 0,
        started = false,
        peak = 0;
      function poll() {
        const sl = hall.scrollLeft;
        const moved = Math.abs(sl - origin);
        peak = Math.max(peak, moved);
        if (!started && moved > 50) {
          started = true;
          performance.mark("GLIDE_START");
        }
        if (started) {
          if (Math.abs(sl - last) < 2) still++;
          else still = 0;
          if (still >= 6 && peak > 4000) {
            performance.mark("GLIDE_END");
            resolve();
            return;
          }
        }
        last = sl;
        requestAnimationFrame(poll);
      }
      requestAnimationFrame(poll);
    })
);
await page.waitForTimeout(2500); // let the settle injection finish

const done = new Promise((r) => client.once("Tracing.tracingComplete", r));
await client.send("Tracing.end");
await done;

// ---- window markers ----
const mark = (label) => {
  const e = events.find(
    (e) => e.name === label && e.cat === "blink.user_timing"
  );
  return e ? e.ts : null;
};
const tStart = mark("GLIDE_START"),
  tEnd = mark("GLIDE_END");
const inWin = (ts) =>
  tStart != null && tEnd != null && ts >= tStart && ts <= tEnd;
const us = (x) => +(x / 1000).toFixed(1);

// ---- raster ----
const raster = events.filter((e) => e.name === "RasterTask" && e.ph === "X");
const rAll = raster.map((e) => e.dur || 0).sort((a, b) => b - a);
const rWin = raster
  .filter((e) => inWin(e.ts))
  .map((e) => e.dur || 0)
  .sort((a, b) => b - a);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---- compositor frames: the 'b' phase carries args.frame_reporter ----
const fr = events
  .filter(
    (e) => e.name === "PipelineReporter" && e.args && e.args.frame_reporter
  )
  .map((e) => ({ ts: e.ts, r: e.args.frame_reporter }));
function tally(list) {
  const t = {
    frames: list.length,
    presentedAll: 0,
    dropped: 0,
    partial: 0,
    checkerboard: 0,
    missingContent: 0,
    highLatency: 0,
    affectsSmoothness: 0,
  };
  for (const { r } of list) {
    if (r.state === "STATE_PRESENTED_ALL") t.presentedAll++;
    else if (r.state === "STATE_DROPPED") t.dropped++;
    else if (r.state === "STATE_PRESENTED_PARTIAL") t.partial++;
    if (r.checkerboarded_needs_raster || r.checkerboarded_needs_record)
      t.checkerboard++;
    if (r.has_missing_content) t.missingContent++;
    if (r.has_high_latency) t.highLatency++;
    if (r.affects_smoothness) t.affectsSmoothness++;
  }
  t.badFrames = t.dropped + t.checkerboard + t.missingContent;
  return t;
}

const out = {
  file,
  dpr,
  transitWindowMs: tStart != null && tEnd != null ? us(tEnd - tStart) : null,
  raster: {
    all: {
      tasks: rAll.length,
      totalMs: us(sum(rAll)),
      worstMs: us(rAll[0] || 0),
    },
    transit: {
      tasks: rWin.length,
      totalMs: us(sum(rWin)),
      worstMs: us(rWin[0] || 0),
      over4ms: rWin.filter((d) => d > 4000).length,
    },
  },
  framesAll: tally(fr),
  framesTransit: tally(fr.filter((f) => inWin(f.ts))), // <-- the tearing window
  errors: errors.slice(0, 5),
};
console.log(JSON.stringify(out, null, 2));
await browser.close();

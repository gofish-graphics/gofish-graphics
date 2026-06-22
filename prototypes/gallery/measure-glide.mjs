// Throwaway perf measurement for the transit velocity gate.
// Records per-frame times (rAF deltas) during an End glide from scrollLeft=0
// at ?n=150, for a given index file. Run: node measure-glide.mjs <file>
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);

const file = process.argv[2] || "index.html";
const url = "file://" + join(here, file) + "?n=150";

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
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
await page.waitForTimeout(400);

// Start a rAF frame-time recorder, then press End to glide to the far wall.
await page.evaluate(() => {
  window.__frames = [];
  const hall = document.getElementById("hall");
  let last = performance.now();
  let lastSL = hall.scrollLeft;
  window.__recording = true;
  function rec(t) {
    if (!window.__recording) return;
    const sl = hall.scrollLeft;
    // classify: a frame is "in transit" if the viewport moved appreciably during it
    window.__frames.push({ dt: t - last, moving: Math.abs(sl - lastSL) > 4 });
    last = t;
    lastSL = sl;
    requestAnimationFrame(rec);
  }
  requestAnimationFrame((t) => {
    last = t;
    lastSL = hall.scrollLeft;
    requestAnimationFrame(rec);
  });
});

await page.evaluate(() => {
  const hall = document.getElementById("hall");
  hall.focus();
  // dispatch End on window (handler is on window)
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "End", bubbles: true })
  );
});

// let the glide run + settle
await page.waitForTimeout(3500);

const res = await page.evaluate(() => {
  window.__recording = false;
  const f = window.__frames.slice(1); // drop first (recorder warmup)
  const stat = (arr) => {
    const d = arr.map((x) => x.dt);
    return {
      frames: d.length,
      worst: d.length ? +Math.max(...d).toFixed(1) : 0,
      over32: d.filter((x) => x > 32).length,
      over16: d.filter((x) => x > 16.7).length,
    };
  };
  const hall = document.getElementById("hall");
  const injected = document.querySelectorAll(".frame .art:not(.empty)").length;
  return {
    all: stat(f),
    inTransit: stat(f.filter((x) => x.moving)), // long frames here = tearing
    settled: stat(f.filter((x) => !x.moving)), // long frames here = just fill-in delay
    scrollLeft: Math.round(hall.scrollLeft),
    maxScroll: Math.round(hall.scrollWidth - hall.clientWidth),
    injectedAtRest: injected,
  };
});

console.log(
  JSON.stringify({ file, ...res, errors: errors.slice(0, 5) }, null, 2)
);
await browser.close();

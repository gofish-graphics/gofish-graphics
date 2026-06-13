// Throwaway: measure rAF frame times around transit ENTRY and during the first
// 500ms of an End-glide at ?n=150. Reports worst frame + frames>32ms in that
// window, and grabs a mid-glide screenshot. Run: node measure-entry.mjs <file>
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);

const file = process.argv[2] || "index.html";
const tag = process.argv[3] || "after";
const url = "file://" + join(here, file) + "?n=150";
const out = join(here, "shots");

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

await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  window.__recording = true;
  window.__t0 = null;
  function rec(t) {
    if (!window.__recording) return;
    if (window.__t0 != null)
      window.__frames.push({ rel: t - window.__t0, dt: t - last });
    last = t;
    requestAnimationFrame(rec);
  }
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(rec);
  });
});

// fire End and mark t0 at the same instant
await page.evaluate(() => {
  const hall = document.getElementById("hall");
  hall.focus();
  window.__t0 = performance.now();
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "End", bubbles: true })
  );
});

// grab a mid-glide screenshot ~350ms in (still sweeping)
await page.waitForTimeout(350);
await page.screenshot({ path: join(out, "transit-midglide-" + tag + ".png") });

await page.waitForTimeout(3200);

const res = await page.evaluate(() => {
  window.__recording = false;
  const f = window.__frames;
  // entry window: first 500ms after End
  const win = f.filter((x) => x.rel >= 0 && x.rel <= 500);
  const d = win.map((x) => x.dt);
  const stat = (arr) => ({
    frames: arr.length,
    worst: arr.length ? +Math.max(...arr).toFixed(1) : 0,
    over32: arr.filter((x) => x > 32).length,
    over16: arr.filter((x) => x > 16.7).length,
  });
  const hall = document.getElementById("hall");
  return {
    first500ms: stat(d),
    framesInWindow: win
      .map((x) => ({ rel: Math.round(x.rel), dt: +x.dt.toFixed(1) }))
      .filter((x) => x.dt > 24),
    scrollLeft: Math.round(hall.scrollLeft),
    maxScroll: Math.round(hall.scrollWidth - hall.clientWidth),
    injectedAtRest: document.querySelectorAll(".frame .art:not(.empty)").length,
  };
});

console.log(
  JSON.stringify({ file, tag, ...res, errors: errors.slice(0, 5) }, null, 2)
);
await browser.close();

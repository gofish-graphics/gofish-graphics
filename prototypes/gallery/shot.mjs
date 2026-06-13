// Throwaway capture/metrics script for the gallery prototype self-review loop.
// Run: node prototypes/gallery/shot.mjs   (from repo root)
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
// Playwright lives in the tests/ package; import it by absolute path so this
// script runs from anywhere via plain `node`.
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);
const url = "file://" + join(here, "index.html");
const out = join(here, "shots");
import { mkdirSync } from "fs";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { width, height, query = "", actions } = {}) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(url + query, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 10000 })
    .catch(() => {});
  const ready = await page.evaluate(() => window.__galleryReady || 0);
  if (actions) await actions(page);
  await page.waitForTimeout(700);
  const packMs = await page.evaluate(() =>
    window.__galleryPackMs ? window.__galleryPackMs() : -1
  );
  const stacks = await page.evaluate(() =>
    window.__galleryStacks ? window.__galleryStacks() : null
  );
  await page.screenshot({ path: join(out, name + ".png") });
  console.log(
    `${name.padEnd(26)} load→ready=${ready.toFixed(0)}ms wall=${Date.now() - t0}ms pack=${packMs.toFixed(2)}ms errors=${errors.length}`
  );
  if (stacks)
    console.log(
      `   stacks: S=${stacks.scale} band=${stacks.band} cols=${stacks.columns} hist=${JSON.stringify(stacks.hist)}`
    );
  if (errors.length) console.log("   ERR:", errors.slice(0, 4).join(" | "));
  await page.close();
}

const scrollHalf = async (page) => {
  await page.evaluate(() => {
    const h = document.getElementById("hall");
    h.scrollLeft = h.scrollWidth * 0.45;
  });
};
const typeSearch = async (page) => {
  await page.fill("#search", "area");
};
const typeEmpty = async (page) => {
  await page.fill("#search", "zzzzz");
};

// Close-up clip of 2-3 frames+plaques so plaque legibility can be verified.
async function plaqueCloseup() {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  // find the bounding box that spans the first few on-screen pieces + plaques
  const clip = await page.evaluate(() => {
    const ps = [...document.querySelectorAll(".piece")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.right > 0 && r.left < window.innerWidth && r.width > 0)
      .sort((a, b) => a.left - b.left)
      .slice(0, 3);
    if (!ps.length) return null;
    const x0 = Math.max(0, Math.min(...ps.map((r) => r.left)) - 20);
    const y0 = Math.max(0, Math.min(...ps.map((r) => r.top)) - 20);
    const x1 = Math.min(
      window.innerWidth,
      Math.max(...ps.map((r) => r.right)) + 20
    );
    const y1 = Math.min(
      window.innerHeight,
      Math.max(...ps.map((r) => r.bottom)) + 30
    );
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
  if (clip)
    await page.screenshot({ path: join(out, "plaque-closeup.png"), clip });
  console.log(
    "plaque-closeup".padEnd(26),
    clip
      ? `clip ${Math.round(clip.width)}x${Math.round(clip.height)}`
      : "no pieces found"
  );
  await page.close();
}

// 2x close-up of a few figures (bench sitter + neighbors) so figure
// quality — joints, feet, proportions — can be judged.
async function figuresZoom() {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  const clip = await page.evaluate(() => {
    // figures now stand along the scrolling wall — only judge the ones currently
    // on screen; take a small leftmost cluster for the zoom.
    const figs = [...document.querySelectorAll(".figure")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.right > 0 && r.left < window.innerWidth)
      .sort((a, b) => a.left - b.left)
      .slice(0, 4);
    if (!figs.length) return null;
    const x0 = Math.max(0, Math.min(...figs.map((r) => r.left)) - 30);
    const x1 = Math.min(
      window.innerWidth,
      Math.max(...figs.map((r) => r.right)) + 30
    );
    const y0 = Math.max(0, Math.min(...figs.map((r) => r.top)) - 30);
    const y1 = Math.min(
      window.innerHeight,
      Math.max(...figs.map((r) => r.bottom)) + 20
    );
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
  if (clip)
    await page.screenshot({ path: join(out, "figures-zoom.png"), clip });
  console.log(
    "figures-zoom".padEnd(26),
    clip
      ? `clip ${Math.round(clip.width)}x${Math.round(clip.height)}`
      : "no figures found"
  );
  await page.close();
}

// Repulsion has two rules; capture both.
//  - "repulsion.png": pointer is READING a chart (over a frame) that has a
//    figure standing in front of it; the figure steps fully clear of the
//    frame edge so the chart is unobstructed (rule 2).
//  - "repulsion-proximity.png": pointer at a figure's lower-body height (clear
//    of any plaque); the figure steps aside via 2D proximity (rule 1).
async function repulsion() {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const geom = () =>
    page.evaluate(() => {
      const figs = [...document.querySelectorAll(".figure")].map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          i,
          cx: (r.left + r.right) / 2,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          w: r.width,
        };
      });
      const frames = [...document.querySelectorAll(".frame")].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          cx: (r.left + r.right) / 2,
          cy: (r.top + r.bottom) / 2,
          w: r.width,
        };
      });
      return { figs, frames };
    });
  const figNow = (i) =>
    page.evaluate((i) => {
      const r = document.querySelectorAll(".figure")[i].getBoundingClientRect();
      return { left: r.left, right: r.right, cx: (r.left + r.right) / 2 };
    }, i);

  const { figs, frames } = await geom();

  // rule 2: a chart with a figure in front of it.
  let pair = null;
  for (const fr of frames) {
    if (fr.w <= 0 || fr.right < 0 || fr.left > 1600) continue;
    const cand = figs.find(
      (f) => f.w > 0 && f.right > fr.left + 6 && f.left < fr.right - 6
    );
    if (cand) {
      pair = { fr, fig: cand };
      break;
    }
  }
  if (pair) {
    await page.mouse.move(pair.fr.cx - 4, pair.fr.cy);
    await page.mouse.move(pair.fr.cx, pair.fr.cy);
    await page.waitForTimeout(900);
    const after = await figNow(pair.fig.i);
    const clears =
      after.right <= pair.fr.left + 2 || after.left >= pair.fr.right - 2;
    await page.screenshot({ path: join(out, "repulsion.png") });
    console.log(
      "repulsion(chart)".padEnd(26),
      `frame@${Math.round(pair.fr.cx)} figure ${clears ? "clears frame edge" : "STILL OVERLAPS"}`
    );
  } else {
    console.log(
      "repulsion(chart)".padEnd(26),
      "no overlapping figure/frame pair"
    );
  }

  // rule 1: lower-body proximity (move pointer well away first to reset).
  await page.mouse.move(40, 40);
  await page.waitForTimeout(500);
  const mid = figs.filter((f) => f.w > 0 && f.cx > 200 && f.cx < 1400);
  if (mid.length) {
    const f = mid[Math.floor(mid.length / 2)];
    await page.mouse.move(f.cx - 4, f.bottom - 35);
    await page.mouse.move(f.cx, f.bottom - 35);
    await page.waitForTimeout(650);
    const after = await figNow(f.i);
    const moved = Math.abs(after.cx - f.cx);
    await page.screenshot({ path: join(out, "repulsion-proximity.png") });
    console.log(
      "repulsion(proximity)".padEnd(26),
      `pointer@${Math.round(f.cx)} figureMoved=${Math.round(moved)}px`
    );
  }
  await page.close();
}

// Filtered-end: a narrow search, then scroll the hall fully right, proving the
// wall now ends right after the last filtered piece (no empty void beyond it).
async function filteredEnd() {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 10000 })
    .catch(() => {});
  await page.fill("#search", "stack");
  await page.waitForTimeout(600);
  const dims = await page.evaluate(() => {
    const h = document.getElementById("hall");
    h.scrollLeft = h.scrollWidth; // jam to the far right
    return {
      scrollWidth: h.scrollWidth,
      clientWidth: h.clientWidth,
      count: window.__galleryFigures ? window.__galleryFigures() : -1,
    };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, "filtered-end.png") });
  console.log(
    "filtered-end".padEnd(26),
    `scrollW=${dims.scrollWidth} clientW=${dims.clientWidth} figures=${dims.count}`
  );
  await page.close();
}

await shot("desktop-default", { width: 1600, height: 900 });
await plaqueCloseup();
await figuresZoom();
await shot("desktop-scrolled", {
  width: 1600,
  height: 900,
  actions: scrollHalf,
});
await shot("desktop-search", { width: 1600, height: 900, actions: typeSearch });
await shot("desktop-empty", { width: 1600, height: 900, actions: typeEmpty });
await shot("tablet", { width: 768, height: 1024 });
await shot("phone", { width: 390, height: 844 });
await repulsion();
await filteredEnd();

// scale test: ?n=150 — measure pack time + jank-free scroll
{
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  const t0 = Date.now();
  await page.goto(url + "?n=150", { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__galleryReady, null, { timeout: 15000 })
    .catch(() => {});
  const firstPaint = Date.now() - t0;
  const packMs = await page.evaluate(() => window.__galleryPackMs());
  const stacks = await page.evaluate(() => window.__galleryStacks());
  if (stacks)
    console.log(
      `n150  stacks: S=${stacks.scale} band=${stacks.band} cols=${stacks.columns} hist=${JSON.stringify(stacks.hist)}`
    );
  // scroll across the whole wall measuring frame timing
  const jank = await page.evaluate(async () => {
    const h = document.getElementById("hall");
    const target = h.scrollWidth;
    let last = performance.now(),
      worst = 0,
      frames = 0;
    return await new Promise((res) => {
      function step() {
        const now = performance.now();
        const dt = now - last;
        last = now;
        if (frames > 2) worst = Math.max(worst, dt);
        frames++;
        h.scrollLeft = Math.min(h.scrollLeft + target / 120, target);
        if (h.scrollLeft >= target - 1 || frames > 200)
          res({ worst: +worst.toFixed(1), frames });
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, "n150.png") });
  console.log(
    `n150  firstPaint=${firstPaint}ms pack=${packMs.toFixed(2)}ms worstFrame=${jank.worst}ms over ${jank.frames} frames`
  );
  // domNodes sanity
  const nodes = await page.evaluate(
    () => document.querySelectorAll(".frame .art svg").length
  );
  console.log(`n150  injected chart SVGs currently in DOM: ${nodes}`);
  await page.close();
}

await browser.close();
console.log("done →", out);

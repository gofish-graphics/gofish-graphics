// Throwaway: verify fix #1 (pointing-arm clipping under max lean) and that the
// viewBox-padding change does NOT shift/resize the rendered body.
// Run: node prototypes/gallery/verify-clip.mjs
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);
const url = "file://" + join(here, "index.html");
const out = join(here, "shots");

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1200, height: 700 },
  deviceScaleFactor: 2,
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.__figureSVG, null, { timeout: 10000 });

// (1) CLIP TEST: inject a real .figure (so it inherits the live .figure CSS —
// content-visibility:auto + its paint containment) into #figures, force the
// pointing pose at MAX lean both directions, and measure the painted arm extent
// vs the .figure box. The arm tip path command in the pointing pose is the
// segment ending near x=115 (viewBox units); we read the rendered <path> bbox.
const clip = await page.evaluate(() => {
  const cont = document.getElementById("figures");
  const results = [];
  for (const lean of [5, -5, 0]) {
    cont.innerHTML = "";
    const el = document.createElement("div");
    el.className = "figure";
    el.style.left = "600px";
    el.style.bottom = "60px";
    el.style.transform = "translateX(-50%)";
    el.innerHTML =
      '<div class="lean" style="transform:rotate(' +
      lean +
      'deg)"><div class="body">' +
      window.__figureSVG("pointing", 150) +
      "</div></div>";
    cont.appendChild(el);
    // force layout / paint
    el.getBoundingClientRect();
    const figR = el.getBoundingClientRect();
    const svg = el.querySelector("svg");
    const svgR = svg.getBoundingClientRect();
    // rendered bbox of ALL painted geometry (union of every path/circle):
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const g of svg.querySelectorAll("path,circle")) {
      const r = g.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      maxX = Math.max(maxX, r.right);
      minY = Math.min(minY, r.top);
      maxY = Math.max(maxY, r.bottom);
    }
    results.push({
      lean,
      fig: { left: figR.left, right: figR.right },
      svg: { left: svgR.left, right: svgR.right },
      ink: { left: minX, right: maxX, top: minY, bottom: maxY },
      // ink must stay within the .figure box (paint-containment clip boundary)
      clippedRight: maxX > figR.right + 0.5,
      clippedLeft: minX < figR.left - 0.5,
    });
  }
  return results;
});
console.log("=== CLIP TEST (pointing pose, real .figure CSS) ===");
for (const r of clip) {
  console.log(
    `lean=${String(r.lean).padStart(3)}deg  figBox=[${r.fig.left.toFixed(1)},${r.fig.right.toFixed(1)}]  ink=[${r.ink.left.toFixed(1)},${r.ink.right.toFixed(1)}]  ` +
      `clipRight=${r.clippedRight} clipLeft=${r.clippedLeft}  ${!r.clippedRight && !r.clippedLeft ? "OK (arm inside box)" : "FAIL (clipped)"}`
  );
}

// screenshot the max-push case as shots/pointing-pushed.png (3x lean + offset)
await page.evaluate(() => {
  const cont = document.getElementById("figures");
  cont.innerHTML = "";
  const el = document.createElement("div");
  el.className = "figure";
  el.style.left = "600px";
  el.style.bottom = "60px";
  el.style.transform = "translateX(calc(-50% + 90px))"; // max displacement to the right
  el.innerHTML =
    '<div class="lean" style="transform:rotate(5deg)"><div class="body">' +
    window.__figureSVG("pointing", 150) +
    "</div></div>";
  cont.appendChild(el);
});
await page.waitForTimeout(100);
await page.screenshot({
  path: join(out, "pointing-pushed.png"),
  clip: { x: 420, y: 380, width: 380, height: 300 },
});

// (2) BEFORE/AFTER OVERLAY: prove the body renders identically (no shift/resize).
// Build the OLD-style svg (viewBox 0 0 120 230, width h*120/230) and the NEW one,
// align both at the same center-x and same bottom-y, overlay green(old)+magenta(new).
const overlay = await page.evaluate(() => {
  const h = 150;
  // reconstruct old vs new svg for the same pose using the live POSES via __figureSVG
  // (new) and a hand-built old wrapper around the SAME body markup.
  const newSvg = window.__figureSVG("pointing", h);
  // extract inner body markup from the new svg (between first > and </svg>)
  const inner = newSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const oldSvg =
    '<svg width="' +
    (h * 120) / 230 +
    '" height="' +
    h +
    '" viewBox="0 0 120 230">' +
    inner +
    "</svg>";
  // center both on x=200, bottom at y=300
  document.body.innerHTML =
    '<div style="position:relative;width:400px;height:340px;background:#cdbfa3">' +
    '<div style="position:absolute;left:200px;bottom:40px;transform:translateX(-50%);color:rgba(0,128,0,.55)">' +
    oldSvg +
    "</div>" +
    '<div style="position:absolute;left:200px;bottom:40px;transform:translateX(-50%);color:rgba(200,0,160,.55)">' +
    newSvg +
    "</div>" +
    "</div>";
  const r = document.body.firstElementChild.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});
await page.waitForTimeout(80);
await page.screenshot({
  path: join(out, "viewbox-before-after.png"),
  clip: overlay,
});
console.log(
  "=== OVERLAY === wrote viewbox-before-after.png (green=old viewBox, magenta=new; perfect overlap = no shift/resize)"
);

console.log(
  `console/page errors: ${errors.length}` +
    (errors.length ? " :: " + errors.slice(0, 5).join(" | ") : "")
);
await browser.close();

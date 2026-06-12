// Throwaway: render named poses at actual gallery display size AND 3x zoom,
// side by side on the gallery floor color, so silhouette legibility can be judged.
// Usage: node prototypes/gallery/pose-shot.mjs pointing crossed
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);
const url = "file://" + join(here, "index.html");
import { mkdirSync } from "fs";
const out = join(here, "shots");
mkdirSync(out, { recursive: true });

const poses = process.argv.slice(2);
if (!poses.length) poses.push("pointing", "crossed");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 500 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.__figureSVG, null, { timeout: 10000 });

for (const pose of poses) {
  // actual gallery figures stand ~120-150px tall; show 130px (real) + 3x zoom.
  const html = await page.evaluate((pose) => {
    const real = window.__figureSVG(pose, 130);
    const big = window.__figureSVG(pose, 390);
    return `<div style="display:flex;align-items:flex-end;gap:60px;padding:40px;background:#cdbfa3;color:#1d1813">
      <div style="text-align:center"><div>${real}</div><div style="font:12px sans-serif">actual ~130px</div></div>
      <div style="text-align:center"><div>${big}</div><div style="font:12px sans-serif">3x zoom</div></div>
    </div>`;
  }, pose);
  await page.setContent(html);
  await page.waitForTimeout(120);
  const box = await page.evaluate(() => {
    const r = document.body.firstElementChild.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.screenshot({
    path: join(out, "pose-" + pose + ".png"),
    clip: box,
  });
  console.log(
    "pose-" + pose,
    "rendered",
    JSON.stringify(box),
    "errors=" + errors.length
  );
}
if (errors.length) console.log("ERR:", errors.slice(0, 4).join(" | "));
await browser.close();

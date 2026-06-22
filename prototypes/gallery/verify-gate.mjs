// Behavioral checks for the velocity gate.
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);
const url = "file://" + join(here, "index.html") + "?n=150";

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
await page.waitForTimeout(400);

// helper: how many injected charts fall within the current viewport band
const visibleInjected = () =>
  page.evaluate(() => {
    const hall = document.getElementById("hall");
    const L = hall.scrollLeft,
      R = L + hall.clientWidth;
    let nearInjected = 0,
      nearEmpty = 0;
    for (const art of document.querySelectorAll(".frame .art")) {
      const piece = art.closest(".piece");
      const r = piece.getBoundingClientRect();
      const onScreen = r.right > 0 && r.left < window.innerWidth;
      if (!onScreen) continue;
      if (art.classList.contains("empty")) nearEmpty++;
      else nearInjected++;
    }
    return { nearInjected, nearEmpty, scrollLeft: Math.round(hall.scrollLeft) };
  });

const press = (key) =>
  page.evaluate(
    (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k })),
    key
  );

// 1) End glide → wait to settle → destination populated, no empty on-screen frames
await press("End");
await page.waitForTimeout(3000);
const atEnd = await visibleInjected();

// 2) Home glide → destination (entrance) populated
await press("Home");
await page.waitForTimeout(3000);
const atHome = await visibleInjected();

// 3) slow wheel scroll from entrance: small deltas spaced out (trackpad-like).
//    after each step + a couple frames, on-screen frames should be injected.
await page.evaluate(() => {
  document.getElementById("hall").scrollLeft = 0;
});
await page.waitForTimeout(300);
let slowEmptyMax = 0;
const hall = page; // alias
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => {
    const h = document.getElementById("hall");
    h.scrollLeft += 30; // ~30px/frame == below the 55 gate
    h.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(120); // let a few frames + drain pass run
  const s = await visibleInjected();
  slowEmptyMax = Math.max(slowEmptyMax, s.nearEmpty);
}
const afterSlow = await visibleInjected();

console.log(
  JSON.stringify(
    {
      atEnd,
      atHome,
      slowWheel: { worstOnScreenEmpty: slowEmptyMax, final: afterSlow },
      errors: errors.slice(0, 5),
    },
    null,
    2
  )
);
await browser.close();

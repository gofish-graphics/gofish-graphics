// Throwaway: verify wheel-cancels-glide, reduced-motion instant jump, and
// settle injection at the destination. Run: node verify-glide-behavior.mjs
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(
  join(here, "../../tests/node_modules/playwright/index.mjs")
);
const url = "file://" + join(here, "index.html") + "?n=150";

const browser = await chromium.launch();
const errors = [];

async function mkPage(reduceMotion) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: reduceMotion ? "reduce" : "no-preference",
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
  return page;
}

// ---- (1) wheel cancels an in-flight End glide, and transit class is cleared ----
{
  const page = await mkPage(false);
  await page.evaluate(() => {
    document.getElementById("hall").scrollLeft = 0;
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true })
    )
  );
  await page.waitForTimeout(220); // glide in flight
  const mid = await page.evaluate(() => ({
    sl: document.getElementById("hall").scrollLeft,
    transit: document.getElementById("track").classList.contains("transit"),
  }));
  // wheel in: should cancel glide + leave transit
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(120);
  const afterWheel = await page.evaluate(() => ({
    sl: document.getElementById("hall").scrollLeft,
    transit: document.getElementById("track").classList.contains("transit"),
  }));
  await page.waitForTimeout(300);
  const settled = await page.evaluate(
    () => document.getElementById("hall").scrollLeft
  );
  // glide was canceled if, after the wheel, scroll no longer races to maxScroll
  const maxScroll = await page.evaluate(() =>
    Math.round(
      document.getElementById("hall").scrollWidth -
        document.getElementById("hall").clientWidth
    )
  );
  const canceled = settled < maxScroll - 1000; // nowhere near the end
  console.log(
    `(1) wheel-cancel  midSL=${Math.round(mid.sl)} midTransit=${mid.transit} afterWheelTransit=${afterWheel.transit} settledSL=${Math.round(settled)} max=${maxScroll}  ${!afterWheel.transit && canceled ? "OK (canceled + left transit)" : "FAIL"}`
  );
  await page.close();
}

// ---- (2) reduced-motion End is an INSTANT jump (no glide, no transit class) ----
{
  const page = await mkPage(true);
  await page.evaluate(() => {
    document.getElementById("hall").scrollLeft = 0;
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true })
    )
  );
  // within a couple frames it should already be at the end and never set transit
  await page.waitForTimeout(60);
  const quick = await page.evaluate(() => ({
    sl: document.getElementById("hall").scrollLeft,
    transit: document.getElementById("track").classList.contains("transit"),
    max: Math.round(
      document.getElementById("hall").scrollWidth -
        document.getElementById("hall").clientWidth
    ),
  }));
  const instant = Math.abs(quick.sl - quick.max) < 2;
  console.log(
    `(2) reduced-motion  sl=${Math.round(quick.sl)} max=${quick.max} transit=${quick.transit}  ${instant && !quick.transit ? "OK (instant, no transit)" : "FAIL"}`
  );
  await page.close();
}

// ---- (3) settle injection: after an End glide lands, the destination band has charts ----
{
  const page = await mkPage(false);
  await page.evaluate(() => {
    document.getElementById("hall").scrollLeft = 0;
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true })
    )
  );
  await page.waitForTimeout(3000); // glide + settle
  const r = await page.evaluate(() => {
    const hall = document.getElementById("hall");
    const left = hall.scrollLeft,
      right = left + hall.clientWidth;
    // count charts injected whose frame is within the viewport
    let inView = 0,
      injectedInView = 0;
    for (const p of document.querySelectorAll(".piece")) {
      const fr = p.getBoundingClientRect();
      if (fr.right > 0 && fr.left < window.innerWidth && fr.width > 0) {
        inView++;
        if (p.querySelector(".art:not(.empty)")) injectedInView++;
      }
    }
    return {
      sl: Math.round(hall.scrollLeft),
      max: Math.round(hall.scrollWidth - hall.clientWidth),
      inView,
      injectedInView,
      transit: document.getElementById("track").classList.contains("transit"),
    };
  });
  const ok = r.injectedInView > 0 && !r.transit && Math.abs(r.sl - r.max) < 2;
  console.log(
    `(3) settle-inject  sl=${r.sl} max=${r.max} inView=${r.inView} injectedInView=${r.injectedInView} transit=${r.transit}  ${ok ? "OK (charts injected at destination, transit cleared)" : "FAIL"}`
  );
  await page.close();
}

console.log(
  `console/page errors: ${errors.length}` +
    (errors.length ? " :: " + errors.slice(0, 5).join(" | ") : "")
);
await browser.close();

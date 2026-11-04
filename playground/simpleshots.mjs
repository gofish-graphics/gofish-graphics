// SCRATCH: screenshots of the simplified playground (headless Chromium): the page in light,
// dark and phone layouts, and the stage at a few states. OUT: the folder; SHOTS: a JSON list of
// [name, patch, { full?, dark?, phone? }] (default: the page shots).
//   OUT=… node playground/simpleshots.mjs
import { readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const store = join(here, "../node_modules/.pnpm");
const pw = readdirSync(store)
  .filter((d) => d.startsWith("playwright@"))
  .sort()
  .at(-1);
const { chromium } = await import(
  pathToFileURL(join(store, pw, "node_modules/playwright/index.mjs")).href
);
const url = pathToFileURL(join(here, "dist/index.html")).href;
const out = process.env.OUT;
mkdirSync(out, { recursive: true });
const shots = process.env.SHOTS
  ? JSON.parse(process.env.SHOTS)
  : [
      ["page-light", {}, { full: true }],
      ["page-dark", {}, { full: true, dark: true }],
      ["page-phone", {}, { full: true, phone: true }],
      ["page-fillet-light", { shape: "fillet" }, { full: true }],
    ];
const browser = await chromium.launch();
const errs = [];
for (const [name, patch, o = {}] of shots) {
  const page = await browser.newPage({
    viewport: o.phone
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    deviceScaleFactor: o.phone ? 2 : 1,
    colorScheme: o.dark ? "dark" : "light",
  });
  page.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  page.on(
    "console",
    (m) => m.type() === "error" && errs.push(`${name}: ${m.text()}`)
  );
  await page.goto(url);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.ms
  );
  await page.evaluate((p) => window.__playground.set(p), patch);
  if (o.open)
    await page.evaluate(
      () => (document.getElementById("barcode-wrap").open = true)
    );
  await page.waitForTimeout(150);
  if (o.stage)
    await (
      await page.$("#stage-wrap")
    ).screenshot({ path: `${out}/${name}.png` });
  else
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: !!o.full });
  const info = await page.evaluate(() => ({
    status: document.getElementById("status").textContent,
    code: document.getElementById("code").textContent,
    groups: document.getElementById("groups").textContent,
  }));
  console.log(`${name}: ${info.status} | ${info.code} | ${info.groups}`);
  await page.close();
}
await browser.close();
if (errs.length) console.log("errors:\n" + errs.join("\n"));

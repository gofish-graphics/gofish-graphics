// SCRATCH: screenshots of artifact-page/index.html: light, dark, phone (full page), console errors, horizontal overflow.
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = "/Users/jmp/gofish-20250316/.claude/worktrees/enclose-shape-unify";
const store = join(root, "node_modules/.pnpm");
const pw = readdirSync(store)
  .filter((d) => d.startsWith("playwright@"))
  .sort()
  .at(-1);
const { chromium } = await import(
  pathToFileURL(join(store, pw, "node_modules/playwright/index.mjs")).href
);
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(root, "artifact-page/index.html")).href;
const browser = await chromium.launch();
for (const [name, o] of [
  ["light", {}],
  ["dark", { dark: true }],
  ["phone", { phone: true }],
  ["light-open", { open: true }],
]) {
  const page = await browser.newPage({
    viewport: o.phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: o.phone ? 2 : 1,
    colorScheme: o.dark ? "dark" : "light",
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  if (o.open)
    await page.evaluate(() =>
      document.querySelectorAll("details").forEach((d) => (d.open = true))
    );
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    hl: document.querySelectorAll("code.hljs").length,
    lns: document.querySelectorAll(".ln.add, .ln.del").length,
  }));
  await page.screenshot({ path: `${out}/page-${name}.png`, fullPage: true });
  if (process.env.CLIPS) {
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    const vh = o.phone ? 844 : 900;
    for (let y = 0, i = 0; y < H; y += vh, i++)
      await page.screenshot({ path: `${out}/clip-${name}-${i}.png`, clip: { x: 0, y, width: o.phone ? 390 : 1280, height: Math.min(vh, H - y) }, fullPage: true });
  }
  console.log(name, JSON.stringify(info), errs.length ? "ERRORS " + errs.join(" | ") : "no errors");
  await page.close();
}
await browser.close();

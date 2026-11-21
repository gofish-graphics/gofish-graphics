import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { createRequire } from "node:module";

const WT = "/Users/jmp/gofish-20250316/.claude/worktrees/tooltip-proposal-1395";
const require = createRequire(WT + "/tests/package.json");
const { chromium } = require("playwright");
const CHECK = "/Users/jmp/.claude/jobs/cf54b757/tmp/check/";
mkdirSync(CHECK, { recursive: true });
cpSync(WT + "/proposals/tooltips/img", CHECK + "img", { recursive: true });
const body = readFileSync(WT + "/proposals/tooltips/page.html", "utf8");
writeFileSync(
  CHECK + "index.html",
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`
);

const browser = await chromium.launch();
const tabs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["examples"];
for (const [w, scheme] of [
  [1280, "light"],
  [400, "dark"],
  [1280, "dark"],
  [400, "light"],
]) {
  const page = await browser.newPage({
    viewport: { width: w, height: 900 },
    colorScheme: scheme,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push("failed " + r.url()));
  for (const t of tabs) {
    await page.goto("file://" + CHECK + "index.html#" + t);
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      highlighted: document.querySelectorAll("code.hljs").length,
      codes: document.querySelectorAll("pre code").length,
      visible: [...document.querySelectorAll("section.panel")]
        .filter((s) => !s.hidden)
        .map((s) => s.id),
      broken: [...document.querySelectorAll("img")]
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.src),
    }));
    console.log(w, scheme, t, JSON.stringify(info), errors.join("; "));
    await page.screenshot({
      path: `${CHECK}${t}-${w}-${scheme}.png`,
      fullPage: true,
    });
  }
  await page.close();
}
await browser.close();

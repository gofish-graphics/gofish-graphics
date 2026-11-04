// SCRATCH: rasterize an SVG at 2x cropped to its drawn content (+ margin). node svgcrop.mjs in.svg out.png
import { readdirSync, readFileSync } from "node:fs";
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
const [inp, outp] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1400 },
  deviceScaleFactor: 2,
});
await page.setContent(
  `<body style="margin:0;background:#fff">${readFileSync(inp, "utf8")}</body>`
);
await page.evaluate(() => {
  const s = document.querySelector("svg");
  const b = s.getBBox();
  const m = 8;
  s.setAttribute(
    "viewBox",
    `${b.x - m} ${b.y - m} ${b.width + 2 * m} ${b.height + 2 * m}`
  );
  s.setAttribute("width", b.width + 2 * m);
  s.setAttribute("height", b.height + 2 * m);
});
await (await page.$("svg")).screenshot({ path: outp });
await browser.close();

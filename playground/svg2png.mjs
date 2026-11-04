// SCRATCH: rasterize SVG files to PNG with playwright's chromium.  node playground/svg2png.mjs a.svg [b.svg …]
import { readdirSync, statSync } from "node:fs";
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
// a folder: every .svg in it
const files = process.argv.slice(2).flatMap((f) =>
  statSync(f).isDirectory()
    ? readdirSync(f)
        .filter((x) => x.endsWith(".svg"))
        .map((x) => join(f, x))
    : [f]
);
for (const f of files) {
  await page.goto(pathToFileURL(f).href);
  const el = await page.$("svg");
  await el.screenshot({ path: f.replace(/\.svg$/, ".png") });
}
await browser.close();

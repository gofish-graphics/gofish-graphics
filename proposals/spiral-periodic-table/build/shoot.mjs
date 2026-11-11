// Screenshot index.html (wrapped in the publish skeleton) at desktop and
// phone widths, light and dark. Reports horizontal overflow and broken images.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const [, , dir, repo, out] = process.argv;
const require = createRequire(repo + "/tests/package.json");
const { chromium } = require("playwright");

const body = readFileSync(dir + "/index.html", "utf8");
const preview = dir + "/_preview.html";
writeFileSync(
  preview,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`
);
const browser = await chromium.launch();
try {
  for (const [name, width] of [
    ["desktop", 1280],
    ["phone", 390],
  ])
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        colorScheme: scheme,
      });
      await page.goto("file://" + preview, { waitUntil: "networkidle" });
      const info = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        broken: [...document.images]
          .filter((i) => !i.complete || i.naturalWidth === 0)
          .map((i) => i.getAttribute("src")),
        hljs: !!window.hljs,
        wide: [...document.querySelectorAll("main *")]
          .filter(
            (e) =>
              e.getBoundingClientRect().right >
                document.documentElement.clientWidth + 1 &&
              !e.closest("pre, .tablewrap")
          )
          .slice(0, 5)
          .map((e) => e.tagName + "." + e.className),
      }));
      console.log(name, scheme, JSON.stringify(info));
      await page.screenshot({
        path: `${out}/page-${name}-${scheme}.png`,
        fullPage: true,
      });
      await page.close();
    }
} finally {
  await browser.close();
  unlinkSync(preview);
}

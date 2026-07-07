// Screenshot one or more gotree storybook stories by name substring.
// Usage: node tests/shot.mjs <substring>   (storybook must be running on :6007)
// Writes /tmp/shot-<id>.png for each match and prints id, svg count, errors.
import { chromium } from "playwright";

const needle = (process.argv[2] || "").toLowerCase();
if (!needle) {
  console.error("usage: node tests/shot.mjs <story-name-substring>");
  process.exit(1);
}

const index = await (await fetch("http://localhost:6007/index.json")).json();
const entries = Object.values(index.entries || index.stories || {});
const matches = entries.filter(
  (e) =>
    e.type !== "docs" &&
    (`${e.title} ${e.name}`.toLowerCase().includes(needle) ||
      e.id.toLowerCase().includes(needle))
);
if (!matches.length) {
  console.error(`no story matches "${needle}". available:`);
  for (const e of entries) console.error("  " + e.id);
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
for (const e of matches) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(
    `http://localhost:6007/iframe.html?id=${e.id}&viewMode=story`,
    { waitUntil: "networkidle" }
  );
  await page.waitForTimeout(1500);
  const svg = await page.locator("svg").count();
  const out = `/tmp/shot-${e.id}.png`;
  await page.screenshot({ path: out, fullPage: true });
  console.log(
    `${e.id}  svg=${svg}  errors=${errors.length ? errors.slice(0, 2).join(" | ") : "none"}  -> ${out}`
  );
}
await browser.close();

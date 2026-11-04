// SCRATCH: stage SVG screenshots from the playground at HEAD. node stage.mjs <out> '<json [[name, patch]]>'
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
const shots = JSON.parse(process.argv[3]);
const browser = await chromium.launch();
const errs = [];
for (const [name, patch] of shots) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  page.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  page.on(
    "console",
    (m) => m.type() === "error" && errs.push(`${name}: ${m.text()}`)
  );
  await page.goto(pathToFileURL(join(root, "playground/dist/index.html")).href);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.ms
  );
  if (patch.dataset)
    await page.evaluate(
      (p) => window.__playground.set({ dataset: p.dataset }),
      patch
    );
  await page.evaluate((p) => window.__playground.set(p), patch);
  await page.waitForTimeout(300);
  await (await page.$("#stage")).screenshot({ path: `${out}/${name}.png` });
  const info = await page.evaluate(() => ({
    status: document.getElementById("status").textContent,
    code: document.getElementById("code")?.textContent,
    groups: document.getElementById("groups")?.textContent,
  }));
  console.log(`${name}: ${info.status} | ${info.code} | ${info.groups}`);
  await page.close();
}
await browser.close();
if (errs.length) console.log("errors:\n" + errs.join("\n"));

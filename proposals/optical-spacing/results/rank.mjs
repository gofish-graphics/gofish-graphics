import { createRequire } from "node:module";
import fs from "node:fs";
const repo =
  "/Users/jmp/gofish-20250316/.claude/worktrees/agent-a22b34f91046e8ad6";
const require = createRequire(repo + "/package.json");
const { chromium } = require(
  repo + "/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright"
);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
await p.goto("file://" + repo + "/proposals/optical-spacing/page.html", {
  waitUntil: "domcontentloaded",
});
await p.waitForTimeout(500);
await p.locator(".sp-paste summary").click();
const dir = repo + "/proposals/optical-spacing/results/";
for (const f of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".txt"))
  .sort()) {
  await p.fill(
    "#sp-paste",
    fs
      .readFileSync(dir + f, "utf8")
      .replace(/^name: *$/m, "name: " + f.replace(".txt", ""))
  );
  await p.click("#sp-paste-go");
  await p.waitForTimeout(200);
  console.log(
    "#### " +
      f +
      "\n" +
      (
        await p.evaluate(
          () => document.getElementById("sp-paste-out").innerText
        )
      ).split("You, mean")[0]
  );
}
await b.close();

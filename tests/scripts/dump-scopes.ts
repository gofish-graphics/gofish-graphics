// Render the stories matching a filter with GOFISH_DUMP_SCOPES on and print each
// one's [scope] frame-equation lines — the single-story companion to the
// whole-corpus capture-sweep, for inspecting a chart's σ-scope structure.
// With --sharing, GOFISH_DUMP_SHARING is on instead and each layer's [sharing]
// plan is printed (planSharing in constraints/compose.ts, #1114).
// Usage: tsx scripts/dump-scopes.ts "<filter>" [--sharing]
import { chromium } from "playwright";
import { join } from "path";
import {
  startViteServer,
  waitForVite,
  type StoryInfo,
} from "./capture-core.js";

const HARNESS_DIR = join(import.meta.dirname, "..", "harness");
const PORT = 3007;

async function main() {
  const args = process.argv.slice(2);
  const sharing = args.includes("--sharing");
  const filter = (args.find((a) => !a.startsWith("--")) ?? "")
    .toLowerCase()
    .trim();
  const flag = sharing ? "GOFISH_DUMP_SHARING" : "GOFISH_DUMP_SCOPES";
  const prefix = sharing ? "[sharing]" : "[scope]";
  const viteProc = startViteServer(HARNESS_DIR, PORT);
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForVite(PORT);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript((name) => {
      (window as unknown as Record<string, unknown>)[name] = 1;
    }, flag);
    let buffer: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.startsWith(prefix)) buffer.push(t);
    });
    await page.goto(`http://localhost:${PORT}/stories-runner.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => (window as any).__STORIES_RUNNER_READY__ === true,
      { timeout: 30_000 }
    );
    const all = (await page.evaluate(() =>
      window.__listStories__()
    )) as StoryInfo[];
    const stories = all.filter((s) =>
      `${s.title}/${s.name}`.toLowerCase().includes(filter)
    );
    for (const story of stories) {
      buffer = [];
      await page.evaluate(async (s) => window.__renderStory__(s), story);
      await page.waitForFunction(() => window.__STORY_RENDER_DONE__ === true, {
        timeout: 15_000,
      });
      await page.waitForTimeout(50);
      console.log(`\n### ${story.title}/${story.name}`);
      for (const l of buffer) console.log(l);
    }
    await context.close();
  } finally {
    await browser.close();
    viteProc.kill();
  }
}
main();

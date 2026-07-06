// Render the stories matching a filter with GOFISH_DUMP_SCOPES on and print each
// one's [scope] frame-equation lines — the single-story companion to the
// whole-corpus capture-sweep, for inspecting a chart's σ-scope structure.
// Usage: tsx scripts/dump-scopes.ts "<filter>"
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
  const filter = (process.argv[2] ?? "").toLowerCase().trim();
  const viteProc = startViteServer(HARNESS_DIR, PORT);
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForVite(PORT);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).GOFISH_DUMP_SCOPES = 1;
    });
    let buffer: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.startsWith("[scope]")) buffer.push(t);
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
      await page.evaluate(async (id) => window.__renderStory__(id), story.id);
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

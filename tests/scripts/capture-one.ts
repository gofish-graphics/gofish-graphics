/**
 * Capture a screenshot (+ normalized DOM) for ONE story (or a small subset),
 * on demand, for an interactive review loop.
 *
 * This is the fast primitive behind the `iterate-example` skill: render the
 * single story you're working on to a PNG that Claude (or you) can look at,
 * critique, and fix — without re-rendering the entire story corpus the way
 * `capture-js-dom.ts` does.
 *
 * It reuses the same headless harness as `capture-js-dom.ts`:
 *   1. Start a Vite dev server serving the stories-runner page
 *   2. Navigate Playwright to that page ONCE
 *   3. List stories, filter by the CLI substring, render + screenshot matches
 *
 * Usage:
 *   tsx scripts/capture-one.ts                 # list all available stories
 *   tsx scripts/capture-one.ts bar/grouped     # capture stories matching "bar/grouped"
 *   tsx scripts/capture-one.ts "Scatter"       # case-insensitive substring on title/name/id
 *
 * Output: tests/tmp/iterate/<path>.png  (and .html for the normalized DOM)
 * The matched output paths are printed at the end so a caller knows what to read.
 */

import { chromium, type Browser } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { normalizeDom } from "./normalize-dom.js";
import { storyToPath } from "./path-mapping.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const OUT_DIR = join(TESTS_DIR, "tmp/iterate");
const VITE_PORT = 3002; // distinct from capture-js-dom (3001) so both can run

function startViteServer(): ChildProcess {
  return spawn(
    "npx",
    [
      "vite",
      "--config",
      join(HARNESS_DIR, "vite.config.ts"),
      "--port",
      String(VITE_PORT),
    ],
    {
      cwd: HARNESS_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    }
  );
}

async function waitForVite(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://localhost:${port}/stories-runner.html`);
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite server did not start within ${timeoutMs}ms`);
}

async function main() {
  const filter = process.argv[2]?.toLowerCase().trim();

  const viteProc = startViteServer();
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));

  let browser: Browser | undefined;

  try {
    await waitForVite(VITE_PORT);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Surface render-time errors — these are exactly what the review loop wants to see.
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[browser] ${msg.text()}`);
      else if (process.env.DEBUG)
        console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) =>
      console.error(`[browser pageerror] ${err.message}`)
    );

    await page.goto(`http://localhost:${VITE_PORT}/stories-runner.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => (window as any).__STORIES_RUNNER_READY__ === true,
      { timeout: 30_000 }
    );
    const runnerError = await page.evaluate(
      () => (window as any).__STORIES_RUNNER_ERROR__
    );
    if (runnerError)
      throw new Error(`Stories runner failed to initialize: ${runnerError}`);

    const stories = await page.evaluate(() => window.__listStories__());

    // No filter → list what's available and exit. Helps when you don't know the id.
    if (!filter) {
      console.log(
        `\n${stories.length} stories available. Pass a substring to capture one:\n`
      );
      for (const s of stories) console.log(`  ${s.title}/${s.name}`);
      console.log(
        `\ne.g.  tsx scripts/capture-one.ts "${stories[0]?.title}/${stories[0]?.name}"`
      );
      return;
    }

    const matches = stories.filter((s) => {
      const hay = `${s.title}/${s.name}`.toLowerCase();
      return hay.includes(filter) || s.id.includes(filter);
    });

    if (matches.length === 0) {
      console.error(
        `\nNo stories match "${filter}". Run without an argument to list all stories.`
      );
      process.exitCode = 1;
      return;
    }

    // Overwrite per-story below (never wipe the whole dir): captures from a
    // previous filter survive, so you can compare two stories across runs.
    mkdirSync(OUT_DIR, { recursive: true });

    console.log(
      `\nCapturing ${matches.length} story(ies) matching "${filter}":\n`
    );
    const written: string[] = [];

    for (const story of matches) {
      const path = storyToPath(story.title, story.name);
      process.stdout.write(`  ${story.title}/${story.name} ... `);

      // Guard each story (like capture-js-dom.ts) so one render/timeout failure
      // doesn't abort the remaining matches when a filter hits several stories.
      try {
        const success = await page.evaluate(
          async (id) => window.__renderStory__(id),
          story.id
        );
        if (!success) {
          const err = await page.evaluate(() => window.__STORY_RENDER_ERROR__);
          console.log(`FAILED: ${err}`);
          continue;
        }
        await page.waitForFunction(
          () => window.__STORY_RENDER_DONE__ === true,
          { timeout: 15_000 }
        );

        const rawDom = await page.evaluate(() => {
          const root = document.getElementById("stories-root");
          return root ? root.innerHTML : "";
        });
        if (!rawDom.trim()) {
          console.log("SKIP (empty)");
          continue;
        }

        const domPath = join(OUT_DIR, `${path}.html`);
        mkdirSync(dirname(domPath), { recursive: true });
        writeFileSync(domPath, normalizeDom(rawDom), "utf-8");

        const rootHandle = await page.$("#stories-root");
        if (rootHandle) {
          const screenshotPath = join(OUT_DIR, `${path}.png`);
          mkdirSync(dirname(screenshotPath), { recursive: true });
          writeFileSync(
            screenshotPath,
            await rootHandle.screenshot({ type: "png" })
          );
          // PNG first (read this), then the DOM (read for exact coords/sizes).
          written.push(screenshotPath, domPath);
        }
        console.log("OK");
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (written.length) {
      console.log(
        `\nWritten — read the .png (and .html for exact coords/sizes):`
      );
      for (const p of written) console.log(`  ${p}`);
    }

    await context.close();
  } finally {
    await browser?.close();
    viteProc.kill();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

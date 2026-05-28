/**
 * Capture DOM snapshots and screenshots from every Storybook story.
 *
 * Instead of building Storybook and navigating to each story URL, this script:
 * 1. Starts a Vite dev server serving the stories-runner page
 * 2. Navigates Playwright to that page ONCE
 * 3. Calls window.__renderStory__(id) for each story in sequence
 * 4. Extracts + normalizes DOM and takes a screenshot after each render
 *
 * This is much faster than per-story navigation because there's no page load
 * or network-idle wait between stories — just JS execution in the same page.
 */

import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { normalizeDom } from "./normalize-dom.js";
import { storyToPath } from "./path-mapping.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const TMP_DIR = join(TESTS_DIR, "tmp/js");
const VITE_PORT = 3001;

// ---------------------------------------------------------------------------
// Start Vite dev server
// ---------------------------------------------------------------------------

function startViteServer(): ChildProcess {
  const proc = spawn(
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

  return proc;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Capturing JS DOM snapshots (batch mode) ===\n");

  // 1. Start Vite
  console.log("Starting Vite dev server...");
  const viteProc = startViteServer();

  // Log Vite output — always show errors, show all output in DEBUG mode
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => {
    process.stderr.write(d.toString());
  });

  let browser: Browser | undefined;

  try {
    await waitForVite(VITE_PORT);
    console.log("Vite server ready");

    // Clean tmp dir from previous runs
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true });
    }
    console.log("");

    // 2. Launch browser and navigate ONCE
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Surface browser console errors immediately
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

    // Wait for the runner to be ready (or to report an error)
    await page.waitForFunction(
      () => (window as any).__STORIES_RUNNER_READY__ === true,
      { timeout: 30_000 }
    );

    const runnerError = await page.evaluate(
      () => (window as any).__STORIES_RUNNER_ERROR__
    );
    if (runnerError)
      throw new Error(`Stories runner failed to initialize: ${runnerError}`);

    // 3. Get the story list
    const stories = await page.evaluate(() => window.__listStories__());
    console.log(`Found ${stories.length} stories\n`);

    mkdirSync(TMP_DIR, { recursive: true });

    let captured = 0;
    let failed = 0;
    let skipped = 0;

    // 4. Render each story in sequence (no navigation!)
    for (const story of stories) {
      const path = storyToPath(story.title, story.name);
      process.stdout.write(`  ${story.title}/${story.name} → ${path} ... `);

      try {
        const success = await page.evaluate(async (id) => {
          return window.__renderStory__(id);
        }, story.id);

        if (!success) {
          const err = await page.evaluate(() => window.__STORY_RENDER_ERROR__);
          console.log(`FAILED: ${err}`);
          failed++;
          continue;
        }

        // Wait for render to settle
        await page.waitForFunction(
          () => window.__STORY_RENDER_DONE__ === true,
          {
            timeout: 15_000,
          }
        );

        // Extract DOM from #stories-root
        const rawDom = await page.evaluate(() => {
          const root = document.getElementById("stories-root");
          return root ? root.innerHTML : "";
        });

        if (!rawDom.trim()) {
          console.log("SKIP (empty)");
          skipped++;
          continue;
        }

        const normalized = normalizeDom(rawDom);

        // Write DOM
        const domPath = join(TMP_DIR, `${path}.html`);
        mkdirSync(dirname(domPath), { recursive: true });
        writeFileSync(domPath, normalized, "utf-8");

        // Screenshot the root element
        const rootHandle = await page.$("#stories-root");
        if (rootHandle) {
          const screenshotPath = join(TMP_DIR, `${path}.png`);
          mkdirSync(dirname(screenshotPath), { recursive: true });
          const screenshot = await rootHandle.screenshot({ type: "png" });
          writeFileSync(screenshotPath, screenshot);
        }

        console.log("OK");
        captured++;
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }

    console.log(
      `\nDone: ${captured} captured, ${failed} failed, ${skipped} skipped`
    );

    await context.close();
  } finally {
    await browser?.close();
    viteProc.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

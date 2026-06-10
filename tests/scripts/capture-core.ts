/**
 * capture-core.ts
 *
 * Shared headless-capture engine used by:
 *   - capture-js-dom.ts  (full corpus → baselines comparison)
 *   - capture-diff.ts     (HEAD vs base-ref geometry/DOM diff)
 *
 * The capture loop is identical in both: spin up a Vite dev server that serves
 * the stories-runner page, navigate Playwright to it once, then render every
 * (optionally filtered) story in sequence and extract + normalize its DOM.
 *
 * What varies between callers is ONLY which `harnessDir` the Vite server is
 * rooted in (so capture-diff can point a second server at a base-ref worktree)
 * and whether PNG screenshots are written. DOM normalization always runs in
 * THIS process via the current `normalize-dom.ts`, so two captures driven from
 * the same invocation are normalized identically — which is what makes the
 * geometry diff platform-stable.
 */

import { chromium, type Browser } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { normalizeDom } from "./normalize-dom.js";
import { storyToPath } from "./path-mapping.js";

export interface StoryInfo {
  id: string;
  title: string;
  name: string;
  moduleKey: string;
  hasLoaders: boolean;
}

export interface CaptureOptions {
  /** Directory containing vite.config.ts + stories-runner.html (the Vite root). */
  harnessDir: string;
  /** Port for this capture's Vite server. Must be unique among concurrent captures. */
  port: number;
  /** Where to write `<path>.html` (and `<path>.png` when `screenshot`). */
  outDir: string;
  /** Case-insensitive substring matched against `title/name` or story id. */
  filter?: string;
  /** Also write a PNG screenshot per story (pixel output is NOT platform-stable). */
  screenshot?: boolean;
  /** Wipe `outDir` before capturing (default: false — callers manage layout). */
  cleanOutDir?: boolean;
}

export interface CaptureResult {
  /** Relative `<path>.html` paths written (normalized DOM), sorted. */
  captured: string[];
  failed: { path: string; error: string }[];
  skipped: string[];
}

function startViteServer(harnessDir: string, port: number): ChildProcess {
  return spawn(
    "npx",
    [
      "vite",
      "--config",
      join(harnessDir, "vite.config.ts"),
      "--port",
      String(port),
    ],
    {
      cwd: harnessDir,
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

/**
 * Capture (a subset of) stories from a harness into `outDir`.
 *
 * Starts its own Vite server + Playwright browser, captures, then tears both
 * down before returning. Safe to call twice in one process with distinct ports.
 */
export async function captureStories(
  opts: CaptureOptions
): Promise<CaptureResult> {
  const {
    harnessDir,
    port,
    outDir,
    filter,
    screenshot = false,
    cleanOutDir = false,
  } = opts;

  const result: CaptureResult = { captured: [], failed: [], skipped: [] };

  const viteProc = startViteServer(harnessDir, port);
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));

  let browser: Browser | undefined;

  try {
    await waitForVite(port);

    if (cleanOutDir && existsSync(outDir)) {
      rmSync(outDir, { recursive: true });
    }
    mkdirSync(outDir, { recursive: true });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[browser] ${msg.text()}`);
      else if (process.env.DEBUG)
        console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) =>
      console.error(`[browser pageerror] ${err.message}`)
    );

    await page.goto(`http://localhost:${port}/stories-runner.html`, {
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

    const allStories = (await page.evaluate(() =>
      window.__listStories__()
    )) as StoryInfo[];

    const needle = filter?.toLowerCase().trim();
    const stories = needle
      ? allStories.filter((s) => {
          const hay = `${s.title}/${s.name}`.toLowerCase();
          return hay.includes(needle) || s.id.includes(needle);
        })
      : allStories;

    console.log(
      `Found ${allStories.length} stories${needle ? `, ${stories.length} matching "${needle}"` : ""}\n`
    );

    for (const story of stories) {
      const path = storyToPath(story.title, story.name);
      process.stdout.write(`  ${story.title}/${story.name} ... `);

      try {
        const success = await page.evaluate(
          async (id) => window.__renderStory__(id),
          story.id
        );
        if (!success) {
          const err = await page.evaluate(() => window.__STORY_RENDER_ERROR__);
          console.log(`FAILED: ${err}`);
          result.failed.push({ path, error: String(err) });
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
          result.skipped.push(path);
          continue;
        }

        const domPath = join(outDir, `${path}.html`);
        mkdirSync(dirname(domPath), { recursive: true });
        writeFileSync(domPath, normalizeDom(rawDom), "utf-8");

        if (screenshot) {
          const rootHandle = await page.$("#stories-root");
          if (rootHandle) {
            const screenshotPath = join(outDir, `${path}.png`);
            mkdirSync(dirname(screenshotPath), { recursive: true });
            writeFileSync(
              screenshotPath,
              await rootHandle.screenshot({ type: "png" })
            );
          }
        }

        console.log("OK");
        result.captured.push(`${path}.html`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
        result.failed.push({ path, error: msg });
      }
    }

    result.captured.sort();
    await context.close();
  } finally {
    await browser?.close();
    viteProc.kill();
  }

  return result;
}

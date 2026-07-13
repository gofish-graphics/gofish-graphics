/**
 * capture-core.ts
 *
 * Shared headless-capture engine used by:
 *   - capture-js-dom.ts  (full corpus → baselines comparison)
 *   - capture-diff.ts     (HEAD vs base-ref geometry/DOM diff)
 *
 * The capture loop is identical in both: spin up a Vite dev server that serves
 * the stories-runner page, then render every (optionally filtered) story and
 * extract + normalize its DOM — in a FRESH browser context per story. The
 * per-story context is deliberate, not waste: Chromium's canvas `measureText`
 * font metrics (`fontBoundingBoxAscent`/`Descent`, sometimes advance widths)
 * for a font with a distinct real face (e.g. `italic 30px serif` → Times
 * Italic, `300 18px monospace` → a light monospace face) CHANGE once that
 * face is first rasterized in the renderer process — and taking a screenshot
 * rasterizes every face the page paints. In a single long-lived page this
 * made text layout order-dependent: a story's `<text>` positions shifted by
 * 0.5-1px depending on which stories had been rendered+screenshotted BEFORE
 * it (and on whether screenshots were enabled at all). Some of that state
 * even survives same-URL navigation (which reuses the renderer process), so
 * the reset that actually holds is a new browser context — its own renderer.
 * Every story is thus measured in an identical fresh environment, byte-
 * comparable with capture-one and the Python parity capture
 * (capture-python-dom.ts). With a warm Vite module cache a context + load
 * costs ~100-150ms/story, the same order as one story render.
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

export function startViteServer(
  harnessDir: string,
  port: number
): ChildProcess {
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

export async function waitForVite(
  port: number,
  timeoutMs = 30_000
): Promise<void> {
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

    // Open a fresh, fully isolated runner page. A new browser CONTEXT gets
    // its own renderer process, which is the reset that actually holds: a
    // same-URL `page.goto` reuses the renderer, and some of Chromium's font
    // state survives navigation inside one renderer (rendering + screenshot
    // of certain stories flipped `300 18px monospace` metrics for every
    // later story in the run — see header comment). Context startup is
    // ~tens of ms, same order as the navigation itself.
    const openRunnerPage = async () => {
      const context = await browser!.newContext({
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
      if (runnerError) {
        await context.close();
        throw new Error(`Stories runner failed to initialize: ${runnerError}`);
      }
      return { context, page };
    };

    // Discovery pass: list the stories, then discard the context.
    const discovery = await openRunnerPage();
    const allStories = (await discovery.page.evaluate(() =>
      window.__listStories__()
    )) as StoryInfo[];
    await discovery.context.close();

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

      // Fresh context (and page) per story: resets Chromium's renderer
      // font-metric state so text measurement can't be polluted by a
      // previous story's raster (see header comment).
      const { context, page } = await openRunnerPage();
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
      } finally {
        await context.close();
      }
    }

    result.captured.sort();
  } finally {
    await browser?.close();
    viteProc.kill();
  }

  return result;
}

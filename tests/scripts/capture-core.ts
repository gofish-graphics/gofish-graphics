/**
 * capture-core.ts
 *
 * Shared headless-capture engine. `captureStories` is used by:
 *   - capture-js-dom.ts  (full corpus → baselines comparison)
 *   - capture-diff.ts     (HEAD vs base-ref geometry/DOM diff)
 *   - capture-pixels.ts   (HEAD vs base-ref pixel diff)
 *   - capture-one.ts      (one story, for the iterate-example loop; also uses
 *                          `listStories`)
 * and `startViteServer`/`waitForVite` alone by capture-sweep.ts, dump-scopes.ts
 * and capture-docs-images.ts.
 *
 * The capture loop: spin up a Vite dev server that serves the stories-runner
 * page, then render every (optionally filtered) story and extract + normalize
 * its DOM — in a FRESH browser context per story. The
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
 * comparable across runs, between the batch capture and capture-one (the
 * same code path), and with the Python parity capture
 * (capture-python-dom.ts). With a warm Vite module cache a context + load
 * costs ~100-150ms/story, the same order as one story render.
 *
 * Because every story already gets its own context, stories are captured
 * CONCURRENTLY: a small pool of workers (see `CaptureOptions.concurrency`)
 * each run one story at a time in its own context of the same browser. The
 * log and the result arrays are still in story order (see `captureStories`).
 *
 * What varies between callers is ONLY which `harnessDir` the Vite server is
 * rooted in (so capture-diff can point a second server at a base-ref worktree),
 * which stories are selected, where output goes, and whether PNG screenshots
 * are written. DOM normalization always runs in
 * THIS process via the current `normalize-dom.ts`, so two captures driven from
 * the same invocation are normalized identically — which is what makes the
 * geometry diff platform-stable.
 *
 * Capture also runs every story on Playwright's FAKE clock. `timer()` (see
 * gofish's src/interaction/inputs.ts) measures elapsed time from
 * `performance.now()` and samples it on a 16ms `setInterval`, so an animated
 * story used to be captured at whatever frame the machine happened to reach:
 * the bird-migration panels sweep 365 days in 10s, a slot every ~27ms, and two
 * runs minutes apart landed on different days. With `clock.install` + `pauseAt`
 * the page's `Date`, `performance`, timers and rAF are all virtual and frozen,
 * and each story is then handed the SAME fixed amount of virtual time between
 * the moment its clock starts and the moment its DOM is read (see the render
 * loop below). Real work — module loads, dataset fetches, `document.fonts
 * .ready` — is NOT paid for in virtual time; it is waited out on the real clock
 * first, which is what keeps the fixed budget meaningful.
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { availableParallelism } from "os";
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
  /**
   * How many stories to capture at once, each in its own browser context.
   * Default: the `CAPTURE_CONCURRENCY` env var if set, else
   * `min(4, os.availableParallelism())`. Output does not depend on it.
   */
  concurrency?: number;
}

export interface CaptureResult {
  /** Relative `<path>.html` paths written (normalized DOM), sorted. */
  captured: string[];
  failed: { path: string; error: string }[];
  skipped: string[];
  /** Absolute paths written per captured story, in story order. */
  written: { html: string; png?: string }[];
}

/** Wall-clock instant the fake clock is installed at. Any fixed value works;
 *  what matters is that it is the same on every run and every machine. */
const CLOCK_EPOCH = Date.UTC(2024, 0, 1, 0, 0, 0);
/** Where the clock is parked once the page has loaded. The page loads with time
 *  running normally (a clock paused across module init can deadlock on a
 *  loader's own timer), then jumps here and stops. */
const CLOCK_PAUSE_AT = CLOCK_EPOCH + 60_000;
/** Virtual ms handed to EVERY story after it first paints, in full. It has to
 *  cover the runner's rAF + 100ms settle with room to spare; beyond that the
 *  figure is arbitrary, but it must never vary — it is what decides which frame
 *  of an animation is captured. */
const VIRTUAL_SETTLE_MS = 512;
/** Advance in frame-sized steps so rAF-driven work sees frames, not one jump. */
const VIRTUAL_STEP_MS = 16;
/** Real ms between polls of a page-side predicate. */
const REAL_POLL_MS = 20;
/** How long first paint is waited for on the REAL clock before virtual time is
 *  handed out anyway. Every story whose render is gated only on real promises
 *  (loaders, dynamic imports, fonts) paints well inside this; the few that
 *  await a `requestAnimationFrame` of their own CANNOT paint until the frozen
 *  clock moves, and they are the ones that spend the whole grace. */
const PAINT_GRACE_MS = 2_000;

/**
 * Has the story painted? An `<svg>` under the root is the first moment a
 * `timer()` can have been read, because the read happens while the pipeline
 * that emits that SVG runs.
 *
 * Polled from NODE, sleeping on the REAL clock: `page.waitForFunction` can't be
 * used once the fake clock is paused, since its default `polling: 'raf'` is a
 * frozen `requestAnimationFrame` and a numeric polling interval is a frozen
 * `setTimeout`, so neither would ever fire.
 */
async function waitForPaint(page: Page, graceMs: number): Promise<boolean> {
  const deadline = Date.now() + graceMs;
  for (;;) {
    const painted = await page.evaluate(
      () =>
        !!document.querySelector("#stories-root svg") ||
        window.__STORY_RENDER_DONE__ === true
    );
    if (painted) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, REAL_POLL_MS));
  }
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

/** One line of a story's log, and the stream it belongs on. */
type LogLine = { err: boolean; text: string };
type Log = (line: LogLine) => void;

const printLine = ({ err, text }: LogLine) =>
  err ? console.error(text) : console.log(text);

/**
 * A running harness: a Vite server rooted at `harnessDir` plus one Chromium,
 * and a way to open a fresh runner page in its own context. Torn down when
 * `fn` settles.
 */
async function withHarness<T>(
  harnessDir: string,
  port: number,
  fn: (openRunnerPage: (log: Log) => Promise<RunnerPage>) => Promise<T>
): Promise<T> {
  const viteProc = startViteServer(harnessDir, port);
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));

  let browser: Browser | undefined;
  try {
    await waitForVite(port);
    browser = await chromium.launch({ headless: true });
    const b = browser;
    return await fn((log) => openRunnerPage(b, port, log));
  } finally {
    await browser?.close();
    viteProc.kill();
  }
}

type RunnerPage = { context: BrowserContext; page: Page };

/**
 * Open a fresh, fully isolated runner page. A new browser CONTEXT gets its own
 * renderer process, which is the reset that actually holds: a same-URL
 * `page.goto` reuses the renderer, and some of Chromium's font state survives
 * navigation inside one renderer (rendering + screenshot of certain stories
 * flipped `300 18px monospace` metrics for every later story in the run — see
 * header comment). Context startup is ~tens of ms, same order as the
 * navigation itself. Browser console errors go to `log`, so a story's errors
 * print with that story.
 */
async function openRunnerPage(
  browser: Browser,
  port: number,
  log: Log
): Promise<RunnerPage> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  // Install the fake clock BEFORE the first navigation so nothing in the
  // page ever sees the real one; it keeps running at real speed until the
  // pause below, so page load is unaffected (see header comment).
  await context.clock.install({ time: CLOCK_EPOCH });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error")
      log({ err: true, text: `[browser] ${msg.text()}` });
    else if (process.env.DEBUG)
      log({ err: false, text: `[browser:${msg.type()}] ${msg.text()}` });
  });
  page.on("pageerror", (err) =>
    log({ err: true, text: `[browser pageerror] ${err.message}` })
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
  // Warm the webfonts while time still runs, so that a story's own
  // `await document.fonts.ready` resolves in a microtask rather than after
  // a real network fetch of unpredictable length.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // From here on time only moves when this process says so.
  await page.clock.pauseAt(CLOCK_PAUSE_AT);
  return { context, page };
}

async function discoverStories(
  open: (log: Log) => Promise<RunnerPage>
): Promise<StoryInfo[]> {
  const { context, page } = await open(printLine);
  try {
    return (await page.evaluate(() => window.__listStories__())) as StoryInfo[];
  } finally {
    await context.close();
  }
}

/** List every story the harness knows about, without capturing any. */
export async function listStories(
  harnessDir: string,
  port: number
): Promise<StoryInfo[]> {
  return withHarness(harnessDir, port, discoverStories);
}

type StoryOutcome =
  | { kind: "ok"; path: string; written: { html: string; png?: string } }
  | { kind: "failed"; path: string; error: string }
  | { kind: "skipped"; path: string };

/** Render one story in `page` and write its output. Throws on timeout. */
async function captureStory(
  page: Page,
  story: StoryInfo,
  outDir: string,
  screenshot: boolean,
  log: Log
): Promise<StoryOutcome> {
  const path = storyToPath(story.title, story.name);

  // Kick the render off but do NOT await it: the runner's tail (a rAF
  // plus a 100ms settle) can only complete once the paused clock is
  // given virtual time below, so awaiting here would deadlock.
  await page.evaluate((id) => {
    void window.__renderStory__(id);
  }, story.id);

  // Phase 1 — real time only. Loaders, dynamic imports, fonts and the
  // gofish render promise are real promises that resolve on their own.
  // None of that may be charged to virtual time, because an animated
  // story's clock starts on its FIRST READ inside that render, and
  // virtual ms spent before that read are ms the animation never sees.
  // Waiting for first paint here is what pins the budget below to the
  // same point in every run.
  await waitForPaint(page, PAINT_GRACE_MS);

  // Phase 2 — the fixed virtual budget, run in full for every story
  // rather than stopped as soon as `__STORY_RENDER_DONE__` flips. That
  // is the point: the DOM is always read exactly VIRTUAL_SETTLE_MS of
  // virtual time past the story's first paint, so an animation lands on
  // the same frame every run.
  for (let t = 0; t < VIRTUAL_SETTLE_MS; t += VIRTUAL_STEP_MS) {
    await page.clock.runFor(VIRTUAL_STEP_MS);
  }

  // A story that still isn't done wanted more time than the budget —
  // usually real work it is doing between frames, which this loop pays
  // for in virtual ms because it can't tell the two apart. Keep going
  // (a hung story must still fail rather than be captured half-drawn)
  // but say so: how much virtual time this story got is now a function
  // of the machine, so an ANIMATED story here would not land on a fixed
  // frame. A still one is unaffected.
  if (!(await page.evaluate(() => window.__STORY_RENDER_DONE__))) {
    const deadline = Date.now() + 15_000;
    let overrun = 0;
    while (!(await page.evaluate(() => window.__STORY_RENDER_DONE__))) {
      if (Date.now() > deadline)
        throw new Error(
          `Timed out after 15000ms waiting for ${story.title}/${story.name} to render`
        );
      await page.clock.runFor(VIRTUAL_STEP_MS);
      overrun += VIRTUAL_STEP_MS;
    }
    log({
      err: true,
      text: `    (clock overrun: +${overrun}ms virtual past the ${VIRTUAL_SETTLE_MS}ms budget — fine for a still story, not a fixed frame for an animated one)`,
    });
  }

  const renderError = await page.evaluate(() => window.__STORY_RENDER_ERROR__);
  if (renderError) return { kind: "failed", path, error: String(renderError) };

  const rawDom = await page.evaluate(() => {
    const root = document.getElementById("stories-root");
    return root ? root.innerHTML : "";
  });
  if (!rawDom.trim()) return { kind: "skipped", path };

  const html = join(outDir, `${path}.html`);
  mkdirSync(dirname(html), { recursive: true });
  writeFileSync(html, normalizeDom(rawDom), "utf-8");

  let png: string | undefined;
  if (screenshot) {
    const rootHandle = await page.$("#stories-root");
    if (rootHandle) {
      png = join(outDir, `${path}.png`);
      writeFileSync(png, await rootHandle.screenshot({ type: "png" }));
    }
  }

  return { kind: "ok", path, written: { html, png } };
}

function defaultConcurrency(): number {
  const env = Number(process.env.CAPTURE_CONCURRENCY);
  if (Number.isInteger(env) && env > 0) return env;
  return Math.max(1, Math.min(4, availableParallelism()));
}

/**
 * Capture (a subset of) stories from a harness into `outDir`.
 *
 * Starts its own Vite server + Playwright browser, captures, then tears both
 * down before returning. Safe to call twice in one process with distinct ports.
 *
 * Stories run on a pool of `concurrency` workers. That is safe because nothing
 * is shared between two stories in flight: each gets its own browser context
 * (own renderer, so no font-metric state crosses over — see header comment)
 * and each context has its own fake clock, so one story's virtual budget is
 * never advanced by another's. Each story's log lines are buffered and
 * printed in story order, and the result arrays are in story order too, so
 * neither depends on which story finished first.
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
    concurrency = defaultConcurrency(),
  } = opts;

  return withHarness(harnessDir, port, async (open) => {
    if (cleanOutDir && existsSync(outDir)) {
      rmSync(outDir, { recursive: true });
    }
    mkdirSync(outDir, { recursive: true });

    const allStories = await discoverStories(open);
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

    // Story i's outcome and log lines, filled in as it finishes; printed
    // once every story before it has been printed.
    const done: { outcome: StoryOutcome; lines: LogLine[] }[] = [];
    let printed = 0;
    const flush = () => {
      while (printed < stories.length && done[printed]) {
        const { lines } = done[printed];
        for (const line of lines) printLine(line);
        printed++;
      }
    };

    const run = async (
      story: StoryInfo
    ): Promise<{ outcome: StoryOutcome; lines: LogLine[] }> => {
      const path = storyToPath(story.title, story.name);
      const lines: LogLine[] = [];
      const log: Log = (line) => lines.push(line);
      let outcome: StoryOutcome;
      try {
        // Fresh context (and page) per story: resets Chromium's renderer
        // font-metric state so text measurement can't be polluted by a
        // previous story's raster (see header comment).
        const { context, page } = await open(log);
        try {
          outcome = await captureStory(page, story, outDir, screenshot, log);
        } finally {
          await context.close();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        outcome = { kind: "failed", path, error: msg };
      }
      const status =
        outcome.kind === "ok"
          ? "OK"
          : outcome.kind === "skipped"
            ? "SKIP (empty)"
            : `FAILED: ${outcome.error}`;
      lines.unshift({
        err: false,
        text: `  ${story.title}/${story.name} ... ${status}`,
      });
      return { outcome, lines };
    };

    let next = 0;
    const worker = async () => {
      while (next < stories.length) {
        const i = next++;
        done[i] = await run(stories[i]);
        flush();
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.max(1, Math.min(concurrency, stories.length)) },
        worker
      )
    );

    const result: CaptureResult = {
      captured: [],
      failed: [],
      skipped: [],
      written: [],
    };
    for (const { outcome } of done) {
      if (outcome.kind === "ok") {
        result.captured.push(`${outcome.path}.html`);
        result.written.push(outcome.written);
      } else if (outcome.kind === "failed") {
        result.failed.push({ path: outcome.path, error: outcome.error });
      } else {
        result.skipped.push(outcome.path);
      }
    }
    result.captured.sort();
    return result;
  });
}

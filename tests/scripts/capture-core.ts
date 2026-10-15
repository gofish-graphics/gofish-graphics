/**
 * capture-core.ts
 *
 * Shared headless-capture engine. `captureStories` is used by:
 *   - capture-js-dom.ts  (full corpus, or one CI shard of it → baselines
 *                          comparison)
 *   - capture-diff.ts     (HEAD vs base-ref geometry/DOM diff)
 *   - capture-pixels.ts   (HEAD vs base-ref pixel diff)
 *   - capture-one.ts      (one story, for the iterate-example loop; also uses
 *                          `listStories`)
 * its per-story pieces (`withHarness`, a fresh runner page per story,
 * `renderStoryOnFakeClock`) by capture-docs-images.ts, and
 * `startViteServer`/`waitForVite` alone by capture-sweep.ts and dump-scopes.ts,
 * and its worker pool (`runInOrder`) by capture-python-dom.ts.
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
 * (capture-python-dom.ts). A runner page loads only the story module it
 * renders (see tests/harness/stories-runner.ts), so a context + load costs a
 * few hundred ms, the same order as one story render; loading the whole
 * corpus there took about four times as long.
 *
 * Because every story already gets its own context, stories are captured
 * CONCURRENTLY: a small pool of workers (see `CaptureOptions.concurrency`)
 * each run one story at a time in its own context of the same browser. The
 * log and the result arrays are still in story order (see `captureStories`).
 *
 * What varies between callers is ONLY which `harnessDir` the Vite server is
 * rooted in (so capture-diff can point a second server at a base-ref worktree,
 * see `withBaseRefHarness`), which stories are selected, where output goes, and
 * whether PNG screenshots are written. DOM normalization always runs in
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
  type BrowserContextOptions,
  type Page,
} from "playwright";
import { execSync, spawn, type ChildProcess } from "child_process";
import { availableParallelism } from "os";
import { writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from "fs";
import { join, dirname } from "path";
import { normalizeDom } from "./normalize-dom.js";
import { storyToPath } from "./path-mapping.js";
import { git, removeWorktree } from "./snapshot-branch.js";

export interface StoryInfo {
  id: string;
  title: string;
  name: string;
  moduleKey: string;
  hasLoaders: boolean;
}

/** What the runner needs to load and render a story: its module and export. */
export type StoryRef = Pick<StoryInfo, "moduleKey" | "name">;

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
   * Default: `defaultConcurrency()`. Output does not depend on it.
   */
  concurrency?: number;
  /** Capture only this shard of the (filtered) stories (see `inShard`). */
  shard?: Shard;
}

/**
 * One of `total` disjoint slices of a story list, numbered from 1 and written
 * `index/total` (e.g. `2/4`). CI's use of shards: the js-capture job in
 * .github/workflows/visual-tests.yml.
 */
export interface Shard {
  index: number;
  total: number;
}

export function parseShard(spec: string): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(spec);
  const index = Number(m?.[1]);
  const total = Number(m?.[2]);
  if (!m || total < 1 || index < 1 || index > total) {
    throw new Error(`bad shard "${spec}": expected index/total, e.g. 2/4`);
  }
  return { index, total };
}

/**
 * The items of `shard`: item i belongs to shard `i % total + 1`. Dealing
 * round-robin rather than in contiguous chunks spreads neighbors (often the
 * stories of one file, which cost about the same) across the shards, so the
 * shards take about as long as each other. Every shard must be handed the
 * items in the same order for the shards to be disjoint and complete.
 */
function inShard<T>(items: T[], shard: Shard | undefined): T[] {
  if (!shard) return items;
  return items.filter((_, i) => i % shard.total === shard.index - 1);
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
/** Where the clock is parked once the page and the story's module have loaded.
 *  They load with time running normally (a clock paused across module init
 *  can deadlock on a loader's own timer), then it jumps here and stops. */
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
export type LogLine = { err: boolean; text: string };
export type Log = (line: LogLine) => void;

export const printLine = ({ err, text }: LogLine) =>
  err ? console.error(text) : console.log(text);

/** Opens a fresh runner page in its own context (see `openRunnerPage`). */
export type OpenRunnerPage = (
  log: Log,
  contextOptions?: BrowserContextOptions
) => Promise<RunnerPage>;

/**
 * A running harness: a Vite server rooted at `harnessDir` plus one Chromium,
 * and a way to open a fresh runner page in its own context. Torn down when
 * `fn` settles. `fn` also gets the browser itself, for pages that are not
 * story renders (capture-docs-images' OG cards).
 */
export async function withHarness<T>(
  harnessDir: string,
  port: number,
  fn: (openRunnerPage: OpenRunnerPage, browser: Browser) => Promise<T>
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
    return await fn(
      (log, contextOptions) => openRunnerPage(b, port, log, contextOptions),
      b
    );
  } finally {
    await browser?.close();
    viteProc.kill();
  }
}

/** This tree's harness: the Vite root for capturing the current worktree. */
export const HARNESS_DIR = join(import.meta.dirname, "../harness");

/**
 * Run `fn` with a harness that renders the stories and library of commit
 * `sha`: a throwaway git worktree at `sha`, torn down when `fn` settles.
 *
 * The worktree's own `tests/harness` is replaced by THIS tree's harness
 * before anything runs. The harness is capture tooling, like this driver and
 * `normalize-dom.ts`: it speaks the driver's protocol (`__listStories__`,
 * `__loadStory__`, `__renderStory__`) and decides when a render is done. So
 * both sides of a capture-diff or capture-pixels run use the same tooling,
 * and only what the harness imports by relative path (`packages/`: the
 * library and its stories) comes from `sha`. A harness from `sha` would speak
 * that commit's protocol, which this driver need not understand, and a change
 * to the tooling would show up as a diff in every story.
 */
export async function withBaseRefHarness<T>(
  sha: string,
  fn: (harnessDir: string) => Promise<T>
): Promise<T> {
  const wtPath = join("/tmp", `gofish-base-ref-${process.pid}`);
  removeWorktree(wtPath);
  try {
    git(`git worktree add --detach "${wtPath}" ${sha}`);
    const harnessDir = join(wtPath, "tests/harness");
    rmSync(harnessDir, { recursive: true, force: true });
    cpSync(HARNESS_DIR, harnessDir, { recursive: true });

    // The worktree has no node_modules — install so its harness can run Vite.
    // --ignore-scripts skips husky/postinstall (not needed for a headless
    // render) and keeps the install fast; the pnpm store is shared so it's
    // mostly links.
    console.log(
      `Installing dependencies in the temp worktree (this can take a minute)...`
    );
    execSync("pnpm install --ignore-scripts", {
      cwd: wtPath,
      stdio: "inherit",
    });
    // --ignore-scripts also skips gofish-ir's `prepare` build, which the
    // harness needs to resolve the package. Build it explicitly.
    execSync("pnpm --filter gofish-ir build", {
      cwd: wtPath,
      stdio: "inherit",
    });

    return await fn(harnessDir);
  } finally {
    removeWorktree(wtPath);
  }
}

export type RunnerPage = { context: BrowserContext; page: Page };

/**
 * Open a fresh, fully isolated runner page. A new browser CONTEXT gets its own
 * renderer process, which is the reset that actually holds: a same-URL
 * `page.goto` reuses the renderer, and some of Chromium's font state survives
 * navigation inside one renderer (rendering + screenshot of certain stories
 * flipped `300 18px monospace` metrics for every later story in the run — see
 * header comment). Context startup is ~tens of ms, same order as the
 * navigation itself. Browser console errors go to `log`, so a story's errors
 * print with that story. `contextOptions` override the context defaults
 * (capture-docs-images asks for `deviceScaleFactor: 2`).
 */
async function openRunnerPage(
  browser: Browser,
  port: number,
  log: Log,
  contextOptions: BrowserContextOptions = {}
): Promise<RunnerPage> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...contextOptions,
  });
  // Install the fake clock BEFORE the first navigation so nothing in the
  // page ever sees the real one; it keeps running at real speed until
  // `renderStoryOnFakeClock` pauses it, so page load is unaffected (see
  // header comment).
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
  // Warm the webfonts while time still runs, so that a story's own
  // `await document.fonts.ready` resolves in a microtask rather than after
  // a real network fetch of unpredictable length.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return { context, page };
}

/**
 * List every story, in a runner page of its own: listing is the one thing
 * that loads every story module (see tests/harness/stories-runner.ts).
 */
export async function discoverStories(
  open: OpenRunnerPage
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

/**
 * Render one story into a fresh page from `openRunnerPage` and hand it the
 * fixed virtual budget, after which its DOM is ready to read: a still story
 * is fully drawn and an animated one sits on the same frame every run.
 * Resolves to the story's render error, or null. Throws on timeout, and when
 * the story's module fails to load.
 */
export async function renderStoryOnFakeClock(
  page: Page,
  story: StoryRef,
  label: string,
  log: Log
): Promise<string | null> {
  // Load the story's module while time still runs, as a page load does: a
  // module's init may wait on a timer of its own, which a paused clock
  // would never fire.
  await page.evaluate((s) => window.__loadStory__(s), story);
  // From here on time only moves when this process says so.
  await page.clock.pauseAt(CLOCK_PAUSE_AT);

  // Kick the render off but do NOT await it: the runner's tail (a rAF
  // plus a 100ms settle) can only complete once the paused clock is
  // given virtual time below, so awaiting here would deadlock.
  await page.evaluate((s) => {
    void window.__renderStory__(s);
  }, story);

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
          `Timed out after 15000ms waiting for ${label} to render`
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
  return renderError ? String(renderError) : null;
}

/** Render one story in `page` and write its output. Throws on timeout. */
async function captureStory(
  page: Page,
  story: StoryInfo,
  outDir: string,
  screenshot: boolean,
  log: Log
): Promise<StoryOutcome> {
  const path = storyToPath(story.title, story.name);

  const renderError = await renderStoryOnFakeClock(
    page,
    story,
    `${story.title}/${story.name}`,
    log
  );
  if (renderError) return { kind: "failed", path, error: renderError };

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

/** The `CAPTURE_CONCURRENCY` env var if set, else
 *  `min(4, os.availableParallelism())`. */
export function defaultConcurrency(): number {
  const env = Number(process.env.CAPTURE_CONCURRENCY);
  if (Number.isInteger(env) && env > 0) return env;
  return Math.max(1, Math.min(4, availableParallelism()));
}

/**
 * Run `run` over `items` on a pool of `concurrency` workers and return the
 * results in item order. Each item's log lines are buffered and printed in
 * item order too, once every item before it has printed, so neither the log
 * nor the results depend on which item finished first.
 */
export async function runInOrder<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<{ result: R; lines: LogLine[] }>
): Promise<R[]> {
  const done: { result: R; lines: LogLine[] }[] = [];
  let printed = 0;
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      done[i] = await run(items[i], i);
      while (printed < items.length && done[printed]) {
        for (const line of done[printed].lines) printLine(line);
        printed++;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, items.length)) },
      worker
    )
  );
  return done.map(({ result }) => result);
}

/**
 * Capture (a subset of) stories from a harness into `outDir`.
 *
 * Starts its own Vite server + Playwright browser, captures, then tears both
 * down before returning. Safe to call twice in one process with distinct ports.
 *
 * Stories run on a pool of `concurrency` workers (`runInOrder`). That is safe
 * because nothing is shared between two stories in flight: each gets its own
 * browser context (own renderer, so no font-metric state crosses over — see
 * header comment) and each context has its own fake clock, so one story's
 * virtual budget is never advanced by another's.
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
    shard,
  } = opts;

  return withHarness(harnessDir, port, async (open) => {
    if (cleanOutDir && existsSync(outDir)) {
      rmSync(outDir, { recursive: true });
    }
    mkdirSync(outDir, { recursive: true });

    const allStories = await discoverStories(open);
    const needle = filter?.toLowerCase().trim();
    const matching = needle
      ? allStories.filter((s) => {
          const hay = `${s.title}/${s.name}`.toLowerCase();
          return hay.includes(needle) || s.id.includes(needle);
        })
      : allStories;
    const stories = inShard(matching, shard);

    console.log(
      `Found ${allStories.length} stories` +
        (needle ? `, ${matching.length} matching "${needle}"` : "") +
        (shard
          ? `, ${stories.length} in shard ${shard.index}/${shard.total}`
          : "") +
        "\n"
    );

    const run = async (
      story: StoryInfo
    ): Promise<{ result: StoryOutcome; lines: LogLine[] }> => {
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
      return { result: outcome, lines };
    };
    const outcomes = await runInOrder(stories, concurrency, run);

    const result: CaptureResult = {
      captured: [],
      failed: [],
      skipped: [],
      written: [],
    };
    for (const outcome of outcomes) {
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

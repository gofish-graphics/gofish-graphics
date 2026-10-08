/**
 * Performance benchmark driver.
 *
 * Drives three measurement modes in one Playwright session, all against the
 * perf-instrumented engine (the harness Vite server compiles
 * `__GOFISH_PERF_INSTRUMENTATION__` as `true`; we flip the runtime flag on with
 * an init script). Output is a single `tests/tmp/bench/results.json` (+ `.csv`)
 * consumed by the dogfooded plot stories and the CI delta comment.
 *
 *   1. examples-js  — render every Storybook story; record per-pass engine time.
 *                     The headline "how fast are real JS examples" corpus.
 *   2. examples-py  — render every Python story through the derive-server RPC
 *                     path; record per-pass engine time PLUS the Python-only
 *                     overhead (warm IR /load serialize, derive round-trips,
 *                     spec deserialize) = e2e − sum(engine passes). A global +
 *                     per-story warmup primes the interpreter so loadMs is the
 *                     steady-state per-call cost, not a one-time cold import.
 *   3. synthetic    — sweep a scale parameter across the micro-benchmark
 *                     families (tests/bench/specs.ts); the thesis asymptotics.
 *
 * The recognized per-pass labels are resolve / axes / embed / solve / lower /
 * paint / fonts (see packages/gofish-graphics/src/ast/perf.ts).
 *
 * Usage:
 *   tsx scripts/bench.ts [mode] [--filter <substr>] [--quick]
 *     mode: all (default) | synthetic | examples-js | examples-py
 *     --quick: tiny sweeps / few examples for a local smoke test
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { spawn, type ChildProcess } from "child_process";
import {
  writeFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "fs";
import { join, relative, resolve as resolvePath } from "path";
import { execSync } from "child_process";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import {
  serveStatic,
  loadRulerManifest,
  geomean,
  type StaticServer,
} from "./ruler";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "../..");
const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const PYTHON_STORIES_DIR = join(TESTS_DIR, "python-stories");
const OUT_DIR = join(TESTS_DIR, "tmp/bench");
const HARNESS_PORT = 3010;
const DERIVE_SERVER_PORT = 3011;
// Second harness (base checkout) for interleaved same-runner A/B (--ab-dir).
const AB_HARNESS_PORT = 3012;

const PASS_LABELS = [
  "resolve",
  "axes",
  "embed",
  "solve",
  "lower",
  "paint",
  "fonts",
];

// Invariant: the "engine total" EXCLUDES `fonts` (webfont-readiness await, not
// engine work) so it agrees with bench-report.ts's PASSES; `fonts` is still
// reported as its own per-pass label.
const ENGINE_PASS_LABELS = PASS_LABELS.filter((l) => l !== "fonts");

const argv = process.argv.slice(2);
const QUICK = argv.includes("--quick");
const filterIdx = argv.indexOf("--filter");
// Parse positionally: exclude the --filter value by index (a filter like `Bar`
// must not be mistaken for the MODE). Lowercase only for matching.
const filterValueIdx = filterIdx >= 0 ? filterIdx + 1 : -1;
const FILTER = filterIdx >= 0 ? argv[filterValueIdx] : undefined;
const FILTER_LC = FILTER?.toLowerCase();
const abDirIdx = argv.indexOf("--ab-dir");
const abOutIdx = argv.indexOf("--ab-out");
const rulerIdx = argv.indexOf("--ruler");
// Flag values must not be parsed as the positional MODE.
const flagValueIdxs = new Set(
  [filterIdx, abDirIdx, abOutIdx, rulerIdx]
    .filter((i) => i >= 0)
    .map((i) => i + 1)
);
const MODE =
  argv.find((a, i) => !a.startsWith("--") && !flagValueIdxs.has(i)) ?? "all";

// --ruler <dir>: hermetic reference workload measured in the same browser (any
// mode). --ab-dir <path>: base checkout to interleave HEAD/base against, one
// sample each alternating within the same loop (synthetic mode). --ab-out:
// where the base results.json lands.
const RULER_DIR = rulerIdx >= 0 ? argv[rulerIdx + 1] : undefined;
const AB_DIR = abDirIdx >= 0 ? argv[abDirIdx + 1] : undefined;
const AB_OUT =
  abOutIdx >= 0 ? argv[abOutIdx + 1] : join(OUT_DIR, "results-base.json");

// Sampling discipline: a couple of warmups (JIT, font load), then time-budgeted
// adaptive measurement — keep sampling until the budget elapses or we hit the
// sample cap, never fewer than the floor. Medians shrug off GC/scheduler spikes.
const WARMUP = QUICK ? 1 : 2;
const MEASURE_BUDGET_MS = QUICK ? 300 : 1500;
const MEASURE_MIN = QUICK ? 2 : 4;
const MEASURE_MAX = 20;

// Synthetic sweep. Capped to keep the DOM/paint from OOMing.
const COUNT_NS = QUICK
  ? [10, 100, 1000]
  : [10, 30, 100, 300, 1000, 3000, 10000, 30000];
const NEST_DEPTHS = QUICK ? [2, 8] : [1, 2, 4, 8, 16, 32, 64, 128];
// A measured render slower than this ends its synthetic family: the point is
// healthy but too slow to sample further, and the asymptote is already caught.
const PER_RENDER_CEILING_MS = 20_000;

// Timeout for any one `page.evaluate` (a render, a gc): past it the page is
// stuck, not slow. The slowest healthy render (a bird-migration panel) is ~10s.
// A timeout ends its leg's unit of work, never the run (see `orTimeout`).
const RENDER_BUDGET_MS = 60_000;

type Labels = Record<string, number>;
type Stat = { median: number; min: number; p95: number; n: number };

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

const pct = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length)
  );
  return sorted[idx];
};

const stat = (xs: number[]): Stat => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    median: pct(s, 50),
    min: s[0] ?? 0,
    p95: pct(s, 95),
    n: s.length,
  };
};

/** Reduce an array of per-run label maps to a per-label Stat over the runs. */
const labelStats = (runs: Labels[]): Record<string, Stat> => {
  const keys = new Set<string>();
  for (const r of runs) for (const k of Object.keys(r)) keys.add(k);
  const out: Record<string, Stat> = {};
  for (const k of keys) out[k] = stat(runs.map((r) => r[k] ?? 0));
  return out;
};

/** Engine total: sum of measured passes EXCLUDING `fonts` (see invariant above). */
const sumPasses = (labels: Labels): number =>
  ENGINE_PASS_LABELS.reduce((acc, k) => acc + (labels[k] ?? 0), 0);

type Counts = { nodes: number; displayItems: number };

/** A render past RENDER_BUDGET_MS: its page is stuck, not slow. */
class RenderTimeout extends Error {}

/** `work`, or throw RenderTimeout if it hasn't settled within RENDER_BUDGET_MS.
 *  The abandoned `work` is left to reject when its page closes. */
async function withinBudget<T>(work: Promise<T>): Promise<T> {
  work.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeout()), RENDER_BUDGET_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const TIMED_OUT = Symbol("timed out");

/**
 * `work()`, or TIMED_OUT if one of its renders went over RENDER_BUDGET_MS. Every
 * leg handles a timeout the same way: it ends that leg's unit of work (a story,
 * a synthetic family), never the run. `reopen` replaces the stuck page(s) first,
 * so the abandoned render can't bleed into the next unit.
 */
async function orTimeout<T>(
  work: () => Promise<T>,
  reopen: () => Promise<void>
): Promise<T | typeof TIMED_OUT> {
  try {
    return await work();
  } catch (err) {
    if (!(err instanceof RenderTimeout)) throw err;
    await reopen();
    return TIMED_OUT;
  }
}

/** Log a page's uncaught errors under DEBUG. */
function logPageErrors(page: Page, tag = "pageerror"): void {
  page.on("pageerror", (e) => {
    if (process.env.DEBUG) console.error(`[${tag}] ${e.message}`);
  });
}

/** A fresh page at `url`, once `ready()` holds in it. */
async function openPage(
  context: BrowserContext,
  url: string,
  ready: () => boolean,
  tag?: string
): Promise<Page> {
  const page = await context.newPage();
  logPageErrors(page, tag);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(ready, undefined, { timeout: 30_000 });
  return page;
}

/** Ask Chromium to GC between samples (needs --js-flags=--expose-gc); no-op if absent. */
const gc = async (page: Page): Promise<void> => {
  try {
    await withinBudget(page.evaluate(() => (globalThis as any).gc?.()));
  } catch (err) {
    if (err instanceof RenderTimeout) throw err;
    /* expose-gc not available */
  }
};

type SampleOutcome<T> = { ok: true; value: T } | { ok: false };

/**
 * Warmup, then adaptive measured sampling: keep going until the time budget
 * elapses or the sample cap is hit, never fewer than the floor. `abortIf`
 * (synthetic per-render ceiling) breaks immediately, even below the floor.
 * Returns null if warmup failed (story/point unrenderable).
 */
async function sampleLoop<T>(
  page: Page,
  runOne: () => Promise<SampleOutcome<T>>,
  abortIf?: (v: T) => boolean
): Promise<T[] | null> {
  for (let i = 0; i < WARMUP; i++) {
    const w = await runOne();
    if (!w.ok) return null;
    await gc(page);
  }
  const samples: T[] = [];
  const start = performance.now();
  while (
    samples.length < MEASURE_MIN ||
    (performance.now() - start < MEASURE_BUDGET_MS &&
      samples.length < MEASURE_MAX)
  ) {
    const r = await runOne();
    if (!r.ok) break;
    samples.push(r.value);
    await gc(page);
    if (abortIf?.(r.value)) break;
  }
  return samples;
}

/** First 12 hex of sha256 over a file's bytes — a story's longitudinal series
 *  key. An edit changes the hash and starts a fresh series in the trend. */
function specHashOf(filePath: string): string | undefined {
  try {
    return createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex")
      .slice(0, 12);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

function startHarness(
  prodBuild: boolean,
  harnessDir = HARNESS_DIR,
  port = HARNESS_PORT
): ChildProcess {
  const proc = spawn(
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
      // Own process group so `killProc` can tear down the whole tree — a plain
      // `.kill()` only signals the `npx` wrapper, orphaning the `vite` grandchild
      // that holds the stdout/stderr pipes (which keeps THIS process alive past
      // "benchmark complete") and the harness port (which the later same-runner
      // bench:plots step reuses).
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: "development",
        // Cross-origin isolation for 5µs performance.now(); prod-build alias.
        GOFISH_BENCH: "1",
        ...(prodBuild ? { GOFISH_BENCH_PROD: "1" } : {}),
      },
    }
  );
  proc.stderr?.on("data", (d) => {
    if (process.env.DEBUG) process.stderr.write(d);
  });
  return proc;
}

function startDeriveServer(): ChildProcess {
  const proc = spawn(
    "python3",
    [join(TESTS_DIR, "scripts/derive-server.py"), String(DERIVE_SERVER_PORT)],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true }
  );
  proc.stderr?.on("data", (d) => {
    if (process.env.DEBUG) process.stderr.write(d);
  });
  return proc;
}

/** Kill a spawned server and its whole process group (the `npx`/`python3`
 *  wrapper plus the real `vite`/server grandchild). A plain `proc.kill()` only
 *  reaches the direct child, orphaning the grandchild — which holds the piped
 *  stdio fds that otherwise keep this process alive after the run finishes. */
function killProc(proc: ChildProcess | null | undefined): void {
  if (!proc || proc.pid === undefined) return;
  try {
    // Negative pid → the process group (created via `detached: true`).
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Mode 1: ecological JS examples
// ---------------------------------------------------------------------------

type ExampleResult = {
  id: string;
  title: string;
  name: string;
  specHash?: string;
  passes: Record<string, Stat>;
  totalMs: Stat;
  wallMs: Stat; // in-page wall through the rAF flush — catches un-instrumented time
  counts?: Counts;
};

type JsStoryInfo = {
  id: string;
  title: string;
  name: string;
  moduleKey: string;
};

/** An example story that produced no measurement, and why. */
export type SkippedExample = {
  id: string;
  title: string;
  name: string;
  // `timeout`: a render went over RENDER_BUDGET_MS. `error`: it failed.
  reason: "timeout" | "error";
};

/** A synthetic point or ruler point whose render went over RENDER_BUDGET_MS. */
export type SkippedPoint = { family: string; n: number; reason: "timeout" };

/** A Python story whose render went over RENDER_BUDGET_MS. */
type SkippedPyExample = { path: string; reason: "timeout" };

async function benchExamplesJs(
  context: BrowserContext
): Promise<{ results: ExampleResult[]; skipped: SkippedExample[] }> {
  const open = () =>
    openPage(
      context,
      `http://localhost:${HARNESS_PORT}/stories-runner.html`,
      () => (window as any).__STORIES_RUNNER_READY__ === true
    );
  let page = await open();

  let stories = (await page.evaluate(() =>
    (window as any).__listStories__()
  )) as JsStoryInfo[];
  // The bench must not benchmark its own dogfooded plot stories.
  stories = stories.filter((s) => !s.id.startsWith("benchmarks--"));
  if (FILTER_LC)
    stories = stories.filter(
      (s) =>
        s.id.includes(FILTER_LC) ||
        `${s.title}/${s.name}`.toLowerCase().includes(FILTER_LC)
    );
  if (QUICK) stories = stories.slice(0, 6);

  console.log(`\n[examples-js] ${stories.length} stories\n`);
  const results: ExampleResult[] = [];
  const skipped: SkippedExample[] = [];

  for (const story of stories) {
    process.stdout.write(`  ${story.title}/${story.name} ... `);
    const storyStart = performance.now();
    const elapsed = () =>
      `(${((performance.now() - storyStart) / 1000).toFixed(1)}s)`;
    type Sample = { labels: Labels; wallMs: number; counts?: Counts };
    const samples = await orTimeout(
      () =>
        sampleLoop<Sample>(page, async () => {
          const r = await withinBudget(
            page.evaluate(async (id) => {
              const w = window as any;
              w.__GOFISH_PERF__ = { enabled: true, current: null };
              w.__STORY_RENDER_WALL_MS__ = 0;
              const success = await w.__renderStory__(id);
              if (!success)
                return {
                  ok: false as const,
                  labels: {} as Record<string, number>,
                  wallMs: 0,
                };
              return {
                ok: true as const,
                labels: { ...(w.__GOFISH_PERF__?.current?.labels ?? {}) },
                wallMs: (w.__STORY_RENDER_WALL_MS__ as number) ?? 0,
                counts: w.__GOFISH_PERF__?.current?.counts as
                  | Counts
                  | undefined,
              };
            }, story.id)
          );
          if (!r.ok) return { ok: false };
          return {
            ok: true,
            value: { labels: r.labels, wallMs: r.wallMs, counts: r.counts },
          };
        }),
      async () => {
        await page.close();
        page = await open();
      }
    );
    if (samples === TIMED_OUT || !samples || samples.length === 0) {
      const reason = samples === TIMED_OUT ? "timeout" : "error";
      console.log(`${reason === "timeout" ? "TIMEOUT" : "SKIP"} ${elapsed()}`);
      skipped.push({
        id: story.id,
        title: story.title,
        name: story.name,
        reason,
      });
      continue;
    }
    // moduleKey is relative to tests/harness; resolve to hash the source file.
    const specHash = specHashOf(resolvePath(HARNESS_DIR, story.moduleKey));
    results.push({
      id: story.id,
      title: story.title,
      name: story.name,
      specHash,
      passes: labelStats(samples.map((s) => s.labels)),
      totalMs: stat(samples.map((s) => sumPasses(s.labels))),
      wallMs: stat(samples.map((s) => s.wallMs)),
      counts: samples[samples.length - 1].counts,
    });
    console.log(
      `${results[results.length - 1].totalMs.median.toFixed(2)}ms ${elapsed()}`
    );
  }
  await page.close();
  return { results, skipped };
}

// ---------------------------------------------------------------------------
// Mode 2: ecological Python examples (via derive-server RPC path)
// ---------------------------------------------------------------------------

type PythonStory = {
  module: string;
  function: string;
  path: string;
  file: string;
};

function discoverPythonStories(): PythonStory[] {
  const stories: PythonStory[] = [];
  const scan = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith("__")) {
        scan(
          join(dir, entry.name),
          prefix ? `${prefix}/${entry.name}` : entry.name
        );
      } else if (entry.name.startsWith("test_") && entry.name.endsWith(".py")) {
        const content = readFileSync(join(dir, entry.name), "utf-8");
        const re = /^def\s+(story_\w+)\s*\(/gm;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const base = entry.name
            .replace(/^test_/, "")
            .replace(/\.py$/, "")
            .replace(/_/g, "-");
          const name = m[1].replace(/^story_/, "").replace(/_/g, "-");
          stories.push({
            module: relative(TESTS_DIR, join(dir, entry.name))
              .replace(/\.py$/, "")
              .replace(/\//g, ".")
              .replace(/-/g, "_"),
            function: m[1],
            path: prefix ? `${prefix}/${base}--${name}` : `${base}--${name}`,
            file: relative(TESTS_DIR, join(dir, entry.name)),
          });
        }
      }
    }
  };
  scan(PYTHON_STORIES_DIR, "");
  return stories;
}

type PythonResult = {
  path: string;
  specHash?: string;
  passes: Record<string, Stat>;
  totalMs: Stat; // engine passes only (same JS engine)
  loadMs: Stat; // warm /load: module re-exec + data construct + IR serialize
  e2eMs: Stat; // inject → render-complete (deserialize + derive RPC + engine)
  overheadMs: Stat; // e2e − engine passes: the Python-path tax
  counts?: Counts;
};

async function benchExamplesPy(
  context: BrowserContext
): Promise<{ results: PythonResult[]; skipped: SkippedPyExample[] }> {
  let stories = discoverPythonStories();
  if (FILTER_LC)
    stories = stories.filter((s) => s.path.toLowerCase().includes(FILTER_LC));
  if (QUICK) stories = stories.slice(0, 6);

  console.log(`\n[examples-py] ${stories.length} stories\n`);

  // The Python path renders deserialized IR via the harness index page, which
  // defines `__renderChart__` (the stories-runner / bench-runner pages don't).
  const open = () =>
    openPage(
      context,
      `http://localhost:${HARNESS_PORT}/`,
      () => typeof (window as any).__renderChart__ === "function"
    );
  let page = await open();

  // Global interpreter warmup: the first /load of the whole run pays a one-time
  // ~1s cost to import pandas / vega_datasets / gofish into the derive-server
  // process. That is NOT a per-render cost (a real Python session imports once),
  // so prime it here with a throwaway /load and discard it — leaving the
  // measured `loadMs` to reflect steady-state work (module re-exec + data
  // construction + IR serialize) against an already-warm interpreter.
  try {
    process.stdout.write("  (warming Python interpreter) ... ");
    await fetch(`http://localhost:${DERIVE_SERVER_PORT}/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storyFile: join(TESTS_DIR, stories[0].file),
        function: stories[0].function,
        pythonStoriesDir: PYTHON_STORIES_DIR,
      }),
    });
    console.log("done");
  } catch {
    console.log("skipped");
  }

  // sampleLoop's warmup phase already discards ≥1 per-story /load, so the
  // measured loads run warm: the first /load of a story re-execs its module and
  // loads/caches its dataset; subsequent ones reuse the cache. That is what
  // makes loadMs the steady-state per-call cost rather than a cold first hit.
  const results: PythonResult[] = [];
  const skipped: SkippedPyExample[] = [];

  type PySample = {
    labels: Labels;
    loadMs: number;
    e2eMs: number;
    counts?: Counts;
  };

  for (const story of stories) {
    process.stdout.write(`  ${story.path} ... `);
    const samples = await orTimeout(
      () =>
        sampleLoop<PySample>(page, async () => {
          // /load: import the story + serialize IR + register derives (Python work).
          // perf.now() (µs resolution) — the ~6ms quantity is lost under Date.now().
          const tLoad = performance.now();
          let ir: any;
          try {
            const resp = await fetch(
              `http://localhost:${DERIVE_SERVER_PORT}/load`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  storyFile: join(TESTS_DIR, story.file),
                  function: story.function,
                  pythonStoriesDir: PYTHON_STORIES_DIR,
                }),
              }
            );
            if (!resp.ok) return { ok: false };
            ir = await resp.json();
          } catch {
            return { ok: false };
          }
          const loadDelta = performance.now() - tLoad;

          // Only the single-chart path is benchmarked here; layer/raw-mark
          // are skipped (they don't represent the common per-example case).
          if (ir?.ir?.type === "layer" || ir?.ir?.type === "raw-mark") {
            return { ok: false };
          }

          const deriveServerUrl =
            ir.deriveIds?.length > 0
              ? `http://localhost:${DERIVE_SERVER_PORT}`
              : undefined;
          const spec = { ...ir, deriveServerUrl };

          const r = await withinBudget(
            page.evaluate(async (s) => {
              const w = window as any;
              w.__GOFISH_PERF__ = { enabled: true, current: null };
              const root = document.getElementById("gofish-harness-root");
              if (root) root.innerHTML = "";
              w.__GOFISH_RENDER_COMPLETE__ = false;
              w.__GOFISH_RENDER_ERROR__ = null;
              const t0 = performance.now();
              w.__renderChart__(s);
              // Poll with setTimeout(0), not a fixed 5ms tick — the old quantization
              // added 0–5ms of slop, the same order as the Python tax being measured.
              const deadline = performance.now() + 30000;
              while (
                !w.__GOFISH_RENDER_COMPLETE__ &&
                performance.now() < deadline
              ) {
                await new Promise((res) => setTimeout(res, 0));
                if (w.__GOFISH_RENDER_ERROR__) break;
              }
              const wallMs = performance.now() - t0;
              return {
                err: w.__GOFISH_RENDER_ERROR__ as string | null,
                wallMs,
                labels: { ...(w.__GOFISH_PERF__?.current?.labels ?? {}) },
                counts: w.__GOFISH_PERF__?.current?.counts as
                  | Counts
                  | undefined,
              };
            }, spec)
          );

          if (r.err) return { ok: false };
          return {
            ok: true,
            value: {
              labels: r.labels,
              loadMs: loadDelta,
              e2eMs: r.wallMs,
              counts: r.counts,
            },
          };
        }),
      async () => {
        await page.close();
        page = await open();
      }
    );

    if (samples === TIMED_OUT) {
      console.log("TIMEOUT");
      skipped.push({ path: story.path, reason: "timeout" });
      continue;
    }
    if (!samples || samples.length === 0) {
      console.log("SKIP");
      continue;
    }
    const passRuns = samples.map((s) => s.labels);
    results.push({
      path: story.path,
      specHash: specHashOf(join(TESTS_DIR, story.file)),
      passes: labelStats(passRuns),
      totalMs: stat(passRuns.map(sumPasses)),
      loadMs: stat(samples.map((s) => s.loadMs)),
      e2eMs: stat(samples.map((s) => s.e2eMs)),
      overheadMs: stat(
        samples.map((s) => Math.max(0, s.e2eMs - sumPasses(s.labels)))
      ),
      counts: samples[samples.length - 1].counts,
    });
    const last = results[results.length - 1];
    console.log(
      `engine ${last.totalMs.median.toFixed(2)}ms · py-overhead ${last.overheadMs.median.toFixed(2)}ms`
    );
  }
  await page.close();
  return { results, skipped };
}

// ---------------------------------------------------------------------------
// Mode 3: synthetic asymptotics
// ---------------------------------------------------------------------------

type SyntheticPoint = {
  family: string;
  n: number;
  passes: Record<string, Stat>;
  totalMs: Stat;
  wallMs: Stat;
  batch: number; // renders folded per sample (>1 only for sub-ms points)
  counts?: Counts;
};

type SyntheticMeasure = {
  passes: Record<string, Stat>;
  totalMs: Stat;
  wallMs: Stat;
  batch: number;
  counts?: Counts;
};

type SyntheticSample = {
  labels: Labels;
  wallMs: number;
  batch: number;
  counts?: Counts;
};

/** One synthetic render on `page` via the harness's __runSyntheticBench__. */
async function evalSyntheticSample(
  page: Page,
  family: string,
  n: number
): Promise<SyntheticSample | null> {
  try {
    return (await withinBudget(
      page.evaluate(([f, k]) => (window as any).__runSyntheticBench__(f, k), [
        family,
        n,
      ] as [string, number])
    )) as SyntheticSample;
  } catch (err) {
    if (err instanceof RenderTimeout) throw err;
    return null;
  }
}

const toSyntheticMeasure = (samples: SyntheticSample[]): SyntheticMeasure => ({
  passes: labelStats(samples.map((s) => s.labels)),
  totalMs: stat(samples.map((s) => sumPasses(s.labels))),
  wallMs: stat(samples.map((s) => s.wallMs)),
  batch: samples[samples.length - 1].batch,
  counts: samples[samples.length - 1].counts,
});

async function runSyntheticPoint(
  page: Page,
  family: string,
  n: number
): Promise<SyntheticMeasure | null> {
  const samples = await sampleLoop<SyntheticSample>(
    page,
    async () => {
      const sample = await evalSyntheticSample(page, family, n);
      return sample ? { ok: true, value: sample } : { ok: false };
    },
    // Per-render ceiling: bail immediately once a single (per-render) wall blows
    // past the budget, so a giant n doesn't run the full sample floor.
    (v) => v.wallMs > PER_RENDER_CEILING_MS
  );
  if (!samples || samples.length === 0) return null;
  return toSyntheticMeasure(samples);
}

/**
 * Interleaved same-runner A/B for one point: warm up both pages, then alternate
 * ONE HEAD sample and ONE base sample inside a single time-budgeted loop, so any
 * thermal/scheduler drift hits both engines equally (kills the minutes-apart
 * drift of benching the two phases separately). Both sides get identical sampling.
 */
async function runSyntheticPointAB(
  headPage: Page,
  basePage: Page,
  family: string,
  n: number
): Promise<{ head: SyntheticMeasure; base: SyntheticMeasure } | null> {
  for (let i = 0; i < WARMUP; i++) {
    const a = await evalSyntheticSample(headPage, family, n);
    const b = await evalSyntheticSample(basePage, family, n);
    if (!a || !b) return null;
    await gc(headPage);
    await gc(basePage);
  }
  const headS: SyntheticSample[] = [];
  const baseS: SyntheticSample[] = [];
  const start = performance.now();
  while (
    headS.length < MEASURE_MIN ||
    (performance.now() - start < MEASURE_BUDGET_MS &&
      headS.length < MEASURE_MAX)
  ) {
    const a = await evalSyntheticSample(headPage, family, n);
    if (!a) break;
    headS.push(a);
    await gc(headPage);
    const b = await evalSyntheticSample(basePage, family, n);
    if (!b) break;
    baseS.push(b);
    await gc(basePage);
    if (a.wallMs > PER_RENDER_CEILING_MS || b.wallMs > PER_RENDER_CEILING_MS)
      break;
  }
  if (headS.length === 0 || baseS.length === 0) return null;
  return { head: toSyntheticMeasure(headS), base: toSyntheticMeasure(baseS) };
}

/** A fresh page on the synthetic bench runner served at `port`. */
function openBenchRunner(context: BrowserContext, port: number, tag?: string) {
  return openPage(
    context,
    `http://localhost:${port}/bench-runner.html`,
    () => (window as any).__BENCH_RUNNER_READY__ === true,
    tag
  );
}

/** The (family, n) sweep points, in order — shared by the plain and A/B paths. */
function syntheticSweep(families: { count: string[]; nest: boolean }): {
  family: string;
  n: number;
}[] {
  const out: { family: string; n: number }[] = [];
  const countFamilies = FILTER_LC
    ? families.count.filter((f) => f.includes(FILTER_LC))
    : families.count;
  for (const family of countFamilies)
    for (const n of COUNT_NS) out.push({ family, n });
  if (families.nest && (!FILTER_LC || "nest".includes(FILTER_LC)))
    for (const depth of NEST_DEPTHS) out.push({ family: "nest", n: depth });
  return out;
}

type SyntheticRun = { points: SyntheticPoint[]; skipped: SkippedPoint[] };

/**
 * The synthetic sweep. A family ends at its first point that errors, goes over
 * PER_RENDER_CEILING_MS (measured, then too slow to sample further), or times
 * out (recorded in `skipped`).
 */
async function benchSynthetic(context: BrowserContext): Promise<SyntheticRun> {
  const open = () => openBenchRunner(context, HARNESS_PORT);
  let page = await open();
  const families = (await page.evaluate(() =>
    (window as any).__listSyntheticFamilies__()
  )) as { count: string[]; nest: boolean };

  const points: SyntheticPoint[] = [];
  const skipped: SkippedPoint[] = [];
  const stopped = new Set<string>();
  let curFamily = "";
  for (const { family, n } of syntheticSweep(families)) {
    if (stopped.has(family)) continue;
    if (family !== curFamily) {
      curFamily = family;
      console.log(`\n[synthetic] family "${family}"`);
    }
    process.stdout.write(`  n=${n} ... `);
    const r = await orTimeout(
      () => runSyntheticPoint(page, family, n),
      async () => {
        await page.close();
        page = await open();
      }
    );
    if (r === TIMED_OUT) {
      console.log("TIMEOUT (stopping family)");
      skipped.push({ family, n, reason: "timeout" });
      stopped.add(family);
      continue;
    }
    if (!r) {
      console.log("ERROR (stopping family)");
      stopped.add(family);
      continue;
    }
    points.push({ family, n, ...r });
    console.log(
      `engine ${r.totalMs.median.toFixed(2)}ms · wall ${r.wallMs.median.toFixed(2)}ms`
    );
    if (r.wallMs.median > PER_RENDER_CEILING_MS) {
      console.log(
        `  (n=${n} exceeded ${PER_RENDER_CEILING_MS}ms ceiling — stopping family)`
      );
      stopped.add(family);
    }
  }
  await page.close();
  return { points, skipped };
}

/**
 * Interleaved same-runner A/B synthetic sweep: HEAD on HARNESS_PORT vs base on
 * AB_HARNESS_PORT, alternating one sample each per point. Both engines see
 * identical specs and identical sampling; the delta is free of cross-machine
 * variance AND of the thermal drift of benching them minutes apart. Families
 * end as in `benchSynthetic`; a timed-out point is skipped for both sides.
 */
async function benchSyntheticAB(context: BrowserContext): Promise<{
  head: SyntheticPoint[];
  base: SyntheticPoint[];
  skipped: SkippedPoint[];
}> {
  const openHead = () => openBenchRunner(context, HARNESS_PORT);
  const openBase = () =>
    openBenchRunner(context, AB_HARNESS_PORT, "base pageerror");
  let headPage = await openHead();
  let basePage = await openBase();
  const families = (await headPage.evaluate(() =>
    (window as any).__listSyntheticFamilies__()
  )) as { count: string[]; nest: boolean };

  const head: SyntheticPoint[] = [];
  const base: SyntheticPoint[] = [];
  const skipped: SkippedPoint[] = [];
  const stopped = new Set<string>();
  let curFamily = "";
  for (const { family, n } of syntheticSweep(families)) {
    if (stopped.has(family)) continue;
    if (family !== curFamily) {
      curFamily = family;
      console.log(`\n[synthetic A/B] family "${family}"`);
    }
    process.stdout.write(`  n=${n} ... `);
    const r = await orTimeout(
      () => runSyntheticPointAB(headPage, basePage, family, n),
      // Either page may be the stuck one; both are cheap to replace.
      async () => {
        await headPage.close();
        await basePage.close();
        headPage = await openHead();
        basePage = await openBase();
      }
    );
    if (r === TIMED_OUT) {
      console.log("TIMEOUT (stopping family)");
      skipped.push({ family, n, reason: "timeout" });
      stopped.add(family);
      continue;
    }
    if (!r) {
      console.log("ERROR (stopping family)");
      stopped.add(family);
      continue;
    }
    head.push({ family, n, ...r.head });
    base.push({ family, n, ...r.base });
    console.log(
      `HEAD ${r.head.totalMs.median.toFixed(2)}ms · base ${r.base.totalMs.median.toFixed(2)}ms`
    );
    if (
      r.head.wallMs.median > PER_RENDER_CEILING_MS ||
      r.base.wallMs.median > PER_RENDER_CEILING_MS
    )
      stopped.add(family);
  }
  await headPage.close();
  await basePage.close();
  return { head, base, skipped };
}

// ---------------------------------------------------------------------------
// Ruler leg: the hermetic reference workload, measured in this same browser
// ---------------------------------------------------------------------------

type RulerMeta = {
  version: string;
  // Geomean of the point medians — the run's normalization divisor.
  factorMs: number;
  points: { family: string; n: number; wallMs: Stat }[];
  // Points whose render timed out; left out of `points` and `factorMs`.
  skipped?: SkippedPoint[];
};

async function benchRuler(
  browser: Browser,
  dir: string
): Promise<RulerMeta | null> {
  let manifest;
  try {
    manifest = loadRulerManifest(dir);
  } catch {
    console.warn(`[ruler] no manifest.json in ${dir} — skipping ruler leg`);
    return null;
  }
  const srv = await serveStatic(dir);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const open = () =>
      openPage(
        context,
        `http://localhost:${srv.port}/`,
        () => (window as any).__RULER_READY__ === true
      );
    let page = await open();
    console.log(
      `\n[ruler] v${manifest.version} (${manifest.points.length} points)`
    );
    const points: RulerMeta["points"] = [];
    const skipped: SkippedPoint[] = [];
    for (const pt of manifest.points) {
      process.stdout.write(`  ${pt.family} n=${pt.n} ... `);
      const samples = await orTimeout(
        () =>
          sampleLoop<number>(page, async () => {
            try {
              const r = (await withinBudget(
                page.evaluate(
                  ([f, n]) => (window as any).__runRulerPoint__(f, n),
                  [pt.family, pt.n] as [string, number]
                )
              )) as { wallMs: number };
              return { ok: true, value: r.wallMs };
            } catch (err) {
              if (err instanceof RenderTimeout) throw err;
              return { ok: false };
            }
          }),
        async () => {
          await page.close();
          page = await open();
        }
      );
      if (samples === TIMED_OUT) {
        console.log("TIMEOUT");
        skipped.push({ family: pt.family, n: pt.n, reason: "timeout" });
        continue;
      }
      if (!samples || samples.length === 0) {
        console.log("SKIP");
        continue;
      }
      const s = stat(samples);
      points.push({ family: pt.family, n: pt.n, wallMs: s });
      console.log(`${s.median.toFixed(2)}ms`);
    }
    await context.close();
    const factorMs = geomean(points.map((p) => p.wallMs.median));
    console.log(`  → ruler factor ${factorMs.toFixed(2)}ms`);
    return {
      version: manifest.version,
      factorMs,
      points,
      ...(skipped.length ? { skipped } : {}),
    };
  } finally {
    await srv.close();
  }
}

// ---------------------------------------------------------------------------
// CSV emission (long format: one row per pass measurement)
// ---------------------------------------------------------------------------

function toCsv(results: BenchResults): string {
  const rows: string[] = ["mode,group,scale,pass,median_ms,min_ms,p95_ms,runs"];
  const row = (
    mode: string,
    group: string,
    scale: string,
    pass: string,
    s: Stat
  ) =>
    rows.push(
      `${mode},${JSON.stringify(group)},${scale},${pass},${s.median},${s.min},${s.p95},${s.n}`
    );
  const emit = (
    mode: string,
    group: string,
    scale: string,
    passes: Record<string, Stat>
  ) => {
    for (const [pass, s] of Object.entries(passes))
      row(mode, group, scale, pass, s);
  };
  // Counts are deterministic scalars — carried in the median column (min/p95=0).
  const scalar = (v: number): Stat => ({ median: v, min: v, p95: v, n: 1 });
  const emitCounts = (
    mode: string,
    group: string,
    scale: string,
    c: Counts | undefined
  ) => {
    if (!c) return;
    row(mode, group, scale, "nodes", scalar(c.nodes));
    row(mode, group, scale, "displayItems", scalar(c.displayItems));
  };

  for (const e of results.examplesJs) {
    emit("examples-js", e.id, "", e.passes);
    row("examples-js", e.id, "", "wall", e.wallMs);
    emitCounts("examples-js", e.id, "", e.counts);
  }
  for (const p of results.examplesPy) {
    emit("examples-py", p.path, "", p.passes);
    row("examples-py-overhead", p.path, "", "overhead", p.overheadMs);
    row("examples-py-load", p.path, "", "load", p.loadMs);
    row("examples-py-e2e", p.path, "", "e2e", p.e2eMs);
    emitCounts("examples-py", p.path, "", p.counts);
  }
  for (const s of results.synthetic) {
    emit("synthetic", s.family, String(s.n), s.passes);
    row("synthetic", s.family, String(s.n), "wall", s.wallMs);
    row("synthetic", s.family, String(s.n), "batch", scalar(s.batch));
    emitCounts("synthetic", s.family, String(s.n), s.counts);
  }
  return rows.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type BenchResults = {
  meta: {
    sha: string;
    timestamp: string;
    node: string;
    platform: string;
    // Hardware/browser provenance: cross-run trend points can't be re-derived
    // retroactively without it.
    cpuModel: string;
    cores: number;
    chromium: string;
    playwright: string;
    // Best-effort Python dep versions; present only when the Python leg ran.
    pythonDeps?: Record<string, string>;
    quick: boolean;
    // Whether the instrumented production bundle (dist-bench) was benched; false
    // means the dev-mode source alias (SolidJS dev build) was used as fallback.
    prodBuild: boolean;
    sampling: { warmup: number; budgetMs: number; min: number; max: number };
    passLabels: string[];
    enginePassLabels: string[];
    // Set on BOTH files when this run was an interleaved same-runner A/B
    // (--ab-dir): HEAD and base sampled alternately in one loop, not minutes apart.
    interleaved?: boolean;
    // The hermetic reference workload measured this run (--ruler), or null.
    ruler: RulerMeta | null;
  };
  examplesJs: ExampleResult[];
  // Stories the examples-js leg ran but could not measure. Kept out of
  // `examplesJs` so every entry there has real stats; a skipped story simply
  // has no match in cross-run comparisons. Absent in older results files.
  examplesJsSkipped?: SkippedExample[];
  examplesPy: PythonResult[];
  // Likewise for the Python leg's timeouts (unsupported IR kinds are not listed).
  examplesPySkipped?: SkippedPyExample[];
  synthetic: SyntheticPoint[];
  // Synthetic points that timed out; each one ended its family.
  syntheticSkipped?: SkippedPoint[];
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

const DIST_BENCH = join(ROOT, "packages/gofish-graphics/dist-bench");

/**
 * Ensure the instrumented production bundle exists; build it on demand. Returns
 * true if dist-bench is usable (bench the code users run), false to fall back to
 * the dev-mode source alias — e.g. the build:bench script doesn't exist yet or
 * the build failed. We do NOT edit packages/ ourselves.
 */
function ensureProdBuild(): boolean {
  if (existsSync(join(DIST_BENCH, "index.js"))) return true;
  try {
    console.log("[prod] building instrumented dist-bench (build:bench) ...");
    execSync("pnpm --filter gofish-graphics build:bench", {
      cwd: ROOT,
      stdio: process.env.DEBUG ? "inherit" : "ignore",
    });
    if (existsSync(join(DIST_BENCH, "index.js"))) return true;
    console.warn(
      "[prod] build:bench produced no dist-bench/index.js — falling back to dev-mode source alias"
    );
    return false;
  } catch {
    console.warn(
      "[prod] `pnpm --filter gofish-graphics build:bench` unavailable or failed — " +
        "falling back to dev-mode source alias (SolidJS dev build, unminified)"
    );
    return false;
  }
}

function playwrightVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    return req("playwright/package.json").version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Best-effort Python dep versions via importlib.metadata; swallow failures.
 *  Single-line (semicolons) so it survives `python3 -c` shell-quoting; matches
 *  each target against installed distributions modulo `_`/`-` casing. */
function pythonDeps(): Record<string, string> | undefined {
  const script =
    "import importlib.metadata as m, json; " +
    "d={x.metadata['Name'].lower().replace('-','_'): x.version for x in m.distributions()}; " +
    "print(json.dumps({p: d.get(p.lower().replace('-','_')) for p in ['pandas','vega_datasets','gofish-graphics']}))";
  try {
    const out = execSync(`python3 -c ${JSON.stringify(script)}`, {
      cwd: ROOT,
    }).toString();
    const parsed = JSON.parse(out.trim());
    const clean: Record<string, string> = {};
    for (const [k, val] of Object.entries(parsed))
      if (val) clean[k] = String(val);
    return Object.keys(clean).length ? clean : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const wantJs = MODE === "all" || MODE === "examples-js";
  const wantPy = MODE === "all" || MODE === "examples-py";
  const wantSyn = MODE === "all" || MODE === "synthetic";

  // Bench the instrumented production bundle when available; fall back to the
  // dev-mode source alias otherwise (recorded in meta.prodBuild).
  const prodBuild = ensureProdBuild();

  // Interleaved same-runner A/B (synthetic only): spawn a second harness from the
  // base checkout. The base checkout is a full worktree that must already have
  // run `pnpm install` + `pnpm --filter gofish-graphics build:bench`. Skip
  // gracefully if it predates the bench harness.
  const abBase = AB_DIR && wantSyn ? resolvePath(AB_DIR) : undefined;
  const abHarnessDir = abBase ? join(abBase, "tests/harness") : undefined;
  const abActive = !!(
    abHarnessDir && existsSync(join(abHarnessDir, "bench-runner.html"))
  );
  if (abBase && !abActive)
    console.warn(
      `[a/b] ${abBase}/tests/harness/bench-runner.html missing — HEAD-only fallback`
    );

  const harnessProc = startHarness(prodBuild);
  const abHarnessProc =
    abActive && abHarnessDir
      ? startHarness(prodBuild, abHarnessDir, AB_HARNESS_PORT)
      : null;
  const deriveProc = wantPy ? startDeriveServer() : null;

  let browser: Browser | undefined;
  const results: BenchResults = {
    meta: {
      sha: gitSha(),
      timestamp: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      cores: os.cpus().length,
      chromium: "unknown", // filled after launch (browser.version())
      playwright: playwrightVersion(),
      ...(wantPy ? { pythonDeps: pythonDeps() } : {}),
      quick: QUICK,
      prodBuild,
      sampling: {
        warmup: WARMUP,
        budgetMs: MEASURE_BUDGET_MS,
        min: MEASURE_MIN,
        max: MEASURE_MAX,
      },
      passLabels: PASS_LABELS,
      enginePassLabels: ENGINE_PASS_LABELS,
      ...(abActive ? { interleaved: true } : {}),
      ruler: null,
    },
    examplesJs: [],
    examplesPy: [],
    synthetic: [],
  };
  // Base-checkout results (same schema), written to --ab-out in --ab mode.
  let baseResults: BenchResults | null = null;

  try {
    await waitFor(`http://localhost:${HARNESS_PORT}/stories-runner.html`);
    if (abHarnessProc)
      await waitFor(`http://localhost:${AB_HARNESS_PORT}/bench-runner.html`);
    if (deriveProc)
      await waitFor(`http://localhost:${DERIVE_SERVER_PORT}/health`);

    // --expose-gc lets us GC between samples (window.gc?.()) to cut cross-sample
    // GC interference from the measured window.
    browser = await chromium.launch({
      headless: true,
      args: ["--js-flags=--expose-gc"],
    });
    results.meta.chromium = browser.version();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    if (wantSyn) {
      if (abActive && abBase) {
        const { head, base, skipped } = await benchSyntheticAB(context);
        results.synthetic = head;
        results.syntheticSkipped = skipped;
        baseResults = {
          meta: {
            ...results.meta,
            sha: baseSha(abBase),
            interleaved: true,
            ruler: null,
          },
          examplesJs: [],
          examplesPy: [],
          synthetic: base,
          syntheticSkipped: skipped,
        };
      } else {
        const syn = await benchSynthetic(context);
        results.synthetic = syn.points;
        results.syntheticSkipped = syn.skipped;
      }
    }
    if (wantJs) {
      const js = await benchExamplesJs(context);
      results.examplesJs = js.results;
      results.examplesJsSkipped = js.skipped;
    }
    if (wantPy) {
      const py = await benchExamplesPy(context);
      results.examplesPy = py.results;
      results.examplesPySkipped = py.skipped;
    }

    // Ruler leg (any mode): measure the hermetic reference workload in this same
    // browser session so the run's factorMs cancels the CI hardware lottery.
    if (RULER_DIR) results.meta.ruler = await benchRuler(browser, RULER_DIR);

    await context.close();
  } finally {
    await browser?.close();
    killProc(harnessProc);
    killProc(abHarnessProc);
    killProc(deriveProc);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "results.json"),
    JSON.stringify(results, null, 2)
  );
  writeFileSync(join(OUT_DIR, "results.csv"), toCsv(results));
  if (baseResults) {
    const abOutAbs = resolvePath(AB_OUT);
    mkdirSync(join(abOutAbs, ".."), { recursive: true });
    writeFileSync(abOutAbs, JSON.stringify(baseResults, null, 2));
  }

  console.log(`\n=== Benchmark complete ===`);
  console.log(
    `  engine: ${prodBuild ? "prod (dist-bench)" : "dev-mode source alias"}`
  );
  console.log(`  examples-js: ${results.examplesJs.length}`);
  for (const s of results.examplesJsSkipped ?? [])
    console.log(`    skipped (${s.reason}): ${s.title}/${s.name}`);
  console.log(`  examples-py: ${results.examplesPy.length}`);
  for (const s of results.examplesPySkipped ?? [])
    console.log(`    skipped (${s.reason}): ${s.path}`);
  console.log(`  synthetic points: ${results.synthetic.length}`);
  for (const s of results.syntheticSkipped ?? [])
    console.log(`    skipped (${s.reason}): ${s.family} n=${s.n}`);
  if (results.meta.ruler) {
    console.log(
      `  ruler: v${results.meta.ruler.version} factor ${results.meta.ruler.factorMs.toFixed(2)}ms`
    );
    for (const s of results.meta.ruler.skipped ?? [])
      console.log(`    skipped (${s.reason}): ${s.family} n=${s.n}`);
  }
  if (baseResults) console.log(`  interleaved base → ${resolvePath(AB_OUT)}`);
  console.log(`  → ${join(OUT_DIR, "results.json")}`);
}

/** HEAD sha of the base checkout (for base results.meta.sha in --ab mode). */
function baseSha(dir: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();
  } catch {
    return "unknown";
  }
}

main().then(
  // Exit explicitly: even after killing the harness process groups, a lingering
  // handle (a not-yet-drained pipe, a keep-alive socket) can otherwise leave the
  // event loop non-empty, hanging the CI step long after "benchmark complete".
  () => process.exit(0),
  (err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  }
);

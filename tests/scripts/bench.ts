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

import { chromium, type Browser, type Page } from "playwright";
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

// Synthetic sweep. Capped to keep the DOM/paint from OOMing; the per-point
// ceiling stops a family early once a single render blows past the budget so
// we still capture the asymptote leading up to it.
const COUNT_NS = QUICK
  ? [10, 100, 1000]
  : [10, 30, 100, 300, 1000, 3000, 10000, 30000];
const NEST_DEPTHS = QUICK ? [2, 8] : [1, 2, 4, 8, 16, 32, 64, 128];
const PER_RENDER_CEILING_MS = 20_000;

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

/** Ask Chromium to GC between samples (needs --js-flags=--expose-gc); no-op if absent. */
const gc = async (page: Page): Promise<void> => {
  try {
    await page.evaluate(() => (globalThis as any).gc?.());
  } catch {
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
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  proc.stderr?.on("data", (d) => {
    if (process.env.DEBUG) process.stderr.write(d);
  });
  return proc;
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

async function benchExamplesJs(page: Page): Promise<ExampleResult[]> {
  await page.goto(`http://localhost:${HARNESS_PORT}/stories-runner.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => (window as any).__STORIES_RUNNER_READY__ === true,
    { timeout: 30_000 }
  );

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

  for (const story of stories) {
    process.stdout.write(`  ${story.title}/${story.name} ... `);
    type Sample = { labels: Labels; wallMs: number; counts?: Counts };
    const samples = await sampleLoop<Sample>(page, async () => {
      const r = await page.evaluate(async (id) => {
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
          counts: w.__GOFISH_PERF__?.current?.counts as Counts | undefined,
        };
      }, story.id);
      if (!r.ok) return { ok: false };
      return {
        ok: true,
        value: { labels: r.labels, wallMs: r.wallMs, counts: r.counts },
      };
    });
    if (!samples || samples.length === 0) {
      console.log("SKIP");
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
    console.log(`${results[results.length - 1].totalMs.median.toFixed(2)}ms`);
  }
  return results;
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

async function benchExamplesPy(page: Page): Promise<PythonResult[]> {
  let stories = discoverPythonStories();
  if (FILTER_LC)
    stories = stories.filter((s) => s.path.toLowerCase().includes(FILTER_LC));
  if (QUICK) stories = stories.slice(0, 6);

  console.log(`\n[examples-py] ${stories.length} stories\n`);

  // The Python path renders deserialized IR via the harness index page, which
  // defines `__renderChart__` (the stories-runner / bench-runner pages don't).
  await page.goto(`http://localhost:${HARNESS_PORT}/`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () => typeof (window as any).__renderChart__ === "function",
    {
      timeout: 30_000,
    }
  );

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

  type PySample = {
    labels: Labels;
    loadMs: number;
    e2eMs: number;
    counts?: Counts;
  };

  for (const story of stories) {
    process.stdout.write(`  ${story.path} ... `);
    const samples = await sampleLoop<PySample>(page, async () => {
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

      // Only the single-chart path is benchmarked here; layer/raw-mark/unsupported
      // are skipped (they don't represent the common per-example case).
      if (
        ir?._kind === "layer" ||
        ir?._kind === "raw-mark" ||
        ir?._kind === "layer-unsupported"
      ) {
        return { ok: false };
      }

      const deriveServerUrl =
        ir.deriveIds?.length > 0
          ? `http://localhost:${DERIVE_SERVER_PORT}`
          : undefined;
      const spec = {
        data: ir.data,
        operators: ir.operators,
        mark: ir.mark,
        options: ir.options,
        connect: ir.connect ?? null,
        deriveServerUrl,
      };

      const r = await page.evaluate(async (s) => {
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
        while (!w.__GOFISH_RENDER_COMPLETE__ && performance.now() < deadline) {
          await new Promise((res) => setTimeout(res, 0));
          if (w.__GOFISH_RENDER_ERROR__) break;
        }
        const wallMs = performance.now() - t0;
        return {
          err: w.__GOFISH_RENDER_ERROR__ as string | null,
          wallMs,
          labels: { ...(w.__GOFISH_PERF__?.current?.labels ?? {}) },
          counts: w.__GOFISH_PERF__?.current?.counts as Counts | undefined,
        };
      }, spec);

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
    });

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
  return results;
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
    return (await page.evaluate(
      ([f, k]) => (window as any).__runSyntheticBench__(f, k),
      [family, n] as [string, number]
    )) as SyntheticSample;
  } catch {
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

async function openBenchRunner(page: Page, port: number): Promise<void> {
  await page.goto(`http://localhost:${port}/bench-runner.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => (window as any).__BENCH_RUNNER_READY__ === true,
    { timeout: 30_000 }
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

async function benchSynthetic(page: Page): Promise<SyntheticPoint[]> {
  await openBenchRunner(page, HARNESS_PORT);
  const families = (await page.evaluate(() =>
    (window as any).__listSyntheticFamilies__()
  )) as { count: string[]; nest: boolean };

  const points: SyntheticPoint[] = [];

  const countFamilies = FILTER_LC
    ? families.count.filter((f) => f.includes(FILTER_LC))
    : families.count;

  for (const family of countFamilies) {
    console.log(`\n[synthetic] family "${family}"`);
    for (const n of COUNT_NS) {
      process.stdout.write(`  n=${n} ... `);
      const r = await runSyntheticPoint(page, family, n);
      if (!r) {
        console.log("ERROR (stopping family)");
        break;
      }
      points.push({ family, n, ...r });
      console.log(
        `engine ${r.totalMs.median.toFixed(2)}ms · wall ${r.wallMs.median.toFixed(2)}ms`
      );
      if (r.wallMs.median > PER_RENDER_CEILING_MS) {
        console.log(
          `  (n=${n} exceeded ${PER_RENDER_CEILING_MS}ms ceiling — stopping family)`
        );
        break;
      }
    }
  }

  if (families.nest && (!FILTER_LC || "nest".includes(FILTER_LC))) {
    console.log(`\n[synthetic] family "nest" (depth sweep)`);
    for (const depth of NEST_DEPTHS) {
      process.stdout.write(`  depth=${depth} ... `);
      const r = await runSyntheticPoint(page, "nest", depth);
      if (!r) {
        console.log("ERROR (stopping family)");
        break;
      }
      points.push({ family: "nest", n: depth, ...r });
      console.log(
        `engine ${r.totalMs.median.toFixed(2)}ms · wall ${r.wallMs.median.toFixed(2)}ms`
      );
      if (r.wallMs.median > PER_RENDER_CEILING_MS) break;
    }
  }
  return points;
}

/**
 * Interleaved same-runner A/B synthetic sweep: HEAD on `headPage` (HARNESS_PORT)
 * vs base on `basePage` (AB_HARNESS_PORT), alternating one sample each per point.
 * Both engines see identical specs and identical sampling; the delta is free of
 * cross-machine variance AND of the thermal drift of benching them minutes apart.
 */
async function benchSyntheticAB(
  headPage: Page,
  basePage: Page
): Promise<{ head: SyntheticPoint[]; base: SyntheticPoint[] }> {
  await openBenchRunner(headPage, HARNESS_PORT);
  await openBenchRunner(basePage, AB_HARNESS_PORT);
  const families = (await headPage.evaluate(() =>
    (window as any).__listSyntheticFamilies__()
  )) as { count: string[]; nest: boolean };

  const head: SyntheticPoint[] = [];
  const base: SyntheticPoint[] = [];
  const stopped = new Set<string>();
  let curFamily = "";
  for (const { family, n } of syntheticSweep(families)) {
    if (stopped.has(family)) continue;
    if (family !== curFamily) {
      curFamily = family;
      console.log(`\n[synthetic A/B] family "${family}"`);
    }
    process.stdout.write(`  n=${n} ... `);
    const r = await runSyntheticPointAB(headPage, basePage, family, n);
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
  return { head, base };
}

// ---------------------------------------------------------------------------
// Ruler leg: the hermetic reference workload, measured in this same browser
// ---------------------------------------------------------------------------

type RulerMeta = {
  version: string;
  // Geomean of the point medians — the run's normalization divisor.
  factorMs: number;
  points: { family: string; n: number; wallMs: Stat }[];
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
    const page = await context.newPage();
    await page.goto(`http://localhost:${srv.port}/`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => (window as any).__RULER_READY__ === true, {
      timeout: 30_000,
    });
    console.log(
      `\n[ruler] v${manifest.version} (${manifest.points.length} points)`
    );
    const points: RulerMeta["points"] = [];
    for (const pt of manifest.points) {
      process.stdout.write(`  ${pt.family} n=${pt.n} ... `);
      const samples = await sampleLoop<number>(page, async () => {
        try {
          const r = (await page.evaluate(
            ([f, n]) => (window as any).__runRulerPoint__(f, n),
            [pt.family, pt.n] as [string, number]
          )) as { wallMs: number };
          return { ok: true, value: r.wallMs };
        } catch {
          return { ok: false };
        }
      });
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
    return { version: manifest.version, factorMs, points };
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
  examplesPy: PythonResult[];
  synthetic: SyntheticPoint[];
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
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      if (process.env.DEBUG) console.error(`[pageerror] ${e.message}`);
    });

    if (wantSyn) {
      if (abActive && abBase) {
        const basePage = await context.newPage();
        basePage.on("pageerror", (e) => {
          if (process.env.DEBUG) console.error(`[base pageerror] ${e.message}`);
        });
        const { head, base } = await benchSyntheticAB(page, basePage);
        results.synthetic = head;
        await basePage.close();
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
        };
      } else {
        results.synthetic = await benchSynthetic(page);
      }
    }
    if (wantJs) results.examplesJs = await benchExamplesJs(page);
    if (wantPy) results.examplesPy = await benchExamplesPy(page);

    // Ruler leg (any mode): measure the hermetic reference workload in this same
    // browser session so the run's factorMs cancels the CI hardware lottery.
    if (RULER_DIR) results.meta.ruler = await benchRuler(browser, RULER_DIR);

    await context.close();
  } finally {
    await browser?.close();
    harnessProc.kill();
    abHarnessProc?.kill();
    deriveProc?.kill();
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
  console.log(`  examples-py: ${results.examplesPy.length}`);
  console.log(`  synthetic points: ${results.synthetic.length}`);
  if (results.meta.ruler)
    console.log(
      `  ruler: v${results.meta.ruler.version} factor ${results.meta.ruler.factorMs.toFixed(2)}ms`
    );
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

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

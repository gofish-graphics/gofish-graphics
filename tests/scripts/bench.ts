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
 * The recognized per-pass labels are resolve / axes / solve / lower / paint /
 * fonts (see packages/gofish-graphics/src/ast/perf.ts).
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
import { join, relative } from "path";
import { execSync } from "child_process";

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

const PASS_LABELS = ["resolve", "axes", "solve", "lower", "paint", "fonts"];

const argv = process.argv.slice(2);
const QUICK = argv.includes("--quick");
const filterIdx = argv.indexOf("--filter");
const FILTER = filterIdx >= 0 ? argv[filterIdx + 1]?.toLowerCase() : undefined;
const MODE = argv.find((a) => !a.startsWith("--") && a !== FILTER) ?? "all";

// Repetitions: a couple of warmups (JIT, font load) then measured runs whose
// median we keep (medians shrug off the occasional GC/scheduler spike).
const WARMUP = QUICK ? 0 : 1;
const MEASURE = QUICK ? 2 : 4;

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

const sumPasses = (labels: Labels): number =>
  PASS_LABELS.reduce((acc, k) => acc + (labels[k] ?? 0), 0);

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

function startHarness(): ChildProcess {
  const proc = spawn(
    "npx",
    [
      "vite",
      "--config",
      join(HARNESS_DIR, "vite.config.ts"),
      "--port",
      String(HARNESS_PORT),
    ],
    {
      cwd: HARNESS_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
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
  passes: Record<string, Stat>;
  totalMs: Stat;
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
  )) as { id: string; title: string; name: string }[];
  if (FILTER)
    stories = stories.filter(
      (s) =>
        s.id.includes(FILTER) ||
        `${s.title}/${s.name}`.toLowerCase().includes(FILTER)
    );
  if (QUICK) stories = stories.slice(0, 6);

  console.log(`\n[examples-js] ${stories.length} stories\n`);
  const results: ExampleResult[] = [];

  for (const story of stories) {
    process.stdout.write(`  ${story.title}/${story.name} ... `);
    const runs: Labels[] = [];
    let ok = true;
    for (let i = 0; i < WARMUP + MEASURE; i++) {
      const r = await page.evaluate(async (id) => {
        const w = window as any;
        w.__GOFISH_PERF__ = { enabled: true, current: null };
        const success = await w.__renderStory__(id);
        if (!success)
          return { ok: false, labels: {} as Record<string, number> };
        return {
          ok: true,
          labels: { ...(w.__GOFISH_PERF__?.current?.labels ?? {}) },
        };
      }, story.id);
      if (!r.ok) {
        ok = false;
        break;
      }
      if (i >= WARMUP) runs.push(r.labels);
    }
    if (!ok || runs.length === 0) {
      console.log("SKIP");
      continue;
    }
    results.push({
      id: story.id,
      title: story.title,
      name: story.name,
      passes: labelStats(runs),
      totalMs: stat(runs.map(sumPasses)),
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
  passes: Record<string, Stat>;
  totalMs: Stat; // engine passes only (same JS engine)
  loadMs: Stat; // warm /load: module re-exec + data construct + IR serialize
  e2eMs: Stat; // inject → render-complete (deserialize + derive RPC + engine)
  overheadMs: Stat; // e2e − engine passes: the Python-path tax
};

async function benchExamplesPy(page: Page): Promise<PythonResult[]> {
  let stories = discoverPythonStories();
  if (FILTER)
    stories = stories.filter((s) => s.path.toLowerCase().includes(FILTER));
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

  // Always discard at least one per-story /load so the measured loads run
  // warm: the first /load of a story re-execs its module and loads/caches its
  // dataset; subsequent ones reuse the cache. This is what makes loadMs the
  // steady-state per-call cost rather than a cold first hit.
  const pyWarmup = Math.max(1, WARMUP);

  const results: PythonResult[] = [];

  for (const story of stories) {
    process.stdout.write(`  ${story.path} ... `);
    const passRuns: Labels[] = [];
    const loadMs: number[] = [];
    const e2eMs: number[] = [];
    const overheadMs: number[] = [];
    let ok = true;

    for (let i = 0; i < pyWarmup + MEASURE; i++) {
      // /load: import the story + serialize IR + register derives (Python work).
      const tLoad = Date.now();
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
        if (!resp.ok) {
          ok = false;
          break;
        }
        ir = await resp.json();
      } catch {
        ok = false;
        break;
      }
      const loadDelta = Date.now() - tLoad;

      // Only the single-chart path is benchmarked here; layer/raw-mark/unsupported
      // are skipped (they don't represent the common per-example case).
      if (
        ir?._kind === "layer" ||
        ir?._kind === "raw-mark" ||
        ir?._kind === "layer-unsupported"
      ) {
        ok = false;
        break;
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
        const deadline = performance.now() + 30000;
        while (!w.__GOFISH_RENDER_COMPLETE__ && performance.now() < deadline) {
          await new Promise((res) => setTimeout(res, 5));
          if (w.__GOFISH_RENDER_ERROR__) break;
        }
        const wallMs = performance.now() - t0;
        return {
          err: w.__GOFISH_RENDER_ERROR__ as string | null,
          wallMs,
          labels: { ...(w.__GOFISH_PERF__?.current?.labels ?? {}) },
        };
      }, spec);

      if (r.err) {
        ok = false;
        break;
      }
      if (i >= pyWarmup) {
        passRuns.push(r.labels);
        loadMs.push(loadDelta);
        e2eMs.push(r.wallMs);
        overheadMs.push(Math.max(0, r.wallMs - sumPasses(r.labels)));
      }
    }

    if (!ok || passRuns.length === 0) {
      console.log("SKIP");
      continue;
    }
    results.push({
      path: story.path,
      passes: labelStats(passRuns),
      totalMs: stat(passRuns.map(sumPasses)),
      loadMs: stat(loadMs),
      e2eMs: stat(e2eMs),
      overheadMs: stat(overheadMs),
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
};

async function runSyntheticPoint(
  page: Page,
  family: string,
  n: number
): Promise<{
  passes: Record<string, Stat>;
  totalMs: Stat;
  wallMs: Stat;
} | null> {
  const passRuns: Labels[] = [];
  const wall: number[] = [];
  for (let i = 0; i < WARMUP + MEASURE; i++) {
    let sample: { labels: Labels; wallMs: number };
    try {
      sample = (await page.evaluate(
        ([f, k]) => (window as any).__runSyntheticBench__(f, k),
        [family, n] as [string, number]
      )) as { labels: Labels; wallMs: number };
    } catch {
      return null;
    }
    if (i >= WARMUP) {
      passRuns.push(sample.labels);
      wall.push(sample.wallMs);
    }
  }
  if (passRuns.length === 0) return null;
  return {
    passes: labelStats(passRuns),
    totalMs: stat(passRuns.map(sumPasses)),
    wallMs: stat(wall),
  };
}

async function benchSynthetic(page: Page): Promise<SyntheticPoint[]> {
  await page.goto(`http://localhost:${HARNESS_PORT}/bench-runner.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => (window as any).__BENCH_RUNNER_READY__ === true,
    { timeout: 30_000 }
  );
  const families = (await page.evaluate(() =>
    (window as any).__listSyntheticFamilies__()
  )) as { count: string[]; nest: boolean };

  const points: SyntheticPoint[] = [];

  const countFamilies = FILTER
    ? families.count.filter((f) => f.includes(FILTER))
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

  if (families.nest && (!FILTER || "nest".includes(FILTER))) {
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

// ---------------------------------------------------------------------------
// CSV emission (long format: one row per pass measurement)
// ---------------------------------------------------------------------------

function toCsv(results: BenchResults): string {
  const rows: string[] = ["mode,group,scale,pass,median_ms,min_ms,p95_ms,runs"];
  const emit = (
    mode: string,
    group: string,
    scale: string,
    passes: Record<string, Stat>
  ) => {
    for (const [pass, s] of Object.entries(passes)) {
      rows.push(
        `${mode},${JSON.stringify(group)},${scale},${pass},${s.median},${s.min},${s.p95},${s.n}`
      );
    }
  };
  for (const e of results.examplesJs) emit("examples-js", e.id, "", e.passes);
  for (const p of results.examplesPy) {
    emit("examples-py", p.path, "", p.passes);
    rows.push(
      `examples-py-overhead,${JSON.stringify(p.path)},,overhead,${p.overheadMs.median},${p.overheadMs.min},${p.overheadMs.p95},${p.overheadMs.n}`
    );
    rows.push(
      `examples-py-load,${JSON.stringify(p.path)},,load,${p.loadMs.median},${p.loadMs.min},${p.loadMs.p95},${p.loadMs.n}`
    );
  }
  for (const s of results.synthetic)
    emit("synthetic", s.family, String(s.n), s.passes);
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
    quick: boolean;
    warmup: number;
    measure: number;
    passLabels: string[];
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

async function main() {
  const wantJs = MODE === "all" || MODE === "examples-js";
  const wantPy = MODE === "all" || MODE === "examples-py";
  const wantSyn = MODE === "all" || MODE === "synthetic";

  const harnessProc = startHarness();
  const deriveProc = wantPy ? startDeriveServer() : null;

  let browser: Browser | undefined;
  const results: BenchResults = {
    meta: {
      sha: gitSha(),
      timestamp: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      quick: QUICK,
      warmup: WARMUP,
      measure: MEASURE,
      passLabels: PASS_LABELS,
    },
    examplesJs: [],
    examplesPy: [],
    synthetic: [],
  };

  try {
    await waitFor(`http://localhost:${HARNESS_PORT}/stories-runner.html`);
    if (deriveProc)
      await waitFor(`http://localhost:${DERIVE_SERVER_PORT}/health`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      if (process.env.DEBUG) console.error(`[pageerror] ${e.message}`);
    });

    if (wantSyn) results.synthetic = await benchSynthetic(page);
    if (wantJs) results.examplesJs = await benchExamplesJs(page);
    if (wantPy) results.examplesPy = await benchExamplesPy(page);

    await context.close();
  } finally {
    await browser?.close();
    harnessProc.kill();
    deriveProc?.kill();
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "results.json"),
    JSON.stringify(results, null, 2)
  );
  writeFileSync(join(OUT_DIR, "results.csv"), toCsv(results));

  console.log(`\n=== Benchmark complete ===`);
  console.log(`  examples-js: ${results.examplesJs.length}`);
  console.log(`  examples-py: ${results.examplesPy.length}`);
  console.log(`  synthetic points: ${results.synthetic.length}`);
  console.log(`  → ${join(OUT_DIR, "results.json")}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

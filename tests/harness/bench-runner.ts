/**
 * In-page synthetic benchmark runner.
 *
 * Mirrors `stories-runner.ts`, but instead of rendering Storybook stories it
 * builds the parametric synthetic specs from `tests/bench/specs.ts` and renders
 * one at a time, returning the engine's per-pass perf snapshot plus an in-page
 * wall-clock for each render. The Playwright driver (`tests/scripts/bench.ts`)
 * sweeps the scale parameter and collects the results.
 *
 * Perf instrumentation is force-enabled here (the harness Vite server compiles
 * the engine with `__GOFISH_PERF_INSTRUMENTATION__` defaulting to `true`, so the
 * runtime flag below is all that's needed to start collecting).
 */

import { countFamilies, nestFamily, type RenderOpts } from "../bench/specs";

type PerfGlobal = {
  enabled: boolean;
  current: {
    labels: Record<string, number>;
    startedAt: number;
    // Deterministic size counters written by the engine (packages/ agent).
    // May be absent until that lands — read defensively everywhere.
    counts?: { nodes: number; displayItems: number };
  } | null;
};

const perf = globalThis as { __GOFISH_PERF__?: PerfGlobal };

// Turn instrumentation on for the whole page. The engine writes per-pass
// durations into `__GOFISH_PERF__.current.labels`; we read them back after each
// render (no need to import the engine's internal perf module).
perf.__GOFISH_PERF__ = { enabled: true, current: null };

export type BenchSample = {
  /** Per-pass durations in ms (resolve/axes/solve/lower/paint/fonts),
   *  per single render (batch-averaged at small n). */
  labels: Record<string, number>;
  /** Per-render wall-clock in ms (batch-averaged at small n). */
  wallMs: number;
  /** Renders folded into this sample (>1 only for sub-ms points). */
  batch: number;
  /** Deterministic size counters from the last render, if the engine emits them. */
  counts?: { nodes: number; displayItems: number };
};

declare global {
  interface Window {
    __listSyntheticFamilies__: () => {
      count: string[];
      nest: boolean;
    };
    __runSyntheticBench__: (
      family: string,
      n: number,
      opts?: Partial<RenderOpts>
    ) => Promise<BenchSample>;
    __BENCH_RUNNER_READY__: boolean;
    __BENCH_RUNNER_ERROR__: string | null;
  }
}

window.__listSyntheticFamilies__ = () => ({
  count: Object.keys(countFamilies),
  nest: true,
});

window.__runSyntheticBench__ = async (
  family: string,
  n: number,
  opts?: Partial<RenderOpts>
): Promise<BenchSample> => {
  const root = document.getElementById("bench-root")!;
  root.innerHTML = "";

  const spec = family === "nest" ? nestFamily(n) : countFamilies[family]?.(n);
  if (!spec) throw new Error(`Unknown synthetic family: ${family}`);

  const renderOpts: RenderOpts = { w: opts?.w ?? 800, h: opts?.h ?? 600 };

  // One render: paint into `root`, flush SolidJS (the frame where `lower`/`paint`
  // land), and return its wall time plus the engine's per-pass snapshot.
  const once = async (): Promise<{
    labels: Record<string, number>;
    wallMs: number;
  }> => {
    root.innerHTML = "";
    const t0 = performance.now();
    await spec.render(root, renderOpts);
    await new Promise((r) => requestAnimationFrame(r));
    const wallMs = performance.now() - t0;
    const labels = { ...(perf.__GOFISH_PERF__?.current?.labels ?? {}) };
    return { labels, wallMs };
  };

  // At small n a render is sub-ms — near the timer floor even under COOP/COEP,
  // and the low end of the log-log plot is where slope fitting is most sensitive.
  // Probe once; if fast, fold k = ⌈10/probeMs⌉ renders into one averaged sample.
  const probe = await once();
  const batch =
    probe.wallMs < 5
      ? Math.max(1, Math.ceil(10 / Math.max(probe.wallMs, 0.01)))
      : 1;

  if (batch === 1) {
    return {
      labels: probe.labels,
      wallMs: probe.wallMs,
      batch,
      counts: perf.__GOFISH_PERF__?.current?.counts,
    };
  }

  const acc: Record<string, number> = {};
  let wallSum = 0;
  for (let i = 0; i < batch; i++) {
    const r = await once();
    wallSum += r.wallMs;
    for (const [k, v] of Object.entries(r.labels)) acc[k] = (acc[k] ?? 0) + v;
  }
  const labels: Record<string, number> = {};
  for (const [k, v] of Object.entries(acc)) labels[k] = v / batch;
  return {
    labels,
    wallMs: wallSum / batch,
    batch,
    // Counts are deterministic — the last render's values stand for the point.
    counts: perf.__GOFISH_PERF__?.current?.counts,
  };
};

window.__BENCH_RUNNER_READY__ = false;
window.__BENCH_RUNNER_ERROR__ = null;

try {
  void Object.keys(countFamilies).length;
  window.__BENCH_RUNNER_READY__ = true;
} catch (err: any) {
  window.__BENCH_RUNNER_ERROR__ = err?.message ?? String(err);
  window.__BENCH_RUNNER_READY__ = true;
}

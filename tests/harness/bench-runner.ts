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
  current: { labels: Record<string, number>; startedAt: number } | null;
};

const perf = globalThis as { __GOFISH_PERF__?: PerfGlobal };

// Turn instrumentation on for the whole page. The engine writes per-pass
// durations into `__GOFISH_PERF__.current.labels`; we read them back after each
// render (no need to import the engine's internal perf module).
perf.__GOFISH_PERF__ = { enabled: true, current: null };

export type BenchSample = {
  /** Per-pass durations in ms (resolve/axes/solve/lower/paint/fonts). */
  labels: Record<string, number>;
  /** In-page wall-clock around the whole render call, in ms. */
  wallMs: number;
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

  const t0 = performance.now();
  await spec.render(root, renderOpts);
  // Let SolidJS flush the paint pass (where `lower`/`paint` are recorded).
  await new Promise((r) => requestAnimationFrame(r));
  const wallMs = performance.now() - t0;

  const labels = { ...(perf.__GOFISH_PERF__?.current?.labels ?? {}) };
  return { labels, wallMs };
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

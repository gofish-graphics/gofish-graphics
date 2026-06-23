/**
 * Dogfooded benchmark plots — GoFish rendering its own layout-engine
 * performance numbers.
 *
 * Each story reads the bench results that the driver
 * (`tests/scripts/bench-plots.ts`) injects as `window.__BENCH_RESULTS__`
 * (and run history as `window.__BENCH_HISTORY__`). When those globals are
 * absent — normal Storybook / visual-capture runs — the stories fall back to a
 * small embedded sample so they always render something sensible. The
 * `bench:plots` driver captures these to PNG + standalone SVG for the CI
 * artifact and for direct drop-in to the thesis.
 *
 * These are dev/bench stories: deliberately NOT `gallery`-tagged.
 */

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { chart, scatter, spread, circle, line, rect } from "../../src/lib";

const meta: Meta = {
  title: "Benchmarks",
};
export default meta;

type Args = { w: number; h: number };

// ---------------------------------------------------------------------------
// Result access + fallback sample
// ---------------------------------------------------------------------------

type Stat = { median: number; min: number; p95: number; n: number };
type SyntheticPoint = {
  family: string;
  n: number;
  passes: Record<string, Stat>;
  totalMs: Stat;
  wallMs: Stat;
};
type BenchResults = {
  examplesJs: { id: string; totalMs: Stat }[];
  examplesPy: {
    path: string;
    totalMs: Stat;
    loadMs: Stat;
    e2eMs: Stat;
    overheadMs: Stat;
  }[];
  synthetic: SyntheticPoint[];
};

const log10 = (x: number) => Math.log10(Math.max(x, 1e-4));
const stat = (median: number): Stat => ({ median, min: median, p95: median, n: 1 });

/** Synthetic stand-in so the stories render without a live bench run. */
function fallbackResults(): BenchResults {
  const ns = [10, 30, 100, 300, 1000, 3000, 10000];
  // Rough shapes: solve ~ O(n), paint ~ O(n), resolve ~ O(n), lower ~ O(n),
  // with small constants — a believable placeholder, not real data.
  const mk = (family: string, k: Record<string, number>): SyntheticPoint[] =>
    ns.map((n) => ({
      family,
      n,
      passes: Object.fromEntries(
        Object.entries(k).map(([pass, c]) => [pass, stat(0.2 + c * n)])
      ),
      totalMs: stat(0.5 + 0.02 * n),
      wallMs: stat(0.8 + 0.025 * n),
    }));
  return {
    examplesJs: [{ id: "sample-a", totalMs: stat(4.2) }, { id: "sample-b", totalMs: stat(2.1) }],
    examplesPy: [
      { path: "sample-a", totalMs: stat(4.4), loadMs: stat(9.0), e2eMs: stat(12.0), overheadMs: stat(6.0) },
      { path: "sample-b", totalMs: stat(2.3), loadMs: stat(7.5), e2eMs: stat(8.0), overheadMs: stat(4.5) },
    ],
    synthetic: [
      ...mk("spread", { resolve: 0.003, solve: 0.016, lower: 0.002, paint: 0.011 }),
      ...mk("stack", { resolve: 0.002, solve: 0.02, lower: 0.002, paint: 0.01 }),
      ...mk("scatter", { resolve: 0.003, solve: 0.015, lower: 0.0025, paint: 0.012 }),
      ...mk("grid", { resolve: 0.004, solve: 0.018, lower: 0.003, paint: 0.013 }),
    ],
  };
}

const results = (): BenchResults =>
  (window as any).__BENCH_RESULTS__ ?? fallbackResults();

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// ---------------------------------------------------------------------------
// Asymptotics: solve-pass time vs n, one series per family (log-log)
// ---------------------------------------------------------------------------

export const Asymptotics: StoryObj<Args> = {
  args: { w: 900, h: 420 },
  render: (args: Args) => {
    const container = initializeContainer();
    // One small-multiple panel per family; within a panel, a single line of
    // log10(solve ms) vs log10(n). The slope ≈ the empirical exponent.
    const data = results()
      .synthetic.filter((p) => p.family !== "nest")
      .map((p) => ({
        family: p.family,
        n: p.n,
        logn: log10(p.n),
        logt: log10(p.passes.solve?.median ?? 0.001),
      }));

    chart(data, { axes: true })
      .flow(spread({ by: "family", dir: "x", spacing: 56 }))
      .mark((d: any) =>
        chart(d)
          .flow(scatter({ by: "n", x: "logn", y: "logt", axes: { x: true, y: true } }))
          .mark(circle({ r: 2, fill: "#4190c5" }))
          .connect(line({ stroke: "#4190c5", strokeWidth: 1.5 }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// ---------------------------------------------------------------------------
// Per-pass breakdown for one family (log-log), all passes overlaid
// ---------------------------------------------------------------------------

export const PassBreakdown: StoryObj<Args & { family: string }> = {
  args: { w: 900, h: 420, family: "spread" },
  render: (args) => {
    const container = initializeContainer();
    // One panel per pass (resolve / solve / lower / paint) for a single family;
    // within a panel, log10(pass ms) vs log10(n).
    const passes = ["resolve", "solve", "lower", "paint"];
    const pts = results().synthetic.filter((p) => p.family === args.family);
    const data = pts.flatMap((p) =>
      passes.map((pass) => ({
        pass,
        n: p.n,
        logn: log10(p.n),
        logt: log10(p.passes[pass]?.median ?? 0.0005),
      }))
    );

    chart(data, { axes: true })
      .flow(spread({ by: "pass", dir: "x", spacing: 56 }))
      .mark((d: any) =>
        chart(d)
          .flow(scatter({ by: "n", x: "logn", y: "logt", axes: { x: true, y: true } }))
          .mark(circle({ r: 2, fill: "#e0803b" }))
          .connect(line({ stroke: "#e0803b", strokeWidth: 1.5 }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// ---------------------------------------------------------------------------
// Ecological: aggregate per-example cost, JS vs Python (incl. the Python tax)
// ---------------------------------------------------------------------------

export const Ecological: StoryObj<Args> = {
  args: { w: 560, h: 420 },
  render: (args: Args) => {
    const container = initializeContainer();
    const r = results();
    const data = [
      { stage: "1 JS engine", ms: median(r.examplesJs.map((e) => e.totalMs.median)) },
      { stage: "2 PY engine", ms: median(r.examplesPy.map((e) => e.totalMs.median)) },
      { stage: "3 PY load (warm)", ms: median(r.examplesPy.map((e) => e.loadMs.median)) },
      { stage: "4 PY deserialize+RPC", ms: median(r.examplesPy.map((e) => e.overheadMs.median)) },
    ];

    chart(data, { axes: true })
      .flow(spread({ by: "stage", dir: "x", spacing: 24 }))
      .mark(rect({ h: "ms", w: 56, fill: "stage" }))
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

// ---------------------------------------------------------------------------
// Trend: per-pass median across recent runs (from the benchmarks data branch)
// ---------------------------------------------------------------------------

type TrendRun = { idx: number; label: string; passes: Record<string, number> };

function fallbackHistory(): TrendRun[] {
  return Array.from({ length: 8 }, (_, i) => ({
    idx: i,
    label: `r${i}`,
    passes: {
      resolve: 3 + Math.sin(i) * 0.3,
      solve: 16 + Math.cos(i) * 0.8,
      lower: 2 + Math.sin(i / 2) * 0.2,
      paint: 11 + Math.cos(i / 2) * 0.5,
    },
  }));
}

export const Trend: StoryObj<Args> = {
  args: { w: 620, h: 420 },
  render: (args: Args) => {
    const container = initializeContainer();
    const hist: TrendRun[] = (window as any).__BENCH_HISTORY__ ?? fallbackHistory();
    // One panel per pass; within a panel, pass time over recent runs (commit
    // order). Reads the appended series from the benchmarks data branch in CI.
    const passes = ["resolve", "solve", "lower", "paint"];
    const data = hist.flatMap((run) =>
      passes.map((pass) => ({ pass, idx: run.idx, ms: run.passes[pass] ?? 0 }))
    );

    chart(data, { axes: true })
      .flow(spread({ by: "pass", dir: "x", spacing: 56 }))
      .mark((d: any) =>
        chart(d)
          .flow(scatter({ by: "idx", x: "idx", y: "ms", axes: { x: true, y: true } }))
          .mark(circle({ r: 2, fill: "#3b9e5a" }))
          .connect(line({ stroke: "#3b9e5a", strokeWidth: 1.5 }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

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
 * These are thesis-drop-in figures: sized for a paper column (~640×400 per
 * panel), with a consistent per-pass / per-family color mapping shared across
 * every plot. They are dev/bench stories: deliberately NOT `gallery`-tagged.
 */

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  scatter,
  spread,
  circle,
  line,
  rect,
  group,
  palette,
} from "../../src/lib";

const meta: Meta = {
  title: "Benchmarks",
};
export default meta;

type Args = { w: number; h: number };

// ---------------------------------------------------------------------------
// Shared design tokens: one color per engine pass and per synthetic family,
// reused across every plot so the reader learns the mapping once.
// ---------------------------------------------------------------------------

/** Engine passes in pipeline order (excludes the `fonts` measurement pass). */
const ENGINE_PASSES = ["resolve", "axes", "embed", "solve", "lower", "paint"];

const PASS_COLORS: Record<string, string> = {
  resolve: "#4e79a7",
  axes: "#9c755f",
  embed: "#59a14f",
  solve: "#e15759",
  lower: "#edc948",
  paint: "#b07aa1",
  total: "#111111",
};

const FAMILY_COLORS: Record<string, string> = {
  spread: "#4e79a7",
  stack: "#e15759",
  scatter: "#59a14f",
  grid: "#f28e2b",
  nest: "#b07aa1",
};

// ---------------------------------------------------------------------------
// Result access + fallback samples (kept in sync with the results.json /
// history.json schemas the bench driver emits).
// ---------------------------------------------------------------------------

type Stat = { median: number; min: number; p95: number; n: number };
type Counts = { nodes: number; displayItems: number };
type SyntheticPoint = {
  family: string;
  n: number;
  batch: number;
  passes: Record<string, Stat>;
  totalMs: Stat;
  wallMs: Stat;
  counts?: Counts;
};
type BenchResults = {
  examplesJs: {
    id: string;
    totalMs: Stat;
    wallMs?: Stat;
    counts?: Counts;
    specHash?: string;
  }[];
  examplesPy: {
    path: string;
    totalMs: Stat;
    loadMs: Stat;
    e2eMs: Stat;
    overheadMs: Stat;
    counts?: Counts;
  }[];
  synthetic: SyntheticPoint[];
};

const log10 = (x: number) => Math.log10(Math.max(x, 1e-4));
const stat = (median: number): Stat => ({ median, min: median, p95: median, n: 1 });

/** Synthetic stand-in so the stories render without a live bench run. */
function fallbackResults(): BenchResults {
  const ns = [10, 30, 100, 300, 1000, 3000, 10000];
  // Distinct per-family slopes so the log-log lines fan out into a believable
  // envelope. `k` are per-pass constants (ms per node); nodeFactor turns the
  // synthetic size `n` into an approximate scene-graph node count.
  const mk = (
    family: string,
    k: Record<string, number>,
    total: number,
    nodeFactor: number
  ): SyntheticPoint[] =>
    ns.map((n) => ({
      family,
      n,
      batch: 1,
      passes: Object.fromEntries(
        ENGINE_PASSES.map((pass) => [pass, stat(0.05 + (k[pass] ?? 0.001) * n)])
      ),
      totalMs: stat(0.4 + total * n),
      wallMs: stat(0.7 + total * 1.25 * n),
      counts: { nodes: Math.round(n * nodeFactor), displayItems: Math.round(n * nodeFactor * 0.6) },
    }));
  return {
    examplesJs: [
      { id: "bar/simple", totalMs: stat(0.9), wallMs: stat(1.2), counts: { nodes: 42, displayItems: 24 }, specHash: "aaaa" },
      { id: "atom/mosaic", totalMs: stat(1.6), wallMs: stat(2.1), counts: { nodes: 105, displayItems: 66 }, specHash: "bbbb" },
      { id: "streamgraph", totalMs: stat(2.3), wallMs: stat(3.0), counts: { nodes: 168, displayItems: 96 }, specHash: "cccc" },
      { id: "scatter/pie", totalMs: stat(3.0), wallMs: stat(3.9), counts: { nodes: 240, displayItems: 150 }, specHash: "dddd" },
      { id: "node-link", totalMs: stat(4.6), wallMs: stat(5.9), counts: { nodes: 360, displayItems: 210 }, specHash: "eeee" },
    ],
    examplesPy: [
      { path: "bar/simple", totalMs: stat(1.9), loadMs: stat(6.0), e2eMs: stat(9.0), overheadMs: stat(4.5), counts: { nodes: 42, displayItems: 24 } },
      { path: "atom/mosaic", totalMs: stat(5.3), loadMs: stat(9.0), e2eMs: stat(12.0), overheadMs: stat(5.1), counts: { nodes: 105, displayItems: 66 } },
    ],
    synthetic: [
      ...mk("spread", { resolve: 0.003, axes: 0.0006, embed: 0.001, solve: 0.016, lower: 0.002, paint: 0.011 }, 0.018, 1.4),
      ...mk("stack", { resolve: 0.002, axes: 0.0007, embed: 0.001, solve: 0.024, lower: 0.002, paint: 0.01 }, 0.026, 1.7),
      ...mk("scatter", { resolve: 0.003, axes: 0.0005, embed: 0.001, solve: 0.02, lower: 0.0025, paint: 0.012 }, 0.021, 1.2),
      ...mk("grid", { resolve: 0.004, axes: 0.0008, embed: 0.0012, solve: 0.03, lower: 0.003, paint: 0.013 }, 0.033, 1.9),
    ],
  };
}

const results = (): BenchResults => {
  const injected = (window as any).__BENCH_RESULTS__ as Partial<BenchResults> | undefined;
  if (!injected) return fallbackResults();
  // Be defensive: a quick-mode run can ship empty arrays. Fall back per-slice so
  // a partial results.json still yields readable plots.
  const fb = fallbackResults();
  return {
    examplesJs: injected.examplesJs?.length ? injected.examplesJs : fb.examplesJs,
    examplesPy: injected.examplesPy?.length ? injected.examplesPy : fb.examplesPy,
    synthetic: injected.synthetic?.length ? injected.synthetic : fb.synthetic,
  };
};

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** A small styled caption appended under a plot. */
function caption(container: HTMLElement, text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText =
    "font: 11px/1.4 system-ui, sans-serif; color: #666; margin: 4px 0 0 40px; max-width: 620px;";
  container.appendChild(el);
}

/** A small styled title above a plot. */
function heading(container: HTMLElement, text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText =
    "font: 600 13px/1.4 system-ui, sans-serif; color: #222; margin: 0 0 2px 40px;";
  container.appendChild(el);
}

// ---------------------------------------------------------------------------
// Asymptotics: solve-pass time vs scene size (log-log), one line per family.
// The slope of each line ≈ that family's empirical exponent.
// ---------------------------------------------------------------------------

export const Asymptotics: StoryObj<Args> = {
  args: { w: 640, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    heading(container, "Solve-pass time vs. scene size");

    const families = [...new Set(results().synthetic.map((p) => p.family))].filter(
      (f) => f !== "nest"
    );
    // One flat point set placed in a single log-log space; lines are drawn by
    // grouping the placed points per family. Sort so within-family order is
    // ascending in n (the polyline threads points left→right).
    const pts = results()
      .synthetic.filter((p) => families.includes(p.family))
      .slice()
      .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.n - b.n))
      .map((p, i) => ({
        id: i,
        family: p.family,
        "log₁₀ nodes": log10(p.n),
        "log₁₀ solve ms": log10(p.passes.solve?.median ?? 0.001),
      }));

    chart(pts, { color: palette(FAMILY_COLORS), axes: true })
      .flow(scatter({ by: "id", x: "log₁₀ nodes", y: "log₁₀ solve ms" }))
      .mark(circle({ r: 2.5, fill: "family" }))
      .layer(
        chart()
          .flow(group({ by: "family" }))
          .mark(line({ strokeWidth: 2 }))
      )
      .render(container, { w: args.w, h: args.h });

    caption(
      container,
      "Each line is a synthetic layout family; a slope near 1 on log–log axes means linear scaling."
    );
    return container;
  },
};

// ---------------------------------------------------------------------------
// Per-pass breakdown for one family (log-log), all passes overlaid so their
// relative cost and slopes are directly comparable.
// ---------------------------------------------------------------------------

export const PassBreakdown: StoryObj<Args & { family: string }> = {
  args: { w: 640, h: 400, family: "spread" },
  render: (args) => {
    const container = initializeContainer();
    heading(container, `Per-pass cost vs. scene size — ${args.family}`);

    const src = results().synthetic.filter((p) => p.family === args.family);
    const fam = src.length ? src : results().synthetic.filter((p) => p.family === "spread");
    const pts = fam
      .slice()
      .sort((a, b) => a.n - b.n)
      .flatMap((p, i) =>
        ENGINE_PASSES.map((pass, j) => ({
          id: i * 100 + j,
          pass,
          "log₁₀ nodes": log10(p.n),
          "log₁₀ pass ms": log10(p.passes[pass]?.median ?? 0.0005),
        }))
      );

    chart(pts, { color: palette(PASS_COLORS), axes: true })
      .flow(scatter({ by: "id", x: "log₁₀ nodes", y: "log₁₀ pass ms" }))
      .mark(circle({ r: 2.5, fill: "pass" }))
      .layer(
        chart()
          .flow(group({ by: "pass" }))
          .mark(line({ strokeWidth: 2 }))
      )
      .render(container, { w: args.w, h: args.h });

    caption(
      container,
      "solve dominates; the cheap passes (embed, axes) sit an order of magnitude below."
    );
    return container;
  },
};

// ---------------------------------------------------------------------------
// Ecological: aggregate per-example cost, JS engine vs the Python round-trip
// (the deserialize + RPC "tax" on top of the identical engine work).
// ---------------------------------------------------------------------------

export const Ecological: StoryObj<Args> = {
  args: { w: 560, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    heading(container, "Median per-example cost by stage");

    const r = results();
    const data = [
      { stage: "JS engine", ms: median(r.examplesJs.map((e) => e.totalMs.median)) },
      { stage: "PY engine", ms: median(r.examplesPy.map((e) => e.totalMs.median)) },
      { stage: "PY load", ms: median(r.examplesPy.map((e) => e.loadMs.median)) },
      { stage: "PY RPC", ms: median(r.examplesPy.map((e) => e.overheadMs.median)) },
    ];

    chart(data, {
      axes: true,
      color: palette({
        "JS engine": "#4e79a7",
        "PY engine": "#59a14f",
        "PY load": "#f28e2b",
        "PY RPC": "#e15759",
      }),
    })
      .flow(spread({ by: "stage", dir: "x", spacing: 36 }))
      .mark(rect({ h: "ms", w: 64, fill: "stage" }))
      .render(container, { w: args.w, h: args.h });

    caption(
      container,
      "The JS and PY engine bars are the same layout work; PY load + RPC are the bridge overhead."
    );
    return container;
  },
};

// ---------------------------------------------------------------------------
// Trend: run-over-run health from the benchmarks data branch.
//   Panel 1 — ecological index per pass (+ total), 1.0 = first-run baseline.
//   Panel 2 — fitted solve exponent b per family across runs.
// ---------------------------------------------------------------------------

type TrendRun = {
  idx: number;
  label: string;
  timestamp?: string;
  rulerVersion?: string | null;
  matchedCount?: number;
  ecologicalIndex: Record<string, number>;
  exponents: Record<string, { solve: { a: number; b: number; r2: number }; total: { a: number; b: number; r2: number } }>;
};

function fallbackHistory(): TrendRun[] {
  const passKeys = [...ENGINE_PASSES, "total"];
  const families = ["spread", "stack", "scatter", "grid"];
  return Array.from({ length: 9 }, (_, i) => ({
    idx: i,
    label: `sha${i}`.padEnd(7, "0"),
    timestamp: new Date(2026, 5, 20 + i).toISOString(),
    rulerVersion: "1",
    matchedCount: 41 + (i % 3),
    ecologicalIndex: Object.fromEntries(
      passKeys.map((k) => {
        const drift = 1 + Math.sin((i + k.length) / 2.5) * 0.06 - i * 0.004;
        return [k, k === "total" ? 1 + Math.sin(i / 2.2) * 0.04 - i * 0.006 : drift];
      })
    ),
    exponents: Object.fromEntries(
      families.map((f, fi) => {
        const b = 1.0 + Math.sin((i + fi) / 3) * 0.08 + fi * 0.02;
        return [f, { solve: { a: 0.02, b, r2: 0.99 }, total: { a: 0.03, b: b + 0.03, r2: 0.99 } }];
      })
    ),
  }));
}

export const Trend: StoryObj<Args> = {
  args: { w: 640, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    const injected = (window as any).__BENCH_HISTORY__ as TrendRun[] | undefined;
    // Only trust injected history that speaks the current schema (older runs
    // carried a flat `passes` map with no ecological index / exponents).
    const hist: TrendRun[] =
      injected?.length && injected[0]?.ecologicalIndex ? injected : fallbackHistory();
    const latest = hist[hist.length - 1];

    // --- Panel 1: ecological index per pass over runs -----------------------
    const panel1 = document.createElement("div");
    container.appendChild(panel1);
    heading(panel1, "Ecological performance index over runs");

    const passKeys = ENGINE_PASSES; // total drawn separately, emphasized
    const idxPts = hist.flatMap((run, i) =>
      passKeys.map((pass, j) => ({
        id: i * 100 + j,
        pass,
        run: run.idx,
        index: run.ecologicalIndex?.[pass] ?? 1,
      }))
    );
    const totalPts = hist.map((run, i) => ({
      id: i,
      pass: "total",
      run: run.idx,
      index: run.ecologicalIndex?.total ?? 1,
    }));

    chart(idxPts, { color: palette(PASS_COLORS), axes: true })
      .flow(scatter({ by: "id", x: "run", y: "index" }))
      .mark(circle({ r: 2, fill: "pass" }))
      .layer(
        chart()
          .flow(group({ by: "pass" }))
          .mark(line({ strokeWidth: 1.5 }))
      )
      .layer(
        chart(totalPts, { color: palette(PASS_COLORS) })
          .flow(scatter({ by: "id", x: "run", y: "index" }))
          .mark(circle({ r: 3, fill: "pass" }))
      )
      .layer(
        chart()
          .flow(group({ by: "pass" }))
          .mark(line({ strokeWidth: 3 }))
      )
      .render(panel1, { w: args.w, h: args.h });

    // --- Panel 2: fitted solve exponent b per family over runs --------------
    const panel2 = document.createElement("div");
    container.appendChild(panel2);
    heading(panel2, "Fitted solve exponent (b) over runs");

    const families = [...new Set(hist.flatMap((r) => Object.keys(r.exponents ?? {})))];
    const expPts = hist.flatMap((run, i) =>
      families.map((family, j) => ({
        id: i * 100 + j,
        family,
        run: run.idx,
        b: run.exponents?.[family]?.solve?.b ?? 1,
      }))
    );

    chart(expPts, { color: palette(FAMILY_COLORS), axes: true })
      .flow(scatter({ by: "id", x: "run", y: "b" }))
      .mark(circle({ r: 2, fill: "family" }))
      .layer(
        chart()
          .flow(group({ by: "family" }))
          .mark(line({ strokeWidth: 1.5 }))
      )
      .render(panel2, { w: args.w, h: args.h });

    caption(
      container,
      `Index 1.0 = first tracked run (lower is faster). Latest run ${latest?.label ?? "?"}` +
        (latest?.matchedCount != null ? ` · ${latest.matchedCount} examples matched` : "")
    );
    return container;
  },
};

// ---------------------------------------------------------------------------
// Envelope: real charts sit on/under the synthetic cost envelope. X = scene
// node count (log), Y = engine total ms (log). Dots = JS examples; lines = the
// synthetic families' cost curves.
// ---------------------------------------------------------------------------

export const Envelope: StoryObj<Args> = {
  args: { w: 640, h: 440 },
  render: (args: Args) => {
    const container = initializeContainer();
    heading(container, "Real examples vs. the synthetic cost envelope");

    const r = results();
    const families = [...new Set(r.synthetic.map((p) => p.family))].filter((f) => f !== "nest");

    // Synthetic curves — placed points, then a line per family group.
    const synPts = r.synthetic
      .filter((p) => families.includes(p.family) && p.counts)
      .slice()
      .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.n - b.n))
      .map((p, i) => ({
        id: i,
        family: p.family,
        "log₁₀ nodes": log10(p.counts!.nodes),
        "log₁₀ engine ms": log10(p.totalMs.median),
      }));

    // Real examples — only those with a node count.
    const exPts = r.examplesJs
      .filter((e) => e.counts)
      .map((e, i) => ({
        id: `ex${i}`,
        family: "example",
        "log₁₀ nodes": log10(e.counts!.nodes),
        "log₁₀ engine ms": log10(e.totalMs.median),
      }));

    const base = chart(synPts, { color: palette(FAMILY_COLORS), axes: true })
      .flow(scatter({ by: "id", x: "log₁₀ nodes", y: "log₁₀ engine ms" }))
      .mark(circle({ r: 2, fill: "family" }))
      .layer(
        chart()
          .flow(group({ by: "family" }))
          .mark(line({ strokeWidth: 2 }))
      );

    // Overlay example dots in the same space only when we have any.
    const final = exPts.length
      ? base.layer(
          chart(exPts)
            .flow(scatter({ by: "id", x: "log₁₀ nodes", y: "log₁₀ engine ms" }))
            .mark(circle({ r: 4, fill: "#111", stroke: "white", strokeWidth: 1 }))
        )
      : base;

    final.render(container, { w: args.w, h: args.h });

    caption(
      container,
      "Black dots = real JS examples; colored lines = synthetic families. Dots on/under the fan mean real charts scale no worse than the synthetics."
    );
    return container;
  },
};

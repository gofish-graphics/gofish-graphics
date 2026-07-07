// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * Zero-overhead-when-off performance instrumentation for the render pipeline.
 *
 * The layout/render passes call {@link perfNow} / {@link perfAdd} to record how
 * long each labeled phase takes, and {@link perfSetCount} to record scene-graph
 * size counters (`nodes`, `displayItems`). Everything is gated on a single global switch
 * (`globalThis.__GOFISH_PERF__.enabled`); when it is unset/false the helpers are
 * a boolean check and a no-op — no `performance.now()`, no allocation — so the
 * instrumentation can live permanently on the hot path.
 *
 * Collection model (deliberately NOT a self-closing "run"): the SVG paint pass
 * (`lower`/`paint`) happens *after* `runLayout()` returns, inside SolidJS's
 * reactive render. So a single render's labels accumulate into a shared
 * `current` bucket that {@link perfBeginRun} resets at the *start* of each
 * `runLayout()`. A driver (the bench harness) times the whole render call for
 * the authoritative wall-clock total, then reads `current.labels` (timings) and
 * `current.counts` (scene-graph sizes) via {@link perfSnapshot} once the render
 * has completed — by which point `lower` and `paint` are already recorded and
 * the next render hasn't reset anything. The bench driver reads
 * `window.__GOFISH_PERF__.current.counts` directly, so that global shape
 * (`current.counts.nodes`, `current.counts.displayItems`) is the contract.
 *
 * The recognized labels are: `fonts` (webfont readiness await), `resolve`
 * (domain inference / underlying-space resolution), `axes` (axis/title/legend
 * elaboration), `embed` (per-dim embedding-flag authoring, `resolveEmbedding`),
 * `solve` (constraint solve), `lower` (display-list lowering), `paint`
 * (display-item → SVG JSX).
 *
 * The recognized counts are: `nodes` (scene-graph nodes in the fully elaborated
 * tree the solver sees, recorded just before `solve`) and `displayItems` (items
 * emitted by `lower`). Counts are absolute sizes, set via {@link perfSetCount}
 * (not accumulated).
 *
 * ## Published build pays nothing
 *
 * The whole subsystem is additionally gated on the compile-time constant
 * `__GOFISH_PERF_INSTRUMENTATION__`. The library production build
 * (`vite.config.ts`, `command === "build"`) `define`s it to `false`, so the
 * minifier folds {@link perfEnabled} to a constant `false` and dead-code-
 * eliminates the global lookups and accumulation entirely — the npm package
 * carries no instrumentation. Dev (`pnpm dev`) and the bench harness (the tests
 * Vite server) leave the constant undefined, so it defaults to `true` and the
 * runtime `enabled` flag governs collection as described above. The dedicated
 * `build:bench` production build (`vite build --mode bench` → `dist-bench/`)
 * `define`s the constant to `true`, so the instrumentation survives a minified,
 * production-codegen bundle the bench driver can alias `gofish-graphics` to. `typeof` guards
 * the reference so an undefined token is safe rather than a ReferenceError.
 */

// Replaced with a literal `false` by the library production build's `define`;
// left undefined elsewhere (dev / tests harness) where it defaults to `true`.
declare const __GOFISH_PERF_INSTRUMENTATION__: boolean | undefined;
const INSTRUMENTATION_COMPILED_IN: boolean =
  typeof __GOFISH_PERF_INSTRUMENTATION__ === "undefined"
    ? true
    : __GOFISH_PERF_INSTRUMENTATION__;

export type PerfLabels = Record<string, number>;
export type PerfCounts = Record<string, number>;

export type PerfState = {
  enabled: boolean;
  /** Accumulator for the in-flight render. Reset by {@link perfBeginRun}. */
  current: {
    labels: PerfLabels;
    counts: PerfCounts;
    startedAt: number;
  } | null;
};

declare global {
  var __GOFISH_PERF__: PerfState | undefined;
}

const state = (): PerfState | undefined =>
  (globalThis as { __GOFISH_PERF__?: PerfState }).__GOFISH_PERF__;

/**
 * True when instrumentation is both compiled in and switched on at runtime.
 * In the published build `INSTRUMENTATION_COMPILED_IN` folds to `false`, so this
 * folds to `false` and every guarded section below is eliminated.
 */
export const perfEnabled = (): boolean =>
  INSTRUMENTATION_COMPILED_IN && state()?.enabled === true;

/**
 * `performance.now()` when enabled, else `0`. Pair with {@link perfAdd}:
 * `const t = perfNow(); ...work...; perfAdd("solve", perfNow() - t);`.
 * The `0 - 0` no-op subtraction when disabled is intentional and free.
 */
export const perfNow = (): number =>
  perfEnabled() && typeof performance !== "undefined" ? performance.now() : 0;

/** Add `deltaMs` to a label's running total for the current render. */
export const perfAdd = (label: string, deltaMs: number): void => {
  if (!INSTRUMENTATION_COMPILED_IN) return;
  const s = state();
  if (!s?.enabled || !s.current) return;
  s.current.labels[label] = (s.current.labels[label] ?? 0) + deltaMs;
};

/** Set a scene-graph size counter (absolute, not accumulated). No-op when off. */
export const perfSetCount = (name: string, value: number): void => {
  if (!INSTRUMENTATION_COMPILED_IN) return;
  const s = state();
  if (!s?.enabled || !s.current) return;
  s.current.counts[name] = value;
};

/** Begin a fresh render: clears the per-pass accumulators. No-op when off. */
export const perfBeginRun = (): void => {
  if (!INSTRUMENTATION_COMPILED_IN) return;
  const s = state();
  if (!s?.enabled) return;
  s.current = { labels: {}, counts: {}, startedAt: perfNow() };
};

/**
 * Snapshot the current render's labels and counts (shallow copies), or `null`
 * when off.
 */
export const perfSnapshot = (): {
  labels: PerfLabels;
  counts: PerfCounts;
} | null => {
  if (!INSTRUMENTATION_COMPILED_IN) return null;
  const s = state();
  if (!s?.enabled || !s.current) return null;
  return { labels: { ...s.current.labels }, counts: { ...s.current.counts } };
};

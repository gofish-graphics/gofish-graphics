/**
 * Synthetic micro-benchmark spec generators.
 *
 * Each family is a function of a single scale parameter `n` that builds a v3
 * `chart(...)` and returns a `BenchSpec` whose `render` paints it into a
 * container. The bench runner (`tests/harness/bench-runner.ts`) sweeps `n` over
 * a family and records the per-pass timings reported by the engine's perf
 * instrumentation, so we can read off the practical asymptotics of each layout
 * pass (resolve / solve / lower / paint) against problem size.
 *
 * Families are chosen to isolate distinct layout-engine stressors:
 *  - `spread` / `stack` — a flat array of `n` sibling marks under one operator
 *    (the common "many leaves, one branch point" case; stack additionally sums
 *    `n` sizes into a position).
 *  - `scatter` — `n` independently positioned points (posScale over `n` rows).
 *  - `grid` — ⌈√n⌉ groups × ⌈√n⌉ leaves: a two-level nest, i.e. many *branch
 *    points* each with many children (the σ-solve fan-out case).
 *  - `nest` — a chain of `depth` nested single-child facets: pure recursion /
 *    scope-nesting depth, swept independently of leaf count.
 *
 * This module is imported by the harness Vite server (which aliases
 * `gofish-graphics` to the package source), so it always runs against
 * instrumented engine code.
 */

import { chart, spread, stack, scatter, rect, circle } from "gofish-graphics";

export type RenderOpts = { w: number; h: number };

export type BenchSpec = {
  /** Render into `container`; resolves when the chart has painted. */
  render: (container: HTMLElement, opts: RenderOpts) => Promise<unknown>;
};

/** A family parameterized by a single scale `n`. */
export type CountFamily = (n: number) => BenchSpec;

/** Deterministic synthetic value in [10, 60) — no RNG, so sweeps are stable. */
const val = (i: number): number => 10 + (i % 50);

const rows = (n: number): { i: number; v: number }[] =>
  Array.from({ length: n }, (_, i) => ({ i, v: val(i) }));

/** `n` rects spread along x — flat fan-out, one branch point. */
export const spreadFamily: CountFamily = (n) => ({
  render: (container, { w, h }) =>
    chart(rows(n))
      .flow(spread({ dir: "x", spacing: 1 }))
      .mark(rect({ w: 4, h: "v" }))
      .render(container, { w, h }),
});

/** `n` rects stacked along y — flat fan-out plus an `n`-way position sum. */
export const stackFamily: CountFamily = (n) => ({
  render: (container, { w, h }) =>
    chart(rows(n))
      .flow(stack({ dir: "y" }))
      .mark(rect({ w: 20, h: "v" }))
      .render(container, { w, h }),
});

/** `n` independently positioned points — posScale over `n` rows. */
export const scatterFamily: CountFamily = (n) => ({
  render: (container, { w, h }) => {
    const data = Array.from({ length: n }, (_, i) => ({
      x: i,
      y: val(i) + (i % 7),
    }));
    return chart(data)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 2 }))
      .render(container, { w, h });
  },
});

/** ⌈√n⌉ groups × ⌈√n⌉ leaves — many branch points, each with many children. */
export const gridFamily: CountFamily = (n) => {
  const side = Math.max(1, Math.ceil(Math.sqrt(n)));
  return {
    render: (container, { w, h }) => {
      const data = Array.from({ length: side * side }, (_, k) => ({
        g: Math.floor(k / side),
        i: k % side,
        v: val(k),
      }));
      return chart(data)
        .flow(spread({ by: "g", dir: "x", spacing: 4 }))
        .mark((d: any) =>
          chart(d)
            .flow(spread({ by: "i", dir: "y", spacing: 1 }))
            .mark(rect({ w: 4, h: 4 }))
        )
        .render(container, { w, h });
    },
  };
};

/** All count-parameterized families, keyed by name. */
export const countFamilies: Record<string, CountFamily> = {
  spread: spreadFamily,
  stack: stackFamily,
  scatter: scatterFamily,
  grid: gridFamily,
};

/**
 * A chain of `depth` nested single-child facets (each level spreads a one-row
 * partition into the next), terminating in a single rect. Isolates recursion /
 * scope-nesting depth from leaf count.
 */
export const nestFamily = (depth: number): BenchSpec => {
  const build = (level: number): any => {
    const data = [{ i: 0, v: 30 }];
    if (level <= 0) {
      return chart(data)
        .flow(spread({ dir: "x" }))
        .mark(rect({ w: 8, h: "v" }));
    }
    return chart(data)
      .flow(spread({ dir: "x" }))
      .mark(() => build(level - 1));
  };
  return {
    render: (container, { w, h }) => build(depth).render(container, { w, h }),
  };
};

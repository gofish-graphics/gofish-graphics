import { spread as gfSpread, Layer, Constraint } from "gofish-graphics";
import type { Combiner, DepthCombiner, Alignment } from "./spec";

/**
 * `perDepth` builds a depth-indexed combiner: `fn(depth)` returns the `Combiner`
 * to use for the subtree at that depth. Use it (in a `parentChild`/`sibling`
 * slot) for layouts that vary their template by level.
 *
 * `alternate([a, b, ...])` is the common parity case — it cycles through the
 * combiners by `depth % length` (e.g. swap the spread axis every level for an
 * H-tree, or slice vs. dice every level for a treemap).
 */
export const perDepth = (fn: (depth: number) => Combiner): DepthCombiner => ({
  atDepth: fn,
});

export const alternate = (combiners: Combiner[]): DepthCombiner => ({
  atDepth: (depth: number) => combiners[depth % combiners.length],
});

export type SpreadOptions = {
  dir: "x" | "y";
  spacing?: number;
  alignment?: Alignment;
  /**
   * `"edge"` (default) sums children's bbox widths into the stack span;
   * `"middle"` places child centers `spacing` apart and ignores bbox widths.
   * Use `"middle"` under polar (or any coord transform) where nodes render
   * as points — bbox accumulation would otherwise overflow the transform's
   * domain. Spacing is in domain units (radians for polar theta).
   */
  anchor?: "edge" | "start" | "middle" | "end" | "baseline";
};

/**
 * Spread helper: wraps `gofish-graphics`' `spread` operator as a `Combiner`.
 *
 * When used as a `parentChild` combiner with `dir: "y"`, the helper swaps the
 * two children so the parent ends up at high y (top of the screen) — GoFish
 * is y-up, so the first child of `spreadY` would otherwise land at the bottom.
 * For `dir: "x"` the natural order (parent first → low x → left) is kept.
 * When used as a `sibling` combiner (N children, not 2), no swap is applied.
 */
export const spread = (opts: SpreadOptions): Combiner => {
  const combiner: Combiner = (children: any[]) => {
    const ordered =
      children.length === 2 && opts.dir === "y"
        ? [children[1], children[0]]
        : children;
    return gfSpread(opts as any, ordered);
  };
  combiner.growthDir = opts.dir;
  return combiner;
};

export type DistributeOptions = {
  dir: "x" | "y";
  spacing?: number;
  anchor?: "edge" | "start" | "middle" | "end" | "baseline";
  /** "forward" (default): index 0 at low coord, walking up. "reverse": flip. */
  order?: "forward" | "reverse";
  /**
   * Alignment on the orthogonal axis. When provided, a separate
   * `Constraint.align` is emitted alongside the distribute — keeping the
   * two axes independently expressed (which is the point of preferring
   * distribute constraints over a single coupled `spread` operator).
   */
  alignment?: Alignment;
};

/**
 * Distribute helper: places children along `dir` with `spacing` between
 * them via `Constraint.distribute`. Unlike `spread`, this only positions
 * on the named axis — the orthogonal axis is left for a separate
 * constraint (set `alignment` for a paired `Constraint.align`, or omit
 * for axis-baseline placement).
 *
 * Useful when x and y need independent control (e.g. polar sunburst
 * where parentChild distributes radially and siblings distribute
 * angularly, but the two axes have nothing else in common).
 */
export const distribute = (opts: DistributeOptions): Combiner => {
  const combiner: Combiner = (children: any[]) => {
    // Each child needs a stable name so the Layer's constraint refs resolve.
    // Wrap in a thin Layer (chainable .name()) rather than calling .name on
    // the child directly — the latter loses chainability for createMark-
    // produced NameableMarks.
    const named = children.map((c, i) => Layer([c]).name(`__distribute-${i}`));
    const refs = (c: any) => named.map((_, i) => c[`__distribute-${i}`]);
    const orthogonal = opts.dir === "x" ? "y" : "x";
    return Layer(named).constrain((c: any) => {
      const cs: any[] = [
        Constraint.distribute(
          {
            dir: opts.dir,
            spacing: opts.spacing ?? 0,
            anchor: opts.anchor ?? "edge",
            order: opts.order ?? "forward",
          },
          refs(c)
        ),
      ];
      if (opts.alignment !== undefined) {
        cs.push(Constraint.align({ [orthogonal]: opts.alignment }, refs(c)));
      }
      return cs;
    });
  };
  combiner.growthDir = opts.dir;
  return combiner;
};

/**
 * Per-axis combiner spec. Each axis independently picks one constraint kind —
 * this is GoTree's `Layout(x, y)` model expressed directly over GoFish's
 * per-axis constraints (`align` / `distribute` / `nest`). `nest` is only valid
 * on a 2-child relationship (parent ↔ subtree-group); siblings may only use
 * `align` or `distribute`.
 *
 * Shorthand strings use sensible defaults; the object form exposes the knobs.
 */
export type CombineAxis =
  | "align"
  | "distribute"
  | "nest"
  | { kind: "align"; alignment?: Alignment }
  | {
      kind: "distribute";
      spacing?: number;
      order?: "forward" | "reverse";
      anchor?: "edge" | "start" | "middle" | "end" | "baseline";
    }
  | { kind: "nest"; pad?: number };

export type CombineOptions = { x?: CombineAxis; y?: CombineAxis };

const normalizeAxis = (a: CombineAxis | undefined) =>
  typeof a === "string" ? ({ kind: a } as Extract<CombineAxis, object>) : a;

/**
 * `combine` is the general per-axis combiner: it names each child and emits one
 * `Constraint.*` per specified axis. `combine({ x: "nest", y: "distribute" })`
 * grows the outer to wrap the inner horizontally while stacking the pair
 * vertically. Every gotree layout (node-link, icicle, nested boxes, indented,
 * …) is a point in the `{x, y}` constraint space this enumerates.
 *
 * `nest` on either axis requires exactly two children and treats them as
 * `[outer, inner]`; the `spread`/`distribute`/`nest` helpers remain as
 * ergonomic shorthands for the common single-shape cases.
 */
export const combine = (opts: CombineOptions): Combiner => {
  const combiner: Combiner = (children: any[]) => {
    const named = children.map((c, i) => Layer([c]).name(`__combine-${i}`));
    const refs = (c: any) => named.map((_, i) => c[`__combine-${i}`]);
    return Layer(named).constrain((c: any) => {
      const cs: any[] = [];
      for (const axis of ["x", "y"] as const) {
        const spec = normalizeAxis(opts[axis]);
        if (spec === undefined) continue;
        if (spec.kind === "align") {
          cs.push(
            Constraint.align({ [axis]: spec.alignment ?? "middle" }, refs(c))
          );
        } else if (spec.kind === "distribute") {
          cs.push(
            Constraint.distribute(
              {
                dir: axis,
                spacing: spec.spacing ?? 0,
                order: spec.order ?? "forward",
                anchor: spec.anchor ?? "edge",
              },
              refs(c)
            )
          );
        } else if (spec.kind === "nest") {
          if (children.length !== 2) {
            throw new Error(
              `gofish-gotree combine(): nest on the ${axis} axis requires exactly 2 children [outer, inner], got ${children.length}`
            );
          }
          cs.push(
            Constraint.nest({ [axis]: spec.pad ?? 0 }, [
              c["__combine-0"],
              c["__combine-1"],
            ])
          );
        }
      }
      return cs;
    });
  };
  // Growth axis = the single axis that separates parent from child. `distribute`
  // pushes them apart; `align`/`nest` don't (align is cross-axis, nest is
  // containment). So the growth axis is the lone `distribute` axis; when both or
  // neither distribute (a diagonal cascade, or a pure nest/align), it's
  // ambiguous and links infer the bend from geometry instead.
  const distributeAxes = (["x", "y"] as const).filter(
    (axis) => normalizeAxis(opts[axis])?.kind === "distribute"
  );
  if (distributeAxes.length === 1) combiner.growthDir = distributeAxes[0];
  return combiner;
};

export type NestOptions = { x?: number; y?: number };

const OUTER_NAME = "__nest-outer";
const INNER_NAME = "__nest-inner";

/**
 * Nest helper: wraps `[outer, inner]` in a Layer with
 * `Constraint.nest({x?, y?}, [outer, inner])`. When the inner carries the
 * size and the outer does not (the tree-nesting case), outer sizes to inner's
 * intrinsic dims + 2*padding on each constrained axis and inner is centered
 * inside outer on the same axes.
 *
 * Naming: the nest constraint references its children by name, so we wrap
 * each in a thin Layer named `__nest-outer` / `__nest-inner`. We can't
 * just call `.name()` on the user's nodeMark because createMark's NameableMark
 * loses chainability after the first `.name()` (the result is a plain Mark
 * whose `.name` is the built-in function property). Wrapping in a fresh Layer
 * sidesteps that — `Layer(...).name(...)` chains correctly through the
 * createNodeOperatorSequential PromiseWithRender. The wrapper Layer has no
 * fixed size, so nest's size-override propagates through to the user's
 * mark inside.
 */
export const nest =
  (opts: NestOptions): Combiner =>
  (children: any[]) => {
    if (children.length !== 2) {
      throw new Error(
        `gofish-gotree nest(): expected exactly 2 children [outer, inner], got ${children.length}`
      );
    }
    const [outer, inner] = children;
    const namedOuter = Layer([outer]).name(OUTER_NAME);
    const namedInner = Layer([inner]).name(INNER_NAME);
    return Layer([namedOuter, namedInner]).constrain((c: any) => [
      Constraint.nest(opts, [c[OUTER_NAME], c[INNER_NAME]]),
    ]);
  };

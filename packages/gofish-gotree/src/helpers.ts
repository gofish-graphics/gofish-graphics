import { spread as gfSpread, Layer, Constraint } from "gofish-graphics";
import type { Combiner, Alignment } from "./spec";

export type SpreadOptions = {
  dir: "x" | "y";
  spacing?: number;
  alignment?: Alignment;
  /**
   * `"edge"` (default) sums children's bbox widths into the stack span;
   * `"center"` places child centers `spacing` apart and ignores bbox widths.
   * Use `"center"` under polar (or any coord transform) where nodes render
   * as points — bbox accumulation would otherwise overflow the transform's
   * domain. Spacing is in domain units (radians for polar theta).
   */
  mode?: "edge" | "center";
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
export const spread =
  (opts: SpreadOptions): Combiner =>
  (children: any[]) => {
    const ordered =
      children.length === 2 && opts.dir === "y"
        ? [children[1], children[0]]
        : children;
    return gfSpread(opts as any, ordered);
  };

export type DistributeOptions = {
  dir: "x" | "y";
  spacing?: number;
  mode?: "edge" | "center";
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
export const distribute =
  (opts: DistributeOptions): Combiner =>
  (children: any[]) => {
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
            mode: opts.mode ?? "edge",
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

export type ContainOptions = { x?: number; y?: number };

const OUTER_NAME = "__contain-outer";
const INNER_NAME = "__contain-inner";

/**
 * Contain helper: wraps `[outer, inner]` in a Layer with
 * `Constraint.contain({x?, y?}, [outer, inner])`. Outer sizes to inner's
 * intrinsic dims + 2*padding on each constrained axis; inner is centered
 * inside outer on the same axes.
 *
 * Naming: the contain constraint references its children by name, so we wrap
 * each in a thin Layer named `__contain-outer` / `__contain-inner`. We can't
 * just call `.name()` on the user's nodeMark because createMark's NameableMark
 * loses chainability after the first `.name()` (the result is a plain Mark
 * whose `.name` is the built-in function property). Wrapping in a fresh Layer
 * sidesteps that — `Layer(...).name(...)` chains correctly through the
 * createNodeOperatorSequential PromiseWithRender. The wrapper Layer has no
 * fixed size, so contain's size-override propagates through to the user's
 * mark inside.
 */
export const contain =
  (opts: ContainOptions): Combiner =>
  (children: any[]) => {
    if (children.length !== 2) {
      throw new Error(
        `gofish-gotree contain(): expected exactly 2 children [outer, inner], got ${children.length}`
      );
    }
    const [outer, inner] = children;
    const namedOuter = Layer([outer]).name(OUTER_NAME);
    const namedInner = Layer([inner]).name(INNER_NAME);
    return Layer([namedOuter, namedInner]).constrain((c: any) => [
      Constraint.contain(opts, [c[OUTER_NAME], c[INNER_NAME]]),
    ]);
  };

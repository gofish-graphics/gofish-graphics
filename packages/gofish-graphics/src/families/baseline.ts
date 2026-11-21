// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Baseline` family: where a stack or a spread puts its own 0, the point
 * its parent lines up with other baselines. It is the value of the
 * `baseline` option of `stack` and `spread`.
 *
 * `lib.ts` binds this module as `Baseline` (`Baseline.middle()`), and
 * `gofish-graphics/baseline` exports the same module. A baseline is a plain
 * object, `{ kind, ...params }`, and that object is also its wire form. The
 * kinds and their params are declared once, in gofish-ir's `STRATEGIES`
 * table. `start`, `end`, `middle` and `wiggle` have no options, so each is a
 * value as it is (`Baseline.middle` is `Baseline.middle()`, #1133);
 * `Baseline.at(part, point)` is a call only.
 *
 * A stack lays its parts end to end, each part's tail on the previous part's
 * head. Its start is the first part's tail and its end the last part's head.
 * The stack's fold reads the baseline (`chainFold` in
 * `ast/constraints/distribute.ts`), and so does its placement
 * (`lowerDistributePlacement`). `Trait.diverging()` on the `by` column's unit
 * is `Baseline.at` at the column's midpoint (`stackOrigin` in
 * `ast/schema.ts`).
 *
 * A spread takes every kind but `wiggle`. Its start is its first child's
 * start and its end its last child's end, and its gaps are part of the way.
 * Its baseline only places it (`lowerDistributePlacement`); its fold ignores
 * it.
 */
import type { Frontend } from "gofish-ir";
import { bareKind } from "../ast/strategyKind";

/** A baseline: what a `baseline` option takes. */
export type Baseline = Frontend.BaselineIR;

/** A point on one part: a fraction of the way from its tail to its head (0
 *  is its tail, 1 its head), or one of its anchors (`"baseline"` is its own
 *  0: a bar's tail, or a nested spread's or stack's baseline). */
export type Point = Frontend.BaselinePointIR;

/** The baseline of kind `K`. */
type Kind<K extends Baseline["kind"]> = Extract<Baseline, { kind: K }>;

/** The start of the stack, where its first part's tail is. The default. */
export const start = bareKind(
  "Baseline.start",
  (): Kind<"start"> => ({ kind: "start" })
);

/** The end of the stack, where its last part's head is, so the parts lie
 *  before 0: bars that grow the other way. */
export const end = bareKind(
  "Baseline.end",
  (): Kind<"end"> => ({ kind: "end" })
);

/** Halfway from the start of the stack to its end, so the stack is centered
 *  on its baseline (d3's `stackOffsetSilhouette`). A position on the stack's
 *  axis is then no amount from 0, so the stack's space has no 0, only a
 *  thickness. */
export const middle = bareKind(
  "Baseline.middle",
  (): Kind<"middle"> => ({ kind: "middle" })
);

/** A baseline that moves along the cross axis to keep the bands as flat as
 *  it can: at each place its slope cancels the average slope of the middles
 *  of the parts, weighted by their thickness (d3's `stackOffsetWiggle`,
 *  Byron and Wattenberg 2008). A streamgraph. Over parts that are boxes it is
 *  {@link start}. Like {@link middle}, it leaves the stack with no 0. */
export const wiggle = bareKind(
  "Baseline.wiggle",
  (): Kind<"wiggle"> => ({ kind: "wiggle" })
);

/**
 * A point on one part.
 *
 * @param part A value of the `by` column in a flow, or a child index in the
 *   combinator form. A part the data lacks is placed by the order of the
 *   `by` column (its declared levels) and moves nothing: the baseline falls
 *   on the boundary where the part would be.
 * @param point A fraction of the way from the part's tail to its head, or
 *   `"start"`, `"middle"`, `"end"` or `"baseline"` (its own 0).
 */
export const at = (part: string | number, point: Point): Kind<"at"> => ({
  kind: "at",
  part,
  point,
});

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Spacing` family: how far apart `spread` sets its neighbors along its
 * `dir`, the value of its `spacing` option. `Constraint.distribute` takes the
 * same value as its `spacing`.
 *
 * `lib.ts` binds this module as `Spacing` (`Spacing.pitch(70, { at:
 * "baseline" })`), and `gofish-graphics/spacing` exports the same module.
 * Both kinds take a required amount, so each is a call only. A strategy is a
 * plain object, `{ kind, ...params }`, and that object is also its wire form,
 * so it crosses the Python bridge as IR. The kinds and their params are
 * declared once, in gofish-ir's `STRATEGIES` table, which checks a strategy
 * where `distribute` reads it (`ast/constraints/distribute.ts`).
 *
 * A bare amount (`spacing: 4`, `spacing: fr(1)`) is `Spacing.box(4)`: the
 * chain reads it as that strategy (`spacingOf` in distribute.ts).
 */
import type { LengthValue } from "../ast/length";
import type { Gap } from "../ast/constraints/gap";
import { given } from "../ast/strategyKind";

/** The amount a spacing lays out: pixels, a percent of the room of the
 *  layer that holds the chain, or an `fr` weight in its scope. */
export type Amount = number | LengthValue;

/** `box()`: a gap between facing edges. See {@link box}. */
export type BoxSpacing = { kind: "box"; gap: Gap };

/** The point on each child that `pitch()` measures from. */
export type PitchAt = "start" | "middle" | "end" | "baseline";

/** `pitch()`: a fixed distance between the same point on each child. See
 *  {@link pitch}. */
export type PitchSpacing = { kind: "pitch"; distance: Gap; at?: PitchAt };

/** Every built-in spacing: the value of `spread`'s `spacing`. */
export type Spacing = BoxSpacing | PitchSpacing;

/**
 * A gap between the facing edges of each child's box: the end of one child
 * to the start of the next. The distance between the children depends on
 * their sizes. A bare amount for `spacing` is this kind.
 *
 * @param gap Pixels, `percent(n)` of the spread's room, or `fr(k)` shares of
 *   its scope. A negative gap overlaps the children.
 */
export function box(gap: Amount): BoxSpacing {
  return { kind: "box", gap };
}

/**
 * A fixed distance between the same point on each child: from that point on
 * one child to that point on the next. The distance does not depend on the
 * children's sizes, so rows of different heights keep an even step.
 *
 * @param distance Pixels, `percent(n)` of the spread's room, or `fr(k)`
 *   shares of its scope.
 * @param at The point on each child: `"start"` or `"end"` of its box, its
 *   `"middle"` (center to center), or its `"baseline"` (its local 0).
 *   Default `"baseline"`.
 */
export function pitch(
  distance: Amount,
  opts: { at?: PitchAt } = {}
): PitchSpacing {
  return { kind: "pitch", distance, ...given(opts) };
}

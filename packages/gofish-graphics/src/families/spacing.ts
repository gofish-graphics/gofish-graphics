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
 * Every kind takes a required amount, so each is a call only. A strategy is a
 * plain object, `{ kind, ...params }`, and that object is also its wire form,
 * so it crosses the Python bridge as IR. The kinds and their params are
 * declared once, in gofish-ir's `STRATEGIES` table, which checks a strategy
 * where `distribute` reads it (`ast/constraints/distribute.ts`).
 *
 * A bare amount (`spacing: 4`, `spacing: fr(1)`) is `Spacing.box(4)`: the
 * chain reads it as that strategy (`spacingOf` in distribute.ts).
 */
import type { Frontend } from "gofish-ir";
import type { Gap } from "../ast/constraints/gap";
import { given } from "../ast/strategyKind";

type BoxIR = Extract<Frontend.SpacingIR, { kind: "box" }>;
type PitchIR = Extract<Frontend.SpacingIR, { kind: "pitch" }>;

/** `box()`: a gap between facing edges. See {@link box}. Its gap is a
 *  {@link Gap} as authored (a `LengthValue` from `percent(n)`), which
 *  serializes to the IR's length. */
export type BoxSpacing = Omit<BoxIR, "gap"> & { gap: Gap };

/** The point on each child that `pitch()` measures from. */
export type PitchAt = NonNullable<PitchIR["at"]>;

/** `pitch()`: a fixed distance between the same point on each child. See
 *  {@link pitch}. */
export type PitchSpacing = Omit<PitchIR, "distance"> & { distance: Gap };

/** `atLeast()`: a gap between facing edges of at least an amount. See
 *  {@link atLeast}. */
export type AtLeastSpacing = Extract<Frontend.SpacingIR, { kind: "atLeast" }>;

/** Every built-in spacing: the value of `spread`'s `spacing`. */
export type Spacing = BoxSpacing | PitchSpacing | AtLeastSpacing;

/**
 * A gap between the facing edges of each child's box: the end of one child
 * to the start of the next. The distance between the children depends on
 * their sizes. A bare amount for `spacing` is this kind.
 *
 * @param gap Pixels, `percent(n)` of the spread's room, or `fr(k)` shares of
 *   its scope. A negative gap overlaps the children.
 */
export function box(gap: Gap): BoxSpacing {
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
  distance: Gap,
  opts: { at?: PitchAt } = {}
): PitchSpacing {
  return { kind: "pitch", distance, ...given(opts) };
}

/**
 * A gap of at least `gap` pixels between the facing edges of each child's
 * box. Where other constraints already hold two children far enough apart,
 * the gap leaves them there; where they would come closer, it pushes them
 * apart. The exact constraints are solved first, and the minimum gaps then
 * separate what they place.
 *
 * A minimum gap gives each child a range of positions, not one position.
 * The `slack` of the spread or distribute that states the gaps picks one:
 * see the `Slack` family.
 *
 * PLACEHOLDER: the name is not signed off.
 *
 * @param gap Pixels. A negative gap lets the children overlap by at most
 *   that much.
 */
export function atLeast(gap: number): AtLeastSpacing {
  return { kind: "atLeast", gap };
}

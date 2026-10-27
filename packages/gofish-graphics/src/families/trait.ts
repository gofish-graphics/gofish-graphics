/**
 * The `Trait` family: the capabilities a unit's values have, listed in a
 * unit definition's `traits`
 * (`Unit("USD", { traits: [Trait.summable()] })`).
 *
 * `lib.ts` binds this module as `Trait` (`Trait.summable()`), and
 * `gofish-graphics/trait` exports the same module. Unlike the strategy
 * families, a unit takes a set of traits, not one choice from them, and a
 * trait never reaches the wire: `Unit` turns each into the column class it
 * declares (`unitTypeOf` in `ast/schema.ts`), and that class is what the
 * wire carries. So the traits are not in gofish-ir's `STRATEGIES` table.
 *
 *  - `diverging(midpoint?)`: the order has a midpoint (`HasMidpoint`), in
 *    edge coordinates over the levels, `n / 2` for `n` levels by default.
 *    It needs an ordered domain, `Domain.ordered(levels)`.
 *  - `summable()`: the unit's amounts add up (`CanAdd`). It needs a name.
 */
import type { DivergingTrait, SummableTrait } from "../ast/schema";

export type { Trait } from "../ast/schema";

/** The order of the unit's levels has a midpoint, `midpoint` in edge
 *  coordinates over the levels: 0 is the first level's leading edge, `n`
 *  the last level's trailing edge, and level `i` spans `[i, i + 1]`. The
 *  default, `n / 2`, is the middle of the middle level when `n` is odd, the
 *  boundary between the two middle levels when it is even. A stack over a
 *  column in the unit puts its 0 there. It needs an ordered domain,
 *  `Domain.ordered(levels)`. */
export const diverging = (midpoint?: number): DivergingTrait =>
  Object.freeze(
    midpoint === undefined
      ? { kind: "diverging" as const }
      : { kind: "diverging" as const, midpoint }
  );

/** The unit's amounts add up (`CanAdd`): a sum of them means something
 *  (money, counts, lengths), so a `size` channel, `stack`, treemap `size`
 *  and `.sum()` may sum a column in the unit. Amounts that do not add up
 *  (temperatures, prices, rates) are in a unit without it. */
export const summable = (): SummableTrait =>
  Object.freeze({ kind: "summable" });

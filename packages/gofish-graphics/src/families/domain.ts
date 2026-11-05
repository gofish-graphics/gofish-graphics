// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Domain` family: what a unit's values are, a unit definition's
 * `domain` (`Unit({ domain: Domain.ordered(["low", "mid", "high"]) })`).
 *
 * `lib.ts` binds this module as `Domain` (`Domain.ordered(levels)`), and
 * `gofish-graphics/domain` exports the same module. A domain never reaches
 * the wire as itself: `Unit` turns it into the traits it declares
 * (`unitTypeOf` in `ast/schema.ts`), `HasLevels`, and `HasOrder` for an
 * ordered one, and those are what the wire carries. So the domains are not
 * in gofish-ir's `STRATEGIES` table.
 *
 *  - `discrete(levels)`: a finite set of levels with no order (nominal).
 *    Its groups are laid out in the list's order, and a value outside the
 *    list is an error.
 *  - `ordered(levels)`: a finite set of levels ordered first to last
 *    (ordinal). It is what `Trait.diverging()` needs.
 *
 * A domain that is an interval of numbers (`Domain.continuous`) comes later.
 */
import type { Level, LevelsDomain } from "../ast/schema";

export type { Domain } from "../ast/schema";

/** The domain of `kind` over `levels`, checked to be a list of at least one
 *  level with no level listed twice. Python's `Domain` raises the same
 *  messages, word for word. */
export const levelsDomain = (
  kind: LevelsDomain["kind"],
  levels: readonly Level[]
): LevelsDomain => {
  if (!Array.isArray(levels))
    throw new Error(
      `Domain.${kind}: levels must be a list, e.g. ` +
        `Domain.${kind}(["low", "mid", "high"]), got ${String(levels)}.`
    );
  if (levels.length === 0)
    throw new Error(
      `Domain.${kind}: levels must list at least one level, e.g. ` +
        `Domain.${kind}(["low", "mid", "high"]).`
    );
  const seen = new Set<Level>();
  for (const level of levels) {
    if (seen.has(level))
      throw new Error(
        `Domain.${kind}: the level ${JSON.stringify(level)} is listed twice. ` +
          `Each level is listed once, in its place.`
      );
    seen.add(level);
  }
  return Object.freeze({ kind, levels: Object.freeze([...levels]) });
};

/** Levels with no order (nominal): the values a column in the unit takes,
 *  listed in the order to lay them out in. */
export const discrete = (levels: readonly Level[]): LevelsDomain =>
  levelsDomain("discrete", levels);

/** Levels ordered first to last (ordinal): the values a column in the unit
 *  takes, in their order. Every `by` split over the column is an ordered
 *  split, so an ordinal axis over it reads its groups as ordered. */
export const ordered = (levels: readonly Level[]): LevelsDomain =>
  levelsDomain("ordered", levels);

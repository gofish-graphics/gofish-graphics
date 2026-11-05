// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Domain` family: what a unit's values are, a unit definition's
 * `domain` (`Unit({ domain: Domain.discrete(["low", "mid", "high"]) })`).
 * A domain says only which values exist. Everything else about them (an
 * order, a midpoint, a sum) is a trait, listed in the unit's `traits`.
 *
 * `lib.ts` binds this module as `Domain` (`Domain.discrete(levels)`), and
 * `gofish-graphics/domain` exports the same module. A domain never reaches
 * the wire as itself: `Unit` turns it into the trait it declares
 * (`unitTypeOf` in `ast/schema.ts`), `HasLevels`, and that is what the wire
 * carries. So the domains are not in gofish-ir's `STRATEGIES` table.
 *
 *  - `discrete(levels)`: a finite set of levels. Its groups are laid out in
 *    the list's order, and a value outside the list is an error. The levels
 *    are unordered (nominal) unless the unit lists `Trait.ordered()`.
 *
 * A domain that is an interval of numbers (`Domain.continuous`) comes later.
 */
import type { Level, LevelsDomain } from "../ast/schema";

export type { Domain } from "../ast/schema";

/** A finite set of levels: the values a column in the unit takes, listed in
 *  the order to lay them out in, with at least one level and no level listed
 *  twice. Python's `Domain` raises the same messages, word for word. */
export const discrete = (levels: readonly Level[]): LevelsDomain => {
  if (!Array.isArray(levels))
    throw new Error(
      `Domain.discrete: levels must be a list, e.g. ` +
        `Domain.discrete(["low", "mid", "high"]), got ${String(levels)}.`
    );
  if (levels.length === 0)
    throw new Error(
      `Domain.discrete: levels must list at least one level, e.g. ` +
        `Domain.discrete(["low", "mid", "high"]).`
    );
  const seen = new Set<Level>();
  for (const level of levels) {
    if (seen.has(level))
      throw new Error(
        `Domain.discrete: the level ${JSON.stringify(level)} is listed ` +
          `twice. Each level is listed once, in its place.`
      );
    seen.add(level);
  }
  return Object.freeze({
    kind: "discrete",
    levels: Object.freeze([...levels]),
  });
};

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

/**
 * An axis's `levels` option (`axes: { x: { levels: [...] } }`): one entry
 * per depth, nearest the plot first, over the levels every axis on the dim
 * infers (a numeric axis's ticks, a time axis's rows, an ordinal axis's
 * levels: one per split, and one per bin of a chained key). Axis elaboration
 * (elaborate.tsx) reads the entries at each axis's depths; this module reads
 * the option and reports the entries that did not apply.
 */
import {
  calendarPartition,
  describe,
  type CalendarJSON,
  CalendarPartition,
} from "../calendar";

/** One entry of `axes.x.levels` as written: `true`, `false`, a Calendar
 *  value, or its wire form (`{ kind: "month", step: 1 }`, what Python
 *  sends). */
export type LevelOption = boolean | CalendarPartition | CalendarJSON;

/** One entry of an axis's `levels` option, as read: `true` keeps the level
 *  the axis infers at that depth, `false` hides it, and a Calendar value
 *  names the level's cells. */
export type LevelEntry = boolean | CalendarPartition;

/** Why a `levels` entry could not apply, at its depth: layout reports it
 *  with the axis's levels once the whole chart is elaborated. */
export type LevelIssue = { dim: 0 | 1; depth: number; reason: string };

/** Read `axes.<axis>.levels`. An entry that is not `true`, `false` or a
 *  Calendar value is a loud error. */
export function levelsFromOption(
  levels: readonly LevelOption[],
  axis: string
): LevelEntry[] {
  if (!Array.isArray(levels)) {
    throw new Error(
      `axes.${axis}.levels: expected a list, one entry per level, nearest ` +
        `the plot first, e.g. [true, Calendar.year] or [false, true].`
    );
  }
  return levels.map((e, i) => {
    // `Calendar.week` is also a function (`Calendar.week({ start })`).
    if (typeof e === "boolean" || e instanceof CalendarPartition) return e;
    const where = `axes.${axis}.levels[${i}]`;
    if (typeof e !== "object" || e === null)
      throw new Error(
        `${where}: expected true (keep the level), false (hide it), or a ` +
          `Calendar value (name its cells), got ${describe(e)}.`
      );
    return calendarPartition(e as CalendarPartition | CalendarJSON, where);
  });
}

/**
 * The error for the first `levels` entry of a chart that did not apply: one
 * an axis could not use (`issues`), or one past the last level of its dim.
 * `names` is each dim's levels, nearest the plot first, as the chart drew
 * them; the message lists them. Undefined when every entry applied.
 */
export function levelsError(
  levels: [LevelEntry[] | undefined, LevelEntry[] | undefined],
  names: [readonly string[], readonly string[]],
  issues: readonly LevelIssue[]
): Error | undefined {
  const axisName = (dim: 0 | 1) => (dim === 0 ? "x" : "y");
  const list = (dim: 0 | 1) =>
    names[dim].length === 0
      ? `The ${axisName(dim)} axis has no levels: no axis is drawn on it.`
      : `The ${axisName(dim)} axis's levels, nearest the plot first: ` +
        names[dim].map((n, i) => `[${i}] ${n}`).join(", ") +
        ".";
  const first = [...issues].sort(
    (a, b) => a.dim - b.dim || a.depth - b.depth
  )[0];
  if (first !== undefined) {
    const e = levels[first.dim]![first.depth];
    return new Error(
      `axes.${axisName(first.dim)}.levels[${first.depth}]: ` +
        `${describe(e)} cannot apply: ${first.reason}. ${list(first.dim)}`
    );
  }
  for (const dim of [0, 1] as const) {
    const entries = levels[dim];
    if (entries !== undefined && entries.length > names[dim].length) {
      const k = names[dim].length;
      return new Error(
        `axes.${axisName(dim)}.levels[${k}]: ${describe(entries[k])} has no ` +
          `level to apply to${entries[k] instanceof CalendarPartition ? " (a Calendar value past the inferred levels adds a level only on an axis over cells of time)" : ""}. ${list(dim)}`
      );
    }
  }
  return undefined;
}

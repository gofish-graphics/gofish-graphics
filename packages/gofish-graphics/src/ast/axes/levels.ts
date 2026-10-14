// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

/**
 * An axis's per-level options: `levels`, `label.angle`, `label.align` and
 * `divider` (`axes: { x: { levels: [...], divider: [false, true] } }`). Each
 * is read by depth, nearest the plot first, over the levels every axis on
 * the dim infers (a numeric axis's ticks, a time axis's rows, an ordinal
 * axis's levels: one per split, and one per bin of a chained key). Axis
 * elaboration (elaborate.tsx) reads the entries at each axis's depths with
 * {@link readAtDepth}; this module reads the options and reports the
 * entries that did not apply.
 */
import { axisName } from "../constraints/shared";
import {
  calendarPartition,
  describe,
  type CalendarJSON,
  CalendarPartition,
} from "../calendar";

/** One entry of `axes.x.levels` as written: `true`, `false`, a Calendar
 *  value, or its wire form (`{ kind: "month", every: 1 }`, what Python
 *  sends). */
export type LevelOption = boolean | CalendarPartition | CalendarJSON;

/** One entry of an axis's `levels` option, as read: `true` keeps the level
 *  the axis infers at that depth, `false` hides it, and a Calendar value
 *  names the level's cells. */
export type LevelEntry = boolean | CalendarPartition;

/** Where a level's labels sit along the axis: centered under what each
 *  names, or at the start of each run (see `AxisLabelOptions.align`). */
export type LabelAlign = "start" | "center";

/** A per-level option as read: one value for every level where it applies,
 *  or a list, one entry per depth, nearest the plot first. */
export type PerLevel<T> = T | readonly T[] | undefined;

/** The per-level options of one dim's axes, as read. `levels` is always a
 *  list; `label.angle` is a manual angle (`"auto"` is chosen per row by
 *  `runLayout`, so it has no entry here); in `label.align`, `true` keeps a
 *  level's inferred alignment. */
export type LevelOptions = {
  levels?: readonly LevelEntry[];
  "label.angle"?: PerLevel<number>;
  "label.align"?: PerLevel<LabelAlign | true>;
  divider?: PerLevel<boolean>;
};

export type LevelOptionName = keyof LevelOptions;

/** The value one entry of a per-level option holds. */
type EntryOf<N extends LevelOptionName> =
  LevelOptions[N] extends PerLevel<infer T> ? T : never;

/** Why an entry of a per-level option could not apply, at its depth: layout
 *  reports it with the axis's levels once the whole chart is elaborated. */
export type LevelIssue = {
  dim: 0 | 1;
  option: LevelOptionName;
  depth: number;
  reason: string;
};

/** Every per-level option, in the order their errors are reported. */
const LEVEL_OPTIONS: readonly LevelOptionName[] = [
  "levels",
  "label.angle",
  "label.align",
  "divider",
];

/**
 * The value of `option` at `depth` for one level of the dim's axes, or
 * undefined for the level's inferred setting. `cannot(value)` says why a
 * value cannot apply to this level, if it cannot (`true` dividers on a
 * numeric axis's ticks). A plain value applies to every level where it can,
 * so it skips a level it cannot apply to; an entry of a list names its
 * level, so one that cannot apply is an issue (`issues`).
 */
export function readAtDepth<N extends LevelOptionName>(
  options: LevelOptions,
  option: N,
  dim: 0 | 1,
  depth: number,
  issues: LevelIssue[],
  cannot: (value: EntryOf<N>) => string | undefined = () => undefined
): EntryOf<N> | undefined {
  const opt = options[option] as PerLevel<EntryOf<N>>;
  const value = entryAt(opt, depth);
  if (value === undefined) return undefined;
  const reason = cannot(value);
  if (reason === undefined) return value;
  if (Array.isArray(opt)) issues.push({ dim, option, depth, reason });
  return undefined;
}

/** The entry of a per-level option at `depth`: a plain value at every
 *  depth, a list's entry at its own (undefined past its end). */
export const entryAt = <T>(opt: PerLevel<T>, depth: number): T | undefined =>
  Array.isArray(opt) ? (opt as readonly T[])[depth] : (opt as T | undefined);

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
 * The levels one axis draws, as its `levels` entries name them
 * (`entries[0]` is the axis's first level). `inferred(k, before)` is the
 * level the axis infers at its depth `k`, given the levels before it as
 * named, or undefined past its inferred levels. Each inferred level is kept
 * (`true`, or no entry), hidden (`false`), or replaced by `resolve(entry, k)`
 * for a Calendar entry, which keeps the inferred level when it cannot apply
 * (undefined). On the outermost axis of the dim, Calendar entries past the
 * inferred levels add levels, while `resolve` takes them. Each axis kind
 * supplies only `inferred` and `resolve`.
 */
export function applyLevelEntries<L>(
  inferred: (k: number, before: readonly L[]) => L | undefined,
  entries: readonly (LevelEntry | undefined)[],
  outermost: boolean,
  resolve: (p: CalendarPartition, k: number) => L | undefined
): { level: L; hidden: boolean }[] {
  const out: { level: L; hidden: boolean }[] = [];
  const levels: L[] = [];
  for (let k = 0; ; k++) {
    const e = entries[k];
    const inf = inferred(k, levels);
    let level: L | undefined;
    if (inf !== undefined)
      level = e instanceof CalendarPartition ? (resolve(e, k) ?? inf) : inf;
    else if (outermost && e instanceof CalendarPartition) level = resolve(e, k);
    if (level === undefined) return out;
    levels.push(level);
    out.push({ level, hidden: e === false });
  }
}

/**
 * The error for the first per-level entry of a chart that did not apply:
 * one an axis could not use (`issues`), or one past the last level of its
 * dim. `names` is each dim's levels, nearest the plot first, as the chart
 * drew them; the message lists them. Undefined when every entry applied.
 */
export function levelOptionsError(
  options: readonly [LevelOptions, LevelOptions],
  names: readonly [readonly string[], readonly string[]],
  issues: readonly LevelIssue[]
): Error | undefined {
  const list = (dim: 0 | 1) =>
    names[dim].length === 0
      ? `The ${axisName(dim)} axis has no levels: no axis is drawn on it.`
      : `The ${axisName(dim)} axis's levels, nearest the plot first: ` +
        names[dim].map((n, i) => `[${i}] ${n}`).join(", ") +
        ".";
  const order = (o: LevelOptionName) => LEVEL_OPTIONS.indexOf(o);
  const first = [...issues].sort(
    (a, b) =>
      a.dim - b.dim || order(a.option) - order(b.option) || a.depth - b.depth
  )[0];
  if (first !== undefined) {
    const e = (options[first.dim][first.option] as readonly unknown[])[
      first.depth
    ];
    return new Error(
      `axes.${axisName(first.dim)}.${first.option}[${first.depth}]: ` +
        `${describe(e)} cannot apply: ${first.reason}. ${list(first.dim)}`
    );
  }
  for (const dim of [0, 1] as const) {
    for (const option of LEVEL_OPTIONS) {
      const entries = options[dim][option];
      const k = names[dim].length;
      if (!Array.isArray(entries) || entries.length <= k) continue;
      const adds =
        option === "levels" && entries[k] instanceof CalendarPartition
          ? " (a Calendar value past the inferred levels adds a level only on an axis over cells of time)"
          : "";
      return new Error(
        `axes.${axisName(dim)}.${option}[${k}]: ${describe(entries[k])} has ` +
          `no level to apply to${adds}. ${list(dim)}`
      );
    }
  }
  return undefined;
}

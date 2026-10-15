// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The `Calendar` family: partitions of the time line into calendar cells,
 * one kind per level. A Calendar value is the value of `field(x).bin(...)`
 * over a time column, and an entry of an axis's `levels`
 * (`axes: { x: { levels: [Calendar.month, Calendar.year] } }`).
 *
 * `lib.ts` binds this module as `Calendar` (`Calendar.month`), and
 * `gofish-graphics/calendar` exports the same module. No kind has a required
 * option, so each is a value as it is, and calling it sets options:
 * `Calendar.month` is `Calendar.month()`, `Calendar.month({ every: 3 })` is
 * cells of 3 months, and `Calendar.week({ start: "sunday" })` starts weeks
 * on Sunday (#1133, `ast/strategyKind.ts`). `.format(fn)` labels the cells
 * of any Calendar value, bare or called, in JS only.
 *
 * Each value is a {@link CalendarPartition} (`ast/calendar.ts`, which makes
 * the cells and their labels). Its wire form is `{ kind, every?, start? }`,
 * and the kinds and their options are declared once, in gofish-ir's
 * `STRATEGIES` table, which checks each call.
 */
import {
  calendarPartition,
  type CalendarJSON,
  type CalendarPartition,
  type CalendarUnit,
  type WeekStart,
} from "../ast/calendar";
import { bareKind } from "../ast/strategyKind";

export type { CalendarPartition } from "../ast/calendar";

/** A Calendar value: what `field(x).bin(...)` and an axis level take. */
export type Calendar = CalendarPartition;

/** The options of a level with steps. */
export type EveryOptions = {
  /** How many units one cell spans, a whole number, 1 or more. Default 1.
   *  Steps count from the level above. */
  every?: number;
};

/** The options of a level that starts on a day of the week. */
export type StartOptions = {
  /** The first day of a week. Default "monday" (ISO 8601). */
  start?: WeekStart;
};

/** The kind `unit`, made from its options and checked against the family. */
const level =
  <U extends CalendarUnit, O extends object>(unit: U) =>
  (opts: O = {} as O): CalendarPartition<U> =>
    calendarPartition(
      { kind: unit, ...opts } as CalendarJSON,
      `Calendar.${unit}`
    ) as CalendarPartition<U>;

/** Cells of a second. */
export const second = bareKind(
  "Calendar.second",
  level<"second", EveryOptions>("second")
);

/** Cells of a minute. */
export const minute = bareKind(
  "Calendar.minute",
  level<"minute", EveryOptions>("minute")
);

/** Cells of an hour. */
export const hour = bareKind(
  "Calendar.hour",
  level<"hour", EveryOptions>("hour")
);

/** Cells of a day, from local midnight. */
export const day = bareKind("Calendar.day", level<"day", EveryOptions>("day"));

/** Cells of a day, labeled by the day of the week. Binned alone, a part of a
 *  week: the seven days of the week, from its first day, so all Mondays are
 *  one cell. It has no steps. */
export const weekday = bareKind(
  "Calendar.weekday",
  level<"weekday", StartOptions>("weekday")
);

/** Cells of a week, from its first day. */
export const week = bareKind(
  "Calendar.week",
  level<"week", EveryOptions & StartOptions>("week")
);

/** Cells of a month, from its first day. */
export const month = bareKind(
  "Calendar.month",
  level<"month", EveryOptions>("month")
);

/** Cells of 3 months, from January, April, July and October, labeled Q1 to
 *  Q4. */
export const quarter = bareKind(
  "Calendar.quarter",
  level<"quarter", EveryOptions>("quarter")
);

/** Cells of a year, from January 1. */
export const year = bareKind(
  "Calendar.year",
  level<"year", EveryOptions>("year")
);

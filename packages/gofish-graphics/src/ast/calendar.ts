// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Calendar partitions (#256, #1057): `Calendar.month`, `Calendar.hour.every(6)`,
 * `Calendar.week({ start: "sunday" })`, ...
 *
 * A Calendar value is a PARTITION of the time line into cells: each cell is a
 * half-open interval `[start, end)` of instants (epoch milliseconds, UTC), and
 * its label is the cell's start, formatted for the level ("Jan", "12 AM",
 * "2024"). Where the cells fall depends on a time zone: a day in
 * "America/New_York" starts at local midnight, and some local days last 23 or
 * 25 hours. All calendar math runs through Temporal ({@link temporal}).
 *
 * The interface is {@link CalendarPartition.cells} (the cells that meet an
 * interval) and {@link CalendarPartition.label} (a cell's default label). A
 * time axis reads its rows off it (axes/timeAxis.ts); the 1D `partition`
 * layout operator (#1058) is meant to read its cells off the same interface.
 *
 * Steps (`.every(n)`) are aligned to the next level up, the way calendars
 * count: `Calendar.month.every(3)` starts its cells in January, April, July
 * and October; `Calendar.hour.every(6)` at 0, 6, 12 and 18 o'clock;
 * `Calendar.day.every(2)` on days 1, 3, 5, ... of each month (so the last
 * cell of a 31-day month is one day long); `Calendar.year.every(5)` on years
 * divisible by 5. Weeks count from a fixed week (the one holding 1970-01-01),
 * since weeks do not nest in months.
 */
import type { Temporal as TemporalNS } from "temporal-polyfill";

// ── Temporal ──────────────────────────────────────────────────────────────

type TemporalApi = typeof TemporalNS;

let _temporal: TemporalApi | undefined;

/**
 * Load Temporal: the native API when the runtime has it (Chrome 144+,
 * Firefox 139+, Node 26+), else `temporal-polyfill`, imported only then.
 * Everything that does calendar math awaits this once first (applying a
 * schema with a time column, laying out a chart); after that {@link temporal}
 * returns it synchronously.
 */
export async function loadTemporal(): Promise<TemporalApi> {
  if (_temporal !== undefined) return _temporal;
  const native = (globalThis as { Temporal?: TemporalApi }).Temporal;
  _temporal = native ?? (await import("temporal-polyfill")).Temporal;
  return _temporal;
}

/** The loaded Temporal API (see {@link loadTemporal}). */
export function temporal(): TemporalApi {
  if (_temporal === undefined) {
    throw new Error(
      "Temporal is not loaded yet: await loadTemporal() before calendar math."
    );
  }
  return _temporal;
}

// ── Units ─────────────────────────────────────────────────────────────────

/** The calendar levels, finest first. */
export const CALENDAR_UNITS = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;
export type CalendarUnit = (typeof CALENDAR_UNITS)[number];

/** The day a week starts on. Monday is the ISO 8601 default (as in polars and
 *  pandas). */
export type WeekStart = "monday" | "sunday";

/** The wire form of a Calendar value (what Python sends, and what
 *  `toJSON` writes). `start` is only for weeks. */
export type CalendarJSON = {
  unit: CalendarUnit;
  step?: number;
  start?: WeekStart;
};

/** The level whose cells hold this level's cells: the outer row of a time
 *  axis. A week's parent is the month its start falls in (weeks do not nest
 *  in months, but the month row still reads as the context for them). Year
 *  has none. */
const PARENT: Record<CalendarUnit, CalendarUnit | undefined> = {
  second: "minute",
  minute: "hour",
  hour: "day",
  day: "month",
  week: "month",
  month: "year",
  quarter: "year",
  year: undefined,
};

/** `Intl.DateTimeFormat` options for each level's default label. Quarter has
 *  no Intl field; its label is built by hand ("Q1"). */
const LABEL_FORMAT: Record<
  Exclude<CalendarUnit, "quarter">,
  Intl.DateTimeFormatOptions
> = {
  second: { hour: "numeric", minute: "2-digit", second: "2-digit" },
  minute: { hour: "numeric", minute: "2-digit" },
  hour: { hour: "numeric" },
  day: { month: "short", day: "numeric" },
  week: { month: "short", day: "numeric" },
  month: { month: "short" },
  year: { year: "numeric" },
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(
  unit: Exclude<CalendarUnit, "quarter">,
  zone: string
): Intl.DateTimeFormat {
  const key = `${unit}|${zone}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat(undefined, {
      ...LABEL_FORMAT[unit],
      timeZone: zone,
    });
    formatters.set(key, f);
  }
  return f;
}

/** One cell of a partition: the instants `[start, end)` (epoch ms, UTC), the
 *  level it belongs to (`unit`), and the calendar fields of its start in the
 *  axis's zone, as plain numbers named like pandas' and polars' `dt.*`:
 *  `year`, `quarter` (1 to 4), `month` (1 to 12), `week` (the ISO week
 *  number), `day` (of the month), `hour`, `minute` and `second`. A custom
 *  row label (`format`) is a function of this. */
export type CalendarCell = {
  start: number;
  end: number;
  unit: CalendarUnit;
  year: number;
  quarter: number;
  month: number;
  week: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const ISO_DOW: Record<WeekStart, number> = { monday: 1, sunday: 7 };

// ── Partitions ────────────────────────────────────────────────────────────

/** A partition of the time line into calendar cells: a level (`unit`) at a
 *  step. See the module comment. */
export class CalendarPartition {
  constructor(
    readonly unit: CalendarUnit,
    readonly step: number = 1,
    readonly start: WeekStart | undefined = undefined
  ) {
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(
        `Calendar.${unit}.every(${String(step)}): the step must be a whole ` +
          `number of ${unit}s, 1 or more.`
      );
    }
  }

  /** The same level, `n` units per cell (`Calendar.month.every(3)`). */
  every(n: number): CalendarPartition {
    return new CalendarPartition(this.unit, n, this.start);
  }

  /** The level one up (the outer row of a time axis), or undefined for
   *  year. */
  get parent(): CalendarPartition | undefined {
    const p = PARENT[this.unit];
    return p === undefined ? undefined : new CalendarPartition(p);
  }

  /** The start of the cell that holds instant `t`, in `zone`. */
  floor(t: number, zone: string): number {
    const T = temporal();
    const z = T.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone);
    const n = this.step;
    const down = (v: number, base = 0) => Math.floor((v - base) / n) * n + base;
    let s: TemporalNS.ZonedDateTime;
    switch (this.unit) {
      case "second":
        s = z.round({ smallestUnit: "second", roundingMode: "floor" });
        s = s.with({ second: down(s.second) });
        break;
      case "minute":
        s = z.round({ smallestUnit: "minute", roundingMode: "floor" });
        s = s.with({ minute: down(s.minute) });
        break;
      case "hour":
        s = z.round({ smallestUnit: "hour", roundingMode: "floor" });
        s = s.with({ hour: down(s.hour) });
        break;
      case "day":
        s = z.with({ day: down(z.day, 1) }).startOfDay();
        break;
      case "week": {
        const first = ISO_DOW[this.start ?? "monday"];
        const day = z.startOfDay().subtract({
          days: (z.dayOfWeek - first + 7) % 7,
        });
        if (n === 1) {
          s = day;
          break;
        }
        // Count whole weeks from the week holding 1970-01-01, so a step of
        // n weeks lands on the same weeks whatever the domain.
        const epochWeek = T.PlainDate.from("1970-01-01").subtract({
          days: (4 - first + 7) % 7, // 1970-01-01 was a Thursday (ISO 4)
        });
        const weeks = Math.floor(
          day.toPlainDate().since(epochWeek, { largestUnit: "days" }).days / 7
        );
        s = day.subtract({ days: (weeks - down(weeks)) * 7 });
        break;
      }
      case "month":
        s = z.with({ month: down(z.month, 1), day: 1 }).startOfDay();
        break;
      case "quarter":
        s = z
          .with({
            month: Math.floor((z.month - 1) / (3 * n)) * 3 * n + 1,
            day: 1,
          })
          .startOfDay();
        break;
      case "year":
        s = z.with({ year: down(z.year), month: 1, day: 1 }).startOfDay();
        break;
    }
    return s.epochMilliseconds;
  }

  /** The start of the cell after the one that starts at `start`. */
  next(start: number, zone: string): number {
    const T = temporal();
    const z = T.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(zone);
    const units = this.unit === "quarter" ? "months" : `${this.unit}s`;
    const per = this.unit === "quarter" ? 3 : 1;
    // Step forward and floor: a step aligned to the level above (days 1, 3,
    // ..., 31 of a month) can end a cell early, at the next aligned start.
    for (let k = 1; ; k++) {
      const end = this.floor(
        z.add({ [units]: this.step * per * k } as TemporalNS.DurationLike)
          .epochMilliseconds,
        zone
      );
      if (end > start) return end;
    }
  }

  /** The cells that meet `[lo, hi]`: the first may start before `lo`, and
   *  the last may end after `hi`. */
  cells(lo: number, hi: number, zone: string): CalendarCell[] {
    const T = temporal();
    const out: CalendarCell[] = [];
    let s = this.floor(lo, zone);
    while (s <= hi) {
      const e = this.next(s, zone);
      const z = T.Instant.fromEpochMilliseconds(s).toZonedDateTimeISO(zone);
      out.push({
        start: s,
        end: e,
        unit: this.unit,
        year: z.year,
        quarter: Math.floor((z.month - 1) / 3) + 1,
        month: z.month,
        week: z.weekOfYear!,
        day: z.day,
        hour: z.hour,
        minute: z.minute,
        second: z.second,
      });
      s = e;
    }
    return out;
  }

  /** A cell's default label: its level's field in `zone` (the zone its
   *  cells were read in), formatted by `Intl.DateTimeFormat` in the
   *  runtime's locale ("Jan", "12 AM", "Feb 29", "2024"), or "Q1" to "Q4"
   *  for a quarter. */
  label(cell: CalendarCell, zone: string): string {
    if (this.unit === "quarter") return `Q${cell.quarter}`;
    return formatter(this.unit, zone).format(cell.start);
  }

  toJSON(): CalendarJSON {
    return {
      unit: this.unit,
      step: this.step,
      ...(this.start !== undefined ? { start: this.start } : {}),
    };
  }

  toString(): string {
    const base =
      this.start !== undefined
        ? `Calendar.week({ start: "${this.start}" })`
        : `Calendar.${this.unit}`;
    return this.step === 1 ? base : `${base}.every(${this.step})`;
  }
}

/** `Calendar.week`: the Monday-start week partition, also callable as
 *  `Calendar.week({ start: "sunday" })` for another first day. */
export type WeekPartition = CalendarPartition &
  ((opts?: { start?: WeekStart }) => CalendarPartition);

function weekPartition(): WeekPartition {
  const make = (opts: { start?: WeekStart } = {}) => {
    const start = opts.start ?? "monday";
    if (start !== "monday" && start !== "sunday") {
      throw new Error(
        `Calendar.week: start must be "monday" or "sunday", not ${JSON.stringify(start)}.`
      );
    }
    return new CalendarPartition("week", 1, start);
  };
  // A function that is also the default partition: same prototype, same
  // fields, so `Calendar.week` works as a value and as a call.
  const fn = make as unknown as WeekPartition;
  Object.setPrototypeOf(fn, CalendarPartition.prototype);
  Object.defineProperties(fn, {
    unit: { value: "week", enumerable: true },
    step: { value: 1, enumerable: true },
    start: { value: "monday", enumerable: true },
  });
  return fn;
}

/** The calendar partitions, used in `axes: { x: { rows: [...] } }`. */
export const Calendar = {
  second: new CalendarPartition("second"),
  minute: new CalendarPartition("minute"),
  hour: new CalendarPartition("hour"),
  day: new CalendarPartition("day"),
  week: weekPartition(),
  month: new CalendarPartition("month"),
  quarter: new CalendarPartition("quarter"),
  year: new CalendarPartition("year"),
};

/** A Calendar value from a builder value or its wire form (Python sends the
 *  wire form). An unknown unit is a loud error. */
export function calendarPartition(
  value: CalendarPartition | CalendarJSON,
  where: string
): CalendarPartition {
  if (value instanceof CalendarPartition) return value;
  const v = value as Partial<CalendarJSON> | null;
  if (
    v === null ||
    typeof v !== "object" ||
    !(CALENDAR_UNITS as readonly string[]).includes(v.unit as string)
  ) {
    throw new Error(
      `${where}: expected a Calendar value (Calendar.month, ` +
        `Calendar.hour.every(6), ...), got ${JSON.stringify(value)}.`
    );
  }
  if (v.start !== undefined && v.unit !== "week") {
    throw new Error(`${where}: only Calendar.week takes a start day.`);
  }
  return new CalendarPartition(
    v.unit as CalendarUnit,
    v.step ?? 1,
    v.unit === "week" ? (v.start ?? "monday") : undefined
  );
}

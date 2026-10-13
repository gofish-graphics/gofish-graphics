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
 * interval) and {@link CalendarPartition.label} (a cell's label: the
 * partition's own `.format(fn)`, else the level's default). A
 * time axis reads its rows off it (axes/timeRows.ts); the 1D `partition`
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
import type { Frontend } from "gofish-ir";

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

/** Instant `t` (epoch ms) on the calendar of `zone`. */
export const zoned = (t: number, zone: string): TemporalNS.ZonedDateTime =>
  temporal().Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone);

let _epochDay: TemporalNS.PlainDate | undefined;
/** 1970-01-01, the day weeks count from (built once, on first use). */
const epochDay = (): TemporalNS.PlainDate =>
  (_epochDay ??= temporal().PlainDate.from("1970-01-01"));

// ── Units ─────────────────────────────────────────────────────────────────

/** The wire form of a Calendar value (what Python sends, and what
 *  `toJSON` writes): the IR's `CalendarPartitionIR`. `start` is only for
 *  weeks. */
export type CalendarJSON = Frontend.CalendarPartitionIR;

/** The calendar levels. */
export type CalendarUnit = CalendarJSON["unit"];

/** The day a week starts on. Monday is the ISO 8601 default (as in polars and
 *  pandas). */
export type WeekStart = NonNullable<CalendarJSON["start"]>;

/** The calendar levels, finest first. */
const CALENDAR_UNITS: readonly CalendarUnit[] = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

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

/** The unit a bin of each unit, alone, reads it as a part of (#256): a month
 *  binned alone is a month of the year, so all Junes are one cell. A week
 *  is a part of no larger unit (weeks do not nest in months or years), and
 *  nothing contains a year, so a bin of either alone stays on the time line.
 *  See {@link CalendarPartition.cycle}. */
const CYCLE: Record<CalendarUnit, CalendarUnit | undefined> = {
  second: "minute",
  minute: "hour",
  hour: "day",
  day: "month",
  week: undefined,
  month: "year",
  quarter: "year",
  year: undefined,
};

/** One cell of each cycle unit, as UTC instants, that the parts of a cycle
 *  are read off (`cycleCells` in cells.ts): the leap year 2000 (so
 *  February 29 is a part of the year), its January (31 days, so day 31 is a
 *  part of the month), and its first day, hour and minute. */
const REFERENCE: Partial<Record<CalendarUnit, [string, string]>> = {
  year: ["2000-01-01T00:00:00Z", "2001-01-01T00:00:00Z"],
  month: ["2000-01-01T00:00:00Z", "2000-02-01T00:00:00Z"],
  day: ["2000-01-01T00:00:00Z", "2000-01-02T00:00:00Z"],
  hour: ["2000-01-01T00:00:00Z", "2000-01-01T01:00:00Z"],
  minute: ["2000-01-01T00:00:00Z", "2000-01-01T00:01:00Z"],
};

/** The `[start, end)` (epoch ms, UTC) of the reference cell of the cycle
 *  unit `unit` (see {@link REFERENCE}). */
export function referencePeriod(unit: CalendarUnit): [number, number] {
  const [lo, hi] = REFERENCE[unit]!;
  return [Date.parse(lo), Date.parse(hi)];
}

/** The `Intl.DateTimeFormat` field each part of a label is written with,
 *  when a cell is labeled by several levels at once (a product's "Jun
 *  2015") or a part of a cycle is labeled alone ("Jun"). Quarter has no Intl
 *  field ("Q2"), and a week is never a part. */
const PART_FORMAT: Partial<Record<CalendarUnit, Intl.DateTimeFormatOptions>> = {
  second: { second: "2-digit" },
  minute: { minute: "2-digit" },
  hour: { hour: "numeric" },
  day: { day: "numeric" },
  month: { month: "short" },
  year: { year: "numeric" },
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

/** The locale of default labels: always en-US, not the runtime's locale,
 *  so a chart reads the same on every machine (like `fmtNum`'s numbers, which
 *  never group digits or localize the decimal point). A chart-level locale
 *  option is #1098. */
const LABEL_LOCALE = "en-US";

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(
  unit: Exclude<CalendarUnit, "quarter">,
  zone: string
): Intl.DateTimeFormat {
  const key = `${unit}|${zone}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat(LABEL_LOCALE, {
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
 *  label (`.format(fn)`) is a function of this.
 *
 *  A part of a cycle (a month of the year: a bin of `Calendar.month` alone)
 *  has no one place on the time line: its `start` and `end`, `week`, and
 *  the fields of its cycle unit and above (`year` for a month of the year)
 *  are `NaN`. The fields below its level are those of the part's first
 *  instant (`day` 1 for a month). */
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

/** A custom label for a partition's cells (`Calendar.<unit>.format(fn)`). */
export type CellFormat = (cell: CalendarCell) => string;

const ISO_DOW: Record<WeekStart, number> = { monday: 1, sunday: 7 };

/** The calendar fields of the cell of level `unit` that starts at `s` and
 *  ends at `end` (epoch ms). */
export function fieldsOf(
  s: TemporalNS.ZonedDateTime,
  end: number,
  unit: CalendarUnit
): CalendarCell {
  return {
    start: s.epochMilliseconds,
    end,
    unit,
    year: s.year,
    quarter: Math.floor((s.month - 1) / 3) + 1,
    month: s.month,
    week: s.weekOfYear!,
    day: s.day,
    hour: s.hour,
    minute: s.minute,
    second: s.second,
  };
}

/** The finest first: the order of the fields a part of a cycle keeps. */
const FIELD_ORDER = [
  "second",
  "minute",
  "hour",
  "day",
  "month",
  "quarter",
  "year",
] as const;

/** The fields of a part of a cycle of `cycle` (a month of the year): those
 *  of its first instant `t` in the reference cycle (UTC), with `start`,
 *  `end`, `week`, and the fields of `cycle` and above set to `NaN`, since
 *  the part has no one place on the time line (see {@link CalendarCell}). */
export function cycleFields(
  t: number,
  unit: CalendarUnit,
  cycle: CalendarUnit
): CalendarCell {
  const f = fieldsOf(zoned(t, "UTC"), NaN, unit);
  f.start = NaN;
  f.week = NaN;
  const above = FIELD_ORDER.indexOf(cycle as (typeof FIELD_ORDER)[number]);
  for (const k of FIELD_ORDER.slice(above)) f[k] = NaN;
  return f;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The label of a cell named by several levels at once, the instant `t` read
 * in `zone`: each level writes its own field (`PART_FORMAT`), and
 * `Intl.DateTimeFormat` in en-US puts them in order, so a product of a year
 * and a month reads "Jun 2015", and of a month and a day "Jun 15". A
 * quarter has no Intl field: it comes first, "Q2 2015". One level alone is
 * a part of its cycle: "Jun", "15", "12 AM", "05".
 */
export function productLabel(
  levels: readonly CalendarPartition[],
  t: number,
  zone: string
): string {
  const units = levels.map((p) => p.unit);
  const intlUnits = units.filter((u) => u !== "quarter");
  let text = "";
  if (intlUnits.length > 0) {
    const key = `${intlUnits.join(",")}|${zone}`;
    let f = partFormatters.get(key);
    if (f === undefined) {
      const opts: Intl.DateTimeFormatOptions = { timeZone: zone };
      for (const u of intlUnits) Object.assign(opts, PART_FORMAT[u]);
      f = new Intl.DateTimeFormat(LABEL_LOCALE, opts);
      partFormatters.set(key, f);
    }
    text = f.format(t);
    // Intl writes a minute or a second alone without its leading zero.
    if (
      intlUnits.length === 1 &&
      (units[0] === "minute" || units[0] === "second")
    )
      text = text.padStart(2, "0");
  }
  if (units.includes("quarter")) {
    const month = zoned(t, zone).month;
    const q = `Q${Math.floor((month - 1) / 3) + 1}`;
    text = text === "" ? q : `${q} ${text}`;
  }
  return text;
}

// ── Partitions ────────────────────────────────────────────────────────────

/** A partition of the time line into calendar cells: a level (`unit`) at a
 *  step, with an optional label `format`. See the module comment. */
export class CalendarPartition<U extends CalendarUnit = CalendarUnit> {
  /** The first day of a week, for weeks only (Monday unless given). */
  readonly start: WeekStart | undefined;

  constructor(
    readonly unit: U,
    readonly step: number = 1,
    start?: WeekStart,
    /** The cells' custom label, if any (`.format(fn)`); else the level's
     *  default label. A function, so a partition with one has no wire
     *  form. */
    readonly formatCell?: CellFormat
  ) {
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(
        `Calendar.${unit}.every(${String(step)}): the step must be a whole ` +
          `number of ${unit}s, 1 or more.`
      );
    }
    this.start = unit === "week" ? (start ?? "monday") : undefined;
  }

  /** The same level, `n` units per cell (`Calendar.month.every(3)`). */
  every(n: number): CalendarPartition<U> {
    return new CalendarPartition(this.unit, n, this.start, this.formatCell);
  }

  /** The same cells, labeled by `fn`, a function of the cell
   *  ({@link CalendarCell}): `Calendar.month.every(3).format((c) =>
   *  String(c.year))`. JS only: a function cannot cross to Python, so a
   *  partition with a format has no wire form. */
  format(fn: CellFormat): CalendarPartition<U> {
    if (typeof fn !== "function") {
      throw new Error(
        `${String(this)}.format: expected a function of the cell, ` +
          `(cell) => string.`
      );
    }
    return new CalendarPartition(this.unit, this.step, this.start, fn);
  }

  /** Whether `other` cuts the time line into the same cells: the same
   *  level, step, and week start. The labels may differ. */
  sameCells(other: CalendarPartition | undefined): boolean {
    return (
      other !== undefined &&
      other.unit === this.unit &&
      other.step === this.step &&
      other.start === this.start
    );
  }

  /** The level one up (the outer row of a time axis), or undefined for
   *  year. */
  get parent(): CalendarPartition | undefined {
    const p = PARENT[this.unit];
    return p === undefined ? undefined : new CalendarPartition(p);
  }

  /** The unit this level is a part of when it is binned alone
   *  (`field(x).bin(Calendar.month)` is the month of the year), or undefined
   *  for a level that is a part of nothing (week, year): binned alone, its
   *  cells stay on the time line. See {@link CYCLE}. */
  get cycle(): CalendarUnit | undefined {
    return CYCLE[this.unit];
  }

  /** The part of its cycle unit that the instant `z` falls in: its level's
   *  field at the start of the cell that holds `z` (6 for any instant in
   *  June; 4 for May under `Calendar.month.every(3)`, whose cell starts in
   *  April; 1 to 4 for a quarter). */
  part(z: TemporalNS.ZonedDateTime): number {
    const s = this.floor(z);
    return this.unit === "quarter"
      ? Math.floor((s.month - 1) / 3) + 1
      : (s[this.unit as Exclude<CalendarUnit, "quarter" | "week">] as number);
  }

  /** The default label of a part of this level's cycle (`Calendar.month`
   *  alone): "Jan" for a month, "Q1" for a quarter, "1" for a day of the
   *  month, "12 AM" for an hour of the day, "05" for a minute of the hour
   *  or a second of the minute. `t` is the part's first instant in the
   *  reference cycle (UTC, {@link referencePeriod}). */
  partLabel(cell: CalendarCell, t: number): string {
    if (this.formatCell !== undefined) return this.formatCell(cell);
    return productLabel([this], t, "UTC");
  }

  /** The level and step the cell math runs on: a quarter is 3 months, so
   *  "quarter" matters only to labels. */
  private get span(): [Exclude<CalendarUnit, "quarter">, number] {
    return this.unit === "quarter"
      ? ["month", 3 * this.step]
      : [this.unit, this.step];
  }

  /** The start of the cell that holds `z` (in `z`'s zone). */
  floor(z: TemporalNS.ZonedDateTime): TemporalNS.ZonedDateTime {
    const [unit, n] = this.span;
    const down = (v: number, base = 0) => Math.floor((v - base) / n) * n + base;
    switch (unit) {
      case "second":
      case "minute":
      case "hour": {
        const s = z.round({ smallestUnit: unit, roundingMode: "floor" });
        return s.with({ [unit]: down(s[unit]) });
      }
      case "day":
        return z.with({ day: down(z.day, 1) }).startOfDay();
      case "week": {
        const first = ISO_DOW[this.start!];
        const day = z.startOfDay().subtract({
          days: (z.dayOfWeek - first + 7) % 7,
        });
        if (n === 1) return day;
        // Count whole weeks from the week holding 1970-01-01, so a step of
        // n weeks lands on the same weeks whatever the domain.
        const epochWeek = epochDay().subtract({
          days: (4 - first + 7) % 7, // 1970-01-01 was a Thursday (ISO 4)
        });
        const weeks = Math.floor(
          day.toPlainDate().since(epochWeek, { largestUnit: "days" }).days / 7
        );
        return day.subtract({ days: (weeks - down(weeks)) * 7 });
      }
      case "month":
        return z.with({ month: down(z.month, 1), day: 1 }).startOfDay();
      case "year":
        return z.with({ year: down(z.year), month: 1, day: 1 }).startOfDay();
    }
  }

  /** The start of the cell after the one that starts at `start`. */
  next(start: TemporalNS.ZonedDateTime): TemporalNS.ZonedDateTime {
    const [unit, n] = this.span;
    // Step forward and floor: a step aligned to the level above (days 1, 3,
    // ..., 31 of a month) can end a cell early, at the next aligned start.
    for (let k = 1; ; k++) {
      const end = this.floor(
        start.add({ [`${unit}s`]: n * k } as TemporalNS.DurationLike)
      );
      if (end.epochMilliseconds > start.epochMilliseconds) return end;
    }
  }

  /** The cells that meet `[lo, hi]`: the first may start before `lo`, and
   *  the last may end after `hi`. */
  cells(lo: number, hi: number, zone: string): CalendarCell[] {
    const out: CalendarCell[] = [];
    let s = this.floor(zoned(lo, zone));
    while (s.epochMilliseconds <= hi) {
      const e = this.next(s);
      out.push(fieldsOf(s, e.epochMilliseconds, this.unit));
      s = e;
    }
    return out;
  }

  /** A cell's label: the partition's `.format(fn)`, if it has one. Else
   *  the default: its level's field in `zone` (the zone its cells were read
   *  in), formatted by `Intl.DateTimeFormat` in en-US ({@link LABEL_LOCALE}:
   *  "Jan", "12 AM", "Feb 29", "2024"), or "Q1" to "Q4" for a quarter. */
  label(cell: CalendarCell, zone: string): string {
    if (this.formatCell !== undefined) return this.formatCell(cell);
    if (this.unit === "quarter") return `Q${cell.quarter}`;
    return formatter(this.unit, zone).format(cell.start);
  }

  /** The wire form. A partition with a `.format(fn)` has none (a loud
   *  error): `key` is the index `JSON.stringify` passes for an entry of a
   *  list (an axis's `levels`). */
  toJSON(key?: string): CalendarJSON {
    if (this.formatCell !== undefined) {
      const row = key !== undefined && key !== "" ? `[${key}]: ` : "";
      throw new Error(
        `${row}${String(this)} has no wire form: its format is a JS ` +
          `function, which cannot be serialized (to Python or the IR). ` +
          `Drop the .format(...) to use the default labels.`
      );
    }
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
    const stepped = this.step === 1 ? base : `${base}.every(${this.step})`;
    return this.formatCell === undefined ? stepped : `${stepped}.format(...)`;
  }
}

/** `Calendar.week`: the Monday-start week partition, also callable as
 *  `Calendar.week({ start: "sunday" })` for another first day. */
export type WeekPartition = CalendarPartition<"week"> &
  ((opts?: { start?: WeekStart }) => CalendarPartition<"week">);

function weekPartition(): WeekPartition {
  const make = ({ start }: { start?: WeekStart } = {}) =>
    calendarPartition(
      { unit: "week", step: 1, start },
      "Calendar.week"
    ) as CalendarPartition<"week">;
  // A function that is also the default partition: same prototype, same
  // fields, so `Calendar.week` works as a value and as a call.
  const fn = make as unknown as WeekPartition;
  const week = make();
  Object.setPrototypeOf(fn, CalendarPartition.prototype);
  Object.defineProperties(fn, {
    unit: { value: week.unit, enumerable: true },
    step: { value: week.step, enumerable: true },
    start: { value: week.start, enumerable: true },
  });
  return fn;
}

/** The calendar partitions: the cells of `field(x).bin(...)`, and the
 *  levels of a time axis (`axes: { x: { levels: [...] } }`). */
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

/** `value` as an error message shows it. A partition (a Calendar value, or
 *  `Bin.step(...)`, cells.ts) shows as its builder spelling, its own
 *  `toString`, and nothing calls `toJSON` (a partition with a format has no
 *  wire form, and its `toJSON` throws). */
export function describe(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(describe).join(", ")}]`;
  if (
    value !== null &&
    typeof value === "object" &&
    typeof value.toString === "function" &&
    value.toString !== Object.prototype.toString
  )
    return String(value);
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(
      ([k, v]) => `${k}: ${describe(v)}`
    );
    return `{ ${fields.join(", ")} }`;
  }
  if (typeof value === "function") return "a function";
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/** A Calendar value from a builder value or its wire form (Python sends the
 *  wire form). An unknown unit, or a `start` that is not "monday" or
 *  "sunday" or is given for a level other than weeks, is a loud error. */
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
        `Calendar.hour.every(6), ...), got ${describe(value)}.`
    );
  }
  if (v.start !== undefined && v.unit !== "week") {
    throw new Error(`${where}: only Calendar.week takes a start day.`);
  }
  if (v.start !== undefined && v.start !== "monday" && v.start !== "sunday") {
    throw new Error(
      `${where}: start must be "monday" or "sunday", not ${describe(v.start)}.`
    );
  }
  return new CalendarPartition(v.unit as CalendarUnit, v.step ?? 1, v.start);
}

// ── Ticks ─────────────────────────────────────────────────────────────────

/** The level-and-steps a time axis picks its inner row from, finest first.
 *  Weeks and quarters are never picked (a week row can be asked for; a
 *  quarter row is months in steps of 3 with other labels). */
const AUTO_STEPS: [CalendarUnit, number[]][] = [
  ["second", [1, 5, 15, 30]],
  ["minute", [1, 5, 15, 30]],
  ["hour", [1, 3, 6, 12]],
  ["day", [1, 2]],
  ["month", [1, 2, 3]],
  ["year", [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]],
];

/** About how long one cell of `unit` × `step` lasts. */
export function nominalMs(unit: CalendarUnit, step: number): number {
  const ms: Record<CalendarUnit, number> = {
    second: 1e3,
    minute: 6e4,
    hour: 36e5,
    day: 864e5,
    week: 6048e5,
    month: 2628e6,
    quarter: 7884e6,
    year: 31557e6,
  };
  return ms[unit] * step;
}

/**
 * The partition a time axis over `[lo, hi]` ticks at when its rows are not
 * given: about `count` ticks, as a numeric axis aims for `count` ticks. Like
 * d3's time ticks, it takes the entry of {@link AUTO_STEPS} whose nominal
 * cell length is nearest (by ratio) to `(hi − lo) / count`. A domain of one
 * instant (`lo === hi`) has no length to divide, so it ticks at days: its
 * axis spans the day that holds it. It reads only the domain, never pixels.
 */
export function tickPartition(
  lo: number,
  hi: number,
  count: number
): CalendarPartition {
  if (hi === lo) return Calendar.day;
  const target = (hi - lo) / count;
  let best: CalendarPartition | undefined;
  let bestRatio = Infinity;
  for (const [unit, steps] of AUTO_STEPS) {
    for (const step of steps) {
      const d = nominalMs(unit, step);
      const ratio = Math.max(d / target, target / d);
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = new CalendarPartition(unit, step);
      }
    }
  }
  return best!;
}

/** `[lo, hi]` rounded outward to cell starts of `partition` in `zone`: the
 *  start of the cell that holds `lo`, and the first cell start at or after
 *  `hi`, the smallest run of whole cells that covers the domain. A domain of
 *  one instant is covered by the one cell that holds it. The time analog of
 *  d3's `nice`. */
export function niceToCells(
  lo: number,
  hi: number,
  partition: CalendarPartition,
  zone: string
): [number, number] {
  const first = partition.floor(zoned(lo, zone));
  const last = partition.floor(zoned(hi, zone));
  return [
    first.epochMilliseconds,
    last.epochMilliseconds === hi && hi > lo
      ? hi
      : partition.next(last).epochMilliseconds,
  ];
}

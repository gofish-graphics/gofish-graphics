/**
 * Time (#1057): `Schema.time()` (HasCalendar), Calendar partitions, and the
 * time axis's rows. Covers the calendar math in UTC and across a daylight
 * saving change, steps aligned to the level above, week starts, the parsing
 * of time values, Date inference, the default rows for the three target
 * mocks (daily over 14 months, hourly over 3.5 days, events over 6 years),
 * the rows option, the Temporal polyfill path, and rendered axes (labels and
 * where they sit).
 *
 * Run: `pnpm build && tsx src/tests/time.test.ts` (wired as `pnpm
 * test:time`). The rendering checks import from `dist`, like schema.test.ts.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import {
  Calendar,
  CalendarPartition,
  calendarPartition,
  loadTemporal,
  tickPartition,
} from "../ast/calendar";
import {
  applySchema,
  getColumnTypes,
  setColumnTypes,
  toEpochMs,
  Schema as SrcSchema,
} from "../ast/schema";
import {
  defaultTimeRows,
  rowLabels,
  timeRowsFromOption,
} from "../ast/axes/timeRows";
import {
  CONTINUOUS,
  niceContinuous,
  withCalendar,
} from "../ast/underlyingSpace";
import { interval } from "../util/interval";

const { chart, scatter, spread, line, circle, Schema } = GoFish as any;
const DistCalendar = (GoFish as any).Calendar;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
async function errorOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}
const iso = (t: number) => new Date(t).toISOString();
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Average character width of the non-DOM text fallback (text.tsx). */
const textWidth = (s: string) => s.length * 6;

async function main() {
  console.log("\n# the polyfill loads when Temporal is missing");
  {
    const g = globalThis as { Temporal?: unknown };
    const native = g.Temporal;
    delete g.Temporal;
    const T = await loadTemporal();
    check("loadTemporal falls back to temporal-polyfill", T !== undefined);
    check(
      "the polyfill does calendar math",
      T.PlainDate.from("2024-02-28").add({ days: 1 }).toString() ===
        "2024-02-29"
    );
    if (native !== undefined) g.Temporal = native;
  }

  console.log("\n# calendar cells in UTC");
  {
    const lo = Date.UTC(2023, 10, 15);
    const hi = Date.UTC(2024, 1, 10);
    const months = Calendar.month.cells(lo, hi, "UTC");
    check(
      "month cells meet the domain, the first starting before it",
      same(
        months.map((c) => iso(c.start).slice(0, 10)),
        ["2023-11-01", "2023-12-01", "2024-01-01", "2024-02-01"]
      )
    );
    check(
      "a cell ends where the next starts",
      months.every((c, i) => i === 0 || months[i - 1].end === c.start)
    );
    const q = Calendar.month.every(3).cells(lo, Date.UTC(2024, 11, 31), "UTC");
    check(
      "month.every(3) starts in Jan, Apr, Jul, Oct",
      same(
        q.map((c) => c.month),
        [10, 1, 4, 7, 10]
      )
    );
    const d2 = Calendar.day
      .every(2)
      .cells(Date.UTC(2024, 0, 29), Date.UTC(2024, 1, 3), "UTC");
    check(
      "day.every(2) restarts on the 1st (a 31st is a one-day cell)",
      same(
        d2.map((c) => c.day),
        [29, 31, 1, 3]
      ) && d2[1].end - d2[1].start === 864e5
    );
    const h6 = Calendar.hour
      .every(6)
      .cells(Date.UTC(2024, 1, 28, 1), Date.UTC(2024, 1, 29, 1), "UTC");
    check(
      "hour.every(6) starts at 0, 6, 12, 18",
      same(
        h6.map((c) => c.hour),
        [0, 6, 12, 18, 0]
      )
    );
    const y5 = Calendar.year
      .every(5)
      .cells(Date.UTC(2018, 2), Date.UTC(2031, 0), "UTC");
    check(
      "year.every(5) starts on years divisible by 5",
      same(
        y5.map((c) => c.year),
        [2015, 2020, 2025, 2030]
      )
    );
    const [leap] = Calendar.hour.cells(
      Date.UTC(2024, 1, 29, 13, 30),
      Date.UTC(2024, 1, 29, 13, 30),
      "UTC"
    );
    check(
      "a cell carries its start's calendar fields as plain numbers",
      same(
        [
          leap.year,
          leap.quarter,
          leap.month,
          leap.week,
          leap.day,
          leap.hour,
          leap.minute,
          leap.second,
        ],
        [2024, 1, 2, 9, 29, 13, 0, 0]
      ) && !("zoned" in leap)
    );
    const wk = Calendar.week.cells(
      Date.UTC(2024, 0, 3),
      Date.UTC(2024, 0, 10),
      "UTC"
    );
    check(
      "weeks start on Monday by default",
      wk.every((c) => new Date(c.start).getUTCDay() === 1)
    );
    const sun = Calendar.week({ start: "sunday" }).cells(
      Date.UTC(2024, 0, 3),
      Date.UTC(2024, 0, 10),
      "UTC"
    );
    check(
      'Calendar.week({ start: "sunday" }) starts on Sunday',
      sun.every((c) => new Date(c.start).getUTCDay() === 0)
    );
    check(
      "Calendar.week is a Calendar value and a function",
      Calendar.week instanceof CalendarPartition &&
        typeof Calendar.week === "function" &&
        same(Calendar.week, { unit: "week", step: 1, start: "monday" })
    );
    check(
      "Calendar values write their wire form",
      same(Calendar.hour.every(6), { unit: "hour", step: 6 })
    );
    check(
      "the wire form reads back",
      same(
        calendarPartition({ unit: "month", step: 3 }, "x"),
        Calendar.month.every(3)
      )
    );
    check(
      "a step below 1 is an error",
      (await errorOf(() => Calendar.month.every(0)))?.includes("step") === true
    );
  }

  console.log("\n# calendar cells in a zone with daylight saving");
  {
    const zone = "America/New_York";
    // 2024-03-10 is 23 hours long in New York; 2024-11-03 is 25.
    const days = Calendar.day.cells(
      Date.UTC(2024, 2, 9, 12),
      Date.UTC(2024, 2, 11, 12),
      zone
    );
    check(
      "a day starts at local midnight",
      days.every((c) => c.hour === 0 && c.minute === 0)
    );
    check(
      "the spring-forward day lasts 23 hours",
      (days[1].end - days[1].start) / 36e5 === 23
    );
    const fall = Calendar.day.cells(
      Date.UTC(2024, 10, 3, 12),
      Date.UTC(2024, 10, 3, 13),
      zone
    );
    check(
      "the fall-back day lasts 25 hours",
      (fall[0].end - fall[0].start) / 36e5 === 25
    );
    check(
      "labels read in the zone",
      Calendar.hour.label(days[1], zone) === "12 AM" &&
        Calendar.day.label(days[1], zone) === "Mar 10"
    );
  }

  console.log("\n# time values");
  {
    await loadTemporal();
    check(
      "a date alone is the start of that day in the zone",
      toEpochMs("2024-03-05", "UTC", "d") === Date.UTC(2024, 2, 5) &&
        toEpochMs("2024-03-05", "America/New_York", "d") ===
          Date.UTC(2024, 2, 5, 5)
    );
    check(
      "a date-time with an offset is that instant",
      toEpochMs("2024-03-05T14:30:00Z", "America/New_York", "d") ===
        Date.UTC(2024, 2, 5, 14, 30) &&
        toEpochMs("2024-03-05T14:30:00+02:00", "UTC", "d") ===
          Date.UTC(2024, 2, 5, 12, 30)
    );
    check(
      "a date-time without an offset is wall-clock time in the zone",
      toEpochMs("2024-07-01T09:00", "America/New_York", "d") ===
        Date.UTC(2024, 6, 1, 13)
    );
    check(
      "Dates and numbers pass as their epoch ms; null stays",
      toEpochMs(new Date(5), "UTC", "d") === 5 &&
        toEpochMs(7, "UTC", "d") === 7 &&
        toEpochMs(null, "UTC", "d") === null
    );
    const bad = await errorOf(() => toEpochMs("March 5", "UTC", "when"));
    check(
      "a value that is no time is a loud error naming the column",
      bad?.includes('column "when"') === true && bad.includes("ISO 8601"),
      bad
    );
  }

  console.log("\n# applying a schema");
  {
    const rows = [
      { when: new Date(Date.UTC(2024, 0, 1)), n: "2024-01-01", k: 1 },
    ];
    const typed = await applySchema(rows);
    check(
      "a Date column is inferred as a UTC time",
      same(getColumnTypes(typed), { when: { HasCalendar: { zone: "UTC" } } })
    );
    check(
      "its values become epoch ms, in copied rows",
      (typed[0] as any).when === Date.UTC(2024, 0, 1) &&
        rows[0].when instanceof Date
    );
    check(
      "strings and numbers are never inferred",
      typeof (typed[0] as any).n === "string" && (typed[0] as any).k === 1
    );
    const declared = await applySchema(rows, {
      n: SrcSchema.time({ zone: "Asia/Tokyo" }),
    });
    check(
      "a declared string column parses in its zone",
      (declared[0] as any).n === Date.UTC(2023, 11, 31, 15)
    );
    const untyped = [{ a: 1 }];
    check(
      "data with no types is returned as is",
      (await applySchema(untyped)) === untyped
    );
    const zoneErr = await errorOf(() =>
      applySchema([{ t: 1 }], { t: SrcSchema.time({ zone: "Mars/Olympus" }) })
    );
    check(
      "an unknown zone is a loud error",
      zoneErr?.includes("IANA") === true,
      zoneErr
    );
  }

  console.log("\n# derive results are typed like chart data");
  {
    const input = await applySchema([{ day: "2024-01-01", n: 1 }], {
      day: SrcSchema.time(),
    });
    // Run a derive operator on `data` (default `input`) and return the rows
    // its mark gets.
    const derived = async (
      fn: (rows: any[]) => any[],
      opts?: any,
      data: any = input
    ) => {
      let seen: any;
      const mark = await GoFish.derive(fn, opts)(async (d: any) => {
        seen = d;
        return undefined;
      });
      await mark(data);
      return seen;
    };
    const at = Date.UTC(2024, 0, 2);
    const fromJs = await derived((rows) =>
      rows.map((r) => ({ ...r, at: new Date(at) }))
    );
    check(
      "a derive's Date column is a time, in epoch ms",
      fromJs[0].at === at &&
        same(getColumnTypes(fromJs), {
          day: { HasCalendar: { zone: "UTC" } },
          at: { HasCalendar: { zone: "UTC" } },
        }),
      JSON.stringify([fromJs[0], getColumnTypes(fromJs)])
    );
    check(
      "the input's time column keeps its type and its epoch ms",
      fromJs[0].day === Date.UTC(2024, 0, 1)
    );
    // What the widget's decode hands back for a Python callback that
    // returns a tz-aware datetime column: Dates, typed with the zone.
    const fromPython = await derived((rows) =>
      setColumnTypes(
        rows.map((r) => ({ ...r, at: new Date(at) })),
        { at: { HasCalendar: { zone: "America/New_York" } } }
      )
    );
    const rewritten = await derived((rows) =>
      rows.map((r) => ({ ...r, day: "Mar" }))
    );
    check(
      "a derive that rewrites a date to text makes it plain text",
      rewritten[0].day === "Mar" &&
        getColumnTypes(rewritten)?.day === undefined,
      JSON.stringify([rewritten[0], getColumnTypes(rewritten)])
    );
    const annotated = await derived(
      (rows) => rows.map((r) => ({ ...r, at: "2024-03-05" })),
      { schema: { at: Schema.time({ zone: "America/New_York" }) } }
    );
    check(
      "derive(fn, { schema }) converts ISO strings to instants in its zone",
      annotated[0].at === Date.UTC(2024, 2, 5, 5) &&
        getColumnTypes(annotated)?.at?.HasCalendar?.zone ===
          "America/New_York",
      JSON.stringify([annotated[0], getColumnTypes(annotated)])
    );
    const months = await applySchema(
      [
        { m: "Jan", n: 1 },
        { m: "Feb", n: 2 },
      ],
      { m: SrcSchema.ordered(["Jan", "Feb", "Mar"]) }
    );
    const kept = await derived((rows) => rows.slice(1), undefined, months);
    const quarters = await derived(
      (rows) => rows.map((r) => ({ ...r, m: "Q1" })),
      undefined,
      months
    );
    const reordered = await derived(
      (rows) => rows.map((r) => ({ ...r, m: "Q1" })),
      { schema: { m: Schema.ordered(["Q1", "Q2"]) } },
      months
    );
    const flags = await derived(
      (rows) => rows.map((r) => ({ ...r, m: true })),
      undefined,
      months
    );
    check(
      "an ordered column keeps its order while its values are text or " +
        "numbers, even outside the levels, and loses it otherwise",
      same(getColumnTypes(kept)?.m?.HasOrder?.levels, ["Jan", "Feb", "Mar"]) &&
        same(getColumnTypes(quarters)?.m?.HasOrder?.levels, [
          "Jan",
          "Feb",
          "Mar",
        ]) &&
        getColumnTypes(flags)?.m === undefined &&
        same(getColumnTypes(reordered)?.m?.HasOrder?.levels, ["Q1", "Q2"])
    );
    const filtered = await (async () => {
      let seen: any;
      const mark = await GoFish.filter((r: any) => r.n > 0)(async (d: any) => {
        seen = d;
        return undefined;
      });
      await mark(input);
      return seen;
    })();
    check(
      "filter keeps its input's types",
      filtered[0].day === Date.UTC(2024, 0, 1) &&
        getColumnTypes(filtered)?.day?.HasCalendar?.zone === "UTC"
    );
    check(
      "a typed derive result keeps its own type for its columns",
      fromPython[0].at === at &&
        getColumnTypes(fromPython)?.at?.HasCalendar?.zone ===
          "America/New_York" &&
        getColumnTypes(fromPython)?.day?.HasCalendar?.zone === "UTC"
    );
  }

  console.log("\n# default rows and nicing");
  {
    const rowsOf = (lo: number, hi: number) =>
      defaultTimeRows(tickPartition(lo, hi, 10)).map((r) =>
        r.partition.toString()
      );
    check(
      "daily over 14 months: month, year",
      same(rowsOf(Date.UTC(2023, 10, 1), Date.UTC(2024, 11, 31)), [
        "Calendar.month",
        "Calendar.year",
      ])
    );
    check(
      "hourly over 3.5 days: hours in steps of 6, day",
      same(rowsOf(Date.UTC(2024, 1, 28), Date.UTC(2024, 2, 2, 12)), [
        "Calendar.hour.every(6)",
        "Calendar.day",
      ])
    );
    check(
      "events over 6 years: one year row",
      same(rowsOf(Date.UTC(2018, 2, 12), Date.UTC(2024, 5, 24)), [
        "Calendar.year",
      ])
    );
    const timeSpace = (lo: number, hi: number, zone = "UTC") =>
      withCalendar(CONTINUOUS(interval(lo, hi), "pinned"), { zone });
    const nicedIso = (sp: any, ticks?: any) => {
      const iv = (niceContinuous(sp, ticks) as any).dataInterval;
      return [iso(iv.min), iso(iv.max)];
    };
    check(
      "a time domain nices outward to its inner row's cells",
      same(nicedIso(timeSpace(Date.UTC(2018, 2, 12), Date.UTC(2024, 5, 24))), [
        "2018-01-01T00:00:00.000Z",
        "2025-01-01T00:00:00.000Z",
      ])
    );
    check(
      "an end already on a cell start stays",
      same(nicedIso(timeSpace(Date.UTC(2023, 10, 1), Date.UTC(2025, 0, 1))), [
        "2023-11-01T00:00:00.000Z",
        "2025-01-01T00:00:00.000Z",
      ])
    );
    check(
      "an explicit inner row sets the nicing",
      same(
        nicedIso(timeSpace(Date.UTC(2024, 0, 24), Date.UTC(2024, 2, 31)), {
          count: 10,
          rows: [{ partition: Calendar.week }],
        }),
        ["2024-01-22T00:00:00.000Z", "2024-04-01T00:00:00.000Z"]
      )
    );
    check(
      "a time domain nices in its zone",
      same(
        nicedIso(
          timeSpace(
            Date.UTC(2024, 2, 9, 7),
            Date.UTC(2024, 2, 11, 20),
            "America/New_York"
          )
        ),
        ["2024-03-09T05:00:00.000Z", "2024-03-11T22:00:00.000Z"]
      )
    );
    check(
      "a numeric domain still nices to round numbers",
      same(
        (niceContinuous(CONTINUOUS(interval(3, 97), "pinned")) as any)
          .dataInterval,
        { min: 0, max: 100 }
      )
    );
    const labels = rowLabels(
      { partition: Calendar.year },
      Date.UTC(2023, 10, 1),
      Date.UTC(2025, 0, 1),
      "UTC"
    );
    check(
      "an outer cell that starts before the domain is labeled at its first " +
        "tick, and the last tick is labeled",
      same(
        labels.map((l) => [l.text, iso(l.at).slice(0, 10)]),
        [
          ["2023", "2023-11-01"],
          ["2024", "2024-01-01"],
          ["2025", "2025-01-01"],
        ]
      )
    );
  }

  console.log("\n# the rows option");
  {
    const fmt = (c: any) => `Q${c.quarter}`;
    const rows = timeRowsFromOption(
      [
        Calendar.week,
        { unit: "month" } as any,
        { unit: Calendar.quarter, format: fmt },
      ],
      "x"
    );
    check(
      "rows read Calendar values, wire forms, and { unit, format }",
      rows.length === 3 &&
        rows[0].partition.unit === "week" &&
        rows[1].partition.unit === "month" &&
        rows[2].format === fmt
    );
    const bad = await errorOf(() => timeRowsFromOption(["month"] as any, "x"));
    check(
      "a row that is not a Calendar value is a loud error",
      bad?.includes("axes.x.rows[0]") === true,
      bad
    );
    const callable = timeRowsFromOption(
      [
        { unit: Calendar.week, format: fmt },
        { unit: { unit: "month", step: 3 }, format: fmt } as any,
      ],
      "x"
    );
    check(
      "{ unit, format } takes the callable Calendar.week and a wire form",
      callable[0].partition.unit === "week" &&
        callable[0].format === fmt &&
        callable[1].partition.toString() === "Calendar.month.every(3)" &&
        callable[1].format === fmt
    );
    const named = await errorOf(() =>
      timeRowsFromOption([{ unit: "month", format: fmt }] as any, "x")
    );
    check(
      "{ unit, format } with a level name is a loud error, not a dropped format",
      named?.includes("axes.x.rows[0].unit") === true,
      named
    );
  }

  console.log("\n# week starts are checked in the wire form");
  {
    const bad = await errorOf(() =>
      calendarPartition({ unit: "week", start: "tuesday" } as any, "rows[0]")
    );
    check(
      'a week start that is not "monday" or "sunday" is a loud error',
      bad?.includes('start must be "monday" or "sunday"') === true &&
        bad.includes("rows[0]"),
      bad
    );
    check(
      "a valid wire week start is read",
      calendarPartition({ unit: "week", step: 1, start: "sunday" }, "w")
        .start === "sunday"
    );
  }

  console.log("\n# Date inference reads the first non-null value");
  {
    const at = Date.UTC(2024, 0, 2);
    const rows = await applySchema([
      { d: null, n: null },
      { d: new Date(at), n: 1 },
    ]);
    check(
      "a column whose first value is null is still inferred from its Dates",
      rows[1].d === at &&
        same(getColumnTypes(rows), { d: { HasCalendar: { zone: "UTC" } } }),
      JSON.stringify([rows, getColumnTypes(rows)])
    );
  }

  console.log("\n# naive wall-clock values read in the schema's zone");
  {
    // What the widget's Arrow decode hands a chart for a naive timestamp, a
    // date, and a tz-aware timestamp (arrowDecode.ts): wall-clock strings
    // and epoch ms, all typed HasCalendar.
    const decoded = setColumnTypes(
      [
        {
          naive: "2024-02-28T13:00:00",
          day: "2024-02-28",
          aware: Date.UTC(2024, 1, 28, 13),
        },
      ],
      {
        naive: { HasCalendar: { zone: "UTC" } },
        day: { HasCalendar: { zone: "UTC" } },
        aware: { HasCalendar: { zone: "UTC" } },
      }
    );
    const ny = SrcSchema.time({ zone: "America/New_York" });
    const rows = await applySchema(decoded, {
      naive: ny,
      day: ny,
      aware: ny,
    });
    check(
      "a naive date-time is that wall-clock time in New York",
      rows[0].naive === Date.UTC(2024, 1, 28, 18),
      iso(rows[0].naive)
    );
    check(
      "a date is midnight Feb 28 in New York, not Feb 27",
      rows[0].day === Date.UTC(2024, 1, 28, 5),
      iso(rows[0].day)
    );
    check(
      "a tz-aware instant is unchanged by the zone",
      rows[0].aware === Date.UTC(2024, 1, 28, 13)
    );
    const utc = await applySchema(decoded);
    check(
      "with no schema a wall-clock value reads in UTC",
      utc[0].naive === Date.UTC(2024, 1, 28, 13) &&
        utc[0].day === Date.UTC(2024, 1, 28)
    );
  }

  console.log("\n# one instant");
  {
    const one = withCalendar(
      CONTINUOUS(
        interval(Date.UTC(2024, 1, 28, 15), Date.UTC(2024, 1, 28, 15)),
        "pinned"
      ),
      { zone: "UTC" }
    );
    const iv = (niceContinuous(one) as any).dataInterval;
    check(
      "a one-instant domain nices out to the day that holds it",
      iso(iv.min) === "2024-02-28T00:00:00.000Z" &&
        iso(iv.max) === "2024-02-29T00:00:00.000Z",
      `${iso(iv.min)} ${iso(iv.max)}`
    );
    const midnight = withCalendar(
      CONTINUOUS(
        interval(Date.UTC(2024, 1, 28), Date.UTC(2024, 1, 28)),
        "pinned"
      ),
      { zone: "UTC" }
    );
    const iv2 = (niceContinuous(midnight) as any).dataInterval;
    check(
      "an instant on a cell start still spans its cell",
      iv2.max - iv2.min === 864e5
    );
  }

  console.log("\n# labels are en-US whatever the runtime locale");
  {
    // Simulate a runtime whose default locale is de-DE: a formatter built
    // with no locale formats in German. (A zone no earlier check used, so
    // the label formatters are built after the swap.)
    const Native = Intl.DateTimeFormat;
    (Intl as any).DateTimeFormat = function (
      locale?: string | string[],
      opts?: Intl.DateTimeFormatOptions
    ) {
      return new Native(locale ?? "de-DE", opts);
    };
    try {
      const german = new Intl.DateTimeFormat(undefined, {
        month: "short",
        timeZone: "UTC",
      }).format(Date.UTC(2024, 2, 1));
      const zone = "Europe/Berlin";
      const lo = Date.UTC(2024, 2, 1);
      const labelOf = (p: CalendarPartition) =>
        p.label(p.cells(lo, lo, zone)[0], zone);
      check(
        "the simulated runtime locale is German",
        german.startsWith("Mär"),
        german
      );
      check(
        "month and day labels stay English",
        labelOf(Calendar.month) === "Mar" &&
          labelOf(Calendar.day) === "Mar 1",
        `${labelOf(Calendar.month)} ${labelOf(Calendar.day)}`
      );
    } finally {
      (Intl as any).DateTimeFormat = Native;
    }
  }

  console.log("\n# rendered time axes");
  {
    const textsOf = (dl: any): { text: string; x: number; y: number }[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        if (it.kind === "text") out.push(it);
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out;
    };
    const prices = Array.from({ length: 427 }, (_, i) => ({
      date: new Date(Date.UTC(2023, 10, 1) + i * 864e5)
        .toISOString()
        .slice(0, 10),
      price: 100 + Math.sin(i / 20),
    }));
    const dl = await chart(prices, {
      schema: { date: Schema.time() },
      axes: { x: { title: false }, y: false },
    })
      .flow(scatter({ by: "date", x: "date", y: "price" }))
      .mark(line())
      .toDisplayList({ w: 560, h: 200 });
    const texts = textsOf(dl);
    const words = texts.map((t) => t.text);
    check(
      "the daily axis labels months and years",
      ["Nov", "Dec", "Jan", "Feb", "2023", "2024"].every((w) =>
        words.includes(w)
      ),
      words.join(" ")
    );
    const at = (w: string) => texts.find((t) => t.text === w)!;
    check(
      "the year row sits past the month row",
      at("2023").y > at("Nov").y,
      `${at("2023").y} vs ${at("Nov").y}`
    );
    // A label's center along x (`textWidth` is the non-DOM fallback's).
    const mid = (w: string) => at(w).x + textWidth(w) / 2;
    check(
      'labels are centered on their ticks: "2024" under "Jan", and "2023" ' +
        'under "Nov" at the first tick',
      Math.abs(mid("2024") - mid("Jan")) < 0.5 &&
        Math.abs(mid("2023") - mid("Nov")) < 0.5,
      JSON.stringify([mid("2024"), mid("Jan"), mid("2023"), mid("Nov")])
    );
    check(
      "no tick label is a number of milliseconds",
      !words.some((w) => /^\d{9,}$/.test(w.replace(/,/g, "")))
    );

    const rowsDl = await chart(prices, {
      schema: { date: Schema.time() },
      axes: {
        x: {
          title: false,
          rows: [
            {
              unit: DistCalendar.quarter,
              format: (c: any) =>
                `Q${c.quarter} '${String(c.year % 100).padStart(2, "0")}`,
            },
          ],
        },
        y: false,
      },
    })
      .flow(scatter({ by: "date", x: "date", y: "price" }))
      .mark(line())
      .toDisplayList({ w: 560, h: 200 });
    check(
      "a one-row axis uses its format function",
      same(
        textsOf(rowsDl).map((t) => t.text),
        ["Q4 '23", "Q1 '24", "Q2 '24", "Q3 '24", "Q4 '24", "Q1 '25"]
      ),
      textsOf(rowsDl)
        .map((t) => t.text)
        .join(" ")
    );

    const notTime = await errorOf(() =>
      chart([{ a: 1, b: 2 }], {
        axes: { x: { rows: [DistCalendar.month] } },
      })
        .flow(scatter({ by: "a", x: "a", y: "b" }))
        .mark(circle({ r: 2 }))
        .toDisplayList({ w: 100, h: 100 })
    );
    check(
      "rows on a non-time axis are a loud error",
      notTime?.includes("need a time axis") === true,
      notTime
    );

    // A faceted chart: the facets' ordinal x axis shares the dim with the
    // time axis in each facet. The rows reach the time axes and the ordinal
    // axis ignores them.
    const cities = ["A", "B"].flatMap((city) =>
      ["2024-01-15", "2024-03-10", "2024-05-20"].map((date, i) => ({
        city,
        date,
        v: i,
      }))
    );
    const facetWords = textsOf(
      await chart(cities, {
        schema: { date: Schema.time() },
        axes: { x: { rows: [DistCalendar.month] }, y: false },
      })
        .flow(
          spread({ by: "city", dir: "x" }),
          scatter({ by: "date", x: "date", y: "v", axes: { x: true } })
        )
        .mark(circle({ r: 2 }))
        .toDisplayList({ w: 400, h: 200 })
    ).map((t) => t.text);
    check(
      "a faceted chart's rows reach its time axes, not its category axis",
      facetWords.filter((w) => w === "Jan").length === 2 &&
        !facetWords.includes("2024") &&
        facetWords.includes("A"),
      facetWords.join(" ")
    );

    // One date: the axis spans its day and shows the date, not seconds.
    const oneWords = textsOf(
      await chart([{ date: "2024-02-28", v: 1 }], {
        schema: { date: Schema.time() },
        axes: { x: { title: false }, y: false },
      })
        .flow(scatter({ by: "date", x: "date", y: "v" }))
        .mark(circle({ r: 2 }))
        .toDisplayList({ w: 300, h: 100 })
    ).map((t) => t.text);
    check(
      "a one-date chart labels the date",
      oneWords.includes("Feb 28") && !oneWords.some((w) => /:\d\d:/.test(w)),
      oneWords.join(" ")
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

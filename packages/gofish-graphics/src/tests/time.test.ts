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

const { chart, scatter, line, circle, Schema } = GoFish as any;
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
      Calendar.hour.label(days[1]) === "12 AM" &&
        Calendar.day.label(days[1]) === "Mar 10"
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
          partition: Calendar.week,
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
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

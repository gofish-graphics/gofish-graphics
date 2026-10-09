/**
 * Tests for the widget's Arrow transport: `buildArrowTable` (encode) and
 * `arrowTableToRows` (decode).
 *
 * `buildArrowTable` is the explicit-schema Arrow encoder that
 * replaced `Arrow.tableFromJSON` for the widget RPC transport (issue #783).
 *
 * Every case round-trips through `tableToIPC` / `tableFromIPC` (the same
 * IPC bytes that cross the anywidget bridge to Python) and asserts on the
 * decoded shape, so these tests exercise the exact encoding this module
 * produces, not just its intermediate `Arrow.Table`.
 */

import * as Arrow from "apache-arrow";
import { buildArrowTable } from "./arrowTransport";
import { Serialize, chart, scatter, circle, Schema } from "gofish-graphics";
import { arrowTableToRows } from "./arrowDecode";

// This file is runnable as a script in Node, but the repo doesn't necessarily
// include Node type definitions in all TS contexts.
declare const process: any;

function roundTrip(rows: Record<string, any>[]): Arrow.Table {
  const table = buildArrowTable(rows);
  const bytes = Arrow.tableToIPC(table);
  return Arrow.tableFromIPC(bytes);
}

function structToJSON(row: any): any {
  return row && typeof row.toJSON === "function" ? row.toJSON() : row;
}

function listToPlain(vec: any): any[] {
  return Array.from(vec, (item: any) => {
    if (item && typeof item.toJSON === "function") return structToJSON(item);
    return item;
  });
}

function testFlatTable(): boolean {
  console.log("Test: flat table (plain scalar columns)");
  const rows = [
    { x: 1, name: "a", ok: true },
    { x: 2, name: "b", ok: false },
  ];
  const table = roundTrip(rows);
  if (table.numRows !== 2) {
    console.log(`  ✗ expected 2 rows, got ${table.numRows}`);
    return false;
  }
  const xs = table.getChild("x")!.toArray();
  const names = table.getChild("name")!.toArray();
  const oks = table.getChild("ok")!.toArray();
  if (xs[0] !== 1 || xs[1] !== 2) {
    console.log(`  ✗ x column mismatch: ${xs}`);
    return false;
  }
  if (names[0] !== "a" || names[1] !== "b") {
    console.log(`  ✗ name column mismatch: ${names}`);
    return false;
  }
  if (oks[0] !== true || oks[1] !== false) {
    console.log(`  ✗ ok column mismatch: ${oks}`);
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

function testSingleRowStruct(): boolean {
  console.log("Test: single-row struct column (previously-working case)");
  const rows = [{ __inputRef: 0, datum: { x: 1, label: "a" } }];
  const table = roundTrip(rows);
  const datum = structToJSON(table.getChild("datum")!.get(0));
  if (datum.x !== 1 || datum.label !== "a") {
    console.log(`  ✗ datum mismatch: ${JSON.stringify(datum)}`);
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

function testMultiRowBag(): boolean {
  console.log("Test: multi-row bag (list<struct> — the #783 repro)");
  const rows = [
    {
      __inputRef: 0,
      datum: [
        { x: 1, label: "a" },
        { x: 2, label: "b" },
      ],
    },
    { __inputRef: 1, datum: [{ x: 3, label: "c" }] },
  ];
  const table = roundTrip(rows);
  const bag0 = listToPlain(table.getChild("datum")!.get(0));
  const bag1 = listToPlain(table.getChild("datum")!.get(1));
  if (bag0.length !== 2 || bag0[0].x !== 1 || bag0[1].label !== "b") {
    console.log(`  ✗ bag0 mismatch: ${JSON.stringify(bag0)}`);
    return false;
  }
  if (bag1.length !== 1 || bag1[0].x !== 3) {
    console.log(`  ✗ bag1 mismatch: ${JSON.stringify(bag1)}`);
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

function testRaggedKeys(): boolean {
  console.log("Test: ragged keys within a bag (missing key → null)");
  const rows = [
    {
      datum: [
        { x: 1, label: "a" },
        { x: 2 }, // no `label` key at all
      ],
    },
  ];
  const table = roundTrip(rows);
  const bag = listToPlain(table.getChild("datum")!.get(0));
  if (bag[0].label !== "a") {
    console.log(`  ✗ bag[0].label mismatch: ${JSON.stringify(bag[0])}`);
    return false;
  }
  if (bag[1].label !== null || bag[1].x !== 2) {
    console.log(
      `  ✗ bag[1] should have label=null, x=2, got ${JSON.stringify(bag[1])}`
    );
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

function testEmptyBag(): boolean {
  console.log("Test: empty bag (datum: [])");
  const rows = [{ __inputRef: 0, datum: [] }];
  const table = roundTrip(rows);
  const bag = listToPlain(table.getChild("datum")!.get(0));
  if (bag.length !== 0) {
    console.log(`  ✗ expected empty list, got ${JSON.stringify(bag)}`);
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

function testConflictingTypesThrow(): boolean {
  console.log("Test: conflicting types across rows throws loudly");
  const rows = [{ a: 1 }, { a: "x" }];
  try {
    buildArrowTable(rows);
    console.log("  ✗ expected buildArrowTable to throw, but it didn't");
    return false;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      !message.includes('"a"') ||
      !message.includes("number") ||
      !message.includes("string")
    ) {
      console.log(`  ✗ error message missing column/type detail: ${message}`);
      return false;
    }
    console.log("  ✓ PASSED (threw:", message, ")");
    return true;
  }
}

function testConflictingNestedTypesThrow(): boolean {
  console.log("Test: conflicting types within a bag field throws loudly");
  const rows = [{ datum: [{ x: 1 }, { x: "oops" }] }];
  try {
    buildArrowTable(rows);
    console.log("  ✗ expected buildArrowTable to throw, but it didn't");
    return false;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("datum[].x")) {
      console.log(`  ✗ error message missing nested column path: ${message}`);
      return false;
    }
    console.log("  ✓ PASSED (threw:", message, ")");
    return true;
  }
}

/** The decode (`arrowDecode.ts`): a tz-aware timestamp column reads as epoch
 *  milliseconds tagged with its zone; a naive timestamp or a date reads as
 *  an ISO wall-clock string without an offset, tagged UTC. */
function testTimeColumnsDecodeAsTimes(): boolean {
  console.log("Test: time columns decode with HasCalendar");
  const ms = Date.UTC(2024, 2, 10, 5);
  const day = Date.UTC(2024, 2, 1);
  const table = new Arrow.Table({
    ny: Arrow.vectorFromArray(
      [ms, null],
      new Arrow.TimestampMicrosecond("America/New_York")
    ),
    naive: Arrow.vectorFromArray([ms, ms], new Arrow.TimestampMillisecond()),
    d: Arrow.vectorFromArray(
      [new Date(day), new Date(day)],
      new Arrow.DateDay()
    ),
    n: Arrow.vectorFromArray([1, 2], new Arrow.Int32()),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const types = Serialize.getColumnTypes(rows);
  const ok =
    rows[0].ny === ms &&
    rows[1].ny === null &&
    rows[0].naive === "2024-03-10T05:00:00" &&
    rows[0].d === "2024-03-01" &&
    rows[1].n === 2 &&
    JSON.stringify(types) ===
      JSON.stringify({
        ny: { HasCalendar: { zone: "America/New_York" } },
        naive: { HasCalendar: { zone: "UTC" } },
        d: { HasCalendar: { zone: "UTC" } },
      });
  console.log(
    ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify({ rows, types })}`
  );
  return ok;
}

/** A naive timestamp is a wall-clock time: a chart that declares the column
 *  in America/New_York reads midnight Feb 28 as midnight in New York, as it
 *  reads the string "2024-02-28T00:00:00", not as midnight UTC (7 PM on Feb
 *  27 in New York). A tz-aware timestamp is an instant and is unchanged by
 *  the chart's zone. */
async function testNaiveTimesReadInTheChartZone(): Promise<boolean> {
  console.log("Test: naive timestamps read in the chart's zone");
  const feb28 = Date.UTC(2024, 1, 28); // the wall clock, counted as UTC
  const mar1 = Date.UTC(2024, 2, 1);
  const table = new Arrow.Table({
    t: Arrow.vectorFromArray([feb28, mar1], new Arrow.TimestampMicrosecond()),
    v: Arrow.vectorFromArray([1, 2], new Arrow.Int32()),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const labels = async (data: any[], zone: string) => {
    const dl = await chart(data, {
      schema: { t: Schema.time({ zone }) },
      axes: { x: { title: false }, y: false },
    })
      .flow(scatter({ by: "t", x: "t", y: "v" }))
      .mark(circle({ r: 2 }))
      .toDisplayList({ w: 300, h: 100 });
    const out: string[] = [];
    const walk = (it: any) => {
      if (it.kind === "text") out.push(it.text);
      for (const c of it.children ?? []) walk(c);
    };
    dl.items.forEach(walk);
    return out;
  };
  const naive = await labels(rows, "America/New_York");
  // The same instants as a tz-aware column (midnight UTC): read in New York
  // they start on Feb 27.
  const aware = arrowTableToRows(
    Arrow.tableFromIPC(
      Arrow.tableToIPC(
        new Arrow.Table({
          t: Arrow.vectorFromArray(
            [feb28, mar1],
            new Arrow.TimestampMicrosecond("UTC")
          ),
          v: Arrow.vectorFromArray([1, 2], new Arrow.Int32()),
        })
      )
    )
  );
  const awareLabels = await labels(aware, "America/New_York");
  const ok =
    rows[0].t === "2024-02-28T00:00:00" &&
    naive.includes("Feb 28") &&
    !naive.includes("Feb 27") &&
    aware[0].t === feb28 &&
    awareLabels.includes("Feb 27");
  console.log(
    ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify({ naive, awareLabels })}`
  );
  return ok;
}

/** Rows without a time column carry no column types. */
function testPlainColumnsCarryNoTypes(): boolean {
  console.log("Test: plain columns carry no column types");
  const rows = arrowTableToRows(roundTrip([{ x: 1, s: "a" }]));
  const ok =
    rows[0].x === 1 &&
    rows[0].s === "a" &&
    Serialize.getColumnTypes(rows) === undefined;
  console.log(ok ? "  ✓ PASSED" : "  ✗ FAILED");
  return ok;
}

/** The decode turns list columns, nested lists included, into plain JS
 *  arrays (a polygon's `ring` of `[x, y]` points). */
function testListColumnsDecodeAsArrays(): boolean {
  console.log("Test: list columns decode as plain arrays");
  const point = new Arrow.List(new Arrow.Field("item", new Arrow.Float64()));
  const ring = new Arrow.List(new Arrow.Field("item", point));
  const table = new Arrow.Table({
    ring: Arrow.vectorFromArray(
      [
        [
          [0, 1],
          [2, 3],
        ],
        null,
      ],
      ring
    ),
    ids: Arrow.vectorFromArray(
      [[1n, 2n], []],
      new Arrow.List(new Arrow.Field("item", new Arrow.Int64()))
    ),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const ok =
    Array.isArray(rows[0].ring) &&
    Array.isArray(rows[0].ring[1]) &&
    JSON.stringify(rows[0].ring) === "[[0,1],[2,3]]" &&
    rows[1].ring === null &&
    JSON.stringify(rows[0].ids) === "[1,2]" &&
    Array.isArray(rows[1].ids) &&
    rows[1].ids.length === 0;
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify(rows)}`);
  return ok;
}

/** A null in a numeric column decodes to null, not to whatever its value
 *  buffer holds, and a NaN stays NaN (GoFish never reads NaN as missing). */
function testNumericNullsDecodeAsNull(): boolean {
  console.log("Test: numeric nulls decode as null, NaN as NaN");
  const table = new Arrow.Table({
    x: Arrow.vectorFromArray([1.5, null, 3], new Arrow.Float64()),
    n: Arrow.vectorFromArray([null, 2, 3], new Arrow.Int32()),
    f: Arrow.vectorFromArray([NaN, 1, 2], new Arrow.Float64()),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const ok =
    rows[0].x === 1.5 &&
    rows[1].x === null &&
    rows[2].x === 3 &&
    rows[0].n === null &&
    rows[1].n === 2 &&
    Number.isNaN(rows[0].f) &&
    rows[1].f === 1;
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify(rows)}`);
  return ok;
}

/** A 64-bit integer decodes to a JS number, and a struct to a plain object
 *  whose fields convert by their own types. */
function testWideIntsAndStructs(): boolean {
  console.log("Test: wide ints decode as numbers, structs as plain objects");
  const at = new Arrow.Struct([
    new Arrow.Field("id", new Arrow.Int64()),
    new Arrow.Field("label", new Arrow.Utf8()),
  ]);
  const table = new Arrow.Table({
    t: Arrow.vectorFromArray([1709960400000n, null], new Arrow.Int64()),
    s: Arrow.vectorFromArray([{ id: 7n, label: "a" }, null], at),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const ok =
    rows[0].t === 1709960400000 &&
    rows[1].t === null &&
    Object.getPrototypeOf(rows[0].s) === Object.prototype &&
    rows[0].s.id === 7 &&
    rows[0].s.label === "a" &&
    rows[1].s === null;
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify(rows)}`);
  return ok;
}

/** Times inside lists and structs: no schema names them, so they decode to
 *  epoch milliseconds (a naive timestamp or a date read in UTC), and a list
 *  of structs is a list of rows that carries its own column types. */
function testNestedTimesDecodeAsEpochMs(): boolean {
  console.log("Test: nested times decode as epoch ms");
  const ms = Date.UTC(2024, 2, 10, 5);
  const day = Date.UTC(2024, 2, 1);
  const point = new Arrow.Struct([
    new Arrow.Field("naive", new Arrow.TimestampMillisecond()),
    new Arrow.Field("ny", new Arrow.TimestampMillisecond("America/New_York")),
    new Arrow.Field("d", new Arrow.DateDay()),
    new Arrow.Field("v", new Arrow.Int32()),
  ]);
  const table = new Arrow.Table({
    points: Arrow.vectorFromArray(
      [[{ naive: ms, ny: ms, d: new Date(day), v: 1 }, null]],
      new Arrow.List(new Arrow.Field("item", point))
    ),
    stamps: Arrow.vectorFromArray(
      [[ms, null]],
      new Arrow.List(new Arrow.Field("item", new Arrow.TimestampMillisecond()))
    ),
    at: Arrow.vectorFromArray(
      [{ naive: ms, ny: ms, d: new Date(day), v: 2 }],
      point
    ),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const [inner] = rows[0].points;
  const ok =
    inner.naive === ms &&
    inner.ny === ms &&
    inner.d === day &&
    inner.v === 1 &&
    rows[0].points[1] === null &&
    JSON.stringify(Serialize.getColumnTypes(rows[0].points)) ===
      JSON.stringify({
        naive: { HasCalendar: { zone: "UTC" } },
        ny: { HasCalendar: { zone: "America/New_York" } },
        d: { HasCalendar: { zone: "UTC" } },
      }) &&
    JSON.stringify(rows[0].stamps) === JSON.stringify([ms, null]) &&
    rows[0].at.naive === ms &&
    rows[0].at.d === day &&
    // The top-level rows carry no types: no top-level column is a time.
    Serialize.getColumnTypes(rows) === undefined;
  console.log(
    ok
      ? "  ✓ PASSED"
      : `  ✗ FAILED ${JSON.stringify({ rows, inner: Serialize.getColumnTypes(rows[0].points) })}`
  );
  return ok;
}

/** A callback's decoded rows are typed before anything reads them: a lambda
 *  accessor's result and a derive's single-datum result hold epoch ms, not
 *  the decode's wall-clock strings, and `derive(fn, { schema })` reads them
 *  in its zone. */
async function testCallbackResultsAreTyped(): Promise<boolean> {
  console.log("Test: callback results are typed before they are read");
  const feb28 = Date.UTC(2024, 1, 28, 13); // the wall clock, counted as UTC
  const bridge: Serialize.DeriveBridge = {
    async applyLambda(_id, rows) {
      const table = new Arrow.Table({
        t: Arrow.vectorFromArray(
          rows.map(() => feb28),
          new Arrow.TimestampMillisecond()
        ),
        n: Arrow.vectorFromArray(
          rows.map((_, i) => i),
          new Arrow.Int32()
        ),
      });
      return arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
    },
  };
  // A Python accessor is resolved over its rows in one batch call.
  const accessor = Serialize.unwrapOpts({ __gofish_lambda: "f" }, bridge);
  const [fromAccessor] = await accessor[Serialize.RESOLVE_ROWS]([{ x: 1 }]);
  const single = async (schema?: Record<string, unknown>) => {
    let seen: any;
    const op = Serialize.rebuild(
      "operator",
      "derive",
      { lambdaId: "g", ...(schema ? { schema } : {}) },
      { bridge }
    ) as any;
    await (
      await op(async (d: any) => {
        seen = d;
        return undefined;
      })
    )({ x: 1 });
    return seen;
  };
  const utc = await single();
  const ny = await single({ t: { HasCalendar: { zone: "America/New_York" } } });
  const ok =
    fromAccessor.t === feb28 &&
    !Array.isArray(utc) &&
    utc.t === feb28 &&
    ny.t === Date.UTC(2024, 1, 28, 18);
  console.log(
    ok
      ? "  ✓ PASSED"
      : `  ✗ FAILED ${JSON.stringify({ fromAccessor, utc, ny })}`
  );
  return ok;
}

export async function runArrowTransportTests(): Promise<boolean> {
  console.log("Running Arrow transport tests...\n");

  const results = [
    testFlatTable(),
    testSingleRowStruct(),
    testMultiRowBag(),
    testRaggedKeys(),
    testEmptyBag(),
    testConflictingTypesThrow(),
    testConflictingNestedTypesThrow(),
    testTimeColumnsDecodeAsTimes(),
    testPlainColumnsCarryNoTypes(),
    testListColumnsDecodeAsArrays(),
    testNumericNullsDecodeAsNull(),
    testWideIntsAndStructs(),
    await testNaiveTimesReadInTheChartZone(),
    testNestedTimesDecodeAsEpochMs(),
    await testCallbackResultsAreTyped(),
  ];

  const allPassed = results.every((r) => r);
  console.log();
  if (allPassed) {
    console.log("✓ All Arrow transport tests passed!");
  } else {
    console.log("✗ Some Arrow transport tests failed");
  }
  return allPassed;
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  runArrowTransportTests().then((ok) => process.exit(ok ? 0 : 1));
}

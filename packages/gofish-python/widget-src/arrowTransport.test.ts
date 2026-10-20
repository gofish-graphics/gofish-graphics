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
import { buildArrowTable, LIST_OF_VALUES } from "./arrowTransport";
import { Serialize, chart, scatter, circle, Schema } from "gofish-graphics";
import { arrowTableToRows } from "./arrowDecode";

// This file is runnable as a script in Node, but the repo doesn't necessarily
// include Node type definitions in all TS contexts.
declare const process: any;

/** Encode `items` and decode them back, as the two ends of the bridge do. */
function roundTrip(items: unknown[]): any[] {
  const bytes = Arrow.tableToIPC(buildArrowTable(items));
  return arrowTableToRows(Arrow.tableFromIPC(bytes));
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function testFlatTable(): boolean {
  console.log("Test: flat table (plain scalar columns)");
  const rows = [
    { x: 1, name: "a", ok: true },
    { x: 2, name: "b", ok: false },
  ];
  const back = roundTrip(rows);
  if (!same(back, rows)) {
    console.log(`  ✗ mismatch: ${JSON.stringify(back)}`);
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

/** JS has one number type; as JSON does, an integral column crosses as
 *  integers (Python reads ints) and any other as floats. */
function testIntegralNumbersCrossAsIntegers(): boolean {
  console.log("Test: integral number columns cross as integers");
  const table = buildArrowTable([
    { n: 1, f: 1.5 },
    { n: -3, f: 2 },
  ]);
  const ok =
    Arrow.DataType.isInt(table.schema.fields[0].type) &&
    Arrow.DataType.isFloat(table.schema.fields[1].type) &&
    same(roundTrip([{ n: 1 }, { n: -3 }]), [{ n: 1 }, { n: -3 }]);
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${table.schema}`);
  return ok;
}

/** Data flows as lists, so a callback may get or return groups or values,
 *  not records: such a list crosses as one `value` column, marked as a list
 *  of values, and decodes back to its items. */
function testListOfValuesRoundTrips(): boolean {
  console.log("Test: a list of groups or values round-trips");
  const groups = [[{ x: 1 }, { x: 2 }], [{ x: 3 }]];
  const values = ["a", "b"];
  const ok =
    same(roundTrip(groups), groups) &&
    same(roundTrip(values), values) &&
    same(roundTrip([]), []);
  console.log(
    ok
      ? "  ✓ PASSED"
      : `  ✗ FAILED ${JSON.stringify([roundTrip(groups), roundTrip(values)])}`
  );
  return ok;
}

function testSingleRowStruct(): boolean {
  console.log("Test: single-row struct column (previously-working case)");
  const rows = [{ __inputRef: 0, datum: { x: 1, label: "a" } }];
  const [{ datum }] = roundTrip(rows);
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
  const back = roundTrip(rows);
  if (!same(back, rows)) {
    console.log(`  ✗ bag mismatch: ${JSON.stringify(back)}`);
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
  const [{ datum: bag }] = roundTrip(rows);
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
  const [{ datum: bag }] = roundTrip(rows);
  if (!Array.isArray(bag) || bag.length !== 0) {
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
        ny: Schema.time({ zone: "America/New_York" }).type,
        naive: Schema.time().type,
        d: Schema.time().type,
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
  const rows = roundTrip([{ x: 1, s: "a" }]);
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
        naive: Schema.time().type,
        ny: Schema.time({ zone: "America/New_York" }).type,
        d: Schema.time().type,
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
 *  accessor's result and a derive's result (always a list) hold epoch ms, not
 *  the decode's wall-clock strings, and `derive(fn, { schema })` reads them
 *  in its zone. The bridge answers as a Python host does: a reply whose root
 *  names a table, of rows with a naive timestamp column (`t`) for the derive,
 *  and of naive timestamp values (a list of values) for the accessor. */
async function testCallbackResultsAreTyped(): Promise<boolean> {
  console.log("Test: callback results are typed before they are read");
  const feb28 = Date.UTC(2024, 1, 28, 13); // the wall clock, counted as UTC
  const naive = (rows: any[]) =>
    Arrow.vectorFromArray(
      rows.map(() => feb28),
      new Arrow.TimestampMillisecond()
    );
  const values = (rows: any[]) => {
    const table = new Arrow.Table({ value: naive(rows) });
    return new Arrow.Table(
      new Arrow.Schema(table.schema.fields, LIST_OF_VALUES),
      table.batches
    );
  };
  const bridge: Serialize.DeriveBridge = {
    async call(id, rows) {
      const table =
        id === "f"
          ? values(rows)
          : new Arrow.Table({
              t: naive(rows),
              n: Arrow.vectorFromArray(
                rows.map((_, i) => i),
                new Arrow.Int32()
              ),
            });
      return {
        root: { type: "table", id: "r" },
        tables: {
          r: arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table))),
        },
      };
    },
  };
  // A Python accessor is resolved over its rows in one batch call.
  const accessor = Serialize.unwrapOpts({ __gofish_lambda: "f" }, bridge);
  const [fromAccessor] = await accessor[Serialize.RESOLVE_ROWS]([{ x: 1 }]);
  const derived = async (schema?: Record<string, unknown>) => {
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
    )([{ x: 1 }]);
    return seen;
  };
  const utc = await derived();
  const ny = await derived({
    t: { HasCalendar: { zone: "America/New_York" } },
  });
  const ok =
    fromAccessor === feb28 &&
    Array.isArray(utc) &&
    utc[0].t === feb28 &&
    Array.isArray(ny) &&
    ny[0].t === Date.UTC(2024, 1, 28, 18);
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
    testIntegralNumbersCrossAsIntegers(),
    testListOfValuesRoundTrips(),
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

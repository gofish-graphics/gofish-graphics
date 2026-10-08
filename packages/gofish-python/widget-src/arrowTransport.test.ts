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

/** The decode (`arrowDecode.ts`): a timestamp or date column reads as
 *  `Date`s, and the rows carry `HasCalendar` in the column's zone. */
function testTimeColumnsDecodeAsTimes(): boolean {
  console.log("Test: time columns decode as Dates with HasCalendar");
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
  // The column types ride the array under schema.ts's COLUMN_TYPES symbol.
  const types = (rows as any)[Symbol.for("gofish.columnTypes")];
  const ok =
    rows[0].ny instanceof Date &&
    rows[0].ny.getTime() === ms &&
    rows[1].ny === null &&
    rows[0].naive.getTime() === ms &&
    rows[0].d instanceof Date &&
    rows[0].d.getTime() === day &&
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

/** Rows without a time column carry no column types. */
function testPlainColumnsCarryNoTypes(): boolean {
  console.log("Test: plain columns carry no column types");
  const rows = arrowTableToRows(roundTrip([{ x: 1, s: "a" }]));
  const ok =
    rows[0].x === 1 &&
    rows[0].s === "a" &&
    (rows as any)[Symbol.for("gofish.columnTypes")] === undefined;
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
 *  buffer holds (Python sends a pandas NaN as null). */
function testNumericNullsDecodeAsNull(): boolean {
  console.log("Test: numeric nulls decode as null");
  const table = new Arrow.Table({
    x: Arrow.vectorFromArray([1.5, null, 3], new Arrow.Float64()),
    n: Arrow.vectorFromArray([null, 2], new Arrow.Int32()),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const ok =
    rows[0].x === 1.5 &&
    rows[1].x === null &&
    rows[2].x === 3 &&
    rows[0].n === null &&
    rows[1].n === 2;
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify(rows)}`);
  return ok;
}

export function runArrowTransportTests(): boolean {
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
  const ok = runArrowTransportTests();
  process.exit(ok ? 0 : 1);
}

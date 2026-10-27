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
import {
  Serialize,
  chart,
  scatter,
  spread,
  circle,
  layer,
  rect,
  text,
  Unit,
} from "gofish-graphics";
import { arrowTableToRows } from "./arrowDecode";
import { decodeDocument } from "./arrowBridge";

// This file is runnable as a script in Node, but the repo doesn't necessarily
// include Node type definitions in all TS contexts.
declare const process: any;

/** Encode `items` and decode them back, as the two ends of the bridge do. */
function roundTrip(items: unknown[]): any[] {
  const bytes = Arrow.tableToIPC(buildArrowTable(items));
  return arrowTableToRows(Arrow.tableFromIPC(bytes));
}

/** A table of records, as Python writes one: one struct column, `item`,
 *  whose fields are `columns`. */
function records(columns: Record<string, Arrow.Vector>): Arrow.Table {
  const entries = Object.entries(columns);
  const type = new Arrow.Struct(
    entries.map(([name, v]) => new Arrow.Field(name, v.type, true))
  );
  const data = Arrow.makeData({
    type,
    length: entries[0][1].length,
    nullCount: 0,
    children: entries.map(([, v]) => v.data[0]),
  });
  return new Arrow.Table({ item: Arrow.makeVector(data) });
}

/** The Arrow type of the fields of a table of records `table`. */
const fieldType = (table: Arrow.Table, name: string): Arrow.DataType =>
  (table.schema.fields[0].type as Arrow.Struct).children.find(
    (f) => f.name === name
  )!.type;

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

/** A number column's Arrow type is its declared type, never a guess from
 *  its values: a column JS authored is Float64 (JS has one number type), so
 *  `{ x: 2 }` reaches Python as the float 2.0; a column that arrived as
 *  integers (a Python int64 column, decoded with `HasInteger`) goes back as
 *  Int64, and keeps it through a split leaf (`copyColumnTypes`); a time
 *  goes back as a millisecond timestamp in its zone. */
function testNumbersCrossAsDeclared(): boolean {
  console.log("Test: number columns cross by their declared type");
  const authored = buildArrowTable([{ x: 2 }, { x: 3 }]);
  const fromPython = arrowTableToRows(
    Arrow.tableFromIPC(
      Arrow.tableToIPC(
        records({
          n: Arrow.vectorFromArray([1n, 5n], new Arrow.Int64()),
          t: Arrow.vectorFromArray(
            [0, 1000],
            new Arrow.TimestampMillisecond("America/New_York")
          ),
          f: Arrow.vectorFromArray([1, 2], new Arrow.Float64()),
        })
      )
    )
  );
  const leaf = Serialize.setColumnTypes(
    [fromPython[1]],
    Serialize.getColumnTypes(fromPython)!
  );
  const back = buildArrowTable(leaf);
  const t = fieldType(back, "t");
  const ok =
    Arrow.DataType.isFloat(fieldType(authored, "x")) &&
    Arrow.DataType.isInt(fieldType(back, "n")) &&
    (fieldType(back, "n") as Arrow.Int).bitWidth === 64 &&
    Arrow.DataType.isTimestamp(t) &&
    t.timezone === "America/New_York" &&
    Arrow.DataType.isFloat(fieldType(back, "f")) &&
    same(roundTrip(leaf), [{ n: 5, t: 1000, f: 2 }]);
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${back.schema}`);
  return ok;
}

/** The rows a Python accessor is called with, in a split leaf, carry the
 *  column types of the chart's data, so the encode sends an integer column
 *  back to Python as integers (the piccl bottle's `f"{d['amount']}%"`). */
async function testAccessorRowsCarryTheirTypes(): Promise<boolean> {
  console.log("Test: a Python accessor's rows carry their column types");
  const seen: Arrow.DataType[] = [];
  const bridge: Serialize.DeriveBridge = {
    async call(_id, rows) {
      seen.push(fieldType(buildArrowTable(rows), "amount"));
      return {
        root: { type: "table", id: "r" },
        tables: { r: rows.map((r: any) => `${r.amount}%`) },
      };
    },
  };
  const label = Serialize.unwrapOpts({ __gofish_lambda: "f" }, bridge);
  const rows = arrowTableToRows(
    Arrow.tableFromIPC(
      Arrow.tableToIPC(
        records({
          category: Arrow.vectorFromArray(["a", "b"], new Arrow.Utf8()),
          amount: Arrow.vectorFromArray([30n, 60n], new Arrow.Int64()),
        })
      )
    )
  );
  await chart(rows, { axes: false })
    .flow(spread({ by: "category", dir: "x" }))
    .mark(layer([rect({ h: "amount", w: 10 }), text({ text: label })]))
    .toDisplayList({ w: 300, h: 100 });
  const ok =
    seen.length === 2 &&
    seen.every((t) => Arrow.DataType.isInt(t) && t.bitWidth === 64);
  console.log(ok ? "  ✓ PASSED" : `  ✗ FAILED ${seen.map(String)}`);
  return ok;
}

/** Every list is one column of its items, whatever they are: a struct for
 *  records, a scalar for values, a list for groups. Each decodes back to
 *  its items. */
function testEveryListIsOneColumn(): boolean {
  console.log("Test: every list is one column of its items");
  const rows = [{ x: 1 }, { x: 2 }];
  const groups = [[{ x: 1 }, { x: 2 }], [{ x: 3 }]];
  const values = ["a", "b"];
  const typeOf = (items: unknown[]) => {
    const { fields } = buildArrowTable(items).schema;
    return fields.length === 1 && fields[0].name === "item"
      ? fields[0].type
      : undefined;
  };
  const ok =
    Arrow.DataType.isStruct(typeOf(rows)) &&
    Arrow.DataType.isList(typeOf(groups)) &&
    Arrow.DataType.isUtf8(typeOf(values)) &&
    same(roundTrip(rows), rows) &&
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
  const rows = [{ i: 0, datum: { x: 1, label: "a" } }];
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
      i: 0,
      datum: [
        { x: 1, label: "a" },
        { x: 2, label: "b" },
      ],
    },
    { i: 1, datum: [{ x: 3, label: "c" }] },
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
  const rows = [{ i: 0, datum: [] }];
  const [{ datum: bag }] = roundTrip(rows);
  if (!Array.isArray(bag) || bag.length !== 0) {
    console.log(`  ✗ expected empty list, got ${JSON.stringify(bag)}`);
    return false;
  }
  console.log("  ✓ PASSED");
  return true;
}

function testRefsAreAValueOfTheirOwn(): boolean {
  console.log("Test: a ref is a gofish.ref value, never read off data");
  const { BridgeRef } = Serialize;
  const rows = [
    { source: new BridgeRef(0), k: 1 },
    { source: null, k: 2 },
  ];
  const table = Arrow.tableFromIPC(Arrow.tableToIPC(buildArrowTable(rows)));
  const source = (table.schema.fields[0].type as Arrow.Struct).children[0];
  const back = arrowTableToRows(table) as any[];
  const groups = roundTrip([[new BridgeRef(1), new BridgeRef(0)]]) as any[];
  const top = roundTrip([new BridgeRef(2)]) as any[];
  // A column named like a ref's storage, or like the old sentinel, is data.
  const data = [{ __inputRef: 3, index: 4, datum: { x: 1 } }];
  let mixedThrows = false;
  try {
    buildArrowTable([{ a: new BridgeRef(0) }, { a: { index: 1 } }]);
  } catch {
    mixedThrows = true;
  }
  const ok =
    source.metadata.get("ARROW:extension:name") === "gofish.ref" &&
    back[0].source instanceof BridgeRef &&
    back[0].source.index === 0 &&
    back[1].source === null &&
    Object.keys(back[1]).join() === "source,k" &&
    groups[0][0] instanceof BridgeRef &&
    groups[0][1].index === 0 &&
    top[0] instanceof BridgeRef &&
    top[0].index === 2 &&
    same(roundTrip(data), data) &&
    mixedThrows;
  console.log(
    ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify({ back, groups, top })}`
  );
  return ok;
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
  console.log("Test: time columns decode in Unit.time()");
  const ms = Date.UTC(2024, 2, 10, 5);
  const day = Date.UTC(2024, 2, 1);
  const table = records({
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
        ny: { HasUnit: Unit.time({ zone: "America/New_York" }).type },
        naive: { HasUnit: Unit.time().type },
        d: { HasUnit: Unit.time().type },
        n: { HasInteger: {} },
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
  const table = records({
    t: Arrow.vectorFromArray([feb28, mar1], new Arrow.TimestampMicrosecond()),
    v: Arrow.vectorFromArray([1, 2], new Arrow.Int32()),
  });
  const rows = arrowTableToRows(Arrow.tableFromIPC(Arrow.tableToIPC(table)));
  const labels = async (data: any[], zone: string) => {
    const dl = await chart(data, {
      schema: { t: Unit.time({ zone }) },
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
        records({
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
  const table = records({
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
  const table = records({
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
  const table = records({
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
  const table = records({
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
        naive: { HasUnit: Unit.time().type },
        ny: { HasUnit: Unit.time({ zone: "America/New_York" }).type },
        d: { HasUnit: Unit.time().type },
        v: { HasInteger: {} },
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
  const values = (rows: any[]) => new Arrow.Table({ item: naive(rows) });
  const bridge: Serialize.DeriveBridge = {
    async call(id, rows) {
      const table =
        id === "f"
          ? values(rows)
          : records({
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
    t: { HasUnit: Unit.time({ zone: "America/New_York" }).type },
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

/** A shipped document's JSON is read as JSON (its non-finite tags decode),
 *  and its Arrow tables as Arrow only: a row value shaped like the tag is
 *  data and stays as it is, and a float infinity in a table is a number. */
function testTagsDecodeOnlyInTheJSON(): boolean {
  console.log("Test: non-finite tags decode in the JSON, not in Arrow tables");
  const tag = { $numberDouble: "Infinity" };
  const b64 = (items: unknown[]) =>
    btoa(
      String.fromCharCode(...Arrow.tableToIPC(buildArrowTable(items), "stream"))
    );
  const doc = decodeDocument<any>({
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "rect", w: tag },
    tables: { t0: b64([{ s: tag, x: Infinity }]) },
  } as any);
  const row = doc.tables.t0[0];
  const ok = doc.root.w === Infinity && same(row.s, tag) && row.x === Infinity;
  console.log(
    ok ? "  ✓ PASSED" : `  ✗ FAILED ${JSON.stringify([doc.root, row])}`
  );
  return ok;
}

export async function runArrowTransportTests(): Promise<boolean> {
  console.log("Running Arrow transport tests...\n");

  const results = [
    testFlatTable(),
    testNumbersCrossAsDeclared(),
    await testAccessorRowsCarryTheirTypes(),
    testEveryListIsOneColumn(),
    testSingleRowStruct(),
    testMultiRowBag(),
    testRaggedKeys(),
    testEmptyBag(),
    testConflictingTypesThrow(),
    testConflictingNestedTypesThrow(),
    testRefsAreAValueOfTheirOwn(),
    testTimeColumnsDecodeAsTimes(),
    testPlainColumnsCarryNoTypes(),
    testListColumnsDecodeAsArrays(),
    testNumericNullsDecodeAsNull(),
    testWideIntsAndStructs(),
    await testNaiveTimesReadInTheChartZone(),
    testNestedTimesDecodeAsEpochMs(),
    await testCallbackResultsAreTyped(),
    testTagsDecodeOnlyInTheJSON(),
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

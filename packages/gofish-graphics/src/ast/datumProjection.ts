// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// Datum-path projection: field access that lifts over a node's row collection.
//
// A selected node's `datum` is the *bag of rows* that flowed into it (the
// operator pipeline binds it as an array; a fully-split leaf is a 1-row bag).
// Reading a field off that bag is a relational projection π_field — the
// multiset of that field's values across the rows.
//
// `projectPath` collapses on homogeneity: it resolves to the common value iff
// every row agrees on it (this covers both the 1-row case and a many-row bag
// that happens to be constant in the field, e.g. all of one lake's species
// rows share `lake`), and to `undefined` when the rows disagree — the honest
// "this field is multi-valued here, grouping by it is ill-posed" signal. This
// is exactly SQL's functional-dependency rule (`ONLY_FULL_GROUP_BY`): a column
// is selectable bare iff it is single-valued within the group.
//
// `pluck` is the un-collapsed sibling — the full set of distinct values — for
// when you genuinely want "every possible value" rather than a scalar key.
import toPath from "lodash/toPath";
import sumBy from "lodash/sumBy";
import { GoFishRef } from "./_ref";
import { fieldNameOf, isField, type FieldAccessor } from "./data";
import {
  getFieldOps,
  normalizeNotSupportedError,
  type FieldOp,
} from "./fieldExpr";
import {
  binCells,
  checkPartition,
  Cell,
  DEFAULT_PARTITION,
  type RegionCell,
  type Cells,
} from "./cells";
import { columnType, domainRows, orderByLevels } from "./schema";
import { planeCells, type PolygonCells } from "./polygonCells";
import { isStruct, structBin, type StructExprWire } from "./structExpr";
import type { Cycle } from "../timeWindow";

/** Canonical key for value-equality of (possibly object-valued) field values. */
function eqKey(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

/** Distinct values produced by walking `segments` from `obj`, projecting over
 *  any array encountered (mapping the remaining walk across its elements), and
 *  reading each value the walk reaches with `read` when one is given.
 *  Returns the de-duplicated values in first-seen order. */
function projectValues(
  obj: unknown,
  segments: string[],
  read?: (row: any) => unknown
): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  walkRows(obj, segments, (current) => {
    const v = read === undefined ? current : read(current);
    const k = eqKey(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  });
  return out;
}

/** The rows a key function reads when it is projected over `obj` (see
 *  {@link projectBy}): every row the walk reaches through refs and bags,
 *  nested ones included. */
export function rowsReached(obj: unknown): unknown[] {
  const rows: unknown[] = [];
  walkRows(obj, [], (row) => rows.push(row));
  return rows;
}

/** Walk `segments` from `obj`, projecting over any array encountered and
 *  through any ref's `.datum`, and `visit` each value the walk reaches. */
function walkRows(
  obj: unknown,
  segments: string[],
  visit: (value: unknown) => void
): void {
  const walk = (current: unknown, i: number): void => {
    if (current == null) return; // a missing hop contributes no value
    if (current instanceof GoFishRef) {
      // A ref stands in for the bag of rows it points at: descend into its
      // `.datum` at the SAME segment, so `by: "lake"` projects through a
      // `selectAll(...)` ref exactly as a bare row would — no `datum.` prefix.
      walk(current.datum, i);
      return;
    }
    if (Array.isArray(current)) {
      // Project the rest of the walk over every element of the bag.
      for (const el of current) walk(el, i);
      return;
    }
    if (i === segments.length) {
      visit(current);
      return;
    }
    walk((current as Record<string, unknown>)[segments[i]], i + 1);
  };

  walk(obj, 0);
}

/** Resolve `path` against `obj` with projection + homogeneity collapse.
 *  Scalar iff the projection is single-valued, else `undefined`. Used by the
 *  `by` option of group/spread/scatter so `by: "lake"` works whenever the rows
 *  agree on `lake`, and falls through to `undefined` when they don't. A
 *  `selectAll(...)` ref descends into its `.datum` bag automatically, so the
 *  same bare field path works on refs (no `datum.` prefix). */
export function projectPath(obj: unknown, path: string): unknown {
  const segments = toPath(path);
  const values = projectValues(obj, segments);
  return values.length === 1 ? values[0] : undefined;
}

/** The key a `by`-style selector gives `obj` (a row, a bag of rows, or a ref
 *  standing in for one), with projection and homogeneity collapse as
 *  `projectPath` does for a field path. A key function is applied to each ROW
 *  the walk reaches, never to the ref or the bag, so it reads the same data
 *  it grouped the rows by. */
export function projectBy(obj: unknown, by: SplitBy): unknown {
  const values = projectByValues(obj, by);
  return values.length === 1 ? values[0] : undefined;
}

/** The distinct values `by` reads off `obj`, before {@link projectBy}'s
 *  collapse: none when no row has the field (or there are no rows), one when
 *  they agree, several when they don't. */
export function projectByValues(obj: unknown, by: SplitBy): unknown[] {
  return typeof by === "function"
    ? projectValues(obj, [], by)
    : projectValues(obj, toPath(fieldNameOf(by)!));
}

/** The `by` selector accepted by the split operators (group/spread/scatter):
 *  a field-path string, a key function over the row, or a `field(...)`
 *  accessor (possibly carrying a pipeline of domain ops — see
 *  {@link splitEntries}). */
export type SplitBy =
  | string
  | ((r: any) => unknown)
  | FieldAccessor
  | StructExprWire;

/** The key of one group of a split: a value of the `by` field (text or a
 *  number), or a cell ({@link RegionCell}): a {@link Cell} for a binned key
 *  (`field(x).bin(p)`), a `PolygonCell` for a binned struct
 *  (`struct({ x, y }).bin(b)`). A cell stands for its id (`String(cell)`). */
export type SplitKey = string | number | RegionCell;

/**
 * The mutable cell `ChartBuilder` writes the computed default split/travel
 * direction into (issue #752's default-grouping rule — see
 * `notes/design/relational-mark-default-split.md`). `resolved` marks that a
 * default computation already ran for this connector, so the `.mark()`
 * fusion rewrite's internal `.layer(...)` call (which re-enters
 * `ChartBuilder.layer()`) doesn't recompute and overwrite it.
 *
 * Canonical home for both `chart.ts` (which tags every relational mark with
 * an `inferred` cell of this shape) and `chartBuilder.ts` (which computes
 * into it) — a type-only import creates no runtime cycle even though
 * `chart.ts` also imports `ChartBuilder` from `chartBuilder.ts` at runtime.
 */
export type InferredRelational = {
  by?: SplitBy;
  dir?: "x" | "y";
  /** The path tier's own `by`: the connection variable the connector
   *  threads its operands along, whether `along` named the tier or it was
   *  inferred. A smooth `line` or `ribbon` uses each operand's value of it as
   *  the knots of its curve (see `runKnots` in `connect.tsx`). */
  along?: SplitBy;
  /** The axis the path tier places its groups on by its own `by` field, when
   *  it does: the x of `scatter({ by: "year", x: "year" })`. That axis draws
   *  the connection variable itself, so a `step` curve lets it advance while
   *  every other coordinate holds (`stepPath` in `spline.ts`). */
  parameterAxis?: "x" | "y";
  resolved?: boolean;
  /** The flow's temporal tier, for a TEMPORAL relational mark
   *  (`time.transition()`). A spatial connector threads a tier of the flow
   *  that lays marks out in space; a temporal one threads the tier that lays
   *  them out in time, so the same cell carries the clock the mark reads and
   *  the field its keyframes are keyed by. Undefined for every spatial
   *  connector. */
  time?: TimeTier;
};

/** The temporal tier a `time.sequence(...)` contributes to a flow: the field
 *  whose values are the keyframes, plus the clock the sequence owns. The clock
 *  is read at PAINT time by everything that reads it — the sequence's own hold
 *  and a `time.transition()`'s playhead alike — so a value it emits patches
 *  attributes rather than re-resolving the chart. Whoever reads it during
 *  resolve does so through `readLive`, to build and register it without making
 *  it a pipeline dependency. */
export type TimeTier = {
  by: string;
  clock: () => number;
  /** The sequence's keyframes, in time order: every value of `by` the flow
   *  split on. A transition reads it to tell a gap in one mark's run (two of
   *  its knots that are NOT neighbors here) from a step between neighbors. */
  knots: () => number[];
  /** The cycle of the time axis when the sequence is cyclic: every reader of
   *  time reads it around the seam (see `src/timeWindow.ts`). */
  cycle: () => Cycle | undefined;
  /** Wall-clock milliseconds per unit of `by` on the clock (ms per year, say),
   *  so a timing written in ms (a stagger's `lag`) can be read against a
   *  stretch between two keyframes. */
  msPerUnit: () => number;
};

/** The data a row, a bag of rows, or a ref reads: a ref's datum, else the
 *  value itself. A split leaf's data carries its chart's domain
 *  (`domainRows`), which a binned key's cells are over. */
export const dataOf = (obj: unknown): unknown =>
  obj instanceof GoFishRef ? dataOf(obj.datum) : obj;

/** Build the grouping key-function for a single split. Exists so that path
 *  parsing happens once per split (closing over the parsed `segments`) rather
 *  than once per row, and so the `typeof by === "function"` dispatch is resolved
 *  once rather than re-checked for every row.
 *
 *  A `field(...)` accessor grouping-keys off its `.name`, identical to
 *  passing the bare field-name string — its reordering ops (if any) are
 *  applied separately, over the grouped Map, by {@link splitEntries}. A
 *  binned key (`field(x).bin(p)`, `struct({ x, y }).bin(b)`) keys each row by
 *  its CELL among the cells over `data`'s domain ({@link binKey}), the same
 *  cell objects every split over that domain is keyed by.
 *
 *  Projected keys are runtime strings/numbers/cells (or `undefined` for
 *  ill-posed groups, where the bag disagrees on the key, and for a row with
 *  no value); the assertion bridges the honest `unknown` produced by
 *  projection + homogeneity collapse. */
export function splitKeyFn(
  by: SplitBy,
  data: unknown
): (r: any) => SplitKey | undefined {
  if (typeof by === "function") return by as (r: any) => SplitKey;
  const binned = binKey(by, data);
  if (binned !== undefined) return binned.key;
  const segments = toPath(fieldNameOf(by)!);
  return (r: any) => {
    const values = projectValues(r, segments);
    return (values.length === 1 ? values[0] : undefined) as string | number;
  };
}

/** Numeric-aware, lodash-`orderBy`-compatible-enough key comparator: compares
 *  as numbers when both keys coerce to finite numbers, else falls back to
 *  string comparison. Used by `field(...).sort()`'s no-arg (sort-by-key) form.
 *  A cell compares by its start: its id is its start, as text. */
function compareKeys(a: unknown, b: unknown): number {
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

/**
 * A memo of what is built once per domain (`domainRows`), per op object (the
 * value a `bin` op holds, the same object each time the op runs), and per
 * column key: so every group of a split over one domain gets the same cell
 * objects, in the same order.
 */
function memoByDomain<V>(): (
  domain: object,
  op: object,
  key: string,
  build: () => V
) => V {
  const byDomain = new WeakMap<object, WeakMap<object, Map<string, V>>>();
  return (domain, op, key, build) => {
    let byOp = byDomain.get(domain);
    if (byOp === undefined) byDomain.set(domain, (byOp = new WeakMap()));
    let byKey = byOp.get(op);
    if (byKey === undefined) byOp.set(op, (byKey = new Map()));
    let v = byKey.get(key);
    if (v === undefined) byKey.set(key, (v = build()));
    return v;
  };
}

const cellsMemo = memoByDomain<Cells>();

/** The cells `field(name).bin(partition)` maps values to: the cells of the
 *  partition over the column's values in `d`'s DOMAIN (`domainRows`,
 *  schema.ts), the chart's data, not over `d` alone. */
function domainCells(
  name: string,
  d: Record<string, any>[],
  partitionOp: unknown
): Cells {
  const where = `field("${name}").bin(...)`;
  const raw = (partitionOp ?? DEFAULT_PARTITION) as object;
  const domain = domainRows(d) as Record<string, any>[];
  return cellsMemo(domain, raw, name, () =>
    binCells(
      checkPartition(raw, where),
      domain.map((r) => r?.[name]),
      columnType(d, name)?.HasCalendar?.zone,
      where
    )
  );
}

const planeMemo = memoByDomain<PolygonCells>();

/** The cells of `struct({ x, y }).bin(bin)` over the two columns' values in
 *  `d`'s DOMAIN (`domainRows`), as {@link domainCells} does in 1D. */
function domainPlane(
  fields: { x: string; y: string },
  d: unknown,
  bin: object,
  where: string
): PolygonCells {
  const domain = domainRows(d) as Record<string, any>[];
  return planeMemo(domain, bin, JSON.stringify([fields.x, fields.y]), () =>
    planeCells(
      bin as Parameters<typeof planeCells>[0],
      fields,
      domain.map((r) => r?.[fields.x]),
      domain.map((r) => r?.[fields.y]),
      where
    )
  );
}

/** The loud error for a value a binned key has no cell for. */
const outsideDomain = (where: string, what: string, v: string): Error =>
  new Error(
    `${where}: the ${what} ${v} is outside the ${what === "point" ? "columns'" : "column's"} ` +
      `values in the chart's data, so it has no cell. A derive that makes ` +
      `new values makes a new domain: bin after it.`
  );

/**
 * A binned key's cells over `data`'s domain, in order, and the key it gives
 * a row, a bag of rows, or a ref: the cell its rows fall in, collapsed over
 * the rows as any key is (undefined when they fall in different cells, or
 * have no value). Undefined when `by` is not binned.
 *
 *  - `field(x).bin(p)`: the cells of `p` over the column's domain
 *    ({@link domainCells}), each a {@link Cell}.
 *  - `struct({ x, y }).bin(b)`: the cells of `b` over the two columns'
 *    domain ({@link domainPlane}), each a `PolygonCell`. A struct with
 *    no bin has no cells yet: it is an error.
 *
 * A value outside the domain has no cell, which is an error.
 */
function binKey(
  by: SplitBy,
  data: unknown
):
  | {
      cells: readonly RegionCell[];
      key: (r: unknown) => RegionCell | undefined;
    }
  | undefined {
  // The one cell `cellsOf` gives `r`'s rows, if they agree.
  const collapse =
    (cellsOf: (r: unknown, add: (c: RegionCell) => void) => void) =>
    (r: unknown): RegionCell | undefined => {
      const seen = new Set<RegionCell>();
      cellsOf(r, (c) => seen.add(c));
      return seen.size === 1 ? [...seen][0] : undefined;
    };
  if (isStruct(by)) {
    const { x, y } = by.fields;
    const where = `struct({ x: "${x}", y: "${y}" }).bin(...)`;
    const bin = structBin(by);
    if (bin === undefined)
      throw new Error(
        `struct({ x: "${x}", y: "${y}" }) as a key needs .bin(...): bin it ` +
          `with a call in the Bin family, e.g. .bin(Bin.hex({ radius: 1 })), ` +
          `so each group is a cell.`
      );
    const plane = domainPlane(by.fields, data, bin, where);
    return {
      cells: plane.cells,
      key: collapse((r, add) =>
        walkRows(r, [], (row) => {
          const vx = (row as Record<string, unknown>)?.[x];
          const vy = (row as Record<string, unknown>)?.[y];
          if (vx == null || vy == null) return;
          const cell =
            typeof vx === "number" && typeof vy === "number"
              ? plane.cellOf(vx, vy)
              : undefined;
          if (cell === undefined)
            throw outsideDomain(
              where,
              "point",
              `(${JSON.stringify(vx)}, ${JSON.stringify(vy)})`
            );
          add(cell);
        })
      ),
    };
  }
  const op = getFieldOps(by).find((o) => o.op === "bin");
  if (op === undefined) return undefined;
  if (!isField(by))
    throw new Error(
      "field(...).bin() requires a field(name) accessor as `by`, not a function."
    );
  const name = by.name;
  const { cells, cellOf } = domainCells(
    name,
    data as Record<string, any>[],
    op.partition
  );
  return {
    cells,
    key: collapse((r, add) =>
      walkRows(r, [name], (v) => {
        const cell = typeof v === "number" ? cellOf(v) : undefined;
        if (cell === undefined)
          throw outsideDomain(
            `field("${name}").bin(...)`,
            "value",
            JSON.stringify(v)
          );
        add(cell);
      })
    ),
  };
}

/** Group `rows` by a binned key ({@link binKey}) over `d`'s domain: keyed by
 *  cell, in order, one entry per cell of the domain, so a cell none of
 *  `rows` falls in is kept, with no rows. Rows with a missing value are
 *  dropped. */
function binEntries<T extends Record<string, any>>(
  binned: NonNullable<ReturnType<typeof binKey>>,
  rows: T[]
): Map<RegionCell, T[]> {
  const entries = new Map<RegionCell, T[]>(binned.cells.map((c) => [c, []]));
  for (const row of rows) {
    const cell = binned.key(row);
    if (cell !== undefined) entries.get(cell)!.push(row);
  }
  return entries;
}

/** Reorder `entries`: with `values` (#735), by that explicit group-key
 *  order — groups not listed are appended after, in natural sort order; with
 *  `by`, by the SUM of that field over each entry's rows; with neither, by
 *  the entry's own group key (numeric-aware). */
function sortEntries<T>(
  entries: Map<SplitKey, T[]>,
  op: Extract<FieldOp, { op: "sort" }>
): Map<SplitKey, T[]> {
  const pairs = [...entries.entries()];
  if (op.values !== undefined) {
    const rank = new Map<unknown, number>(op.values.map((v, i) => [v, i]));
    // A cell is listed by its start (or its id).
    const rankOf = (k: SplitKey) =>
      k instanceof Cell ? (rank.get(k.start) ?? rank.get(k.id)) : rank.get(k);
    pairs.sort(([ka], [kb]) => {
      const ra = rankOf(ka);
      const rb = rankOf(kb);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return compareKeys(ka, kb);
    });
    return new Map(pairs);
  }
  const dir = op.order === "desc" ? -1 : 1;
  if (op.by !== undefined) {
    const by = op.by;
    pairs.sort(([, a], [, b]) => dir * (sumBy(a, by) - sumBy(b, by)));
  } else {
    pairs.sort(([ka], [kb]) => dir * compareKeys(ka, kb));
  }
  return new Map(pairs);
}

/** `entries` reordered by one `sort` or `reverse` op. */
function reorderEntries<T>(
  entries: Map<SplitKey, T[]>,
  op: Extract<FieldOp, { op: "sort" | "reverse" }>
): Map<SplitKey, T[]> {
  return op.op === "sort"
    ? sortEntries(entries, op)
    : new Map([...entries.entries()].reverse());
}

/** `entries` reordered by the `sort` and `reverse` ops a `field(...)`
 *  accessor carries, in order: the reordering {@link splitEntries} applies
 *  to its groups. A stack over a `HasMidpoint` column runs it over every level
 *  of the order (spread.tsx), so it knows the order the split lays the
 *  levels out in even when a row has only some of them. */
export function orderEntries<T>(
  by: SplitBy,
  entries: Map<SplitKey, T[]>
): Map<SplitKey, T[]> {
  for (const op of getFieldOps(by)) {
    if (op.op === "sort" || op.op === "reverse")
      entries = reorderEntries(entries, op);
  }
  return entries;
}

/**
 * Group `d` by `by` (via {@link splitKeyFn}): in the order of the column's
 * levels when the data declares the column ordered (`HasOrder`, see
 * schema.ts), else in order of first appearance. A binned key (`bin`, or a
 * binned struct) is grouped by its cells instead, over the column's domain,
 * keyed by cell, one entry per cell, in order, empty cells included (see
 * `binEntries`). Then apply any pipeline ops carried by a `field(...)`
 * accessor (read via `getFieldOps`) IN ORDER:
 *   - `dropNulls` filters out rows whose value at `by`'s field is
 *     `null`/`undefined`, BEFORE grouping, so it is equivalent regardless of
 *     where `dropNulls` sits in the chain.
 *   - `sort` / `reverse` reorder the entries Map.
 *   - a value-slot op (`sum`/`mean`/`count`/`distinct`) in a `by` slot, or
 *     `normalize`, throws — those aren't domain ops.
 * Central helper so spread/group/scatter share one split+ops pipeline —
 * `by`-string/function callers get plain `Map.groupBy` behavior unchanged
 * (they carry no ops).
 */
export function splitEntries<T extends Record<string, any>>(
  by: SplitBy,
  d: T[]
): Map<SplitKey, T[]> {
  const ops = getFieldOps(by);
  let rows = d;
  if (ops.some((op) => op.op === "dropNulls")) {
    if (!isField(by)) {
      throw new Error(
        "field(...).dropNulls() requires a field(name) accessor as `by`, not a function."
      );
    }
    const name = by.name;
    rows = d.filter((row) => {
      const v = (row as Record<string, unknown>)[name];
      return v !== null && v !== undefined;
    });
  }
  // A binned key's groups are its cells, in order, empty ones included
  // (`binEntries`). Any other key's are its values, in order of first
  // appearance, or in the order of the column's levels when the chart's
  // `schema` declares it ordered (HasOrder). The ops below reorder from
  // there.
  const binned = binKey(by, d);
  let entries: Map<SplitKey, T[]>;
  if (binned !== undefined) entries = binEntries(binned, rows);
  else {
    entries = Map.groupBy(rows, splitKeyFn(by, d) as (r: T) => SplitKey);
    const column = fieldNameOf(by);
    const type = columnType(d, column);
    if (type?.HasOrder) {
      const keys = orderByLevels(column!, type.HasOrder, [...entries.keys()]);
      entries = new Map(keys.map((k) => [k, entries.get(k)!]));
    }
  }
  for (const op of ops) {
    switch (op.op) {
      case "dropNulls":
        break; // filtered above, before grouping
      case "bin":
        break; // grouped by its cells above
      case "sort":
      case "reverse":
        entries = reorderEntries(entries, op);
        break;
      case "sum":
      case "mean":
      case "count":
      case "distinct":
        throw new Error(
          `field(...).${op.op}() is an aggregate op — valid on a value channel ` +
            `(e.g. rect({ h: field(...).${op.op}() })), not on \`by\`.`
        );
      case "normalize":
        throw normalizeNotSupportedError();
    }
  }
  return entries;
}

/** Which axes a scatter-family opts object positions: `x`/`y` true when a
 *  plain point value or a full range (`Min`+`Max`) is given for that axis.
 *  Shared by `Scatter`'s `isPlaced` (over the axes merged with `dims`) and
 *  the `arrangement` declaration the scatter operator hands `createOperator`
 *  (both in `graphicalOperators/scatter.tsx`) so the two don't drift. */
export function scatterPositions(opts: {
  x?: unknown;
  xMin?: unknown;
  xMax?: unknown;
  y?: unknown;
  yMin?: unknown;
  yMax?: unknown;
}): { x: boolean; y: boolean } {
  return {
    x:
      opts.x !== undefined ||
      (opts.xMin !== undefined && opts.xMax !== undefined),
    y:
      opts.y !== undefined ||
      (opts.yMin !== undefined && opts.yMax !== undefined),
  };
}

/** The full set of distinct values at `path` ("every possible value"), with no
 *  collapse. `source` may be a ref (anything exposing `.datum`), a row array,
 *  or a single row. Use when you want the multiset, not a scalar key. */
export function pluck(source: any, path: string): unknown[] {
  const root =
    source != null && typeof source === "object" && "datum" in source
      ? (source as { datum: unknown }).datum
      : source;
  return projectValues(root, toPath(path));
}

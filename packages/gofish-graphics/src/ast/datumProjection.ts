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
import { Frontend } from "gofish-ir";
import sumBy from "lodash/sumBy";
import { GoFishRef } from "./_ref";
import {
  chunk,
  fieldNameOf,
  isChunk,
  isField,
  type ChunkKey,
  type FieldAccessor,
} from "./data";
import {
  getFieldOps,
  binStepsOf,
  normalizeNotSupportedError,
  type FieldOp,
} from "./fieldExpr";
import { chainCells, Cell, CycleCell, KeyCell, type Cells } from "./cells";
import {
  columnType,
  copyColumnTypes,
  getColumnTypes,
  orderByLevels,
  type HasDomain,
} from "./schema";
import { describe } from "./calendar";
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
 *  nested ones included, carrying the column types of the bags it reached
 *  them through. */
export function rowsReached(obj: unknown): unknown[] {
  const rows: unknown[] = [];
  walkRows(
    obj,
    [],
    (row) => rows.push(row),
    (bag) => copyColumnTypes(rows, bag)
  );
  return rows;
}

/** Walk `segments` from `obj`, projecting over any array encountered and
 *  through any ref's `.datum`, and `visit` each value the walk reaches
 *  (and `bag` each array it projects over).
 *
 *  A declared domain case, not a row-vs-list sniff: projection is DEFINED
 *  over nested bags (a bag of refs whose datums are bags of rows, a field
 *  whose value is itself a list), so the walk maps over a list wherever one
 *  sits on the path, at any depth. Every datum it starts from is a list. */
function walkRows(
  obj: unknown,
  segments: string[],
  visit: (value: unknown) => void,
  bag?: (list: unknown[]) => void
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
      bag?.(current);
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
  if (isChunk(by)) {
    throw new Error(
      "chunk(size) keys a group by row position, which a single node's rows " +
        "do not carry; it cannot be read back off a node. Group by a field."
    );
  }
  // A key function reads one row here: a node's rows carry no position.
  return typeof by === "function"
    ? projectValues(obj, [], by as (r: unknown) => unknown)
    : projectValues(obj, toPath(fieldNameOf(by)!));
}

/** The `by` selector accepted by the split operators (group/spread/scatter):
 *  a field-path string, a key function over the row (and its position), a
 *  `field(...)` accessor (possibly carrying a pipeline of domain ops — see
 *  {@link splitEntries}), a `struct({ x, y })` key, or a `chunk(size)` bin
 *  over row position. */
export type SplitBy =
  | string
  | ((r: any, i: number) => unknown)
  | FieldAccessor
  | StructExprWire
  | ChunkKey;

/** The key of one group of a split: a value of the `by` field (text or a
 *  number), or a cell ({@link KeyCell}): a {@link Cell} or a
 *  {@link CycleCell} for a binned key (`field(x).bin(p)`), a `PolygonCell`
 *  for a binned struct (`struct({ x, y }).bin(b)`). A cell stands for its id
 *  (`String(cell)`). */
export type SplitKey = string | number | KeyCell;

/** The groups of a split, in order, keyed by their key, and whether the
 *  keys have an order (`HasOrder`): the column the key names is declared
 *  ordered, or the key is binned (cells are ordered by nature). An operator
 *  that folds the groups into an ordinal space reads the order here. */
export type SplitGroups<T> = Map<SplitKey, T[]> & { readonly hasOrder?: true };

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
  /** The default split of the connector's bag: the `by` of every flow tier
   *  but the path tier's, outermost first, one connector per group
   *  ({@link splitByTiers}). */
  split?: SplitBy[];
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
 *  projection + homogeneity collapse. A key function and a `chunk(size)`
 *  also read the row's position `i`. */
export function splitKeyFn(
  by: SplitBy,
  data: unknown
): (r: any, i: number) => SplitKey | undefined {
  if (typeof by === "function") return by as (r: any, i: number) => SplitKey;
  if (isChunk(by)) {
    const size = by.size;
    return (_r, i) => Math.floor(i / size);
  }
  const binned = binKey(by, data);
  if (binned !== undefined) return binned.key;
  const segments = toPath(fieldNameOf(by)!);
  return (r: any) => {
    const values = projectValues(r, segments);
    return (values.length === 1 ? values[0] : undefined) as string | number;
  };
}

/**
 * Group a connector's bag of refs, in flow order, the way the flow's tiers
 * grouped them: one group per combination of the keys `tiers` (the flow's
 * `by`s but the path tier's, outermost first) gave the ref's mark. A ref's
 * key under a tier is the key that tier's split gave the group the ref's
 * mark is in: the `key` of the mark's ancestor that the split made, which
 * `createOperator` stamps with the split's `by` (`GoFishNode.keyBy`). So it
 * is the split's own key in every form: a field's value, a key function's, a
 * `chunk(n)`'s position within its parent group, or a binned key's cell over
 * the split's domain. Nothing is recomputed from the mark's rows, which do
 * not carry that position or domain.
 */
export function splitByTiers(
  tiers: readonly SplitBy[],
  refs: GoFishRef[]
): Map<string, GoFishRef[]> {
  const keyUnder = (r: GoFishRef, by: SplitBy): string | undefined => {
    for (let n = r.targetNode; n !== undefined; n = n.parent)
      if (n.keyBy === by) return n.key;
    return undefined;
  };
  // Unit-separator join: a bare `join("")` would collide composite keys like
  // ("ab","c") and ("a","bc").
  return Map.groupBy(refs, (r) =>
    tiers.map((by) => String(keyUnder(r, by))).join("\u001f")
  );
}

/** Numeric-aware, lodash-`orderBy`-compatible-enough key comparator: compares
 *  as numbers when both keys coerce to finite numbers, else falls back to
 *  string comparison. Used by `field(...).sort()`'s no-arg (sort-by-key) form.
 *  A cell of the line compares by its start (its id is its start, as text),
 *  and a part of a cycle by its place in the cycle. */
function compareKeys(a: unknown, b: unknown): number {
  if (a instanceof CycleCell && b instanceof CycleCell)
    return a.index - b.index;
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

/**
 * A memo of what is built once per domain (each a `HasDomain`, the record a
 * column's type carries: the same object in every split leaf and `filter`
 * result of the typed data), per op object (the value a `bin` op holds, the
 * same object each time the op runs), and per column key: so every group of
 * a split over one domain gets the same cell objects, in the same order.
 */
function memoByDomains<V>(): (
  domains: readonly object[],
  op: object,
  key: string,
  build: () => V
) => V {
  type Level = WeakMap<object, Level | Map<string, V>>;
  const root: Level = new WeakMap();
  return (domains, op, key, build) => {
    let level = root;
    for (const o of domains) {
      let next = level.get(o) as Level | undefined;
      if (next === undefined) level.set(o, (next = new WeakMap()));
      level = next;
    }
    let byKey = level.get(op) as Map<string, V> | undefined;
    if (byKey === undefined) level.set(op, (byKey = new Map()));
    let v = byKey.get(key);
    if (v === undefined) byKey.set(key, (v = build()));
    return v;
  };
}

const cellsMemo = memoByDomains<Cells>();

/** The domain of the column `name` in `d`: the one its column type carries
 *  (`HasDomain`, schema.ts), computed once when the data was typed, never
 *  from the rows of `d`. Undefined when the column has no values. A column
 *  whose values are not all finite numbers has no domain: binning it is an
 *  error that names the column, and the value when `d` holds one. */
function domainOf(
  d: unknown,
  name: string,
  where: string
): HasDomain | undefined {
  const domain = columnType(d, name)?.HasDomain;
  if (domain !== undefined) return domain;
  let stray: unknown;
  let any = false;
  walkRows(d, [name], (v) => {
    if (v == null) return;
    any = true;
    if (stray === undefined && (typeof v !== "number" || !Number.isFinite(v)))
      stray = v;
  });
  if (!any) return undefined;
  if (stray !== undefined)
    throw new Error(
      `${where}: the column "${name}" must hold finite numbers, but it has ` +
        `the value ${describe(stray)}.`
    );
  throw new Error(
    getColumnTypes(d) === undefined
      ? `${where}: the rows carry no column types, so the column "${name}" ` +
        `has no domain to bin over. The data a chart or a derive types ` +
        `carries them; an operator that makes new arrays of its rows must ` +
        `copy them (copyColumnTypes).`
      : `${where}: the column "${name}" must hold finite numbers, but in ` +
        `the data it was typed with it holds other values, so it has no ` +
        `domain.`
  );
}

/** The cells `field(name).bin(a).bin(b)...` maps values to: the cells of the
 *  chain of bins (one per `bin` op, in order) over the column's domain, the
 *  one its type carries ({@link domainOf}), so every group of a split over
 *  the column has the same cells, whatever rows it holds. Memoized on the
 *  domain and the last `bin` op: an op is made by appending it to an
 *  expression, so the ops before it are always the same. */
function domainCells(
  name: string,
  d: Record<string, any>[],
  binOps: readonly Extract<FieldOp, { op: "bin" }>[]
): Cells {
  const where = `field("${name}").bin(...)`;
  const domain = domainOf(d, name, where);
  const build = () =>
    chainCells(
      binStepsOf(binOps, where),
      domain,
      columnType(d, name)?.HasUnit?.zone,
      where
    );
  return domain === undefined
    ? build()
    : cellsMemo([domain], binOps[binOps.length - 1], name, build);
}

const planeMemo = memoByDomains<PolygonCells>();

/** The cells of `struct({ x, y }).bin(bin)` over the two columns' domains
 *  ({@link domainOf}), as {@link domainCells} does in 1D. */
function domainPlane(
  fields: { x: string; y: string },
  d: unknown,
  bin: object,
  where: string
): PolygonCells {
  const x = domainOf(d, fields.x, where);
  const y = domainOf(d, fields.y, where);
  const build = () =>
    planeCells(bin as Parameters<typeof planeCells>[0], fields, x, y, where);
  return x === undefined || y === undefined
    ? build()
    : planeMemo([x, y], bin, JSON.stringify([fields.x, fields.y]), build);
}

/** The loud error for a value a binned key has no cell for. */
const outsideDomain = (where: string, what: string, v: string): Error =>
  new Error(
    `${where}: the ${what} ${v} is outside the ${what === "point" ? "columns' domains" : "column's domain"} ` +
      `(its values in the data it was typed with), so it has no cell. A ` +
      `derive that makes new values makes a new domain: bin after it.`
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
      cells: readonly KeyCell[];
      key: (r: unknown) => KeyCell | undefined;
    }
  | undefined {
  // The one cell `cellsOf` gives `r`'s rows, if they agree.
  const collapse =
    (cellsOf: (r: unknown, add: (c: KeyCell) => void) => void) =>
    (r: unknown): KeyCell | undefined => {
      let first: KeyCell | undefined;
      let mixed = false;
      cellsOf(r, (c) => {
        if (first === undefined) first = c;
        else if (c !== first) mixed = true;
      });
      return mixed ? undefined : first;
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
    // A struct from the wire (Python) did not pass `.bin`'s check.
    Frontend.checkStructBin(bin, where);
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
  const binOps = getFieldOps(by).filter(
    (o): o is Extract<FieldOp, { op: "bin" }> => o.op === "bin"
  );
  if (binOps.length === 0) return undefined;
  if (!isField(by))
    throw new Error(
      "field(...).bin() requires a field(name) accessor as `by`, not a function."
    );
  const name = by.name;
  const { cells, cellOf } = domainCells(
    name,
    data as Record<string, any>[],
    binOps
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
): Map<KeyCell, T[]> {
  const entries = new Map<KeyCell, T[]>(binned.cells.map((c) => [c, []]));
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
      k instanceof Cell
        ? (rank.get(k.start) ?? rank.get(k.id))
        : k instanceof KeyCell
          ? rank.get(k.id)
          : rank.get(k);
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
  by: SplitBy | undefined,
  entries: Map<SplitKey, T[]>
): Map<SplitKey, T[]> {
  for (const op of getFieldOps(by)) {
    if (op.op === "sort" || op.op === "reverse")
      entries = reorderEntries(entries, op);
  }
  return entries;
}

/** The key an operator splits by: its `by`, or with no `by` a split by row
 *  identity, `chunk(1)`: one group `[row]` per row, keyed by position. This
 *  is the one place that default lives. */
export const splitByOf = (by: SplitBy | undefined): SplitBy => by ?? chunk(1);

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
 * No `by` is a split by row identity ({@link splitByOf}).
 * Central helper so spread/group/scatter share one split+ops pipeline —
 * `by`-string/function callers get plain `Map.groupBy` behavior unchanged
 * (they carry no ops). The groups say whether their keys have an order
 * ({@link SplitGroups}).
 */
export function splitEntries<T extends Record<string, any>>(
  byOpt: SplitBy | undefined,
  d: T[]
): SplitGroups<T> {
  const by = splitByOf(byOpt);
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
  const column = fieldNameOf(by);
  const ordered =
    binned !== undefined || columnType(d, column)?.HasOrder !== undefined;
  let entries: Map<SplitKey, T[]>;
  if (binned !== undefined) entries = binEntries(binned, rows);
  else {
    entries = Map.groupBy(rows, splitKeyFn(by, d) as (r: T) => SplitKey);
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
  return ordered
    ? Object.assign(entries, { hasOrder: true as const })
    : entries;
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

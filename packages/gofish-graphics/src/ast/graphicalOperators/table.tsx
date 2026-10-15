import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { createGridConstraint } from "../constraints/grid";
import { ensureChildNames } from "../constraints/shared";
import { splitEntries, type SplitBy } from "../datumProjection";
import { fieldNameOf } from "../data";
import type { OrdinalKey } from "../underlyingSpace";

/**
 * `Table` arranges cells in a `numCols`-wide grid. It elaborates to a flat
 * `layer` of the cells plus a single symmetric `grid` constraint — the grid owns
 * both partitions (columns on x, rows on y), sizes each cell to its flex track,
 * and centers it. See `constraints/grid.ts`.
 */
const Table = createNodeOperator(
  async (
    {
      key,
      numCols: numColsOpt,
      spacing = 0,
      colKeys,
      rowKeys,
      colHasOrder,
      rowHasOrder,
      axisMeasures,
    }: {
      key?: string;
      numCols?: number;
      spacing?: number | [number, number];
      /** The column and row keys the split found, in order (cells for a
       *  binned key), and whether each key's column has an order. */
      colKeys?: OrdinalKey[];
      rowKeys?: OrdinalKey[];
      colHasOrder?: boolean;
      rowHasOrder?: boolean;
      /** Resolved grouping fields per axis, injected by createOperator (table's
       *  `by.x`/`by.y`) → the col/row ORDINAL measures. */
      axisMeasures?: { x?: string; y?: string };
    },
    children: GoFishAST[]
  ) => {
    // Prefer explicit numCols; fall back to colKeys.length; finally a single row.
    const numCols = numColsOpt ?? colKeys?.length ?? children.length;

    // Each cell needs a name so the grid constraint can refer to it (shared
    // with spread and scatter — see `ensureChildNames`).
    const cellNames = ensureChildNames(children, "cell");

    const node = (await layer(children)) as GoFishNode;
    await node.relate((g) => [
      // grid is table's private elaboration target — not part of the public
      // `Constraint` factory (see constraints/index.ts).
      createGridConstraint(
        {
          numCols,
          spacing,
          colKeys,
          rowKeys,
          colMeasure: axisMeasures?.x,
          rowMeasure: axisMeasures?.y,
          colHasOrder,
          rowHasOrder,
        },
        cellNames.map((name) => g[name])
      ),
    ]);

    // `_ordinalKeyMap`: axis elaboration runs BEFORE layout and needs the
    // representative cell for each col/row key — first-row cells for columns,
    // first-column cells for rows.
    const keyMap: Record<string, GoFishNode> = {};
    colKeys?.forEach((k, j) => {
      const c = children[j];
      if (c instanceof GoFishNode) keyMap[String(k)] = c;
    });
    rowKeys?.forEach((k, i) => {
      const c = children[i * numCols];
      if (c instanceof GoFishNode) keyMap[String(k)] = c;
    });
    node._ordinalKeyMap = keyMap;

    if (key !== undefined) node.key = key;
    return node;
  }
);

export type TableOptions = {
  /** The column key (`x`) and row key (`y`): each anything `spread`'s `by`
   *  takes, a field name or a `field(...)` key (binned, chained, a product,
   *  a part of a cycle). */
  by?: { x: SplitBy; y: SplitBy };
  spacing?: number | [number, number];
  numCols?: number;
};

export const table = createOperator<any, TableOptions>(Table, {
  // The columns are the split of the rows by `by.x`, and the rows the split
  // by `by.y`, each as `spread` splits (`splitEntries`: a binned key's groups
  // are its cells, empty ones included). Each cell of the table holds the
  // rows in both its column's group and its row's group.
  split: ({ by }, d) => {
    if (by?.x === undefined || by?.y === undefined)
      throw new Error(
        "table operator form requires opts.by = { x, y }: a key for the " +
          "columns and one for the rows (field names or field(...) keys, " +
          'e.g. { x: "month", y: field("date").bin(Calendar.weekday) })'
      );
    const cols = splitEntries(by.x, d);
    const rows = splitEntries(by.y, d);
    // One pass over the rows: each row's row key, then each column's rows
    // into their cells, which are made first, every one, in row-major order,
    // each keyed by its place in that order. A cell is found by its column
    // key and then its row key, never by a string of the two: keys may hold
    // any text ("6-15", "-5").
    const rowOf = new Map<unknown, unknown>();
    for (const [rowKey, rowRows] of rows)
      for (const r of rowRows) rowOf.set(r, rowKey);
    const cellOf = new Map<unknown, Map<unknown, any[]>>(
      [...cols.keys()].map((colKey) => [colKey, new Map()])
    );
    const entries = new Map<number, any[]>();
    for (const rowKey of rows.keys())
      for (const colKey of cols.keys()) {
        const cell: any[] = [];
        cellOf.get(colKey)!.set(rowKey, cell);
        entries.set(entries.size, cell);
      }
    for (const [colKey, colRows] of cols)
      for (const r of colRows)
        if (rowOf.has(r)) cellOf.get(colKey)!.get(rowOf.get(r))!.push(r);
    return {
      entries,
      layoutOpts: {
        colKeys: [...cols.keys()],
        rowKeys: [...rows.keys()],
        colHasOrder: cols.hasOrder,
        rowHasOrder: rows.hasOrder,
      },
    };
  },
  axisFields: ({ by }) =>
    by ? { x: fieldNameOf(by.x), y: fieldNameOf(by.y) } : undefined,
  serialize: "table",
});

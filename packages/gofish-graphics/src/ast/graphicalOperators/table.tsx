import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import { createOperator } from "../marks/createOperator";
import { layer } from "./layer";
import { Constraint } from "../constraints";
import { childNameKey } from "../constraints/shared";

/**
 * `Table` arranges cells in a `numCols`-wide grid. It elaborates to a flat
 * `layer` of the cells plus a single symmetric `grid` constraint — the grid owns
 * both partitions (columns on x, rows on y), sizes each cell to its flex track,
 * and centers it. See `constraints/grid.ts`.
 */
export const Table = createNodeOperator(
  async (
    {
      name,
      key,
      numCols: numColsOpt,
      spacing = 0,
      colKeys,
      rowKeys,
    }: {
      name?: string;
      key?: string;
      numCols?: number;
      spacing?: number | [number, number];
      colKeys?: string[];
      rowKeys?: string[];
    },
    children: GoFishAST[]
  ) => {
    // Prefer explicit numCols; fall back to colKeys.length; finally a single row.
    const numCols = numColsOpt ?? colKeys?.length ?? children.length;

    // Each cell needs a name so the grid constraint can reference it; reuse the
    // cell's key (from the table split) when present, else synthesize one.
    const cellNames = children.map((c, i) => {
      // Reuse the cell's existing constraint name (string or Token, via
      // `childNameKey`); synthesize and stamp one only when it has none.
      const existing = childNameKey(c);
      if (existing !== undefined) return existing;
      const nm = (c instanceof GoFishNode && c.key) || `__grid_cell_${i}`;
      if (c instanceof GoFishNode) c._name = nm;
      return nm;
    });

    const node = (await layer(children)) as GoFishNode;
    node.constrain((ref) => [
      Constraint.grid(
        { numCols, spacing, colKeys, rowKeys },
        cellNames.map((n) => ref[n] ?? { name: n })
      ),
    ]);

    // `_ordinalKeyMap`: axis elaboration runs BEFORE layout and needs the
    // representative cell for each col/row key — first-row cells for columns,
    // first-column cells for rows.
    const keyMap: Record<string, GoFishNode> = {};
    colKeys?.forEach((k, j) => {
      const c = children[j];
      if (c instanceof GoFishNode) keyMap[k] = c;
    });
    rowKeys?.forEach((k, i) => {
      const c = children[i * numCols];
      if (c instanceof GoFishNode) keyMap[k] = c;
    });
    node._ordinalKeyMap = keyMap;

    if (key !== undefined) node.key = key;
    if (name !== undefined) node._name = name;
    return node;
  }
);

export type TableOptions = {
  by?: { x: string; y: string };
  spacing?: number | [number, number];
  numCols?: number;
};

export const table = createOperator<any, TableOptions>(Table, {
  split: ({ by }, d) => {
    if (!by?.x || !by?.y)
      throw new Error(
        "table operator form requires opts.by = { x: fieldName, y: fieldName }"
      );
    const colKeys = [...new Map(d.map((r) => [String(r[by.x]), true])).keys()];
    const rowKeys = [...new Map(d.map((r) => [String(r[by.y]), true])).keys()];
    const entries = new Map<string | number, any[]>();
    for (const rowKey of rowKeys)
      for (const colKey of colKeys)
        entries.set(
          `${colKey}-${rowKey}`,
          d.filter(
            (r) => String(r[by.x]) === colKey && String(r[by.y]) === rowKey
          )
        );
    return { entries, keys: { colKeys, rowKeys } };
  },
  axisFields: ({ by }) => (by ? { x: by.x, y: by.y } : undefined),
  serialize: { type: "table" },
});

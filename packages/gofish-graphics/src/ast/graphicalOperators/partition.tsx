// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { RegionCell } from "../cells";
import { resolveColumn } from "../channels";
import { DatumValueImpl, isField, type FieldAccessor } from "../data";
import { splitEntries, type SplitBy } from "../datumProjection";
import { resolveAxisName, type AxisName } from "../dims";
import { getFieldOps, type FieldExpr } from "../fieldExpr";
import type { AxisOptions } from "../gofish";
import type { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import type { Operator } from "../types";
import {
  createOperator,
  type TranslatableOperator,
} from "../marks/createOperator";
import { compose } from "../marks/compose";
import { createNodeOperator } from "../withGoFish";
import { Constraint, PositionRegion } from "../constraints";
import type { ColumnDatum } from "../constraints/position";
import { isStruct, structBin, type StructExpr } from "../structExpr";
import { axisName, ensureChildNames } from "../constraints/shared";
import { layer } from "./layer";
import type { Alignment } from "./alignment";

/**
 * `partition` (#1058, #1059, #48) divides the space it is given into the
 * cells of its key, and gives each group its cell. Each cell sits at its true
 * place on one continuous scale, so a cell's width on screen follows its
 * width in data (a 29-day February is narrower than a 31-day March).
 *
 * Its key must have a REGION. `field(x).bin(p)` makes one on one axis (a
 * {@link Cell}, cells.ts), and `struct({ x, y }).bin(b)` makes one on both
 * axes at once (a {@link PolygonCell}, polygonCells.ts: a hexagon, a Voronoi
 * cell). The cells are those of the columns' whole domain in the chart's
 * data, empty ones included, so an empty cell keeps its place: it is a group
 * with no rows, and it is still placed.
 *
 * **How a child gets its region.** Each child is handed a REGION in its
 * layout call, with its size proposal (#1059, `geometry/region.ts`): the
 * region this partition was itself handed, cut down to the child's cell on
 * `dir`. The cell is stated as a position constraint that gives a region,
 * `Constraint.position({ region })` ({@link PositionRegion}), which also
 * makes the axis's domain and tells the axis that it places cells; the
 * layer turns it into the child's region (`buildChildProposals`). The child is
 * laid out in its region's length and places itself in it: a mark with no
 * size of its own (a `rect`, a `region`) fills its cell, and a mark with a
 * size of its own (a circle, a text) sits in the middle of it.
 *
 * On the other axis a top-level partition gives no span, so there the
 * children are aligned by `alignment`, as in `scatter` (bars stand on a
 * shared baseline). A partition inside another partition's cell gives each
 * child that cell on the other axis too, so the child sits in a rectangle,
 * and `alignment` has nothing left to move. That is why nested 1D partitions
 * place their children the same way in either order. There is no layout code
 * of its own: it is a layer with one position constraint per child and one
 * align.
 *
 * **The product form**, `by: { x, y }`, is the two nested 1D partitions, x
 * then y. It is built by that rewrite (`compose`), so it adds no behavior of
 * its own, and on the wire it is those two partitions.
 *
 * **The plane form**, `by: struct({ x, y }).bin(b)`, divides both axes at
 * once into polygon cells. It is the same split and the same constraints:
 * the struct's columns are placed along x and y, so each child's region
 * spans both axes (its cell's box) and holds the cell's outline in data,
 * which the layer maps through both scales into the child's region, and no
 * axis is left to align. A `region` mark draws the outline; any other mark
 * is placed in the box (a circle sits at the box's center).
 */
type PartitionCommon = {
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
  debug?: boolean;
};

/** The 1D form: divide one axis. */
export type PartitionAxisOptions = PartitionCommon & {
  /** The key whose regions divide the space: `field(x).bin(p)`. */
  by: FieldExpr<true>;
  /** The axis to divide: `x`/`y` (axis 0/1 in any coordinate space), or a
   *  name the enclosing coordinate space declares (`theta`/`r` in polar). */
  dir: AxisName;
  /** Cross-axis alignment of the children (the axis the cells do not
   *  divide), where nothing gives them a cell on that axis. */
  alignment?: Alignment;
};

/** The product form: divide both axes, one key per axis, as `table` takes
 *  them. The same as `partition({ by: by.x, dir: "x" })` then
 *  `partition({ by: by.y, dir: "y" })`. */
export type PartitionProductOptions = PartitionCommon & {
  by: { x: FieldExpr<true>; y: FieldExpr<true> };
  dir?: never;
  alignment?: never;
};

/** The plane form: divide both axes at once into the polygon cells of a
 *  binned struct, `struct({ x, y }).bin(Bin.hex({ radius }))`. */
export type PartitionPlaneOptions = PartitionCommon & {
  by: StructExpr<true>;
  dir?: never;
  alignment?: never;
};

export type PartitionOptions =
  | PartitionAxisOptions
  | PartitionProductOptions
  | PartitionPlaneOptions;

/** The loud error for a `by` that has no region. */
const noRegion = (by: unknown): Error => {
  if (isStruct(by))
    return new Error(
      `partition: \`by\` must be a key that has a region, and ` +
        `struct({ x: "${by.fields.x}", y: "${by.fields.y}" }) has none until ` +
        `it is binned: add .bin(Bin.hex({ radius })) or ` +
        `.bin(Bin.voronoi({ seeds })), so each group is placed in its cell.`
    );
  const name = typeof by === "string" ? by : isField(by) ? by.name : "x";
  return new Error(
    `partition: \`by\` must be a key that has a region, such as ` +
      `field("${name}").bin(Calendar.month) or ` +
      `field("${name}").bin({ step: 1 }). Each group is placed in its ` +
      `cell, so the key must say what the cells are. To give each value an ` +
      `equal slot instead, use spread({ by, dir }).`
  );
};

/** The layout node's options: per child, its cell, and the columns of the
 *  key, in the key's order (one for a field, x then y for a struct), as maps
 *  from a value to its datum. */
type PartitionNodeProps = {
  key?: string;
  dir?: AxisName;
  cells: RegionCell[];
  columns: ColumnDatum[];
  alignment?: Alignment;
  axes?: PartitionCommon["axes"];
};

const PartitionNode = createNodeOperator(
  async (
    {
      key,
      dir,
      cells,
      columns,
      alignment = "baseline",
      axes,
      ...rest
    }: PartitionNodeProps,
    children: GoFishAST[]
  ) => {
    if (children.length === 0)
      throw new Error(
        "partition: the key has no cells: its column has no values in the " +
          "chart's data."
      );
    const names = ensureChildNames(children, "partition");
    const node = (await layer({ key, ...rest } as any, children)) as GoFishNode;
    // `dir` may be a name the enclosing coordinate space declares, so the
    // constraints wait for the resolveAliases pass.
    node._elaborateInAxisScope = async (_outer, inner) => {
      // The axes the key's columns are placed along: `dir` for a field, both
      // for a struct (a cell of the plane).
      const placed: (0 | 1)[] =
        dir === undefined
          ? [0, 1]
          : [resolveAxisName(inner, dir, "partition dir")];
      const along: [ColumnDatum | undefined, ColumnDatum | undefined] = [
        undefined,
        undefined,
      ];
      placed.forEach((axis, k) => (along[axis] = columns[k]));
      // The children are aligned on each axis no column is placed along.
      const free = ([0, 1] as const).filter((axis) => !placed.includes(axis));
      await node.relate((g) => {
        const refs = names.map((name) => g[name]);
        return [
          ...refs.map((ref, i) =>
            Constraint.position(
              { region: new PositionRegion(cells[i], along) },
              [ref]
            )
          ),
          ...free.map((axis) =>
            Constraint.align({ [axisName(axis)]: alignment }, refs)
          ),
        ];
      });
    };
    if (axes !== undefined) {
      const toShow = (opt: AxisOptions | undefined): boolean | undefined =>
        opt === undefined ? undefined : opt === false ? false : true;
      node._axisOverride =
        typeof axes === "boolean"
          ? { x: axes, y: axes }
          : { x: toShow(axes.x), y: toShow(axes.y) };
    }
    return node;
  }
);

/** A datum read from the column `name`: it carries what the column says
 *  about its values (its measure, and its schema type: a time column's
 *  calendar), as a position read from the column does, so the axis it is
 *  placed on is that column's axis. */
function columnDatum(
  d: unknown[],
  name: string,
  accessor: unknown = name
): ColumnDatum {
  const { measure, type } = resolveColumn(d, accessor);
  return (v) =>
    new DatumValueImpl(
      v,
      measure,
      undefined,
      undefined,
      type === undefined ? undefined : name,
      type
    );
}

/** Whether `by` has a region: a field binned by `.bin(p)`, or a struct
 *  binned by `.bin(b)`. */
const hasRegion = (by: unknown): boolean =>
  isStruct(by)
    ? structBin(by) !== undefined
    : isField(by) && getFieldOps(by).some((op) => op.op === "bin");

const partitionOperator = createOperator<
  any,
  PartitionAxisOptions | PartitionPlaneOptions
>(
  ((
    { dir, cells, columns, alignment, axes, key }: any,
    children: GoFishAST[]
  ) =>
    PartitionNode(
      { key, dir, cells, columns, alignment, axes },
      children
    )) as any,
  {
    split: ({ by }, d) => {
      // A key has a region only through `.bin` (the type rules the rest out
      // in TS; the wire form from Python is checked here).
      if (!hasRegion(by)) throw noRegion(by);
      const entries = splitEntries(by as SplitBy, d);
      const cells = [...entries.keys()];
      if (!cells.every((k): k is RegionCell => k instanceof RegionCell))
        throw noRegion(by);
      const columns = isStruct(by)
        ? [columnDatum(d, by.fields.x), columnDatum(d, by.fields.y)]
        : [columnDatum(d, (by as FieldAccessor).name, by)];
      return { entries, layoutOpts: { cells, columns } };
    },
    // The axis it divides is a value axis (the cells' positions), as a
    // scatter's span is. A coord-declared `dir` (`theta`, ...) positions
    // neither axis at build time, as for spread.
    // TODO(#838 follow-up): resolve the travel axis by name too.
    arrangement: {
      kind: "value",
      positions: ({ by, dir }) =>
        isStruct(by)
          ? { x: true, y: true }
          : { x: dir === "x", y: dir === "y" },
    },
    serialize: "partition",
  }
);

/** Whether `by` is the product form's `{ x, y }` (and not a field or a
 *  struct). */
const isProductKey = (by: unknown): by is PartitionProductOptions["by"] =>
  typeof by === "object" && by !== null && !isField(by) && !isStruct(by);

/**
 * Divide the space into the cells of `by`, one group per cell, each given its
 * cell.
 *
 * - `partition({ by: field(x).bin(p), dir })` divides one axis.
 * - `partition({ by: { x: field(a).bin(p), y: field(b).bin(q) } })` divides
 *   both: it is the 1D partition on x, then the 1D partition on y.
 * - `partition({ by: struct({ x: a, y: b }).bin(Bin.hex({ radius })) })`
 *   divides both at once, into hexagons (or Voronoi cells, `Bin.voronoi`).
 *
 * It has only the operator form: its children are the groups of its key, so
 * there is no list of children to pass it.
 */
export function partition(
  opts: PartitionAxisOptions
): TranslatableOperator<any[], any[]>;
export function partition(
  opts: PartitionProductOptions
): Operator<any[], any[]>;
export function partition(
  opts: PartitionPlaneOptions
): TranslatableOperator<any[], any[]>;
export function partition(
  opts: PartitionOptions
): TranslatableOperator<any[], any[]> | Operator<any[], any[]> {
  if (isStruct(opts.by)) {
    const { dir, alignment } = opts as PartitionOptions;
    if (dir !== undefined || alignment !== undefined)
      throw new Error(
        "partition: a struct key divides both axes at once, so `dir` and " +
          "`alignment` do not apply. Each child is placed in its cell."
      );
    return partitionOperator(opts as PartitionPlaneOptions);
  }
  if (!isProductKey(opts.by)) {
    if ((opts as PartitionAxisOptions).dir === undefined)
      throw new Error(
        "partition: `dir` names the axis to divide, e.g. " +
          'partition({ by, dir: "x" }). To divide both axes, key `by` by ' +
          "axis: partition({ by: { x: ..., y: ... } })."
      );
    return partitionOperator(opts as PartitionAxisOptions);
  }
  const { by, dir, alignment, ...rest } = opts as PartitionOptions & {
    by: PartitionProductOptions["by"];
  };
  const keys = Object.keys(by);
  if (keys.length !== 2 || by.x === undefined || by.y === undefined)
    throw new Error(
      `partition: a \`by\` keyed by axis takes exactly the keys x and y, ` +
        `got ${keys.join(", ") || "none"}. To divide one axis, pass ` +
        `partition({ by: field(f).bin(p), dir }).`
    );
  if (dir !== undefined || alignment !== undefined)
    throw new Error(
      "partition: a `by` keyed by axis divides both axes, so `dir` and " +
        "`alignment` do not apply. Each child is placed in its cell."
    );
  return compose(
    partitionOperator({ ...rest, by: by.x, dir: "x" }),
    partitionOperator({ ...rest, by: by.y, dir: "y" })
  );
}

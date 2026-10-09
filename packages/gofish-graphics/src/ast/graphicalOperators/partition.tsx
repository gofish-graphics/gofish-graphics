// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { Cell } from "../cells";
import { resolveColumn } from "../channels";
import { DatumValueImpl, isField, type FieldAccessor } from "../data";
import { splitEntries } from "../datumProjection";
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
import { axisName, ensureChildNames } from "../constraints/shared";
import { layer } from "./layer";
import type { Alignment } from "./alignment";

/**
 * `partition` (#1058, #1059, #48) divides the space it is given into the
 * cells of its key, and gives each group its cell. Each cell sits at its true
 * place on one continuous scale, so a cell's width on screen follows its
 * width in data (a 29-day February is narrower than a 31-day March).
 *
 * Its key must have a REGION. Today only `field(x).bin(p)` makes one (a
 * {@link Cell}, cells.ts). The cells are those of the column's whole domain in
 * the chart's data, empty ones included, so an empty cell keeps its place: it
 * is a group with no rows, and it is still placed.
 *
 * **How a child gets its region.** The cell reaches the child as a position
 * constraint that takes a region, `Constraint.position({ [dir]: region })`
 * ({@link PositionRegion}). The layer lays the child out in the cell's length
 * (its size proposal) and puts the child's center on the cell's center. So a
 * mark with no size along `dir` (a `rect`, a `region`) fills its cell, and a
 * mark with a size of its own (a circle, a text) sits in the middle of it. On
 * the other axis the child gets the whole space and is aligned by
 * `alignment`, as in `scatter`. The region's cell also tells the axis that it
 * places cells. There is no layout code of its own: it is a layer with one
 * position constraint per child and one align.
 *
 * **The product form**, `by: { x, y }`, is two nested 1D partitions, x then
 * y, with the inner one centering its children on x (alignment `"middle"`).
 * It is built by that rewrite (`compose`), so it adds no behavior of its own,
 * and on the wire it is those two partitions. A child then gets a rectangle:
 * its y cell from the inner partition, and its x cell from the outer one,
 * which centers the inner partition's box in it. The inner partition's box
 * is as wide as its widest child, so its children, centered on one line, are
 * each centered in the x cell. The outer partition keeps the default
 * alignment, which leaves the inner partitions where their y cells put
 * them (a `"middle"` alignment would center their boxes instead).
 *
 * A region is a box today. A hexagon or a Voronoi cell (#1059 part B) also
 * needs its outline to reach the child; see `PositionRegion` for where it
 * goes.
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
   *  divide). */
  alignment?: Alignment;
};

/** The product form: divide both axes, one key per axis, as `table` takes
 *  them. The same as `partition({ by: by.x, dir: "x" })` then
 *  `partition({ by: by.y, dir: "y", alignment: "middle" })`. */
export type PartitionProductOptions = PartitionCommon & {
  by: { x: FieldExpr<true>; y: FieldExpr<true> };
  dir?: never;
  alignment?: never;
};

export type PartitionOptions = PartitionAxisOptions | PartitionProductOptions;

/** The loud error for a `by` that has no region. */
const noRegion = (by: unknown): Error => {
  const name = typeof by === "string" ? by : isField(by) ? by.name : "x";
  return new Error(
    `partition: \`by\` must be a key that has a region, such as ` +
      `field("${name}").bin(Calendar.month) or ` +
      `field("${name}").bin({ step: 1 }). Each group is placed in its ` +
      `cell, so the key must say what the cells are. To give each value an ` +
      `equal slot instead, use spread({ by, dir }).`
  );
};

/** The layout node's options: one region per child, on `dir`. */
type PartitionNodeProps = {
  key?: string;
  dir: AxisName;
  regions: PositionRegion[];
  alignment?: Alignment;
  axes?: PartitionCommon["axes"];
};

const PartitionNode = createNodeOperator(
  async (
    {
      key,
      dir,
      regions,
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
      const axis = resolveAxisName(inner, dir, "partition dir");
      await node.relate((g) => {
        const refs = names.map((name) => g[name]);
        return [
          ...refs.map((ref, i) =>
            Constraint.position({ [axisName(axis)]: regions[i] }, [ref])
          ),
          Constraint.align(
            { [axisName((1 - axis) as 0 | 1)]: alignment },
            refs
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

const partitionOperator = createOperator<any, PartitionAxisOptions>(
  (({ dir, regions, alignment, axes, key }: any, children: GoFishAST[]) =>
    PartitionNode({ key, dir, regions, alignment, axes }, children)) as any,
  {
    split: ({ by }, d) => {
      // A key has a region only through `.bin(p)` (the type rules the rest
      // out in TS; the wire form from Python is checked here).
      if (!isField(by) || !getFieldOps(by).some((op) => op.op === "bin"))
        throw noRegion(by);
      const entries = splitEntries(by as FieldAccessor, d);
      const cells = [...entries.keys()];
      if (!cells.every((k): k is Cell => k instanceof Cell)) throw noRegion(by);
      // Each edge carries what the column says about its values (its
      // measure, and its schema type: a time column's calendar), as a
      // position read from the column does, so the axis is that column's
      // axis.
      const { measure, type } = resolveColumn(d, by);
      const edge = (v: number) =>
        new DatumValueImpl(
          v,
          measure,
          undefined,
          undefined,
          type === undefined ? undefined : by.name,
          type
        );
      return {
        entries,
        layoutOpts: {
          regions: cells.map(
            (c) => new PositionRegion(c, [edge(c.start), edge(c.end)])
          ),
        },
      };
    },
    // The axis it divides is a value axis (the cells' positions), as a
    // scatter's span is. A coord-declared `dir` (`theta`, ...) positions
    // neither axis at build time, as for spread.
    // TODO(#838 follow-up): resolve the travel axis by name too.
    arrangement: {
      kind: "value",
      positions: ({ dir }) => ({ x: dir === "x", y: dir === "y" }),
    },
    serialize: "partition",
  }
);

/** Whether `by` is the product form's `{ x, y }` (and not a field). */
const isProductKey = (by: unknown): by is PartitionProductOptions["by"] =>
  typeof by === "object" && by !== null && !isField(by);

/**
 * Divide the space into the cells of `by`, one group per cell, each given its
 * cell.
 *
 * - `partition({ by: field(x).bin(p), dir })` divides one axis.
 * - `partition({ by: { x: field(a).bin(p), y: field(b).bin(q) } })` divides
 *   both: it is the 1D partition on x, then the 1D partition on y centering
 *   its children on x.
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
  opts: PartitionOptions
): TranslatableOperator<any[], any[]> | Operator<any[], any[]> {
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
        "`alignment` do not apply. Each child is centered in its cell."
    );
  return compose(
    partitionOperator({ ...rest, by: by.x, dir: "x" }),
    partitionOperator({ ...rest, by: by.y, dir: "y", alignment: "middle" })
  );
}

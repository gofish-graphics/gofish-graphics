// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { Cell } from "../cells";
import { resolveColumn } from "../channels";
import { DatumValueImpl, isField, type FieldAccessor } from "../data";
import { splitEntries } from "../datumProjection";
import type { AxisName } from "../dims";
import { getFieldOps, type FieldExpr } from "../fieldExpr";
import type { AxisOptions } from "../gofish";
import {
  createOperator,
  type TranslatableOperator,
} from "../marks/createOperator";
import type { GoFishAST } from "../_ast";
import { Scatter } from "./scatter";

/**
 * `partition` (#1058, #48) divides the space it is given along `dir` into the
 * cells of its key: each group is placed across its cell's interval
 * `[start, end)` on one continuous scale, so a cell's width on screen follows
 * its width in data (a 29-day February is narrower than a 31-day March).
 *
 * Its key must have a REGION. Today only `field(x).bin(p)` makes one (a
 * {@link Cell}, cells.ts). The cells are those of the column's whole domain in
 * the chart's data, empty ones included, so an empty cell keeps its place: it
 * is a group with no rows, and it is still placed.
 *
 * It is `scatter`'s range form with the span read off the key: the split
 * hands the layout one `{ min, max }` span per cell (the cell's start and
 * end, carrying the column's measure and type, so a time column gives a time
 * axis), and `Scatter` elaborates that into one interval position constraint
 * per child. The two edges of that constraint set the child's size along
 * `dir`, so a mark with no size there fills its cell. There is no layout code
 * of its own.
 *
 * The region a child gets is the cell's interval on `dir` and the whole space
 * on the other axis. A 2D partition would hand each child a region on both
 * axes (a rectangle, or a hexagon's outline), which an interval constraint
 * cannot state; that waits for #1059.
 */
export type PartitionOptions = {
  /** The key whose regions divide the space: `field(x).bin(p)`. */
  by: FieldExpr<true>;
  /** The axis to divide: `x`/`y` (axis 0/1 in any coordinate space), or a
   *  name the enclosing coordinate space declares (`theta`/`r` in polar). */
  dir: AxisName;
  /** Cross-axis alignment of the children (the axis the cells do not
   *  divide). */
  alignment?: "start" | "middle" | "end" | "baseline";
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
  debug?: boolean;
};

/** The loud error for a `by` that has no region. */
const noRegion = (by: unknown): Error => {
  const name = typeof by === "string" ? by : isField(by) ? by.name : "x";
  return new Error(
    `partition: \`by\` must be a key that has a region, such as ` +
      `field("${name}").bin(Calendar.month) or ` +
      `field("${name}").bin({ step: 1 }). Each group is placed across its ` +
      `cell's interval, so the key must say what the cells are. To give ` +
      `each value an equal slot instead, use spread({ by, dir }).`
  );
};

const partitionOperator = createOperator<any, PartitionOptions>(
  // `dir` became the span's axis in the split; the rest is scatter's.
  (({ dir: _dir, ...opts }: any, children: GoFishAST[]) =>
    Scatter(opts, children)) as any,
  {
    split: ({ by, dir }, d) => {
      // A key has a region only through `.bin(p)` (the type rules the rest
      // out in TS; the wire form from Python is checked here).
      if (!isField(by) || !getFieldOps(by).some((op) => op.op === "bin"))
        throw noRegion(by);
      const entries = splitEntries(by as FieldAccessor, d);
      const cells = [...entries.keys()];
      if (!cells.every((k): k is Cell => k instanceof Cell)) throw noRegion(by);
      // Each end carries what the column says about its values (its measure,
      // and its schema type: a time column's calendar), as a position read
      // from the column does, so the axis is that column's axis.
      const { measure, type } = resolveColumn(d, by);
      // Each end also names its cell, so the axis knows it places cells.
      const edge = (cell: Cell, v: number) =>
        new DatumValueImpl(
          v,
          measure,
          undefined,
          undefined,
          type === undefined ? undefined : by.name,
          type,
          cell
        );
      return {
        entries,
        layoutOpts: {
          dims: {
            [dir]: {
              min: cells.map((c) => edge(c, c.start)),
              max: cells.map((c) => edge(c, c.end)),
            },
          },
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

/**
 * Divide the space along `dir` into the cells of `by` (`field(x).bin(p)`),
 * one group per cell, each placed across its cell. It has only the operator
 * form: its children are the groups of its key, so there is no list of
 * children to pass it.
 */
export function partition(
  opts: PartitionOptions
): TranslatableOperator<any[], any[]> {
  return partitionOperator(opts);
}

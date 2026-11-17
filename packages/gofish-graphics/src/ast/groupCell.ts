// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * The cell a group is: a split by a key binned on a
 * line, `field(x).bin(p)` or `d.bin(p)` on a distribution, gives each cell's
 * group the interval of the cell on the key's variable and the rows of the
 * group it was split from. It rides the group's rows ARRAY, as its column
 * types do (`COLUMN_TYPES`, schema.ts), so whatever reads a group reads the
 * cell it is.
 *
 * A distribution of the cell's variable reads it: in a cell, the
 * distribution is the whole one's restricted to the cell (`restrictDist`,
 * dist.ts), not one made from the cell's rows alone. So the cells of one
 * curve meet exactly, and each keeps the whole curve's height. The leaves
 * that read it are the three that make a function of the variable: a
 * family (`evalDistGroup`, distExpr.ts), a field's sample (the `sample`
 * fold, fieldExpr.ts), and a band through the rows over the variable
 * (`bandOfRows`, shapes/band.tsx). A distribution of another variable is
 * of the cell's rows, which is that variable's distribution given the
 * cell.
 */
import { tagArray } from "./data";
import type { Interval } from "./fun";

/** The variable a cell is an interval of: a column, by name, or a
 *  distribution, by its family and parameters as the wire writes them. */
export type CellVariable =
  | { kind: "column"; name: string }
  | { kind: "dist"; id: string };

/** What a cell's group knows of its cell. */
export type GroupCell = {
  variable: CellVariable;
  /** The cell, in the variable's units (epoch milliseconds for a time). */
  cell: Interval;
  /** The rows of the group the cell was split from, which may be a cell
   *  itself. */
  whole: readonly unknown[];
};

const GROUP_CELL: unique symbol = Symbol.for("gofish.groupCell");

/** Tag `rows`, a cell's group, with its cell. */
export const setGroupCell = <T>(rows: T, cell: GroupCell): T =>
  tagArray(rows, GROUP_CELL, cell);

/** The cell `rows` is a group of, if any. */
export const groupCellOf = (rows: unknown): GroupCell | undefined =>
  rows != null
    ? ((rows as any)[GROUP_CELL] as GroupCell | undefined)
    : undefined;

/** The cell `rows` is a group of when the cell is an interval of
 *  `variable`. */
export function cellOn(
  rows: unknown,
  variable: CellVariable
): GroupCell | undefined {
  const c = groupCellOf(rows);
  if (c === undefined) return undefined;
  const v = c.variable;
  const same =
    v.kind === "column"
      ? variable.kind === "column" && variable.name === v.name
      : variable.kind === "dist" && variable.id === v.id;
  return same ? c : undefined;
}

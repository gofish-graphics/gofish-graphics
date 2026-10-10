// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * `struct({ x, y })` (#1059, #48): a key that reads two fields at once, named
 * after polars' `pl.struct`. A hexagon or a Voronoi cell depends on both
 * fields together, so a `.bin` on each field cannot express it.
 *
 * `.bin(b)` chains on it as it does on `field`, with a `Bin` strategy
 * (`Bin.hex({ radius })`, `Bin.voronoi({ seeds })`): the key's groups are
 * then the cells of the plane (polygonCells.ts), each with its outline. A
 * struct is a key only once it is binned: today only `partition` reads one,
 * and it needs the cells' regions.
 *
 * The class's own fields are its wire form (`{ type: "struct", fields, ops? }`,
 * `StructAccessor` in gofish-ir), so an instance and the wire object the
 * Python bridge sends are read the same way ({@link structBin}).
 */
import { Frontend } from "gofish-ir";
import type { Bin } from "../families/bin";
import type { PlaneFields } from "./polygonCells";

/** One op of a struct's pipeline: the cells it is binned into. */
export type StructOp = { op: "bin"; partition: Bin };

/** The wire form of a struct key. */
export type StructExprWire = Frontend.StructAccessor;

export class StructExpr<HasRegion extends boolean = boolean> {
  public readonly type = "struct" as const;
  /** Type-level only (no runtime field): whether this key gives each group a
   *  REGION, as `FieldExpr<true>` does. Only `.bin(b)` makes one, and
   *  `partition` requires one, so `partition({ by: struct({ x, y }) })` is a
   *  type error. */
  declare readonly hasRegion?: HasRegion;
  constructor(
    public readonly fields: PlaneFields,
    public readonly ops: readonly StructOp[] = []
  ) {}

  /** Map each row's point `(x, y)` to its CELL in `bin`, a call in the `Bin`
   *  family: `Bin.hex({ radius })` or `Bin.voronoi({ seeds })`. The groups
   *  are the cells over the two columns' domain in the chart's data, so
   *  every group of a split sees the same cells, and empty cells are kept. */
  bin(bin: Bin): StructExpr<true> {
    if (this.ops.length > 0)
      throw new Error(
        "struct(...).bin(...) is already binned: a struct takes one bin."
      );
    Frontend.checkStrategy("Bin", bin, "struct(...).bin");
    return new StructExpr<true>(this.fields, [{ op: "bin", partition: bin }]);
  }

  toJSON(): StructExprWire {
    return {
      type: "struct",
      fields: { x: this.fields.x, y: this.fields.y },
      ...(this.ops.length ? { ops: [...this.ops] } : {}),
    };
  }
}

/**
 * A key that reads two fields at once: `struct({ x: "lon", y: "lat" })`.
 * `x` and `y` name the column read on each axis. Bin it with `.bin(b)`, a
 * call in the `Bin` family, to give each group its cell of the plane.
 */
export function struct(fields: PlaneFields): StructExpr<false> {
  const keys = Object.keys(fields ?? {});
  if (
    keys.length !== 2 ||
    typeof fields.x !== "string" ||
    typeof fields.y !== "string"
  )
    throw new Error(
      `struct({ x, y }): takes exactly the keys x and y, each a field name, ` +
        `e.g. struct({ x: "lon", y: "lat" }); got ${JSON.stringify(fields)}.`
    );
  return new StructExpr<false>({ x: fields.x, y: fields.y });
}

/** Whether `v` is a struct key: a {@link StructExpr} or its wire form. */
export const isStruct = (v: unknown): v is StructExprWire =>
  typeof v === "object" &&
  v !== null &&
  (v as { type?: unknown }).type === "struct";

/** A struct key's bin, or undefined when it is not binned. */
export const structBin = (by: StructExprWire): Bin | undefined =>
  by.ops?.find((op) => op.op === "bin")?.partition;

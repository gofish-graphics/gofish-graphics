// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Name Resolution & Scoping — /internals/core/names-and-scoping
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { Placeable } from "../_node";
import {
  localAnchorPoint,
  type Anchor,
  type Dimensions,
  type Direction,
  type FancyDirection,
  elaborateDirection,
} from "../dims";
import type { UnderlyingSpace } from "../underlyingSpace";

/**
 * A constraint operand that lives INSIDE one of the layer's direct children
 * (`container`), not at the top level — e.g. `mercury` inside
 * `enclose(spread(...planets))` named from an outer layer's `.constrain()`.
 *
 * The container's own layout has already fixed where `node` sits inside it, so
 * the operand is rigidly attached to the container: its box is the container's
 * box plus a constant `gap` (the operand's `min` offset from the container's
 * `min`, per axis). The solve ties the two with a rigid relation
 * (`solvePlacementConstraints`). If the container is not itself an operand,
 * it is baseline-placed before the solve like any unconstrained child, so the
 * nested operand is a fixed reference the other operands move to. If the
 * container is an operand too, the solve moves it, and the nested operand
 * with it. The container carries the write-back; this stand-in's own
 * placement writes are no-ops. Resizing a nested operand is impossible from
 * outside its container, so the size-writing hooks throw.
 */
export class NestedOperand implements Placeable {
  constructor(
    private readonly name: string,
    private readonly node: GoFishAST,
    private readonly container: Placeable,
    /** Per axis: operand `min` − container `min`, in the container's frame. */
    readonly gap: [number, number]
  ) {}

  get dims(): Dimensions {
    return ([0, 1] as const).map((i) => {
      const base = this.container.dims[i].min;
      const size = this.node.dims[i].size;
      const min = base === undefined ? undefined : base + this.gap[i];
      const placed = min !== undefined && size !== undefined;
      return {
        min,
        center: placed ? localAnchorPoint("center", min!, size!) : undefined,
        max: placed ? localAnchorPoint("max", min!, size!) : undefined,
        size,
        embedded: this.node.dims[i].embedded,
      };
    }) as Dimensions;
  }

  localAnchor(axis: FancyDirection, anchor: Anchor): number | undefined {
    return this.node.localAnchor(axis, anchor);
  }

  projectedTranslate(dir: Direction): number | undefined {
    const min = this.dims[dir].min;
    const localMin = this.node.localAnchor(dir, "min");
    return min === undefined || localMin === undefined
      ? undefined
      : min - localMin;
  }

  spaceOn(dir: Direction): UnderlyingSpace | undefined {
    return (this.node as Placeable).spaceOn?.(dir);
  }

  /** The container carries the move (see the class doc). */
  place(): void {}
  pinAnchor(): void {}

  setExtent(axis: FancyDirection): void {
    this.refuseResize(axis);
  }
  setSizeOnly(axis: FancyDirection): void {
    this.refuseResize(axis);
  }

  private refuseResize(axis: FancyDirection): never {
    const dir = elaborateDirection(axis) === 0 ? "width" : "height";
    throw new Error(
      `Constraint: cannot set the ${dir} of "${this.name}" — it is nested ` +
        `inside another child of this layer, which already laid it out. ` +
        `Size-setting constraints need a direct child of the layer.`
    );
  }
}

/**
 * Offset of `node`'s box `min` from `container`'s box `min`, per axis, in the
 * container's frame: `node`'s own placed min in its parent, plus the
 * translates of every ancestor strictly between `node` and `container` (the
 * same accumulation `GoFishRef.layout` uses), minus the container's local min.
 */
export function nestedGap(
  node: GoFishAST,
  container: GoFishAST
): [number, number] {
  return ([0, 1] as const).map((i) => {
    let min =
      (node.localAnchor(i, "min") ?? 0) + (node.projectedTranslate(i) ?? 0);
    for (let a = node.parent; a && a !== container; a = a.parent) {
      min += a.projectedTranslate(i) ?? 0;
    }
    return min - (container.localAnchor(i, "min") ?? 0);
  }) as [number, number];
}

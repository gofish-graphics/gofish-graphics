import type { GoFishNode, Placeable } from "../_node";
import type { GoFishAST } from "../_ast";
import type { AxisMap } from "../domain";
import { isToken, type Token } from "../createName";

/** Anything the constraint system can address by name: a GoFishNode, a
 *  GoFishRef proxy, or a structural view of either. */
export type NamedNode = { _name?: string | Token };

export type Axis = "x" | "y";
export type Alignment = "start" | "middle" | "end";
/** Anchor for align/position constraints. The bbox anchors (`Alignment`) place
 *  a target by its extent; `"baseline"` places the target's own ORIGIN (its
 *  local coordinate 0) at the value. `align` itself only emits relations
 *  between anchors; if no explicit placement fixes the related component, the
 *  solver normalizes that floating component so its minimum coordinate is 0. */
export type AlignAnchor = Alignment | "baseline";

/** The align constraint's full per-axis value grammar (#726): a point anchor
 *  ({@link AlignAnchor}), or an interval statistic over the size cell —
 *  `"size"` (equate lengths only; the target does not move) or `"span"`
 *  (equate both endpoints: position AND size). `"span"`/`"size"` are align-only
 *  — they name a relation the target has no intrinsic size for, not a point on
 *  a box, so `position`/`distribute` do not accept them. */
export type AlignValue = AlignAnchor | "span" | "size";

/** Whether an align spec puts its targets at point anchors on its axis: one
 *  anchor, or one per target. `"span"` and `"size"` are interval statistics
 *  that write an unbound target, so they place nothing at a point. */
export const isPointAlign = (
  spec: AlignValue | AlignAnchor[] | undefined
): spec is AlignAnchor | AlignAnchor[] =>
  spec !== undefined && spec !== "span" && spec !== "size";

/**
 * A constraint operand. A name operand (a `.relate()` operand, a
 * `RelateOperand`) is a node NAME, resolved with the same lookup
 * `ref("name")` uses (`resolveScopedName`), starting at `scope`, the layer
 * whose `.relate()` bound it, or at the constrained layer when it has none.
 * A handle ({@link SlotOperand}, {@link NodeOperand}) is a reference a macro
 * (an operator, an elaboration pass) builds already resolved: it names no
 * one, so it can neither capture a user's name nor be captured by one, and
 * its {@link key} is known when it is built. `resolveReferences`
 * (`_ref.tsx`) writes a name operand's key each round. The placement solve
 * keys on the key, and `name` is only how the operand reads in a message.
 */
export interface ConstraintRef {
  readonly name: string;
  readonly scope?: GoFishNode;
  /** The `uid` of the node the operand resolved to (see {@link keyOf}). */
  key?: string;
}

/**
 * A macro's handle on a child of the layer it built: the child in slot
 * `slot` of `layer`. It resolves to whatever fills the slot, so a pass that
 * wraps the child in place (`children[i] = wrapper`) keeps it pointing at
 * the wrapper, as a slot of `_relateClauses` does.
 */
export class SlotOperand implements ConstraintRef {
  constructor(
    public readonly layer: GoFishNode,
    public readonly slot: number
  ) {}
  /** A handle is resolved when it is built: its key is the uid of the
   *  child in its slot now. */
  get key(): string | undefined {
    return this.layer.children[this.slot]?.uid;
  }
  /** How the operand reads in a message: the child's name, or its slot. */
  get name(): string {
    const child = this.layer.children[this.slot];
    return (child && childNameKey(child)) ?? `child ${this.slot + 1}`;
  }
}

/** The slot operand of `node`, a child of `layer`. */
export const slotOf = (layer: GoFishNode, node: GoFishAST): SlotOperand => {
  const slot = layer.children.indexOf(node);
  if (slot < 0)
    throw new Error("[gofish] slotOf: the node is not a child of the layer");
  return new SlotOperand(layer, slot);
};

/** A slot operand for every child of `layer`, in order. */
export const childSlots = (layer: GoFishNode): SlotOperand[] =>
  layer.children.map((_, i) => new SlotOperand(layer, i));

/** A macro's handle on one node it holds (a paint-order default of
 *  `applyRelationalZBelowDefaults`): it resolves to that node. */
export class NodeOperand implements ConstraintRef {
  constructor(public readonly node: GoFishAST) {}
  get key(): string {
    return this.node.uid;
  }
  get name(): string {
    return childNameKey(this.node) ?? `a "${this.node.type}" node`;
  }
}

/** The handle the placement solve keys `ref` by: the uid of the node it
 *  resolved to. Throws when no resolution has written it yet. */
export const keyOf = (ref: ConstraintRef): string => {
  if (ref.key === undefined)
    throw new Error(
      `[gofish] constraint operand "${ref.name}" is not resolved ` +
        `(resolveReferences has not run on its layer)`
    );
  return ref.key;
};

/** Per-axis data→pixel position maps, as built by `layer.tsx` and consumed
 *  by `Constraint.position` (a literal coordinate is a raw pixel; a `datum`
 *  coordinate is mapped through the matching map via `pxOf`). An entry is
 *  `undefined` exactly when the axis is unanchored — the position half of the
 *  single {@link AxisScale} carrier. */
export type ConstraintPosScales = [AxisMap | undefined, AxisMap | undefined];

/** Per-axis pixel at which a layer seats the baselines of its free (baseline
 *  magnitude) children (#773): the measure origin under the layer's data→pixel
 *  map when the layer is anchored (a sized layer's own solved frame included),
 *  0 for a free layer. Layer places unconstrained free children there; the
 *  solver's free-origin fallback (`solveAxisProblem`) seats a floating
 *  component's shared free baseline there. `undefined` where the layer has no
 *  origin on the axis. */
export type FreeOrigin = [number | undefined, number | undefined];

/** Convert axis name to dimension index (0 = x, 1 = y) */
export const axisIndex = (axis: Axis): 0 | 1 => (axis === "x" ? 0 : 1);

/** Convert dimension index to axis name (inverse of {@link axisIndex}). */
export const axisName = (axis: 0 | 1): Axis => (axis === 0 ? "x" : "y");

/** Key identifying one (axis, operand key) slot in the placement system. */
export const placementKey = (axis: Axis, key: string): string =>
  `${axis}:${key}`;

/** Check if a placeable has been placed on a given axis */
export const isPlacedOn = (p: Placeable, axisIdx: 0 | 1): boolean =>
  p.dims[axisIdx].min !== undefined;

/** Map each direct child's `uid` to its index, so a resolved operand
 *  (`keyOf`) finds the direct child it is, if it is one. Shared by the
 *  layer's constraint passes (nest plan, composition, sharing). */
export const buildChildIndex = (
  childNodes: readonly { uid: string }[]
): Map<string, number> => new Map(childNodes.map((c, i) => [c.uid, i]));

/** Normalize a node's _name (string or Token) to the string a name lookup
 * compares. Tokens contribute their `__tag`. */
export const childNameKey = (node: NamedNode): string | undefined => {
  const n = node._name;
  if (n === undefined) return undefined;
  return isToken(n) ? n.__tag : n;
};

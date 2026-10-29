import { GoFishNode, type Placeable } from "../_node";
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
 * A constraint operand: a handle on the nodes it means. A macro (an
 * operator, an elaboration pass) holds a slot of the layer it built
 * ({@link SlotOperand}) or a node ({@link NodeOperand}); a `.relate()`
 * operand (`RelateOperand`) holds the nodes its name meant when the call
 * bound it. A handle names no one, so it can neither capture a user's name
 * nor be captured by one. `resolveReferences` (`_ref.tsx`) reads every
 * operand of a layer once per round and keeps the result on the layer
 * (`ResolvedConstraints`). The placement solve keys on the node it means
 * ({@link KeyOf}), and `name` is only how the operand reads in a message.
 */
export interface ConstraintRef {
  readonly name: string;
  /** The nodes this operand means, read from `layer`, whose constraint
   *  holds it. */
  means(layer: GoFishNode): readonly GoFishAST[];
}

/** What a user's reference sees of `node`: `node`, or, for a ring an
 *  elaboration pass inserted (`_transparent`, built by `wrapRing`), its
 *  content, slot 0. A ring is its content: it takes no name, adds no
 *  depth, and its shapes (an axis, a label) are invisible to a lookup. */
export function contentOf(node: GoFishAST): GoFishAST {
  let cur = node;
  while (cur instanceof GoFishNode && cur._transparent) cur = cur.children[0];
  return cur;
}

/**
 * A macro's handle on a child of the layer it built: the child in slot
 * `slot` of `layer`. It resolves to whatever fills the slot, so a pass that
 * wraps the child in place (`replaceChild`) keeps it pointing at the
 * wrapper, as a slot of `_relateClauses` does.
 */
export class SlotOperand implements ConstraintRef {
  constructor(
    public readonly layer: GoFishNode,
    public readonly slot: number
  ) {}
  /** The child that fills this slot, seen from `layer`: a slot operand is a
   *  handle of the layer that built it, so any other layer, or an empty
   *  slot, is an error. */
  child(layer: GoFishNode): GoFishAST {
    const child = layer === this.layer ? layer.children[this.slot] : undefined;
    if (child === undefined)
      throw new Error(
        `[gofish] a slot operand of another layer, or of an empty slot ` +
          `(slot ${this.slot})`
      );
    return child;
  }
  means(layer: GoFishNode): readonly GoFishAST[] {
    return [this.child(layer)];
  }
  /** How the operand reads in a message: the name of the child's content
   *  (a ring a pass put in the slot takes no name), or its slot. */
  get name(): string {
    const child = this.layer.children[this.slot];
    return (
      (child && childNameKey(contentOf(child))) ?? `child ${this.slot + 1}`
    );
  }
}

/** A finder of slot operands of `layer`: the handle on the slot each of its
 *  children fills (`indexOfChild`). Throws on a node that is not one of
 *  them. */
export const slotOf =
  (layer: GoFishNode): ((node: GoFishAST) => SlotOperand) =>
  (node) => {
    const i = layer.indexOfChild(node);
    if (i === undefined)
      throw new Error("[gofish] slotOf: the node is not a child of the layer");
    return new SlotOperand(layer, i);
  };

/** A slot operand for every child of `layer`, in order. */
export const childSlots = (layer: GoFishNode): SlotOperand[] =>
  layer.children.map((_, i) => new SlotOperand(layer, i));

/** A macro's handle on one node it holds (a paint-order default of
 *  `applyRelationalZBelowDefaults`): it resolves to that node. */
export class NodeOperand implements ConstraintRef {
  constructor(public readonly node: GoFishAST) {}
  means(): readonly GoFishAST[] {
    return [this.node];
  }
  get name(): string {
    return childNameKey(this.node) ?? `a "${this.node.type}" node`;
  }
}

/** The handle the placement solve keys an operand by: the `uid` of the node
 *  one layer's last `resolveReferences` round resolved it to
 *  (`ResolvedConstraints.keyOf`). Throws on an operand that is not one of
 *  that layer's. */
export type KeyOf = (ref: ConstraintRef) => string;

/** A layer's resolved operands as a plan reads them (a layer's
 *  `ResolvedConstraints` is one): each operand's key, and the node each key
 *  resolved to, with the index of the direct child that is (`direct`) or
 *  holds it. */
export type ResolvedOperands = {
  keyOf: KeyOf;
  operands: ReadonlyMap<string, { child: number; direct: boolean }>;
};

/** The index of the direct child `ref` resolved to, or undefined when it
 *  resolved to a node inside one (a nested operand). */
export const directSlot = (
  { keyOf, operands }: ResolvedOperands,
  ref: ConstraintRef
): number | undefined => {
  const op = operands.get(keyOf(ref));
  return op?.direct ? op.child : undefined;
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

/** Normalize a node's _name (string or Token) to the string a name lookup
 * compares. Tokens contribute their `__tag`. */
export const childNameKey = (node: NamedNode): string | undefined => {
  const n = node._name;
  if (n === undefined) return undefined;
  return isToken(n) ? n.__tag : n;
};

import type { Placeable } from "../_node";
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

/**
 * A constraint operand: a node NAME, resolved at layout from the constrained
 * layer with the same lookup `ref("name")` uses (`resolveScopedName`), and the
 * operand's key in the placement solve.
 */
export type ConstraintRef = { readonly name: string };

/** Per-axis data→pixel position maps, as built by `layer.tsx` and consumed
 *  by `Constraint.position` (a literal coordinate is a raw pixel; a `datum`
 *  coordinate is mapped through the matching map via `pxOf`). An entry is
 *  `undefined` exactly when the axis is unanchored — the position half of the
 *  single {@link AxisScale} carrier. */
export type ConstraintPosScales = [AxisMap | undefined, AxisMap | undefined];

/** Convert axis name to dimension index (0 = x, 1 = y) */
export const axisIndex = (axis: Axis): 0 | 1 => (axis === "x" ? 0 : 1);

/** Convert dimension index to axis name (inverse of {@link axisIndex}). */
export const axisName = (axis: 0 | 1): Axis => (axis === 0 ? "x" : "y");

/** Key identifying one (axis, node name) slot in the placement system. */
export const placementKey = (axis: Axis, name: string): string =>
  `${axis}:${name}`;

/** Check if a placeable has been placed on a given axis */
export const isPlacedOn = (p: Placeable, axisIdx: 0 | 1): boolean =>
  p.dims[axisIdx].min !== undefined;

/** Normalize a node's _name (string or Token) to the string used as a key in
 * the Layer's nameToPlaceable and constraint refs. Tokens contribute their
 * `__tag`. */
export const childNameKey = (node: NamedNode): string | undefined => {
  const n = node._name;
  if (n === undefined) return undefined;
  return isToken(n) ? n.__tag : n;
};

let internalNameCount = 0;

/**
 * A fresh name for a node the library itself names so a constraint can refer
 * to it (an operator's child, an axis tier, a label). Unique per call, so it
 * can never equal a name a user wrote or another library name: a library name
 * never clashes with a user's `.name("…")` in the string-name lookup, and two
 * operators' names never make each other ambiguous.
 */
export const internalName = (kind: string): string =>
  `__${kind}#${++internalNameCount}`;

/**
 * Give every child a constraint name that is unique among the children and
 * return the names in order, so an operator that elaborates to
 * `layer(children).constrain(...)` (spread, scatter, table) can refer to each
 * child. A child the user named keeps its name; an unnamed child, or a second
 * child with the same user name (cut returns N slices that all carry the
 * source mark's name), gets an `internalName`. The data key is never used as a
 * name: it is data, not a name the user wrote. The (possibly new) name is
 * written back to `_name` ONLY when it changed, so an unchanged `createName`
 * Token survives for token-based `ref`/`selectAll`. A `ref` child is a
 * GoFishRef proxy (not a GoFishNode) but carries `_name` too.
 */
export const ensureChildNames = (
  children: GoFishAST[],
  prefix: string
): string[] => {
  const used = new Set<string>();
  return children.map((c) => {
    const existing = childNameKey(c);
    const nm =
      existing !== undefined && !used.has(existing)
        ? existing
        : internalName(prefix);
    used.add(nm);
    if (nm !== existing) c._name = nm;
    return nm;
  });
};

/** Map each direct child's name (`childNameKey`) to its index; first occurrence
 *  wins. Shared by the layer's constraint passes (nest plan, composition) to
 *  resolve `ConstraintRef`s against child positions. */
export const buildNameIndex = (
  childNodes: readonly NamedNode[]
): Map<string, number> => {
  const m = new Map<string, number>();
  for (let i = 0; i < childNodes.length; i++) {
    const name = childNameKey(childNodes[i]);
    if (name !== undefined && !m.has(name)) m.set(name, i);
  }
  return m;
};

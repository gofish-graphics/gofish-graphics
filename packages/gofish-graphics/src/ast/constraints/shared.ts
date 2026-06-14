import { GoFishNode, type Placeable } from "../_node";
import { GoFishRef } from "../_ref";
import type { GoFishAST } from "../_ast";
import { isToken } from "../createName";

export type Axis = "x" | "y";
export type Alignment = "start" | "middle" | "end";
/** Anchor for align/position constraints. The bbox anchors (`Alignment`) place
 *  a target by its extent; `"baseline"` places the target's own ORIGIN (its
 *  local coordinate 0) at the value. When no sibling is pre-placed the fallback
 *  is the axis origin — the scale's zero (`posScale(0)`) on a scaled axis, the
 *  layer origin on a pixel-pure one — so `align({y: "baseline"})` on a
 *  pixel-pure axis means "stay where you were laid out", regardless of how far
 *  the target's bbox extends past its origin (e.g. axis labels hanging below
 *  a chart's zero line). */
export type AlignAnchor = Alignment | "baseline";

/** Lightweight handle for referencing a named child inside .constrain() */
export type ConstraintRef = { readonly name: string };

/** Per-axis data→pixel position scales, as built by `layer.tsx` and consumed
 *  by `Constraint.position` (a literal coordinate is a raw pixel; a `datum`
 *  coordinate is mapped through the matching scale). */
export type ConstraintPosScales = [
  ((value: number) => number) | undefined,
  ((value: number) => number) | undefined,
];

/** Convert axis name to dimension index (0 = x, 1 = y) */
export const axisIndex = (axis: Axis): 0 | 1 => (axis === "x" ? 0 : 1);

/** Check if a placeable has been placed on a given axis */
export const isPlacedOn = (p: Placeable, axisIdx: 0 | 1): boolean =>
  p.dims[axisIdx].min !== undefined;

/** Normalize a node's _name (string or Token) to the string used as a key in
 * the Layer's nameToPlaceable and constraint refs. Tokens contribute their
 * `__tag`. */
export const childNameKey = (node: GoFishAST): string | undefined => {
  if (!("_name" in node)) return undefined;
  const n = (node as GoFishNode)._name;
  if (n === undefined) return undefined;
  return isToken(n) ? n.__tag : n;
};

/**
 * Give every child a UNIQUE constraint name and return the names in order, so an
 * operator that elaborates to `layer(children).constrain(...)` (spread, scatter)
 * can reference each child. Reuses an existing name/key; else synthesizes
 * `__${prefix}_${i}`. Two subtleties both elaborations need (and both got wrong
 * before being shared):
 *   - `||` not `??`: an EMPTY-string name is as useless as a missing one (it's
 *     falsy, so the layer's phase-1 `!childName` guard would baseline-place a
 *     constraint target).
 *   - duplicates are disambiguated (cut returns N slices that all carry the
 *     source mark's name — without this they collapse onto one placeable).
 * The (possibly new) name is written back to `_name` ONLY when it changed, so an
 * unchanged `createName` Token survives for token-based `ref`/`selectAll`. A
 * `ref` child is a GoFishRef proxy (not a GoFishNode) but carries `_name` too.
 */
export const ensureChildNames = (
  children: GoFishAST[],
  prefix: string
): string[] => {
  const used = new Set<string>();
  return children.map((c, i) => {
    const existing = childNameKey(c);
    let nm =
      existing || (c instanceof GoFishNode && c.key) || `__${prefix}_${i}`;
    if (used.has(nm)) nm = `${nm}__${prefix}_${i}`;
    used.add(nm);
    if (nm !== existing && (c instanceof GoFishNode || c instanceof GoFishRef))
      c._name = nm;
    return nm;
  });
};

/** Map each direct child's name (`childNameKey`) to its index; first occurrence
 *  wins. Shared by the layer's constraint passes (nest plan, composition) to
 *  resolve `ConstraintRef`s against child positions. */
export const buildNameIndex = (
  childNodes: GoFishAST[]
): Map<string, number> => {
  const m = new Map<string, number>();
  for (let i = 0; i < childNodes.length; i++) {
    const name = childNameKey(childNodes[i]);
    if (name !== undefined && !m.has(name)) m.set(name, i);
  }
  return m;
};

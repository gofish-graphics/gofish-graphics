// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { ConstraintSpec } from ".";
import type { Dimensions, Size } from "../dims";
import { isNestConstraint, nestedSpace, type NestConstraint } from "./nest";
import type { UnderlyingSpace } from "../underlyingSpace";

type NamedChild = {
  _name?: string | { __tag: string };
  key?: string;
  args?: { dims?: [{ size?: unknown }, { size?: unknown }] };
  children?: readonly unknown[];
};

export type NestPlanChild = NamedChild;

const childNameKey = (node: NestPlanChild): string | undefined => {
  const n = node._name;
  if (n === undefined) return undefined;
  return typeof n === "string" ? n : n.__tag;
};

const buildNameIndex = (childNodes: NestPlanChild[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (let i = 0; i < childNodes.length; i++) {
    const name = childNameKey(childNodes[i]);
    if (name !== undefined && !m.has(name)) m.set(name, i);
  }
  return m;
};

// ── Nest pre-pass ───────────────────────────────────────────────────────────
//
// `Constraint.nest` is a two-of-three size relation on each constrained axis:
// `outer = inner + 2·padding`, with padding always known. So per axis the
// unknown is which of {outer, inner} is derived from the other, dispatched on
// which side carries the size:
//   inner sized, outer not  → 'in'   INSIDE_OUT  (outer = inner + 2p; boxes)
//   outer sized, inner not  → 'out'  OUTSIDE_IN  (inner = outer − 2p; padding)
//   neither sized           → 'out'  OUTSIDE_IN  (the layer sizes outer — a
//                             distribute slice or the layer box as a fill child
//                             — then inner = outer − 2p)
//   both sized              → CENTER_ONLY (no derivation; only center inner —
//                             over-determination checked for two literal-px sizes)
//
// "Sized" here means the node carries a definite, non-fill extent on the axis:
// an own declared size (`args.dims[axis].size` — literal px or data-driven
// `value(v)`), a composite that shrink-wraps to its content (any node with
// children — a nested box, a stack, a layer), or the inside-out-derived outer of
// another same-layer nest. A claim-less leaf is the only "fill": it stretches to
// its proposal, which is what makes the neither-sized case outside-in.
//
// A nest resolves ONE direction; 'in' on one axis and 'out' on the other is
// rejected (mixed). The plan emits a directed edge per non-CENTER nest
// (source → derived) and a topological layout order (source before derived).
// The space-resolution fold derives a space only from an 'in' edge whose inner
// is SIZE; the layout proposal reads every edge. Single-ownership is enforced
// per (derivedNode, axis). See size-claims.md "Dimension B".

export type NestEdge = {
  derivedIdx: number;
  sourceIdx: number;
  /** 'in' = inside-out (outer derived from inner); 'out' = outside-in (inner
   *  derived from outer). */
  dir: "in" | "out";
  padX?: number;
  padY?: number;
};

export type NestPlan = {
  /** derivedChildIndex → edges deriving it (one per axis-group); read by the
   *  space fold and the layout proposal. */
  byDerived: Map<number, NestEdge[]>;
  /** Child layout order with source before derived (topological); cycles throw. */
  order: number[];
};

type NestLayoutSource = {
  dims: Dimensions;
};

/** Apply a planned nest size proposal after the source children have concrete
 *  layout dimensions. The plan still decides dependency direction/order; this
 *  helper is deliberately just the layout-time arithmetic:
 *
 *    inside-out: outer = inner + 2·padding
 *    outside-in: inner = outer − 2·padding
 *
 *  Non-derived axes keep the caller's normal proposal. */
export function applyNestLayoutProposal(
  baseSize: Size,
  edges: readonly NestEdge[] | undefined,
  sources: readonly NestLayoutSource[]
): Size {
  if (edges === undefined) return baseSize;
  const next: Size = [baseSize[0], baseSize[1]];
  for (const e of edges) {
    const sourceDims = sources[e.sourceIdx].dims;
    const sign = e.dir === "in" ? 1 : -1;
    if (e.padX !== undefined)
      next[0] = Math.max(0, (sourceDims[0].size ?? 0) + sign * 2 * e.padX);
    if (e.padY !== undefined)
      next[1] = Math.max(0, (sourceDims[1].size ?? 0) + sign * 2 * e.padY);
  }
  return next;
}

/** Apply the nest space-resolution fold to child spaces.
 *
 * Only INSIDE_OUT edges (`dir: "in"`) derive a space: `outer = inner +
 * 2·padding` when the inner axis is a SIZE/baseline magnitude. OUTSIDE_IN is
 * purely a layout-time size proposal, so it deliberately derives no space here.
 * The returned child-space array is a copy; the input is never mutated. */
export function applyNestSpacePlan(
  childSpaces: readonly Size<UnderlyingSpace>[],
  nestPlan: NestPlan | undefined
): Size<UnderlyingSpace>[] {
  if (nestPlan === undefined) return [...childSpaces];
  const effectiveChildren = childSpaces.map(
    (s) => [s[0], s[1]] as Size<UnderlyingSpace>
  );
  for (const i of nestPlan.order) {
    for (const e of nestPlan.byDerived.get(i) ?? []) {
      if (e.dir !== "in") continue;
      const sourceSpaces = effectiveChildren[e.sourceIdx];
      if (e.padX !== undefined)
        effectiveChildren[i][0] = nestedSpace(
          effectiveChildren[i][0],
          sourceSpaces[0],
          e.padX
        );
      if (e.padY !== undefined)
        effectiveChildren[i][1] = nestedSpace(
          effectiveChildren[i][1],
          sourceSpaces[1],
          e.padY
        );
    }
  }
  return effectiveChildren;
}

/** Classify each nest by which side carries the size, resolve a single
 *  resolution direction per nest, validate single-ownership and
 *  over-determination, and topologically sort the layout order (source before
 *  derived). Returns undefined when the layer has no size-deriving nest
 *  (the common path, and CENTER_ONLY-only nests, stay on the untouched
 *  proposal path — their centering is handled by the placement solver). */
export function buildNestPlan(
  childNodes: NestPlanChild[],
  constraints: ConstraintSpec[]
): NestPlan | undefined {
  // Common case: no nest constraints — bail before allocating anything.
  if (!constraints.some(isNestConstraint)) return undefined;
  const nests = constraints.filter(isNestConstraint);

  const indexByName = buildNameIndex(childNodes);

  type ResolvedNest = {
    c: NestConstraint;
    outerName: string;
    innerName: string;
    outerIdx: number;
    innerIdx: number;
  };
  const resolved: ResolvedNest[] = [];
  for (const c of nests) {
    const outerName = c.children[0].name;
    const innerName = c.children[1].name;
    const outerIdx = indexByName.get(outerName);
    const innerIdx = indexByName.get(innerName);
    // A ref into a nested tier has no direct slot here — nothing to size.
    if (outerIdx === undefined || innerIdx === undefined) continue;
    resolved.push({ c, outerName, innerName, outerIdx, innerIdx });
  }

  // Per-axis outer→inner adjacency over resolved nests, for the `sized`
  // recursion. An outer may nest multiple children. Treat the outer as sized if
  // ANY same-axis inner is independently sized; using a single outer→inner map
  // made chained nests declaration-order-sensitive because later constraints
  // overwrote earlier candidates before ownership validation.
  const nestedInnersByAxis: [
    Map<number, Set<number>>,
    Map<number, Set<number>>,
  ] = [new Map(), new Map()];
  const addNestedInner = (axis: 0 | 1, outerIdx: number, innerIdx: number) => {
    const inners = nestedInnersByAxis[axis].get(outerIdx) ?? new Set<number>();
    inners.add(innerIdx);
    nestedInnersByAxis[axis].set(outerIdx, inners);
  };
  for (const r of resolved) {
    if (r.c.x !== undefined) addNestedInner(0, r.outerIdx, r.innerIdx);
    if (r.c.y !== undefined) addNestedInner(1, r.outerIdx, r.innerIdx);
  }

  /** The node's own declared size on `axis` (literal px or `value(v)`), or
   *  undefined when it is a fill/derived child. */
  const ownSize = (idx: number, axis: 0 | 1) => {
    const n = childNodes[idx];
    return n.args?.dims?.[axis]?.size;
  };
  // A composite (any node with children — a stack, a layer, a nested
  // box) shrink-wraps to its content, so it carries a definite extent without
  // declaring `args.dims`. A claim-less leaf is the only fill.
  const isComposite = (idx: number): boolean => {
    const n = childNodes[idx];
    return (n.children?.length ?? 0) > 0;
  };
  // Is `idx`'s extent on `axis` determined independently of an enclosing nest?
  // True for an own size, a composite, or an inside-out-derived outer. The last
  // makes nested same-layer inside-out chains resolve inside-out at every level.
  // Well-founded on the acyclic outer→inner graph; cycles are caught by the topo
  // sort below.
  const sizedMemo = new Map<string, boolean>();
  const sized = (idx: number, axis: 0 | 1): boolean => {
    if (ownSize(idx, axis) !== undefined) return true;
    if (isComposite(idx)) return true;
    const innerIdxs = nestedInnersByAxis[axis].get(idx);
    if (innerIdxs === undefined) return false;
    const key = `${idx}:${axis}`;
    const cached = sizedMemo.get(key);
    if (cached !== undefined) return cached;
    sizedMemo.set(key, false); // break self-reference on a rejected cycle
    const result = [...innerIdxs].some((innerIdx) => sized(innerIdx, axis));
    sizedMemo.set(key, result);
    return result;
  };

  const edges: NestEdge[] = [];
  // (derivedIdx, axis) → the nest that derives it; at most one (single owner).
  const ownerOf = new Map<
    string,
    { derivedName: string; sourceName: string }
  >();

  for (const { c, outerName, innerName, outerIdx, innerIdx } of resolved) {
    // Classify each constrained axis, then resolve ONE direction. A nest may
    // not mix 'in' and 'out'.
    let hasIn = false;
    let hasOut = false;
    const derivedAxes: { axis: 0 | 1; pad: number }[] = [];
    for (const axis of [0, 1] as const) {
      const pad = axis === 0 ? c.x : c.y;
      if (pad === undefined) continue; // unconstrained axis

      const outerSized = ownSize(outerIdx, axis) !== undefined;
      const innerSized = sized(innerIdx, axis);

      if (innerSized && outerSized) {
        // BOTH sized → CENTER_ONLY: no derivation, just center in the placement
        // solver. Verify consistency only when both are literal px — a
        // data-driven or composite side may legitimately resolve to anything.
        const inner = ownSize(innerIdx, axis);
        const outer = ownSize(outerIdx, axis);
        if (
          typeof inner === "number" &&
          typeof outer === "number" &&
          Math.abs(outer - (inner + 2 * pad)) > 1e-6
        ) {
          throw new Error(
            `Constraint.nest: outer "${outerName}" (${outer}) and inner ` +
              `"${innerName}" (${inner}) over-determine the ${
                axis === 0 ? "x" : "y"
              } axis: inner + 2·${pad} = ${inner + 2 * pad} ≠ ${outer}. ` +
              `Drop one of the two sizes.`
          );
        }
        continue; // CENTER_ONLY contributes no edge on this axis
      }

      // inner sized → inside-out; otherwise (outer sized, or neither: the layer
      // sizes the outer) → outside-in.
      if (innerSized) hasIn = true;
      else hasOut = true;
      derivedAxes.push({ axis, pad });
    }

    // All constrained axes were CENTER_ONLY → no size derivation (centering
    // still happens in the placement solver).
    if (derivedAxes.length === 0) continue;

    if (hasIn && hasOut) {
      throw new Error(
        `Constraint.nest: inner is sized on one axis and outer on the ` +
          `other (inner "${innerName}", outer "${outerName}") — mixed ` +
          `inside-out/outside-in is not supported; split into two nests ` +
          `or size consistently.`
      );
    }
    const dir: "in" | "out" = hasIn ? "in" : "out";

    // 'in' (inside-out) derives the outer from the inner; 'out' (outside-in)
    // derives the inner from the outer.
    const derivedIsOuter = dir === "in";
    const derivedIdx = derivedIsOuter ? outerIdx : innerIdx;
    const sourceIdx = derivedIsOuter ? innerIdx : outerIdx;
    const derivedName = derivedIsOuter ? outerName : innerName;
    const sourceName = derivedIsOuter ? innerName : outerName;

    const edge: NestEdge = { derivedIdx, sourceIdx, dir };
    for (const { axis, pad } of derivedAxes) {
      // Single owner: at most one nest may derive a given (node, axis).
      const key = `${derivedIdx}:${axis}`;
      const prev = ownerOf.get(key);
      if (prev !== undefined) {
        throw new Error(
          `Constraint.nest: child "${derivedName}" is sized by two nest ` +
            `constraints on the ${axis === 0 ? "x" : "y"} axis (from ` +
            `"${prev.sourceName}" and "${sourceName}") — a box may be sized by ` +
            `at most one nest per axis.`
        );
      }
      ownerOf.set(key, { derivedName, sourceName });
      if (axis === 0) edge.padX = pad;
      else edge.padY = pad;
    }
    edges.push(edge);
  }

  if (edges.length === 0) return undefined;

  const byDerived = new Map<number, NestEdge[]>();
  for (const e of edges) {
    const arr = byDerived.get(e.derivedIdx) ?? [];
    arr.push(e);
    byDerived.set(e.derivedIdx, arr);
  }

  // Topological layout order: a derived node depends on its source(s), so each
  // source must precede it. Cycles (A nests B nests A) throw with the index chain.
  const order: number[] = [];
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (i: number, stack: number[]): void => {
    if (visited.has(i)) return;
    if (visiting.has(i)) {
      throw new Error(
        `Constraint.nest cycle detected through child indices ${[
          ...stack,
          i,
        ].join(" → ")}`
      );
    }
    visiting.add(i);
    for (const e of byDerived.get(i) ?? []) visit(e.sourceIdx, [...stack, i]);
    visiting.delete(i);
    visited.add(i);
    order.push(i);
  };
  for (let i = 0; i < childNodes.length; i++) visit(i, []);

  return { byDerived, order };
}

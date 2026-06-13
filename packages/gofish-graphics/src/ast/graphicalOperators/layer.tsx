// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import * as Monotonic from "../../util/monotonic";
import { GoFishNode } from "../_node";
import { isToken } from "../createName";
import { Size, elaborateDims, FancyDims } from "../dims";
import {
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  isPOSITION,
  isSIZE,
  isUNDEFINED,
  spaceMeasure,
} from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { computeSize, foldFinite } from "../../util";
import { posScaleFromSpace } from "../domain";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { coord } from "../coordinateTransforms/coord";
import { createNodeOperatorSequential } from "../withGoFish";
import { GoFishAST } from "../_ast";
import {
  applyConstraints,
  collectPositionDomains,
  containedSpace,
  getPositioningConstraintRefs,
  isContainConstraint,
  isZOrderConstraint,
  type ConstraintPosScales,
  type ConstraintSpec,
  type ContainConstraint,
  type ZOrderConstraint,
} from "../constraints";
import {
  distributeSpaceFold,
  type DistributeConstraint,
} from "../constraints/distribute";
import { alignSpaceFold, type AlignConstraint } from "../constraints/align";
import { allocateSlices } from "../constraints/folds";
import { axisIndex } from "../constraints/shared";
import { isValue } from "../data";
import { unionChildSpaces } from "./alignment";

/** Normalize a node's _name (string or Token) to the string used as a key in
 * the Layer's nameToPlaceable and constraint refs. Tokens contribute their
 * `__tag`. */
const childNameKey = (node: GoFishAST): string | undefined => {
  if (!("_name" in node)) return undefined;
  const n = (node as GoFishNode)._name;
  if (n === undefined) return undefined;
  return isToken(n) ? n.__tag : n;
};

// ── Contain pre-pass ────────────────────────────────────────────────────────
//
// `Constraint.contain` is a two-of-three size relation on each constrained
// axis: `outer = inner + 2·padding`, with padding always known. So per axis the
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
// "Sized" here means the node carries a *definite, non-fill* extent on the axis:
// an own declared size (`args.dims[axis].size` — literal px or data-driven
// `value(v)`), a composite that shrink-wraps to its content (any node with
// children — a nested contained box, a stack, a layer), or the inside-out-
// derived outer of another same-layer contain. A claim-less *leaf* (a bare
// rect/ellipse with no size) is the only "fill": it stretches to its proposal,
// which is what makes the neither-sized case outside-in. This is the structural
// reading of the firing model (layout-synthesis.md Part 3): an intrinsic inner
// fires inside-out, a fill inner fires outside-in.
//
// A contain resolves ONE direction; 'in' on one axis and 'out' on the other is
// rejected (mixed). The plan emits a directed edge per non-CENTER contain
// (source → derived) and a topological layout order (source before derived).
// The space-resolution fold derives a space only from an 'in' edge whose inner
// is SIZE; the layout proposal reads every edge. Single-ownership is enforced
// per (derivedNode, axis). See size-claims.md "Dimension B".

type ContainEdge = {
  derivedIdx: number;
  sourceIdx: number;
  /** 'in' = inside-out (outer derived from inner); 'out' = outside-in (inner
   *  derived from outer). */
  dir: "in" | "out";
  padX?: number;
  padY?: number;
};

type ContainPlan = {
  edges: ContainEdge[];
  /** derivedChildIndex → edges deriving it (one per axis-group); read by the
   *  space fold and the layout proposal. */
  byDerived: Map<number, ContainEdge[]>;
  /** Child layout order with source before derived (topological); cycles throw. */
  order: number[];
};

/** Classify each contain by which side carries the size, resolve a single
 *  resolution direction per contain, validate single-ownership and
 *  over-determination, and topologically sort the layout order (source before
 *  derived). Returns undefined when the layer has no size-deriving contain
 *  (the common path, and CENTER_ONLY-only contains, stay on the untouched
 *  proposal path — their centering is handled by `applyContain`). */
function buildContainPlan(
  childNodes: GoFishAST[],
  constraints: ConstraintSpec[]
): ContainPlan | undefined {
  const contains = constraints.filter(isContainConstraint);
  if (contains.length === 0) return undefined;

  const indexByName = new Map<string, number>();
  for (let i = 0; i < childNodes.length; i++) {
    const name = childNameKey(childNodes[i]);
    if (name !== undefined && !indexByName.has(name)) indexByName.set(name, i);
  }

  type ResolvedContain = {
    c: ContainConstraint;
    outerName: string;
    innerName: string;
    outerIdx: number;
    innerIdx: number;
  };
  const resolved: ResolvedContain[] = [];
  for (const c of contains) {
    const outerName = c.children[0].name;
    const innerName = c.children[1].name;
    const outerIdx = indexByName.get(outerName);
    const innerIdx = indexByName.get(innerName);
    // A ref into a nested tier has no direct slot here — nothing to size.
    if (outerIdx === undefined || innerIdx === undefined) continue;
    resolved.push({ c, outerName, innerName, outerIdx, innerIdx });
  }

  // Per-axis outer→inner map over resolved contains, for the `sized` recursion.
  const outerInnerByAxis: [Map<number, number>, Map<number, number>] = [
    new Map(),
    new Map(),
  ];
  for (const r of resolved) {
    if (r.c.x !== undefined) outerInnerByAxis[0].set(r.outerIdx, r.innerIdx);
    if (r.c.y !== undefined) outerInnerByAxis[1].set(r.outerIdx, r.innerIdx);
  }

  /** The node's own declared size on `axis` (literal px or `value(v)`), or
   *  undefined when it is a fill/derived child. */
  const ownSize = (idx: number, axis: 0 | 1) => {
    const n = childNodes[idx];
    return n instanceof GoFishNode ? n.args?.dims?.[axis]?.size : undefined;
  };
  // A composite (any node with children — a stack, a layer, a nested contained
  // box) shrink-wraps to its content, so it carries a definite extent without
  // declaring `args.dims`. A claim-less *leaf* (a bare rect) is the only fill.
  const isComposite = (idx: number): boolean => {
    const n = childNodes[idx];
    return n instanceof GoFishNode && n.children.length > 0;
  };
  // Is `idx`'s extent on `axis` determined independently of an enclosing
  // contain (i.e. NOT a fill)? True for an own size, a composite, or an
  // inside-out-derived outer (the outer of a contain whose inner is itself
  // sized) — the last makes nested same-layer inside-out chains resolve
  // inside-out at every level. Well-founded on the (acyclic) outer→inner DAG;
  // cycles are caught by the topo sort below.
  const sizedMemo = new Map<string, boolean>();
  const sized = (idx: number, axis: 0 | 1): boolean => {
    if (ownSize(idx, axis) !== undefined) return true;
    if (isComposite(idx)) return true;
    const innerIdx = outerInnerByAxis[axis].get(idx);
    if (innerIdx === undefined) return false;
    const key = `${idx}:${axis}`;
    const cached = sizedMemo.get(key);
    if (cached !== undefined) return cached;
    sizedMemo.set(key, false); // break self-reference on a (rejected) cycle
    const result = sized(innerIdx, axis);
    sizedMemo.set(key, result);
    return result;
  };

  const edges: ContainEdge[] = [];
  // (derivedIdx, axis) → the contain that derives it; at most one (single owner).
  const ownerOf = new Map<
    string,
    { derivedName: string; sourceName: string }
  >();

  for (const { c, outerName, innerName, outerIdx, innerIdx } of resolved) {
    // Classify each constrained axis, then resolve ONE direction. A contain may
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
        // BOTH sized → CENTER_ONLY: no derivation, just center (applyContain).
        // Verify consistency only when both are literal px — a data-driven or
        // composite side may legitimately resolve to anything.
        const inner = ownSize(innerIdx, axis);
        const outer = ownSize(outerIdx, axis);
        if (
          typeof inner === "number" &&
          typeof outer === "number" &&
          Math.abs(outer - (inner + 2 * pad)) > 1e-6
        ) {
          throw new Error(
            `Constraint.contain: outer "${outerName}" (${outer}) and inner ` +
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
    // still happens via applyContain).
    if (derivedAxes.length === 0) continue;

    if (hasIn && hasOut) {
      throw new Error(
        `Constraint.contain: inner is sized on one axis and outer on the ` +
          `other (inner "${innerName}", outer "${outerName}") — mixed ` +
          `inside-out/outside-in is not supported; split into two contains ` +
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

    const edge: ContainEdge = { derivedIdx, sourceIdx, dir };
    for (const { axis, pad } of derivedAxes) {
      // Single owner: at most one contain may derive a given (node, axis).
      const key = `${derivedIdx}:${axis}`;
      const prev = ownerOf.get(key);
      if (prev !== undefined) {
        throw new Error(
          `Constraint.contain: child "${derivedName}" is sized by two contain ` +
            `constraints on the ${axis === 0 ? "x" : "y"} axis (from ` +
            `"${prev.sourceName}" and "${sourceName}") — a box may be sized by ` +
            `at most one contain per axis.`
        );
      }
      ownerOf.set(key, { derivedName, sourceName });
      if (axis === 0) edge.padX = pad;
      else edge.padY = pad;
    }
    edges.push(edge);
  }

  if (edges.length === 0) return undefined;

  const byDerived = new Map<number, ContainEdge[]>();
  for (const e of edges) {
    const arr = byDerived.get(e.derivedIdx) ?? [];
    arr.push(e);
    byDerived.set(e.derivedIdx, arr);
  }

  // Topological layout order: a derived node depends on its source(s), so each
  // source must precede it. Cycles (A contains B contains A) throw with the
  // index chain.
  const order: number[] = [];
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (i: number, stack: number[]): void => {
    if (visited.has(i)) return;
    if (visiting.has(i)) {
      throw new Error(
        `Constraint.contain cycle detected through child indices ${[
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

  return { edges, byDerived, order };
}

// ── Spread-shape recognition: the operator image of layer constraints ───────
//
// Constraints are normally pure post-layout positioners. `spread`, by contrast,
// also folds its children's underlying spaces into a composed claim (a Monotonic
// sum + spacing on the stack axis via `distributeSpaceFold`, an alignment fold
// on the cross axis via `alignSpaceFold`) so a parent can invert that claim to
// auto-fit, and at layout time it *sizes* its children from a budget (the flex
// fragment, `allocateSlices`). This recognizer detects when a layer's
// constraints form that same operator image and reproduces both halves, so
// `layer + align + distribute` is geometrically identical to `spread`.
//
// The recognized image: exactly ONE `distribute` (optionally `glue`), at most
// one cross-axis `align` with a uniform string anchor, and nothing else (no
// `position` / z-order). This is the same guard the prototype used minus the
// "distribute covers every child" requirement: children NOT covered by the
// distribute are unconstrained siblings that overlay (max-union with the
// distribute's claim). The structural guards keep every existing constraint set
// untouched — axis-elaboration layers carry `position` constraints, and the
// legend layer carries two `align`s, so both fall out of the image and keep
// their `unionChildSpaces` behavior. Anything beyond the image (multiple
// distributes per axis, distribute + position on one axis) likewise falls back
// to `unionChildSpaces`; the general max-plus composition that would handle it
// is the residual in
// apps/docs/docs/internals/design/constraints-as-core.md ("Composition and
// conflict semantics").

/** Distribute budget descriptor, stashed by `resolveUnderlyingSpace` and
 *  consumed by `layout` to solve a scale factor and propose per-child sizes. */
type DistributeBudget = {
  dAxis: 0 | 1;
  /** Already glue-zeroed (see createDistributeConstraint). */
  spacing: number;
  /** Names of the distribute targets, in placement order. */
  order: string[];
  /** The folded SIZE Monotonic on the distribute axis, if the fold was SIZE —
   *  inverted against the layer's allotted size to derive the child scale
   *  factor (auto-fit). Absent for glue/POSITION/ORDINAL/UNDEFINED folds. */
  sizeDomain?: Monotonic.Monotonic;
};

type SpreadShape = {
  /** Per-axis space overrides; undefined leaves the default union in place. */
  spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined];
  budget: DistributeBudget;
};

/** Build a per-axis Size carrying `space` on `axis` and UNDEFINED elsewhere, so
 *  a single space can be fed to `unionChildSpaces` as a pseudo-child. */
const axisSize = (
  space: UnderlyingSpace,
  axis: 0 | 1
): Size<UnderlyingSpace> =>
  axis === 0 ? [space, UNDEFINED] : [UNDEFINED, space];

/** Max-union a folded claim with any unconstrained siblings' spaces on `axis`
 *  (the distribute's claim and overlay siblings co-occupy the layer box, so
 *  the extent is their union). With no siblings this returns `claim`
 *  unchanged — preserving exact parity with spread for the covers-all image. */
function maxUnionWith(
  claim: UnderlyingSpace,
  others: UnderlyingSpace[],
  axis: 0 | 1
): UnderlyingSpace {
  if (others.length === 0) return claim;
  return unionChildSpaces(
    [axisSize(claim, axis), ...others.map((s) => axisSize(s, axis))],
    axis
  );
}

function resolveSpreadShape(
  constraints: ConstraintSpec[],
  childNodes: GoFishAST[],
  childSpaces: Size<UnderlyingSpace>[]
): SpreadShape | undefined {
  if (constraints.length === 0) return undefined;
  const distributes = constraints.filter((c) => c.type === "distribute");
  const aligns = constraints.filter((c) => c.type === "align");
  // Operator image: exactly one distribute, at most one align, nothing else.
  // Any `position`/z-order constraint is a different layout regime.
  if (distributes.length !== 1) return undefined;
  if (aligns.length > 1) return undefined;
  if (distributes.length + aligns.length !== constraints.length) {
    return undefined;
  }

  const indexByName = new Map<string, number>();
  for (let i = 0; i < childNodes.length; i++) {
    const name = childNameKey(childNodes[i]);
    if (name !== undefined && !indexByName.has(name)) indexByName.set(name, i);
  }
  const keyOf = (i: number): string | undefined =>
    childNodes[i] instanceof GoFishNode
      ? (childNodes[i] as GoFishNode).key
      : undefined;

  const dist = distributes[0] as DistributeConstraint;
  const dAxis = axisIndex(dist.dir);
  const aAxis = (1 - dAxis) as 0 | 1;

  // Distribute targets in placement order (matches applyDistribute's `order`).
  // Every target must be a direct child (so we can slice it); a ref into a
  // nested tier has no slot here, so bail to the general union.
  const order = (
    dist.order === "reverse" ? [...dist.children].reverse() : dist.children
  ).map((r) => r.name);
  if (!order.every((n) => indexByName.has(n))) return undefined;
  const dIdx = order.map((n) => indexByName.get(n)!);
  const coveredSet = new Set(dIdx);

  const foldD = distributeSpaceFold(
    dIdx.map((i) => childSpaces[i][dAxis]),
    dIdx.map(keyOf),
    { spacing: dist.spacing, mode: dist.mode, glue: dist.glue }
  );

  // Unconstrained siblings (children outside the distribute) overlay the
  // distribute's claim on both axes.
  const otherSpaces = (axis: 0 | 1): UnderlyingSpace[] =>
    childSpaces.filter((_, i) => !coveredSet.has(i)).map((c) => c[axis]);

  const spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined] = [
    undefined,
    undefined,
  ];
  if (!isUNDEFINED(foldD)) {
    spaces[dAxis] = maxUnionWith(foldD, otherSpaces(dAxis), dAxis);
  }

  // Optional cross-axis align: a single uniform anchor on the distribute's
  // cross axis only (a per-child anchor array or a same-axis spec has no single
  // spread equivalent). Folded over the children the align covers.
  if (aligns.length === 1) {
    const al = aligns[0] as AlignConstraint;
    const anchor = aAxis === 0 ? al.x : al.y;
    const distAxisSpec = dAxis === 0 ? al.x : al.y;
    const aIdx = al.children
      .map((r) => indexByName.get(r.name))
      .filter((i): i is number => i !== undefined);
    if (
      typeof anchor === "string" &&
      distAxisSpec === undefined &&
      aIdx.length > 0
    ) {
      const foldA = alignSpaceFold(
        aIdx.map((i) => childSpaces[i][aAxis]),
        anchor
      );
      if (!isUNDEFINED(foldA)) {
        spaces[aAxis] = maxUnionWith(foldA, otherSpaces(aAxis), aAxis);
      }
    }
  }

  return {
    spaces,
    budget: {
      dAxis,
      spacing: dist.spacing,
      order,
      sizeDomain: isSIZE(foldD) ? foldD.domain : undefined,
    },
  };
}

// ── Z-order resolution ────────────────────────────────────────────────────
//
// When a layer has `Constraint.zAbove` / `zBelow` constraints, it flattens
// its (non-component) subtree into a single paint list, topologically sorts
// it against the constraints, and emits the result in resolved order.

type PaintItem = {
  node: GoFishAST;
  /** Sum of skipped-ancestor translates between this layer and the hoisted
   *  element. Applied as a `<g transform="translate(…)">` wrapper at emit. */
  accTranslate: [number, number];
  /** Position in the flattened default order (used as a stable tiebreaker). */
  defaultOrder: number;
  /** Existing numeric `_zOrder` hint (used as the primary tiebreaker so
   *  `node.zOrder(-1)` still pushes a node toward the back by default). */
  defaultZ: number;
};

function flattenForZOrder(children: GoFishAST[]): PaintItem[] {
  const out: PaintItem[] = [];
  let order = 0;
  walk(children, 0, 0);
  return out;

  // NB: only translates are accumulated across transparent ancestors. A
  // non-component nested layer that also carries `options.transform.scale`
  // would hoist its children with the right translate but the *wrong*
  // resolved size, since the scale isn't propagated here. No current story
  // mixes z-order constraints with scaled inner layers; revisit if one does.
  function walk(cs: GoFishAST[], accTx: number, accTy: number): void {
    for (const child of cs) {
      if (!(child instanceof GoFishNode)) {
        out.push({
          node: child,
          accTranslate: [accTx, accTy],
          defaultOrder: order++,
          defaultZ: 0,
        });
        continue;
      }
      // Plain (non-component) nested layers are transparent for paint
      // ordering — their children are hoisted into this paint context.
      if (!child._isComponent && child.type === "layer") {
        const cTx = accTx + (child.transform?.translate?.[0] ?? 0);
        const cTy = accTy + (child.transform?.translate?.[1] ?? 0);
        walk(child.children, cTx, cTy);
      } else {
        out.push({
          node: child,
          accTranslate: [accTx, accTy],
          defaultOrder: order++,
          defaultZ: child.getZOrder(),
        });
      }
    }
  }
}

function topoSortByZOrder(
  items: PaintItem[],
  constraints: ZOrderConstraint[]
): PaintItem[] {
  const n = items.length;

  // name → indices. Descent through nested layers can theoretically produce
  // duplicates if names collide; we apply the constraint to all matches.
  const nameToIndices = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const node = items[i].node;
    if (node instanceof GoFishNode && node._name !== undefined) {
      const raw = node._name;
      const name = isToken(raw) ? raw.__tag : raw;
      const arr = nameToIndices.get(name);
      if (arr) arr.push(i);
      else nameToIndices.set(name, [i]);
    }
  }

  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  const inDegree: number[] = new Array(n).fill(0);
  const addEdge = (from: number, to: number) => {
    if (from === to) return;
    if (!adj[from].has(to)) {
      adj[from].add(to);
      inDegree[to]++;
    }
  };

  for (const c of constraints) {
    const aName = c.children[0].name;
    const bName = c.children[1].name;
    const aIdx = nameToIndices.get(aName) ?? [];
    const bIdx = nameToIndices.get(bName) ?? [];
    for (const ai of aIdx) {
      for (const bi of bIdx) {
        // zAbove(a, b): a paints LATER (over b) → edge b → a
        // zBelow(a, b): a paints EARLIER (under b) → edge a → b
        if (c.type === "zAbove") addEdge(bi, ai);
        else addEdge(ai, bi);
      }
    }
  }

  // Stable topo sort: among eligible nodes, pick by (defaultZ, defaultOrder).
  const cmp = (i: number, j: number): number =>
    items[i].defaultZ - items[j].defaultZ ||
    items[i].defaultOrder - items[j].defaultOrder;

  const eligible: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) eligible.push(i);
  }

  const result: PaintItem[] = [];
  const emitted = new Array<boolean>(n).fill(false);
  while (eligible.length > 0) {
    eligible.sort(cmp);
    const i = eligible.shift()!;
    result.push(items[i]);
    emitted[i] = true;
    for (const j of adj[i]) {
      inDegree[j]--;
      if (inDegree[j] === 0) eligible.push(j);
    }
  }

  if (result.length < n) {
    const remaining = [];
    for (let i = 0; i < n; i++) {
      if (!emitted[i]) {
        const node = items[i].node;
        const raw = node instanceof GoFishNode ? node._name : undefined;
        const name =
          raw === undefined ? "(unnamed)" : isToken(raw) ? raw.__tag : raw;
        remaining.push(name);
      }
    }
    throw new Error(
      `z-order constraints form a cycle; could not order: ${remaining.join(", ")}`
    );
  }

  return result;
}

export const layer = createNodeOperatorSequential(
  async (
    childrenOrOptions:
      | ({
          key?: string;
          coord?: CoordinateTransform;
          transform?: { scale?: { x?: number; y?: number } };
          box?: boolean;
        } & FancyDims)
      | GoFishAST[],
    maybeChildren?: GoFishAST[]
  ) => {
    const options = Array.isArray(childrenOrOptions) ? {} : childrenOrOptions;
    const children = Array.isArray(childrenOrOptions)
      ? childrenOrOptions
      : maybeChildren || [];

    // If coord is provided, delegate to coord transform (similar to frame but without transform/box)
    if (!Array.isArray(childrenOrOptions) && options.coord !== undefined) {
      const {
        coord: coordTransform,
        key,
        transform: _transform,
        box: _box,
        ...restDims
      } = options;
      return coord(
        {
          key,
          transform: coordTransform,
          ...restDims,
        },
        children.filter((c): c is GoFishNode => c instanceof GoFishNode)
      );
    }

    const dims = elaborateDims(options);

    // SELF-SCALING REGIONS. When this layer is given an explicit pixel size on
    // a dim, it becomes a self-contained scaling region on that dim: its scales
    // resolve against its own box at layout time, exactly like the root resolves
    // against the canvas ("a chart embeds the way it renders"). So in
    // `resolveUnderlyingSpace` the real POSITION/SIZE space is stashed here and
    // UNDEFINED is reported upward — a parent layer's union then ignores this
    // axis rather than polluting a shared domain with foreign units (e.g. a
    // marginal histogram's count axis vs. the center's data units). `layout`
    // reads the stash back to build the LOCAL scale. The reported space is
    // UNDEFINED for now; issue #508's proposed CONSTANT kind is the eventual
    // home for "known fixed pixel extent". Indexed [x, y]; last write wins if
    // resolveUnderlyingSpace runs more than once.
    const selfScaledSpaces: [
      UnderlyingSpace | undefined,
      UnderlyingSpace | undefined,
    ] = [undefined, undefined];

    // Distribute budget descriptor from the recognized spread shape, stashed by
    // `resolveUnderlyingSpace` and consumed by `layout` to invert the composed
    // SIZE against the allotted size and propose per-child slices.
    let constraintBudget: DistributeBudget | undefined;

    return new GoFishNode(
      {
        type: options.box === true ? "box" : "layer",
        key: options.key,
        shared: [false, false],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[],
          _shared: Size<boolean>,
          constraints
        ) => {
          // Apply layer's own transform.scale to any SIZE spaces produced
          // by unionChildSpaces (the SIZE-preserving overlay path).
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const applyScale = (
            space: UnderlyingSpace,
            scale: number
          ): UnderlyingSpace =>
            isSIZE(space) && scale !== 1
              ? SIZE(Monotonic.smul(scale, space.domain), space.measure)
              : space;

          // Contain space fold: only INSIDE_OUT edges (`dir: 'in'`) derive a
          // space — `outer = inner + 2·padding` when inner is SIZE — so a
          // contained pair participates in the union below, hence in a parent's
          // auto-fit solve. Computed in dependency (source-first) order so
          // chained contains compose (A⊇B⊇C: C feeds B feeds A). OUTSIDE_IN
          // edges derive NOTHING here: the outer is a normal child whose own
          // claim (or fill/undefined) flows through the union, and `inner =
          // outer − 2p` is purely a layout-time proposal. When inner isn't SIZE,
          // `containedSpace` leaves outer as-is and the proposal handles sizing.
          const containPlan = buildContainPlan(_childNodes, constraints ?? []);
          let effectiveChildren = children;
          if (containPlan !== undefined) {
            effectiveChildren = children.map(
              (s) => [s[0], s[1]] as Size<UnderlyingSpace>
            );
            for (const i of containPlan.order) {
              for (const e of containPlan.byDerived.get(i) ?? []) {
                if (e.dir !== "in") continue;
                const sourceSpaces = effectiveChildren[e.sourceIdx];
                if (e.padX !== undefined)
                  effectiveChildren[i][0] = containedSpace(
                    effectiveChildren[i][0],
                    sourceSpaces[0],
                    e.padX
                  );
                if (e.padY !== undefined)
                  effectiveChildren[i][1] = containedSpace(
                    effectiveChildren[i][1],
                    sourceSpaces[1],
                    e.padY
                  );
              }
            }
          }

          // `position` constraints contribute a POSITION-domain fragment per
          // axis: the union of their data values is this layer's domain on that
          // axis, merged with any POSITION domain bubbled up from children. This
          // is what lets the layer build a position scale at layout time so
          // `Constraint.position` can map data values to pixels.
          const posDomains = collectPositionDomains(constraints ?? []);
          const resolveAxis = (
            axis: 0 | 1,
            scale: number,
            iv: Interval.Interval | undefined
          ): UnderlyingSpace => {
            const base = applyScale(
              unionChildSpaces(effectiveChildren, axis),
              scale
            );
            if (iv === undefined) return base;
            const merged =
              isPOSITION(base) && base.domain
                ? Interval.unionAll(base.domain, iv)
                : iv;
            // `position`-constraint datum domains (iv) are untagged — measure
            // flows from the children's POSITION (if any), permissively.
            return POSITION(merged, spaceMeasure(base));
          };
          const resolved: [UnderlyingSpace, UnderlyingSpace] = [
            resolveAxis(0, scaleX, posDomains.x),
            resolveAxis(1, scaleY, posDomains.y),
          ];

          // A simple spread expressed as align + distribute. When the
          // constraints match that operator image (see resolveSpreadShape),
          // override the constrained axes with spread's own space folds (SIZE
          // sum + spacing on the distribute axis, the alignment fold on the
          // cross axis). Applied BEFORE the self-scaling stash below so an
          // explicit-size layer builds its LOCAL scale from the folded space,
          // exactly like spread.
          const shape = resolveSpreadShape(
            constraints ?? [],
            _childNodes,
            effectiveChildren
          );
          constraintBudget = shape?.budget;
          if (shape) {
            for (const axis of [0, 1] as const) {
              const s = shape.spaces[axis];
              if (s !== undefined) resolved[axis] = s;
            }
          }

          // Stash the absorbed POSITION/SIZE space and report UNDEFINED upward
          // for any dim with an explicit pixel size — self-scaling region; see
          // selfScaledSpaces above. (last write wins — may run more than once.)
          selfScaledSpaces[0] = undefined;
          selfScaledSpaces[1] = undefined;
          for (const axis of [0, 1] as const) {
            if (dims[axis].size === undefined) continue;
            const sp = resolved[axis];
            // DIFFERENCE/ORDINAL unions are left untouched (no stash).
            if ((isPOSITION(sp) && sp.domain) || isSIZE(sp)) {
              selfScaledSpaces[axis] = sp;
              resolved[axis] = UNDEFINED;
            }
          }
          return resolved;
        },
        layout: (shared, size, scaleFactors, children, posScales, node) => {
          // Compute size using dims (w and h) before passing to children
          size = [
            computeSize(dims[0].size, scaleFactors?.[0]!, size[0]) ?? size[0],
            computeSize(dims[1].size, scaleFactors?.[1]!, size[1]) ?? size[1],
          ];

          // Build the LOCAL scale for each self-scaled (stashed) dim against our
          // own pixel box — see selfScaledSpaces above. The recipe (cf. the
          // gofish.tsx root): POSITION → a posScale mapping the stashed domain
          // onto [0, size]; SIZE → a scale factor inverting the Monotonic against
          // size. A POSITION stash touches only `basePosScales`; a SIZE stash
          // only `childScaleFactors`. When the size can't be resolved (NaN) we
          // leave the inherited value, degrading to the inherited path rather
          // than emitting NaN scales.
          //
          // `basePosScales` is reused below as the floor for `effectivePosScales`
          // and the per-child forwarding (`childScalesFor`), so the override
          // applies regardless of `ownsPositionAxis`. `childScaleFactors` is a
          // fresh array — never mutate the parent's `scaleFactors` (unlike
          // spread, which mutates intentionally for sibling sharing).
          const basePosScales: ConstraintPosScales = [
            posScales[0],
            posScales[1],
          ];
          const childScaleFactors: Size<number | undefined> = [
            scaleFactors?.[0],
            scaleFactors?.[1],
          ];
          for (const dim of [0, 1] as const) {
            const stashed = selfScaledSpaces[dim];
            if (stashed === undefined || !Number.isFinite(size[dim])) continue;
            if (isPOSITION(stashed)) {
              basePosScales[dim] =
                posScaleFromSpace(stashed, size[dim]) ?? posScales[dim];
            } else if (isSIZE(stashed)) {
              childScaleFactors[dim] =
                stashed.domain.inverse(size[dim]) ?? scaleFactors?.[dim];
            }
          }

          // Layer budget solve for a recognized spread shape. When the
          // distribute fold composed a SIZE claim, invert it against this
          // layer's resolved size on the distribute axis to derive the child
          // scale factor (the same Monotonic.inverse recipe as the selfScaled
          // path, but driven by the *allotted* size, not only an explicit
          // w/h, and passing `upperBoundGuess` like spread does). Idempotent
          // with the root's own inversion of the same SIZE.
          if (
            constraintBudget?.sizeDomain &&
            Number.isFinite(size[constraintBudget.dAxis])
          ) {
            const dAxis = constraintBudget.dAxis;
            const sf = constraintBudget.sizeDomain.inverse(size[dAxis], {
              upperBoundGuess: size[dAxis],
            });
            if (sf !== undefined) childScaleFactors[dAxis] = sf;
            else
              // A non-invertible fold-produced Monotonic would otherwise
              // silently vanish the content (spread's `?? 0`); name the axis and
              // budget so the failure is visible, then keep the inherited factor.
              console.warn(
                `layer: could not invert distribute SIZE claim on ${
                  dAxis === 0 ? "x" : "y"
                } axis for budget ${size[dAxis]}px; keeping inherited scale factor.`,
                constraintBudget
              );
          }

          // Per-child proposed size for the distribute-covered children: the
          // fill policy (`allocateSlices`) — an equal slice each — on the
          // distribute axis, the full size on the cross axis. A child carrying
          // its own explicit size ignores this (its size wins), matching
          // spread; a claim-less child consumes the slice.
          const sliceByName: Map<string, number> | undefined = constraintBudget
            ? (() => {
                const b = constraintBudget;
                const slices = allocateSlices(
                  size[b.dAxis],
                  b.spacing,
                  b.order.length
                );
                const m = new Map<string, number>();
                b.order.forEach((name, i) => m.set(name, slices[i]));
                return m;
              })()
            : undefined;
          const childSizeFor = (childName: string | undefined): Size => {
            if (
              !constraintBudget ||
              childName === undefined ||
              !sliceByName!.has(childName)
            ) {
              return size;
            }
            const sliced: Size = [size[0], size[1]];
            sliced[constraintBudget.dAxis] = sliceByName!.get(childName)!;
            return sliced;
          };

          // `position` constraints with a datum coordinate contribute a data
          // domain on their axis (see collectPositionDomains); the union is what
          // those constraints resolve against. `ownsAxis` is consumed again by
          // the per-child posScale forwarding below (`childScalesFor`).
          const constraintDomains = collectPositionDomains(node.constraints);
          const ownsAxis: [boolean, boolean] = [
            constraintDomains.x !== undefined,
            constraintDomains.y !== undefined,
          ];
          const ownsPositionAxis = ownsAxis[0] || ownsAxis[1];

          // Scale for resolving this layer's datum `position` constraints: an
          // inherited posScale, else a local one mapping the layer's own
          // POSITION domain onto its pixel size (the shared fallback recipe,
          // `posScaleFromSpace` — scatter uses the same one). Only built when
          // the layer actually owns such an axis — it is used solely by
          // applyConstraints below, not passed to children.
          const space = node._underlyingSpace;
          // `basePosScales` (the inherited scales with any self-scaled dim
          // overridden — see selfScaledSpaces above) is the floor here.
          const effectivePosScales: ConstraintPosScales = ownsPositionAxis
            ? [
                basePosScales[0] ?? posScaleFromSpace(space?.[0], size[0]),
                basePosScales[1] ?? posScaleFromSpace(space?.[1], size[1]),
              ]
            : [basePosScales[0], basePosScales[1]];

          const childPlaceables: ReturnType<
            (typeof children)[number]["layout"]
          >[] = new Array(children.length);

          // Collect *positioning* constraint refs only — children skipped
          // here forgo phase-1 baseline placement so a constraint can place
          // them. Z-order constraints don't position; including them here
          // would erroneously rob their referents of baseline placement.
          const constrainedNames =
            node.constraints.length > 0
              ? getPositioningConstraintRefs(node.constraints)
              : new Set<string>();

          // Contain layout order: source before derived, so the derived node
          // can be proposed `source.dims ± 2·padding` on its constrained axes
          // (see buildContainPlan / the contain fold in resolveUnderlyingSpace).
          const containPlan = buildContainPlan(node.children, node.constraints);
          const layoutOrder = containPlan?.order ?? children.map((_, i) => i);

          // Per-AXIS targets of *datum*-pinned `position` constraints (e.g. axis
          // ticks pinned via `Constraint.position({ y: datum(v) })`). A datum pin
          // consumes the scale, so the target must not also receive it; a literal
          // *pixel* pin (`Constraint.position({ y: 0 })`) does not consume the
          // scale, so it's deliberately NOT tracked here — content pinned at its
          // raw pixel origin still needs its posScale. Tracked per axis, not
          // per child: a child pinned on one axis may still need the scale on
          // the other (an axis line position-seated on its cross axis resolves
          // its own-axis datum endpoints through the scale).
          const positionTargetDims = new Map<string, Set<0 | 1>>();
          for (const c of node.constraints) {
            if (c.type === "position") {
              for (const r of c.children) {
                if (!r) continue;
                const dims = positionTargetDims.get(r.name) ?? new Set();
                if (c.x !== undefined && isValue(c.x)) dims.add(0);
                if (c.y !== undefined && isValue(c.y)) dims.add(1);
                positionTargetDims.set(r.name, dims);
              }
            }
          }

          // Per-child posScales on the axes this layer owns. The blanket
          // suppression of a layer-owned axis is too coarse for elaborated axes:
          // the wrapped *content* may be POSITION (e.g. a scatter) and genuinely
          // needs the shared scale, while the *ticks* (position-constraint
          // targets) and any SIZE content must not get it (a posScale leaking
          // into a SIZE spread makes its alignment skip placing children). So on
          // an owned axis, forward `effectivePosScales` only to a non-target
          // child whose own space on that axis is POSITION; otherwise suppress.
          const childScalesFor = (
            i: number,
            targetDims: Set<0 | 1> | undefined
          ): ConstraintPosScales => {
            const sp = (children[i] as GoFishNode)._underlyingSpace;
            const pick = (dim: 0 | 1) => {
              // Non-owned axis: forward the inherited scale, or the local one
              // for a self-scaled (stashed) dim (basePosScales folds that in).
              if (!ownsAxis[dim]) return basePosScales[dim];
              if (targetDims?.has(dim)) return undefined; // placed by the constraint
              return sp && isPOSITION(sp[dim])
                ? effectivePosScales[dim]
                : undefined;
            };
            return [pick(0), pick(1)];
          };

          for (const i of layoutOrder) {
            const child = children[i];
            const childName = childNameKey(node.children[i]);
            const targetDims =
              childName !== undefined
                ? positionTargetDims.get(childName)
                : undefined;
            // Contain proposal: override the DERIVED node's size from its
            // SOURCE on each derived axis — `outer = inner + 2p` for 'in',
            // `inner = outer − 2p` for 'out'. The source is already laid out
            // (ahead of us in layoutOrder, since the plan orders source before
            // derived). Clamp ≥ 0; non-derived axes keep the normal proposal
            // (`childSizeFor`), so contain composes with — and wins on its
            // derived axes over — any budget slice.
            let layoutSize: Size = childSizeFor(childName);
            const containEdges = containPlan?.byDerived.get(i);
            if (containEdges !== undefined) {
              const next: Size = [layoutSize[0], layoutSize[1]];
              for (const e of containEdges) {
                const sourceDims = childPlaceables[e.sourceIdx].dims;
                const sign = e.dir === "in" ? 1 : -1;
                if (e.padX !== undefined)
                  next[0] = Math.max(
                    0,
                    (sourceDims[0].size ?? 0) + sign * 2 * e.padX
                  );
                if (e.padY !== undefined)
                  next[1] = Math.max(
                    0,
                    (sourceDims[1].size ?? 0) + sign * 2 * e.padY
                  );
              }
              layoutSize = next;
            }
            const childPlaceable = child.layout(
              layoutSize,
              childScaleFactors,
              childScalesFor(i, targetDims)
            );
            if (!childName || !constrainedNames.has(childName)) {
              childPlaceable.place("x", 0, "baseline");
              childPlaceable.place("y", 0, "baseline");
            }
            childPlaceables[i] = childPlaceable;
          }

          if (node.constraints.length > 0) {
            // Constraint-based placement:
            // Build name -> placeable map from named children
            const nameToPlaceable = new Map<
              string,
              (typeof childPlaceables)[number]
            >();
            for (let i = 0; i < node.children.length; i++) {
              const childName = childNameKey(node.children[i]);
              if (childName !== undefined) {
                nameToPlaceable.set(childName, childPlaceables[i]);
              }
            }

            // Apply constraints in declaration order. When a constraint has no
            // pre-placed target, fall back to this layer's own box baselines.
            applyConstraints(
              node.constraints,
              nameToPlaceable,
              size,
              effectivePosScales
            );

            // Place any child the constraints left unplaced at the layer's
            // baseline origin — consistent with the phase-1 baseline placement
            // of unconstrained children. A ref-consuming child (e.g. connect)
            // that must observe constrained siblings should live in an outer
            // tier laid out after them (see notes/nested-layer-tiers.md), not
            // rely on a re-layout pass here.
            for (const cp of childPlaceables) {
              if (cp.dims[0].min === undefined) cp.place("x", 0, "baseline");
              if (cp.dims[1].min === undefined) cp.place("y", 0, "baseline");
            }
          } else {
            // Default layer behavior: place all children at (0, 0)
            for (const cp of childPlaceables) {
              cp.place("x", 0);
              cp.place("y", 0);
            }
          }

          // Calculate the bounding box of all children (NaN-safe; see
          // foldFinite for why undefined extents are skipped).
          const minX = foldFinite(
            childPlaceables.map((cp) => cp.dims[0].min),
            Math.min
          );
          const maxX = foldFinite(
            childPlaceables.map((cp) => cp.dims[0].max),
            Math.max
          );
          const minY = foldFinite(
            childPlaceables.map((cp) => cp.dims[1].min),
            Math.min
          );
          const maxY = foldFinite(
            childPlaceables.map((cp) => cp.dims[1].max),
            Math.max
          );

          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;

          const translateY =
            dims[1].min !== undefined ? dims[1].min - minY : undefined;

          return {
            intrinsicDims: [
              {
                min: minX,
                size: maxX - minX,
                center: minX + (maxX - minX) / 2,
                max: maxX,
              },
              {
                min: minY,
                size: maxY - minY,
                center: minY + (maxY - minY) / 2,
                max: maxY,
              },
            ],
            transform: {
              translate: [
                dims[0].min !== undefined ? dims[0].min - minX : undefined,
                translateY,
              ],
              scale: [scaleX, scaleY],
            },
          };
        },
        render: ({ transform, coordinateTransform }, children, node) => {
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const wrapTransform = `translate(${transform?.translate?.[0] ?? 0}, ${
            transform?.translate?.[1] ?? 0
          }) scale(${scaleX}, ${scaleY})`;

          // Z-order resolution: when this layer carries any zAbove/zBelow
          // constraints, flatten the (non-component) subtree and emit in
          // topologically-resolved order. Otherwise, keep the existing
          // (zOrder, index) sort over already-rendered children.
          const zConstraints: ZOrderConstraint[] = (
            node.constraints ?? []
          ).filter(isZOrderConstraint);

          if (zConstraints.length === 0) {
            const orderedChildren = children
              .map((child, index) => ({
                child,
                index,
                zOrder:
                  node.children[index] instanceof GoFishNode
                    ? (node.children[index] as GoFishNode).getZOrder()
                    : 0,
              }))
              .sort((a, b) => a.zOrder - b.zOrder || a.index - b.index)
              .map(({ child }) => child);
            return <g transform={wrapTransform}>{orderedChildren}</g>;
          }

          const flat = flattenForZOrder(node.children);
          const sorted = topoSortByZOrder(flat, zConstraints);
          return (
            <g transform={wrapTransform}>
              {sorted.map((item) => {
                const rendered = item.node.INTERNAL_render(coordinateTransform);
                if (item.accTranslate[0] === 0 && item.accTranslate[1] === 0) {
                  return rendered;
                }
                return (
                  <g
                    transform={`translate(${item.accTranslate[0]}, ${item.accTranslate[1]})`}
                  >
                    {rendered}
                  </g>
                );
              })}
            </g>
          );
        },
      },
      children
    );
  }
);

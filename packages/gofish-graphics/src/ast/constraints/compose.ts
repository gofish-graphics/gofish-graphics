// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── Per-axis constraint composition: the operator image of layer constraints ─
//
// This module owns how a layer composes its constraints into a per-axis claim
// (the *space fold*) plus a layout-time *budget* for sizing covered children.
// It is the single seam the Layer (`layer.tsx`) calls; the general max-plus
// composition algebra (issue #547) lands here as a body swap.
//
// Constraints are normally pure post-layout positioners. `spread`, by contrast,
// also folds its children's underlying spaces into a composed claim (a Monotonic
// sum + spacing on the stack axis via `distributeSpaceFold`, an alignment fold
// on the cross axis via `alignSpaceFold`) so a parent can invert that claim to
// auto-fit, and at layout time it *sizes* its children from a budget (the flex
// fragment, `allocateSlices`). This module detects when a layer's constraints
// form that same operator image and reproduces both halves, so
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

import * as Monotonic from "../../util/monotonic";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { Size } from "../dims";
import {
  UNDEFINED,
  UnderlyingSpace,
  isSIZE,
  isUNDEFINED,
} from "../underlyingSpace";
import { unionChildSpaces } from "../graphicalOperators/alignment";
import { type ConstraintSpec } from ".";
import { distributeSpaceFold, type DistributeConstraint } from "./distribute";
import { alignSpaceFold, type AlignConstraint } from "./align";
import { axisIndex, childNameKey } from "./shared";

/** Distribute budget descriptor, stashed by `resolveUnderlyingSpace` and
 *  consumed by `layout` to solve a scale factor and propose per-child sizes. */
export type DistributeBudget = {
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

export type SpreadShape = {
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

export function composeConstraintSpaces(
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

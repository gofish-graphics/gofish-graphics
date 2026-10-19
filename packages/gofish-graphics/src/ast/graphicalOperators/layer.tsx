// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  GoFishNode,
  placeUnplacedChild,
  warnLayout,
  type ToPixel,
} from "../_node";
import { fixedOverflowInside, spacingOverflow } from "../layoutWarnings";
import type { DisplayList } from "gofish-ir";
import { shadowCheckScaleRoot } from "../solver/shadow";
import { getScopeRegistry, seatInScope } from "../solver/scopes";
import { isToken } from "../createName";
import {
  Size,
  elaborateDims,
  deferAxisDims,
  FancyDims,
  displayTranslate,
} from "../dims";
import {
  UnderlyingSpace,
  isCONTINUOUS,
  isUNDEFINED,
  magnitude,
} from "../underlyingSpace";
import { Extent, hullExtent, impliedExtent, mapsDomain } from "../extent";
import * as Monotonic from "../../util/monotonic";
import type { KeyedDomains } from "../keyedDomains";
import { isValue } from "../data";
import { computeSize, foldFinite } from "../../util";
import { axisScale } from "../domain";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { coord } from "../coordinateTransforms/coord";
import { bakeChildren } from "../coordinateTransforms/bake";
import { createNodeOperatorSequential } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { NestedOperand, nestedGap } from "../constraints/nestedOperand";
import { fromFrameStart, orientView, rawPlaceable } from "../axisDirection";
import type { RigidAttachment } from "../constraints/placementSolver";
import {
  applyConstraints,
  resolveConstraintOperands,
  type ResolvedOperand,
  collectPositionDomains,
  gridSpaces,
  resolveGridTracks,
  gridCellSizeByName,
  gridTracksFromSizes,
  Constraint,
  relateScheduleForLayout,
  type ConstraintSpec,
  type ZOrderConstraint,
} from "../constraints";
import { GoFishRef, findPathToRoot } from "../_ref";
import {
  axisIndex,
  childNameKey,
  internalName,
  type ConstraintPosScales,
  type FreeOrigin,
} from "../constraints/shared";
import {
  applyNestExtentPlan,
  applyNestLayoutProposal,
  applyNestSpacePlan,
  buildNestPlan,
} from "../constraints/nestPlan";
import {
  composePlanExtents,
  composePlanSpaces,
  planConstraintComposition,
  planSharing,
  type LayerSharingPlan,
  resolveLayerAxisExtent,
  resolveLayerBaseSpaces,
  type ComposeBudget,
} from "../constraints/compose";
import {
  buildDistributeSliceMap,
  buildLayerConstraintLayoutPlan,
  buildChildProposals,
  placementConstraints,
  childLayoutSizeProposal,
  childPosScalesFor,
  selectGridConstraint,
  solveLayerScales,
} from "../constraints/proposalPlan";
import {
  actsOn,
  constrainedOn,
  literalSeats,
  placeByClaims,
  type ClaimChild,
  type ClaimPlacement,
  type Placement,
} from "../constraints/claimPlacement";
import { placementIn } from "../placementClaims";
import {
  guttersAroundPlot,
  guttersInSlot,
  seatPastGutters,
} from "../chromeGutters";

// ── Z-order resolution ────────────────────────────────────────────────────
//
// A layer's `Constraint.zAbove` / `zBelow` constraints order its direct
// children (`orderChildrenForPaint` in paintOrder.ts): each operand lifts to
// the child that contains it, and a constraint whose operands share a child is
// pushed down into that child's own order, whatever kind of node the child is
// (every node that paints its children orders them through the same function).

/** Find every relational-mark connector node (tagged `__relationalOperands`
 *  by `createRelationalMark`, chart.ts) anywhere in `node`'s subtree that
 *  hasn't already been claimed by an inner enclosing layer. Bounded to
 *  `GoFishNode`s (a ref carries no children of its own). */
function findUnclaimedConnectors(node: GoFishAST, out: GoFishNode[]): void {
  if (!(node instanceof GoFishNode)) return;
  if ((node as any).__relationalOperands) out.push(node);
  for (const child of node.children ?? []) {
    findUnclaimedConnectors(child, out);
  }
}

/** The node identity of a `GoFishAST` (a ref's target, or the node itself). */
export function targetOf(n: GoFishAST): GoFishNode | undefined {
  return n instanceof GoFishRef ? n.targetNode : (n as GoFishNode);
}

/** Give `node` a resolvable constraint name if it doesn't already have one
 *  (a fresh `internalName`, as `ensureChildNames` does). */
function ensureConstraintName(node: GoFishNode): string {
  if (node._name !== undefined) {
    return typeof node._name === "string" ? node._name : internalName("z");
  }
  node._name = internalName("z");
  return node._name;
}

/**
 * Install the default `zBelow(connector, operand)` paint-order constraint for
 * every relational-mark connector (`line`, `ribbon`, …) found anywhere in
 * `children`'s subtrees, against whichever of `children` contains the node(s)
 * it references — in EVERY call form (bag, pairwise, `by`-split, and the
 * low-level explicit-children form), since all of them route through the same
 * `createRelationalMark` tagging (chart.ts). No dispatch on mark kind here:
 * any node carrying the tag participates.
 *
 * A connector whose author already set an explicit `.zOrder(...)` (including
 * `.zOrder(0)` — the unset state is `undefined`, so any explicit call counts
 * as an author decision) or `.relate(...)` (a non-empty constraints array)
 * is left alone — the explicit choice wins over the default.
 *
 * A connector whose referenced node lies outside `children`'s subtrees (e.g.
 * both live several `.layer()` tiers up) is left tagged so an OUTER `layer()`
 * call gets a chance to resolve it — the tag is only cleared once consumed.
 *
 * Returns the auto-derived zBelow constraints (merged with any that already
 * existed on `node` — there are none for a freshly built layer, but this
 * stays defensive) to install via `node.relate(...)`-equivalent direct
 * assignment (this runs before any user `.relate()` chain, which replaces
 * `constraints` wholesale and so always wins over the default, matching the
 * "explicit override" rule).
 */
function applyRelationalZBelowDefaults(
  node: GoFishNode,
  children: GoFishAST[]
): void {
  const connectors: GoFishNode[] = [];
  for (const child of children) findUnclaimedConnectors(child, connectors);
  if (connectors.length === 0) return;

  const pairs: [string, string][] = [];
  for (const connector of connectors) {
    const operands: GoFishAST[] | undefined = (connector as any)
      .__relationalOperands;
    if (!operands) continue;
    // Explicit author override (zOrder hint or their own constraints) wins.
    if (
      connector.getZOrder() !== undefined ||
      connector.constraints.length > 0
    ) {
      delete (connector as any).__relationalOperands;
      continue;
    }
    let claimedAny = false;
    for (const operand of operands) {
      const target = targetOf(operand);
      if (!target) continue;
      // Only claim an operand that actually lives within `children`'s
      // subtrees at this level (found via an ancestor walk against
      // `children`) — otherwise leave the tag for an outer `layer()` call to
      // resolve. The constraint names the operand itself: paint order lifts
      // it to whichever child holds it, or pushes it down when the connector
      // shares that child. Names are visible through any non-component node.
      const path = findPathToRoot(target);
      const withinScope = children.some(
        (c) => c !== connector && path.includes(c as GoFishAST)
      );
      if (!withinScope) continue;
      // An operand that is itself a plain layer (a `layer([...])` mark, a
      // `time.history`) names that whole layer, so the connector goes under
      // everything it paints.
      pairs.push([
        ensureConstraintName(connector),
        ensureConstraintName(target),
      ]);
      claimedAny = true;
    }
    // Consumed (fully or partially) at this level — don't let an outer layer
    // re-process it. An operand this level couldn't place (e.g. it lives
    // further up the tree) is simply not constrained; that's a rarer shape
    // than the sibling-tier case this covers.
    if (claimedAny) delete (connector as any).__relationalOperands;
  }
  if (pairs.length === 0) return;
  const refs: Record<string, { name: string }> = {};
  for (const [a, b] of pairs) {
    refs[a] ??= { name: a };
    refs[b] ??= { name: b };
  }
  const zBelowConstraints = pairs.map(([a, b]) =>
    Constraint.zBelow(refs[a], refs[b])
  );
  node.constraints = [...node.constraints, ...zBelowConstraints];
}

const sum = ([a, b]: [number, number]) => a + b;

/** `child`'s plot claim (`GoFishNode.resolvePlotExtent`) in `parent`'s axis
 *  order. A child that reads y the other way is read reflected: its box is
 *  the same, and its plot lies at the other end of it. */
const plotIn = (
  child: GoFishNode,
  parent: GoFishNode
): Size<Extent | undefined> => {
  const plot = child.resolvePlotExtent();
  const full = child.resolveExtent();
  if (plot === full || child.yFrame.direction === parent.yFrame.direction)
    return plot;
  const [f, p] = [full[1], plot[1]];
  if (f === undefined || p === undefined || f === p) return plot;
  // Reflected about the box `[−d, a]`: x ↦ (a − d) − x.
  const { add, negate } = Monotonic;
  const span = add(f.ascent, negate(f.descent));
  return [plot[0], Extent(add(span, p.descent), add(negate(span), p.ascent))];
};

/** The pixels a chart's chrome adds around its plot on `axis`, for a chart
 *  with a size of its own `px` there. A chart's own `w`/`h` is its plot
 *  without chrome (#1032), and its chrome dresses its content, the chart
 *  frame's one child (`frameChart`), so the chart is that size plus the
 *  gutters its content's claims give around a plot of that size. 0 for any
 *  other node. */
const chartChrome = (node: GoFishNode, axis: 0 | 1, px: number): number => {
  const content = node.children[0];
  return node._chartBox?.[axis] === true &&
    content instanceof GoFishNode &&
    content.chrome !== undefined
    ? sum(guttersAroundPlot(content, axis, px))
    : 0;
};

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

    // SIZED NODES (#1114). A layer with a size of its own on an axis (a
    // literal `w`/`h`, or a data-valued one) is a sized node there: at layout
    // it maps the keyed domain of its content into its box, as the root does
    // into the canvas ("a chart embeds the way it renders"). A literal size
    // carries no data, so the layer reports its content's type upward; which
    // domain that type shares with is decided by the sharing sets, not by
    // the size. Its claim is its own pixels, since it solves its own σ
    // (`fixedClaim` in the claim hook). A data-valued size is a magnitude in the
    // parent's unit, so the layer reports that, and its content is nested in
    // the box. `contentExtents` is the content's claim, written by
    // `resolveExtent` and solved against the box by `layout`.
    const contentExtents: [Extent | undefined, Extent | undefined] = [
      undefined,
      undefined,
    ];
    // Per axis, the children the claim walk places where the layer's
    // constraints put them (`placeByClaims`), rather than in its own union:
    // the ones the union leaves out (`placed`), and, on an axis no
    // constraint fold composes, every child a constraint places there.
    const claimPlaced: [Set<number>, Set<number>] = [new Set(), new Set()];
    // The constraints' operands, resolved once for the constraints they
    // were resolved from: the claim walk and layout both read them.
    let operandsMemo:
      | { of: ConstraintSpec[]; operands: Map<string, ResolvedOperand> }
      | undefined;
    const constraintOperands = (): Map<string, ResolvedOperand> => {
      if (operandsMemo?.of !== node.constraints)
        operandsMemo = {
          of: node.constraints,
          operands:
            node.constraints.length > 0
              ? resolveConstraintOperands(node)
              : new Map<string, ResolvedOperand>(),
        };
      return operandsMemo.operands;
    };
    // Per axis, the children that are ink there (`placeByClaims`): they
    // draw, but take no room in the claim, nor in the box.
    const inkChildren: [Set<number>, Set<number>] = [new Set(), new Set()];
    // Where each child that is a `ref` stand-in has its target land in this
    // layer's frame on `axis` (`placementIn`), by child index.
    const standInPlacements = (axis: 0 | 1): (Placement | undefined)[] =>
      node.children.map((c) =>
        c instanceof GoFishRef && c.targetNode !== undefined
          ? placementIn(c.targetNode, node, axis)
          : undefined
      );
    // What the claim walk knows of each child on `axis`, for
    // `placeByClaims`: its claim (`extents`), its type, whether it is a `ref`
    // stand-in and where its target lands here (`placed`), whether it
    // reads its place from refs, and whether its own data places it in this
    // layer's frame.
    const claimChildren = (
      axis: 0 | 1,
      extents: Size<Extent | undefined>[],
      placed: (Placement | undefined)[]
    ): ClaimChild[] => {
      const sets = node.sharing().sets[axis];
      let held: boolean | undefined;
      return node.children.map((c, i) => {
        const space = c.resolveUnderlyingSpace()[axis];
        return {
          name: childNameKey(c),
          extent: extents[i]?.[axis],
          space,
          standIn: c instanceof GoFishRef,
          placed: placed[i],
          inkOn:
            (c as GoFishNode).inkOn?.[axis] === true ||
            (alongOwnAxis(c, axis) && (held ??= heldInChain(axis))),
          dataPositioned:
            sets[i] === 0 && isCONTINUOUS(space) && space.origin !== "free",
        };
      });
    };
    // A category label along its own axis takes room only past the ends
    // of its axis (#1115): between neighbors it overdraws them rather than
    // pushing them apart. So in a layer a chain along that axis holds (the
    // labels of one group of a grouped bar chart, inside the spread of
    // groups), it is ink: its overhang would widen the gap between groups.
    const alongOwnAxis = (c: GoFishAST, axis: 0 | 1): boolean =>
      c instanceof GoFishNode &&
      c.axisLabel?.kind === "ordinal" &&
      c.axisLabel.dim === axis;
    const heldInChain = (axis: 0 | 1): boolean => {
      for (let p = node.parent; p !== undefined; p = p.parent) {
        if (p.axisDir === axis) return true;
        if (p.claimWalk?.ownScope[axis] === true) return false;
      }
      return false;
    };
    // Where the layer's constraints place its children on `axis` in the
    // claim walk (`placeByClaims`), for their claims `extents`.
    const placeChildren = (
      axis: 0 | 1,
      extents: Size<Extent | undefined>[],
      placed: (Placement | undefined)[]
    ) =>
      placeByClaims(
        axis,
        claimChildren(axis, extents, placed),
        node.constraints,
        constraintOperands(),
        claimPlaced[axis],
        nestedPlacement(axis)
      );
    // Where an operand nested in a child lands in this layer's frame.
    const nestedPlacement = (axis: 0 | 1) => (name: string) => {
      const op = constraintOperands().get(name);
      return op !== undefined && op.node instanceof GoFishNode
        ? placementIn(op.node, node, axis)
        : undefined;
    };
    // How this layer seats its children (`ClaimWalk.seating`), read once
    // for the operands it was read from.
    let seatingMemo:
      | {
          of: Map<string, ResolvedOperand>;
          seating: ReturnType<NonNullable<GoFishNode["claimWalk"]>["seating"]>;
        }
      | undefined;
    const seating = () => {
      const operands = constraintOperands();
      if (seatingMemo?.of === operands) return seatingMemo.seating;
      const operandName = new Map<number, string>();
      for (const [name, op] of operands)
        if (op.direct && !operandName.has(op.child))
          operandName.set(op.child, name);
      const acting: [
        Map<number, ConstraintSpec[]>,
        Map<number, ConstraintSpec[]>,
      ] = [new Map(), new Map()];
      for (const c of node.constraints)
        for (const axis of [0, 1] as const) {
          if (!actsOn(c, axis)) continue;
          const kids = new Set<number>();
          for (const r of c.children) {
            const op = operands.get(r.name);
            if (op !== undefined) kids.add(op.child);
          }
          for (const k of kids) {
            const list = acting[axis].get(k);
            if (list === undefined) acting[axis].set(k, [c]);
            else list.push(c);
          }
        }
      let index = new Map(node.children.map((c, i) => [c, i]));
      const indexOf = (child: GoFishAST): number => {
        const i = index.get(child);
        if (i !== undefined && node.children[i] === child) return i;
        index = new Map(node.children.map((c, j) => [c, j]));
        return index.get(child) ?? -1;
      };
      seatingMemo = { of: operands, seating: { indexOf, operandName, acting } };
      return seatingMemo.seating;
    };
    // Whether a child of this layer's own set takes whatever room the layer
    // is given on `axis` (it claims none, as a rect with no size does).
    const ownSetFills = (
      axis: 0 | 1,
      extents: Size<Extent | undefined>[]
    ): boolean => {
      const sharing = node.sharing() as LayerSharingPlan;
      return node.children.some(
        (c, i) =>
          sharing.sets[axis][i] === 0 &&
          !sharing.datumPlaced[axis].has(i) &&
          extents[i]?.[axis] === undefined &&
          c instanceof GoFishNode &&
          c.inkOn?.[axis] !== true
      );
    };

    // Distribute budget descriptor from the recognized spread shape, stashed by
    // `resolveExtent` and consumed by `layout` to invert the composed SIZE
    // claim against the allotted size and propose per-child slices.
    let constraintBudget: ComposeBudget | undefined;

    // The layer's composed per-axis types: the types of its content. A pure
    // function of the children's types: the type hook computes it, reports it
    // (a data-valued size reports its magnitude instead), and keeps it in
    // `layerTypes` for the claim hook, which follows the same steps.
    const composeLayerTypes = (
      children: Size<UnderlyingSpace>[],
      childNodes: GoFishAST[],
      constraints: ConstraintSpec[]
    ) => {
      // A grid constraint makes this layer a grid. Stage 6e: the grid no
      // longer bypasses the fold — it participates. Its categorical track
      // axes (ORDINAL over columns / rows, for axis rendering) are composed
      // in at the END of this function, overriding the covered axes, while
      // any sibling constraint (align / position) still contributes to the
      // fold below. Its size claim (Σ max-of-cell-claims + gaps) is consumed
      // at layout time by `resolveGridTracks`, not reported as the axis space
      // — a categorical axis cannot also be a SIZE magnitude.
      const gridC = selectGridConstraint(constraints);

      // Nest type fold: only INSIDE_OUT edges (`dir: 'in'`) derive a type
      // — outer takes inner's type when inner is continuous (the padding is
      // pixels, so it goes on the claim: `outer = inner + 2·padding`) — so a
      // nested pair participates in the union below, hence in a parent's
      // auto-fit solve. Computed in dependency (source-first) order so
      // chained nests compose (A⊇B⊇C: C feeds B feeds A). OUTSIDE_IN
      // edges derive NOTHING here: the outer is a normal child whose own
      // type and claim flow through the union, and `inner = outer − 2p` is
      // purely a layout-time proposal. When inner isn't continuous,
      // `nestedSpace` leaves outer as-is and the proposal handles sizing.
      const nestPlan = buildNestPlan(childNodes, constraints);
      const effectiveChildren = applyNestSpacePlan(children, nestPlan);

      // `position` constraints contribute a POSITION-domain fragment per
      // axis: the union of their data values is this layer's domain on that
      // axis, merged with any POSITION domain bubbled up from children. This
      // is what lets the layer build a position scale at layout time so
      // `Constraint.position` can map data values to pixels.
      const posDomains = collectPositionDomains(constraints);
      // The children the layer's own union leaves out on each axis: those
      // its sharing sets detach (a literal `position` places them
      // elsewhere), and those a datum position places (their own extent is
      // nested at the datum, which is what they add to the domain).
      // A layer's rule is built on `planSharing`, so its plan carries
      // `datumPlaced`.
      const sharing = node.sharing() as LayerSharingPlan;
      const placed = ([0, 1] as const).map(
        (axis) =>
          new Set([
            ...sharing.datumPlaced[axis],
            ...sharing.sets[axis].flatMap((s, i) => (s !== 0 ? [i] : [])),
          ])
      ) as [Set<number>, Set<number>];
      const base = resolveLayerBaseSpaces(
        effectiveChildren,
        posDomains,
        placed
      );
      const resolved: Size<UnderlyingSpace> = [base.spaces[0], base.spaces[1]];

      // A simple spread expressed as align + distribute. When the
      // constraints match that operator image (see planConstraintComposition),
      // override the constrained axes with spread's own type folds (the
      // distribute fold on the distribute axis, the alignment fold on the
      // cross axis); the claim hook folds their claims the same way. A sized
      // layer maps the folded type into its box, exactly like spread.
      const plan = planConstraintComposition(constraints, childNodes);
      const composed =
        plan !== undefined
          ? composePlanSpaces(plan, effectiveChildren)
          : undefined;
      if (composed !== undefined) {
        for (const axis of [0, 1] as const) {
          const s = composed.spaces[axis];
          if (s !== undefined) resolved[axis] = s;
        }
      }

      // Grid track axes compose LAST, overriding the covered axes with the
      // categorical ORDINAL space (columns on x, rows on y) that axis
      // rendering consumes — the grid's contribution to the fold. A pure
      // grid therefore reports exactly `gridSpaces` (as before); a grid mixed
      // with a sibling constraint keeps that sibling's fold on any axis the
      // grid leaves UNDEFINED (no keys).
      const gridAxes =
        gridC !== undefined ? gridSpaces(gridC, childNodes) : undefined;
      if (gridAxes !== undefined) {
        for (const axis of [0, 1] as const) {
          if (!isUNDEFINED(gridAxes[axis])) resolved[axis] = gridAxes[axis];
        }
      }
      return {
        nestPlan,
        effectiveChildren,
        posDomains,
        placed,
        base,
        plan,
        composed,
        gridAxes,
        resolved,
      };
    };

    // The type hook's last composition, read by the claim hook. A node's
    // claim walk resolves its types first (`GoFishNode.resolveExtent`), and
    // the type memo and the claim memo are cleared together, so whenever the
    // claim hook runs, this is the composition behind the current types.
    let layerTypes: ReturnType<typeof composeLayerTypes> | undefined;

    const node: GoFishNode = new GoFishNode(
      {
        type: options.box === true ? "box" : "layer",
        key: options.key,
        // The sharing sets come from the constraints (`planSharing`). A
        // data-valued size (`w: "count"`, the mosaic's `size` wrapper) also
        // nests the content on its axis: the layer's size is a magnitude in
        // its parent's unit, and the content is a second frame inside it.
        resolveSharing: (childNodes, constraints) => {
          const plan = planSharing(constraints, childNodes);
          for (const axis of [0, 1] as const)
            if (isValue(dims[axis].size))
              childNodes.forEach((_, i) => plan.nested[axis].add(i));
          return plan;
        },
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[],
          constraints: ConstraintSpec[]
        ) => {
          layerTypes = composeLayerTypes(
            children,
            _childNodes,
            constraints ?? []
          );
          // What the layer reports upward: its content's type, except on an
          // axis with a DATA-valued size (`w: "count"`, #4/#20, the nested
          // mosaic), where the layer is a free magnitude in its parent's unit,
          // a leaf in its parent's set exactly like a rect with `w: "count"`.
          // Its content is nested in that box (see `resolveSharing`). A
          // literal size carries no data, so it changes nothing here.
          return ([0, 1] as const).map((axis) => {
            const dsize = dims[axis].size;
            return isValue(dsize)
              ? magnitude(dsize)
              : layerTypes!.resolved[axis];
          }) as Size<UnderlyingSpace>;
        },
        // The claim half, following the same steps as the type hook: nest
        // padding, the base union (scaled by `transform.scale`, which acts on
        // pixels only), the constraint folds, then the grid tracks.
        resolveExtent: (childExtents, _childSpaces, spaces) => {
          const t = layerTypes;
          if (t === undefined)
            throw new Error("[gofish] layer: claim resolved before its type");
          const fillsRoom = (i: number, axis: 0 | 1) => {
            const c = node.children[i];
            return c instanceof GoFishNode && c.fillsRoom(axis);
          };
          const effectiveExtents = applyNestExtentPlan(
            childExtents,
            t.effectiveChildren,
            t.nestPlan,
            fillsRoom
          );
          const scale = [
            options.transform?.scale?.x ?? 1,
            options.transform?.scale?.y ?? 1,
          ];
          const operands = constraintOperands();
          // A stand-in the claim walk places on an axis: the constraints
          // seat what is related to it where its target lands, so a fold
          // that starts its children at the layer's origin does not hold.
          const placedStandIns = [standInPlacements(0), standInPlacements(1)];
          const standIns = placedStandIns.map((ps) =>
            ps.some((p) => p !== undefined)
          );
          // How the claim composes each axis: a grid's track axis claims
          // nothing (the tracks size at layout, in `resolveGridTracks`); a
          // constraint fold (a spread's align + distribute) has every child
          // in it; otherwise the base union holds the children that share
          // the layer's frame, and the claim walk places the rest where the
          // layer's constraints put them (`placeByClaims`): a ring's axis,
          // titles and legend around the content it dresses (#1032), a
          // scatter's marks at their data, a mark aligned on another's end.
          const modes = ([0, 1] as const).map((axis) =>
            t.gridAxes !== undefined && !isUNDEFINED(t.gridAxes[axis])
              ? "grid"
              : t.composed?.fragments[axis] !== undefined &&
                  t.composed.spaces[axis] !== undefined &&
                  !standIns[axis]
                ? "fold"
                : "placed"
          );
          for (const axis of [0, 1] as const)
            claimPlaced[axis] =
              modes[axis] === "placed"
                ? new Set([
                    ...t.placed[axis],
                    ...constrainedOn(axis, node.constraints, operands),
                  ])
                : t.placed[axis];
          const placements: [
            ClaimPlacement | undefined,
            ClaimPlacement | undefined,
          ] = [undefined, undefined];
          for (const axis of [0, 1] as const) {
            inkChildren[axis] = new Set();
            if (modes[axis] !== "placed" || claimPlaced[axis].size === 0)
              continue;
            const p = placeChildren(
              axis,
              effectiveExtents,
              placedStandIns[axis]
            );
            placements[axis] = p;
            inkChildren[axis] = p.ink;
            const session = node.tryGetRenderSession();
            if (p.ink.size > 0 && session !== undefined)
              (session.inkLayers ??= new Set()).add(node);
          }
          // The claim on each axis from the children's claims `extents`:
          // the fold's (`folded`), or the base union merged with the hull of
          // what the claim walk places (`hullOf`), so a scope solved at or
          // above the layer leaves that room. A child of the own set that
          // fills the room it is given makes the layer fill it too: it
          // claims no fixed room.
          const claimFrom = (
            extents: Size<Extent | undefined>[],
            folded: Size<Extent | undefined> | undefined,
            hullOf: (p: ClaimPlacement) => Extent | undefined
          ): [Extent | undefined, Extent | undefined] =>
            [0, 1].map((axis) => {
              const a = axis as 0 | 1;
              if (modes[a] === "grid") return undefined;
              if (modes[a] === "fold") return folded![a];
              const own = resolveLayerAxisExtent(
                extents,
                t.effectiveChildren,
                a,
                scale[a],
                a === 0 ? t.posDomains.x : t.posDomains.y,
                t.base.union[a],
                t.base.spaces[a],
                claimPlaced[a]
              );
              const p = placements[a];
              const hull = p === undefined ? undefined : hullOf(p);
              if (hull === undefined) return own;
              if (own !== undefined) return hullExtent(own, hull);
              return ownSetFills(a, effectiveExtents) ? undefined : hull;
            }) as [Extent | undefined, Extent | undefined];
          const reflected = node.children.map(
            (c) => c.yFrame.direction !== node.yFrame.direction
          );
          const fold =
            t.plan !== undefined && t.composed !== undefined
              ? composePlanExtents(
                  t.plan,
                  t.composed,
                  effectiveExtents,
                  t.effectiveChildren,
                  reflected
                )
              : undefined;
          constraintBudget = fold?.budget;
          const resolved = claimFrom(
            effectiveExtents,
            fold?.extents,
            (p) => p.hull
          );
          // The plot's claim (`GoFishNode.resolvePlotExtent`): the same
          // steps over the children's plot claims, with the hull of what
          // the constraints place leaving out the dressing, and a chain with
          // a stand-in reaching only as far as its stand-ins. A chain's
          // other parts count whole: what hangs off a part inside a chain
          // takes room between the parts, so it is part of the plot. A layer
          // whose children are not stand-ins and have their claims as their
          // plots, with no dressing placed, has its claim as its plot.
          const plotIsClaim =
            node.children.every(
              (c) =>
                c instanceof GoFishNode &&
                c.resolvePlotExtent() === c.resolveExtent()
            ) && placements.every((p) => p === undefined || p.plot === p.hull);
          const plotOf = () => {
            const childPlots = applyNestExtentPlan(
              node.children.map((c) =>
                c instanceof GoFishNode ? plotIn(c, node) : c.resolveExtent()
              ),
              t.effectiveChildren,
              t.nestPlan,
              fillsRoom
            );
            return claimFrom(
              childPlots,
              modes.includes("fold")
                ? composePlanExtents(
                    t.plan!,
                    t.composed!,
                    effectiveExtents,
                    t.effectiveChildren,
                    reflected,
                    {
                      extents: childPlots,
                      standIn: node.children.map((c) => c instanceof GoFishRef),
                    }
                  ).extents
                : undefined,
              (p) => p.plot
            );
          };
          const plot = plotIsClaim ? resolved : plotOf();
          // The content's claim, which `layout` solves against the layer's box
          // when the layer is sized. A data-valued size reports the claim of
          // its magnitude instead; the content's claim stays inside the box.
          contentExtents[0] = resolved[0];
          contentExtents[1] = resolved[1];
          // What the layer claims upward. A data-valued size claims its
          // magnitude. A literal size claims its own pixels: the box is a
          // sized node, so its content's σ is its own, and the parent must
          // not solve against the content as if it were data-scaled room.
          // The claim keeps the content's split about data 0, at the σ the
          // box solves: its content widened to its keyed domain and niced,
          // solved once against the literal size through the registry
          // (`solveFixed`), whose solution `layout` reuses. So the box's 0
          // sits where its content's does. Content that maps no domain
          // (`mapsDomain`) is laid out in the box, which claims its pixels
          // from its start edge (#493: fixed-size nodes report their size).
          const session = node.tryGetRenderSession();
          const keyed: KeyedDomains | undefined = session?.keyedDomains;
          const fixedClaim = (axis: 0 | 1, px: number): Extent | undefined => {
            const claim = resolved[axis];
            if (!mapsDomain(t.resolved[axis], claim))
              return Extent(Monotonic.linear(0, px));
            const [space, wide] = keyed?.scope(
              node,
              axis,
              t.resolved[axis],
              claim
            ) ?? [t.resolved[axis], claim];
            const solved = getScopeRegistry(session).solveFixed(
              node,
              keyed?.axisKey(node, axis, t.resolved[axis]),
              { kind: "sized", rootKey: node.key ?? node.type, axis },
              space,
              wide,
              px
            );
            if (solved === undefined || wide === undefined) return claim;
            return Extent(
              Monotonic.linear(0, wide.ascent.run(solved.sigma)),
              Monotonic.linear(0, wide.descent.run(solved.sigma))
            );
          };
          // A literal start places the layer that many pixels from its
          // parent's origin (`translate` in `layout`), so its claim moves
          // with it.
          const at = (axis: 0 | 1, claim: Extent | undefined) => {
            const min = dims[axis].min;
            return claim === undefined || typeof min !== "number" || min === 0
              ? claim
              : Extent(
                  Monotonic.adds(claim.ascent, min),
                  Monotonic.adds(claim.descent, -min)
                );
          };
          const claims = ([0, 1] as const).map((axis) => {
            const size = dims[axis].size;
            if (isValue(size)) return impliedExtent(spaces[axis]);
            if (typeof size === "number")
              return at(
                axis,
                fixedClaim(axis, size + chartChrome(node, axis, size))
              );
            return at(axis, resolved[axis]);
          }) as [Extent | undefined, Extent | undefined];
          // A node with a size of its own is a part of its parent's plot,
          // chrome and dressing included.
          node._plotExtent = plotIsClaim
            ? undefined
            : (([0, 1] as const).map((axis) =>
                dims[axis].size !== undefined
                  ? claims[axis]
                  : at(axis, plot[axis])
              ) as [Extent | undefined, Extent | undefined]);
          return claims;
        },
        layout: (size, scales, children, node, region) => {
          // This layer's y direction: its children and constraints are read
          // in this axis order (see `axisDirection.ts`).
          const direction = node.yFrame.direction;
          // Split the incoming single-carrier scale into its two half-channels
          // for the proposal planning below: σ (size slope) feeds sizing and the
          // child σ forwarding; the anchored map feeds `position` constraints and
          // per-child map forwarding. They recombine per child at `child.layout`.
          const inheritedScaleFactors: Size<number | undefined> = [
            scales?.[0]?.sigma,
            scales?.[1]?.sigma,
          ];
          const inheritedPosScales: ConstraintPosScales = [
            scales?.[0]?.map,
            scales?.[1]?.map,
          ];
          // Compute size using dims (w and h) before passing to children. A
          // chart's own size is its plot's: its chrome adds around it.
          size = ([0, 1] as const).map((axis) => {
            const own = computeSize(
              dims[axis].size,
              inheritedScaleFactors[axis]!,
              size[axis]
            );
            return own === undefined
              ? size[axis]
              : own + chartChrome(node, axis, own);
          }) as Size;

          // Grid budget (Stage 6e): resolve the tracks under the unified max rule
          // from the cells' pre-layout size claims — each track sizes to the max
          // claim of its cells, fill tracks split the leftover equally. This
          // sizes only the FILL cells (a claim cell keeps its own size); the
          // authoritative PLACEMENT tracks are recomputed from the actual
          // laid-out cell sizes after the child loop (`gridTracksFromSizes`), so
          // cell centers pin to the real geometry.
          const gridC = selectGridConstraint(node.constraints);
          const gridCellByName = gridC
            ? gridCellSizeByName(
                gridC,
                resolveGridTracks(
                  gridC,
                  node.children,
                  size,
                  getScopeRegistry(node.tryGetRenderSession()),
                  node.key ?? node.type
                )
              )
            : undefined;

          // The scales this layer hands its children (`solveLayerScales`): on
          // an axis where it is a sized node (a size of its own, or a slot it
          // is given with no frame), it maps the keyed domain of its content
          // into its box, niced when some chart draws an axis over that
          // domain (#659); everywhere else it inherits σ. Every solve goes
          // through the render's one σ-scope registry.
          node.resolveExtent();
          const keyed = node.tryGetRenderSession()?.keyedDomains;
          // A data-valued size's content is a set of its own, so its domain
          // is its unit's. Any other content is in this layer's set, whose
          // domain it shares even when it carries no unit (literals).
          const viaSet = (axis: 0 | 1) => !isValue(dims[axis].size);
          const scopes = getScopeRegistry(node.tryGetRenderSession());
          const layerScales = solveLayerScales(
            [dims[0].size !== undefined, dims[1].size !== undefined],
            layerTypes?.resolved,
            contentExtents,
            node._underlyingSpace,
            (axis) => node.inSlot(axis),
            size,
            inheritedScaleFactors,
            inheritedPosScales,
            (axis, space, claim) =>
              keyed?.scope(node, axis, space, claim, viaSet(axis)) ?? [
                space,
                claim,
              ],
            scopes,
            node.key ?? node.type,
            [scopes.fixedSolve(node, 0), scopes.fixedSolve(node, 1)]
          );
          const childScaleFactors = layerScales.sigmas;
          // A node dressed in chrome reads its gutters off the claims at the
          // size it is laid out at (#1032): at its σ where its plot has a
          // claim, else for its slot, which its plot fills. Then it seats
          // its content past them.
          if (node.chrome !== undefined) {
            node.chrome.gutters = [
              guttersInSlot(node, 0, childScaleFactors[0], size[0]),
              guttersInSlot(node, 1, childScaleFactors[1], size[1]),
            ];
            seatPastGutters(node);
          }
          // No σ fits the size this layer has: its fixed parts need more.
          // It keeps the inherited σ, and the layout warns
          // (`layoutWarnings.ts`).
          for (const axis of layerScales.failedAxes)
            warnLayout(node, fixedOverflowInside(node, axis, size[axis]));
          for (const check of layerScales.checks) {
            // Solver shadow (#39): assert the frame equation content(σ)=allocated
            // closes for this σ-scope. No-op unless GOFISH_SOLVER_CHECK is set.
            shadowCheckScaleRoot(
              check.extent,
              size[check.axis],
              check.sigma,
              check.axis
            );
          }

          // Per-child proposed size for distribute-covered children: each
          // distribute segment slices its axis size equally among its covered
          // children; a child covered on both axes (a table cell) draws an
          // x-slice and a y-slice. Uncovered axes get the full size. A child
          // carrying its own explicit size ignores this (its size wins),
          // matching spread; a claim-less child consumes the slice.
          const sliceByName = constraintBudget
            ? buildDistributeSliceMap(constraintBudget.segments, size)
            : undefined;
          // A spread whose parts claim nothing (they share what is left):
          // spacing alone larger than its size. A spread with a claim is
          // warned about where its scope is solved.
          if (
            node.axisDir !== undefined &&
            node.resolveExtent()[node.axisDir] === undefined
          )
            warnLayout(
              node,
              spacingOverflow(node, node.axisDir, size[node.axisDir])
            );

          // `position` constraints with a datum coordinate contribute a data
          // domain on their axis (see collectPositionDomains), and resolve
          // against the layer's frame. A child such a constraint places gets
          // no map on that axis (`childPosScalesFor`).
          const constraintDomains = collectPositionDomains(node.constraints);
          const ownsAxis: [boolean, boolean] = [
            constraintDomains.x !== undefined,
            constraintDomains.y !== undefined,
          ];
          const effectivePosScales = layerScales.frames;
          // Which children share this layer's domain on each axis. A
          // detached child is placed elsewhere, so the placement solve does
          // not treat it as positioned by its data in this frame.
          const sharing = node.sharing();
          // What the position constraints hand each child (#1059): the
          // span an interval pins it across, which it is laid out in, and its
          // region: its cell, and on the other axis the region this layer was
          // given; or, for a child with no cell that no constraint places,
          // the region this layer was given. A child is laid out in its
          // region's length, and places itself in it.
          const proposals = buildChildProposals(
            node.constraints,
            effectivePosScales,
            region
          );

          // Where a child's baseline goes on each axis (#773), by the one
          // seating rule (`seatInScope`) in this layer's frame. A free child
          // (a baseline magnitude, e.g. a rect with a data `h`) has no
          // position of its own; its baseline sits at the frame's pixel of
          // data 0, so a signed extent (ascent above, descent below) grows
          // from the axis's 0 on both sides. The frame is the layer's map
          // (`effectivePosScales`): a pinned layer's is the map it shares, a
          // stash's is its own scope, a free layer's has its baseline at local
          // 0, since its parent seats it there, and a layer with no data 0
          // has none (`frameOf`). Unconstrained free children are placed
          // here; constrained ones get the same pixel from the solver's
          // free-origin fallback (`solveAxisProblem`). A pinned child shares
          // the frame and stays at 0.
          const freeOrigin: FreeOrigin = [
            effectivePosScales[0]?.originPx,
            effectivePosScales[1]?.originPx,
          ];
          //
          // A seat is a position along this layer's axis order. A child whose
          // y grows upward inside this layer that reads top-down is seated
          // from the bottom of the band this layer allocated it
          // (`childFrames`, else its own box): its axis starts there, as the
          // root's starts at the bottom of the canvas (`placeRoot` in
          // gofish.tsx). A child that reads top-down hangs from its origin,
          // which is its top, in either kind of layer.
          const childFrames: number[] = new Array(children.length);
          const baselineFor = (
            cp: (typeof childPlaceables)[number],
            i: number
          ): [number, number] => {
            const [bx, by] = [0, 1].map(
              (axis) =>
                seatInScope(
                  effectivePosScales[axis],
                  cp.spaceOn?.(axis as 0 | 1)
                ).seatPx
            );
            if (direction === -1 || children[i].yFrame.direction === 1)
              return [bx, by];
            const frame = Number.isFinite(childFrames[i])
              ? childFrames[i]
              : (cp.dims[1].size ?? 0);
            return [bx, by + frame];
          };

          const childPlaceables: ReturnType<
            (typeof children)[number]["layout"]
          >[] = new Array(children.length);

          const layoutPlan = buildLayerConstraintLayoutPlan(
            node.children,
            node.constraints
          );
          // Every placement operand resolved to a node inside this layer, by
          // name from this layer outward (like `ref`). Throws on a missing,
          // ambiguous, or out-of-layer operand (#819).
          const operands = constraintOperands();
          // A child skips phase-1 baseline placement only when a positioning
          // operand names the child itself. A nested operand does not: it is
          // a fixed reference into its container, which stays where its own
          // placement puts it unless the container is named too (then the
          // two move together — see `NestedOperand`).
          const constrainedChildren = new Set<number>();
          for (const name of layoutPlan.constrainedNames) {
            const op = operands.get(name);
            if (op?.direct) constrainedChildren.add(op.child);
          }
          // Drawing clauses of `.relate()` run in dependency order around the
          // solve: a clause that reads positions lays out after the solve
          // that writes them (#878). Plain children lay out before it, as
          // always.
          const relateOrder = relateScheduleForLayout(node, operands);
          // Where a literal position pins each child's origin, read once.
          const literalSeatsByName = literalSeats(node.constraints);

          const layoutChild = (i: number) => {
            const child = children[i];
            const childName = childNameKey(node.children[i]);
            const targetDims =
              childName !== undefined
                ? layoutPlan.positionTargetDims.get(childName)
                : undefined;
            // Nest proposal: override the DERIVED node's size from its
            // SOURCE on each derived axis — `outer = inner + 2p` for 'in',
            // `inner = outer − 2p` for 'out'. The source is already laid out
            // (ahead of us in layoutOrder, since the plan orders source before
            // derived). Clamp ≥ 0; non-derived axes keep the normal child
            // proposal, so nest composes with — and wins on its derived axes
            // over — any budget slice.
            const childRegion =
              (childName !== undefined
                ? proposals.regionByName.get(childName)
                : undefined) ??
              (constrainedChildren.has(i) ? undefined : proposals.passedOn);
            // In a share scope (`sharesRoom`) a child is laid out at its
            // claim at σ: a band is one σ, and a node that holds bands is
            // what its claim says at the σ the scope solved.
            const own = ([0, 1] as const).map((axis) => {
              const sigma = childScaleFactors[axis];
              const claim =
                child instanceof GoFishNode
                  ? child.resolveExtent()[axis]
                  : undefined;
              return claim !== undefined &&
                sigma !== undefined &&
                Number.isFinite(sigma) &&
                node.sharesRoom(axis)
                ? claim.width.run(sigma)
                : undefined;
            }) as Size<number | undefined>;
            const proposed = applyNestLayoutProposal(
              childLayoutSizeProposal(
                childName,
                size,
                gridCellByName,
                sliceByName,
                proposals.spanByName,
                childRegion,
                own
              ),
              layoutPlan.nestPlan?.byDerived.get(i),
              childPlaceables
            );
            // A node dressed in chrome hands its content (its first child)
            // what the chrome's gutters leave of its slot (#1032), or its
            // own room in a share scope. Gutters larger than the slot leave
            // the content no room (the fixed parts overflow, and the scope
            // that solved the slot warns); an unsized axis (NaN) stays
            // unsized.
            const inside = (axis: 0 | 1) =>
              Math.max(0, proposed[axis] - sum(node.chromeGutters(axis)));
            const layoutSize: Size =
              i === 0 && node.chrome !== undefined
                ? [own[0] ?? inside(0), own[1] ?? inside(1)]
                : proposed;
            // Recombine the two forwarding decisions into the single carrier: σ
            // forwards uniformly (childScaleFactors), the anchored map forwards
            // per child (childPosScalesFor — stripped where a constraint consumed
            // the scale). A stripped map keeps the child's σ.
            const seats = (childName === undefined
              ? undefined
              : literalSeatsByName.get(childName)) ?? [undefined, undefined];
            const childMaps = childPosScalesFor(
              (children[i] as GoFishNode)._underlyingSpace,
              targetDims,
              ownsAxis,
              effectivePosScales,
              seats
            );
            childFrames[i] = layoutSize[1];
            const childPlaceable = child.layout(
              layoutSize,
              [
                axisScale(childScaleFactors[0], childMaps[0]),
                axisScale(childScaleFactors[1], childMaps[1]),
              ],
              childRegion
            );
            if (!constrainedChildren.has(i)) {
              const [bx, by] = baselineFor(childPlaceable, i);
              childPlaceable.place("x", bx, "baseline");
              childPlaceable.place("y", by, "baseline");
            } else {
              // A literal pin of its origin depends on nothing else, so it
              // places the child now: the children laid out after it (a
              // `ref` into it) read it where it ends up.
              if (seats[0] !== undefined)
                childPlaceable.place("x", seats[0], "baseline");
              if (seats[1] !== undefined)
                childPlaceable.place("y", seats[1], "baseline");
            }
            childPlaceables[i] = childPlaceable;
          };

          for (const i of layoutPlan.layoutOrder) {
            if (!relateOrder.clauses.has(i)) layoutChild(i);
          }
          for (const i of relateOrder.beforeSolve) layoutChild(i);

          if (node.constraints.length > 0) {
            // Constraint-based placement:
            // Build name -> placeable map from named children
            const nameToPlaceable = new Map<
              string,
              (typeof childPlaceables)[number]
            >();
            // The direct child each name in `nameToPlaceable` stands for (or
            // sits in, for a nested operand), recorded where the name is set.
            const childOfName = new Map<string, number>();
            for (let i = 0; i < node.children.length; i++) {
              const childName = childNameKey(node.children[i]);
              // A drawing clause laid out after the solve has no placeable
              // yet, and nothing in the solve can address it.
              if (childName !== undefined && childPlaceables[i]) {
                nameToPlaceable.set(childName, childPlaceables[i]);
                childOfName.set(childName, i);
              }
            }
            // Operands override by resolution: a direct operand is its child's
            // placeable; a nested one is a `NestedOperand` rigidly tied to the
            // child that contains it (keyed by that child's operand name, or a
            // synthetic key when the child itself is not an operand).
            const containerKey = new Map<number, string>();
            const nested: [string, ResolvedOperand][] = [];
            for (const [name, op] of operands) {
              childOfName.set(name, op.child);
              if (op.direct) {
                nameToPlaceable.set(name, childPlaceables[op.child]);
                containerKey.set(op.child, name);
              } else nested.push([name, op]);
            }
            const rigid = new Map<string, RigidAttachment>();
            for (const [name, op] of nested) {
              let container = containerKey.get(op.child);
              if (container === undefined) {
                container = `\u0000child:${op.child}`;
                containerKey.set(op.child, container);
                nameToPlaceable.set(container, childPlaceables[op.child]);
                childOfName.set(container, op.child);
              }
              // The operand sits at a fixed pixel offset inside its container
              // (`nestedGap`); the solve sees both in this layer's axis order.
              const containerPx = rawPlaceable(childPlaceables[op.child]);
              const gapPx = nestedGap(op.node, node.children[op.child]);
              const operand = new NestedOperand(
                name,
                op.node,
                containerPx,
                gapPx
              );
              nameToPlaceable.set(
                name,
                orientView(
                  operand,
                  direction
                ) as unknown as (typeof childPlaceables)[number]
              );
              // The same offset in this layer's axis order: from the
              // container's start edge to the operand's, which is its top
              // when y reads top-down and its bottom when y grows upward.
              const gap: [number, number] = [
                gapPx[0],
                fromFrameStart(
                  gapPx[1],
                  containerPx.dims[1].size ?? 0,
                  direction
                ) - (direction === 1 ? 0 : (op.node.dims[1].size ?? 0)),
              ];
              rigid.set(name, { container, gap });
            }

            // Compose and solve placement constraints as one per-axis relational
            // problem. Declaration order does not choose an anchor; unanchored
            // components receive a deterministic weak origin.
            // Placement tracks from the ACTUAL laid-out cell sizes (Stage 6e):
            // each track's extent is the max of its cells' real geometry, so the
            // cell-center pins match what rendered (and the solver shadow agrees).
            const gridTracks = gridC
              ? gridTracksFromSizes(
                  gridC,
                  childPlaceables.map((cp) =>
                    cp
                      ? ([
                          Math.abs(cp.dims[0].size ?? 0),
                          Math.abs(cp.dims[1].size ?? 0),
                        ] as [number, number])
                      : undefined
                  )
                )
              : undefined;

            // Which (constrained child, axis) is anchored to a data scale — its
            // baseline is fixed at `posScale(0)` by the shared map, so `align`
            // leaves it where its own scale puts it (a scatter facet panel).
            // This is the SPACE/scope fact that used to be reconstructed inside
            // the align guard via a `placementOn` method on the target; Stage 6f
            // collects it ONCE here, at the layer boundary, reading the pure DATA
            // fact (a continuous axis with a data position: a pinned or
            // origin-less one, anything but free) and hands it to the
            // placement solve's ownership plan — the constraint path no longer
            // consults the space pass's free/determined/conflict lattice.
            const dataPositioned: [Set<string>, Set<string>] = [
              new Set(),
              new Set(),
            ];
            for (const [name, cp] of nameToPlaceable) {
              const childSpace = (cp as GoFishNode)._underlyingSpace;
              if (childSpace === undefined) continue;
              const i = childOfName.get(name)!;
              for (const axis of [0, 1] as const) {
                const s = childSpace[axis];
                const shares = sharing.sets[axis][i] === 0;
                if (
                  shares &&
                  s !== undefined &&
                  isCONTINUOUS(s) &&
                  s.origin !== "free"
                )
                  dataPositioned[axis].add(name);
              }
            }

            applyConstraints(
              placementConstraints(node.constraints, proposals.regionByName),
              nameToPlaceable,
              size,
              effectivePosScales,
              gridTracks,
              dataPositioned,
              rigid,
              freeOrigin
            );

            // Place any child the constraints left unplaced at its baseline
            // origin (`baselineFor`), the same rule as the phase-1 placement in
            // `layoutChild`. A layer without constraints needs no step here:
            // phase 1 already placed every child. A drawing clause that reads the
            // constrained positions is laid out after this (see
            // `relateOrder`), not by a re-layout pass here.
            childPlaceables.forEach((cp, i) => {
              if (cp) placeUnplacedChild(cp, "baseline", baselineFor(cp, i));
            });
          }

          for (const i of relateOrder.afterSolve) layoutChild(i);

          // Calculate the bounding box of all children (NaN-safe; see
          // foldFinite for why undefined extents are skipped). Each child's
          // box is read once.
          const mins: [(number | undefined)[], (number | undefined)[]] = [
            [],
            [],
          ];
          const maxs: [(number | undefined)[], (number | undefined)[]] = [
            [],
            [],
          ];
          childPlaceables.forEach((cp, i) => {
            const d = cp.dims;
            // A child that is ink on an axis draws there but takes no room
            // in this box, as it takes none in the claim (`placeByClaims`).
            for (const axis of [0, 1] as const) {
              if (inkChildren[axis].has(i)) continue;
              mins[axis].push(d[axis].min);
              maxs[axis].push(d[axis].max);
            }
          });
          const minX = foldFinite(mins[0], Math.min);
          const maxX = foldFinite(maxs[0], Math.max);
          const minY = foldFinite(mins[1], Math.min);
          const maxY = foldFinite(maxs[1], Math.max);
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;

          const translate = (axis: 0 | 1, min: number): number | undefined =>
            dims[axis].min !== undefined ? dims[axis].min - min : undefined;

          return {
            // Store only the local box `(min, size)`; the `dims` getter derives
            // center/max from it via `localAnchorPoint` (`size = max − min ≥ 0`,
            // both ends from the same child fold). Writing them here was dead —
            // every consumer reads `.dims`, and layer's own render ignores
            // `intrinsicDims` entirely (#39 stage 3).
            intrinsicDims: [
              { min: minX, size: maxX - minX },
              { min: minY, size: maxY - minY },
            ],
            transform: {
              translate: [translate(0, minX), translate(1, minY)],
              scale: [scaleX, scaleY],
            },
          };
        },
        // IR lowering — mirror of the box/layer render. #39 stage 6d: the box's
        // subtree is flattened to absolute-transform display objects (seeded at
        // the box's own baked absolute translate) and each is lowered at that
        // absolute transform — no per-container `toPixel` closure. z-order is
        // resolved by the shared bake walk exactly as the root bake does. A
        // non-identity scale can't fold into coordinates, so it stays a `group`
        // item wrapping the children.
        lower: ({ transform, coordinateTransform }, _children, node) => {
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const [wrapTx, wrapTy] = displayTranslate(transform);
          // A `box` is a coordinate-transform barrier: its children render in
          // linear box-local space (the box positions itself in the parent
          // coord, but its content does not warp). Mirror the render's
          // `this.type !== "box" ? coordinateTransform : undefined`.
          const childCoord =
            node.type === "box" ? undefined : coordinateTransform;

          // Seed the subtree bake at the box's absolute translate only — scale
          // is applied by the group below, not folded into coordinates.
          const childItems = bakeChildren(node, [wrapTx, wrapTy]).flatMap((d) =>
            d.node.INTERNAL_lower(childCoord, d.transform)
          );

          if (scaleX === 1 && scaleY === 1) return childItems;

          // Scale about the box's pixel origin: p ↦ origin + s·(p − origin).
          const outer = node.getRenderSession().toPixel!;
          const [ox, oy] = outer([wrapTx, wrapTy]);
          return [
            {
              kind: "group",
              transform: {
                translate: [ox * (1 - scaleX), oy * (1 - scaleY)],
                scale: [scaleX, scaleY],
              },
              children: childItems,
            },
          ];
        },
      },
      children
    );
    node.claimWalk = {
      ink: inkChildren,
      operands: constraintOperands,
      seating,
      literalStart: [0, 1].map((axis) => {
        const min = dims[axis].min;
        return typeof min === "number" ? min : 0;
      }) as [number, number],
      ownScope: [dims[0].size !== undefined, dims[1].size !== undefined],
      placeChildren: (axis, extents) =>
        placeChildren(axis, extents, standInPlacements(axis)),
      // Memoized with the claims it reads. The claim hook's own placement
      // is not reused: it places the nest-adjusted claims, and only on an
      // axis the claim walk places children on.
      childBoxes: (axis) => {
        const memo = node._claimMemo.childBoxes;
        if (memo[axis] === "busy") return undefined;
        if (memo[axis] !== undefined) return memo[axis];
        memo[axis] = "busy";
        const boxes = placeByClaims(
          axis,
          claimChildren(
            axis,
            node.children.map((c) => c.resolveExtent()),
            standInPlacements(axis)
          ),
          node.constraints,
          constraintOperands(),
          new Set(),
          nestedPlacement(axis)
        ).boxes();
        memo[axis] = boxes;
        return boxes;
      },
    };
    // Defer the axis-name-keyed `dims` option to the resolveAliases pass.
    node._elaborateInAxisScope = deferAxisDims(options, dims);
    // Default zBelow(connector, operand) for relational marks (line/ribbon/…)
    // found anywhere in this layer's subtree — see the doc comment above.
    applyRelationalZBelowDefaults(node, children);
    return node;
  }
);

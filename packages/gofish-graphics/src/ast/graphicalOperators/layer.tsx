// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { GoFishNode, warnLayout, type ToPixel } from "../_node";
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
import {
  Extent,
  hullExtent,
  impliedExtent,
  mapsDomain,
  padExtent,
} from "../extent";
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
  relateScheduleForLayout,
  type ConstraintSpec,
  type ZOrderConstraint,
} from "../constraints";
import { GoFishRef } from "../_ref";
import { applyRelationalZBelowDefaults } from "../constraints/relationalPaint";
import {
  axisIndex,
  buildNameIndex,
  childNameKey,
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

const sum = ([a, b]: [number, number]) => a + b;

/** `p` grown by an outline drawn `o` pixels past its box on each side
 *  (`GoFishNode.strokeOverhang`). */
const outlined = (
  p: Placement | undefined,
  o: number
): Placement | undefined =>
  p === undefined || o === 0
    ? p
    : {
        lo: Monotonic.adds(p.lo, -o),
        hi: Monotonic.adds(p.hi, o),
        extent: padExtent(p.extent, o),
      };

/** Whether `node` is a ring of chrome (`GoFishNode.chrome`): a layer whose
 *  first child is the ring inside it and whose other children are chrome. */
const isRing = (node: GoFishNode): boolean => {
  for (let o: GoFishNode | undefined = node; o !== undefined; o = o.parent)
    if (o.chrome?.rings.includes(node)) return true;
  return false;
};

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
  return node._chartBox?.[axis] === true && content instanceof GoFishNode
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
    // Per axis, the children that are dressing there (`placeByClaims`).
    const dressingChildren: [Set<number>, Set<number>] = [new Set(), new Set()];
    // Where each child that is a `ref` stand-in has its target land in this
    // layer's frame on `axis` (`placementIn`), and where each child drawn
    // from refs lands (`GoFishNode.placedFromRefs`), by child index, its
    // outline included (`GoFishNode.claimedOverhang`), as a claim includes it.
    const standInPlacements = (axis: 0 | 1): (Placement | undefined)[] =>
      node.children.map((c) =>
        c instanceof GoFishRef
          ? c.targetNode !== undefined
            ? placementIn(c.targetNode, node, axis)
            : undefined
          : outlined(c.placedFromRefs?.(node, axis), c.claimedOverhang)
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
          fromRefs: c instanceof GoFishNode && c.placedFromRefs !== undefined,
          placed: placed[i],
          inkOn:
            (c as GoFishNode).inkOn?.[axis] === true ||
            (c instanceof GoFishNode &&
              c.placedFromRefs !== undefined &&
              placed[i] === undefined) ||
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
          c.inkOn?.[axis] !== true &&
          c.placedFromRefs === undefined
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
      // A layer's rule is built on `planSharing`, so its plan carries
      // `datumPlaced`.
      const sharing = node.sharing() as LayerSharingPlan;
      // Only the datums that place children of the layer's own set: a
      // constraint that places a detached child (a chrome ring's tick, which
      // the ring's sharing puts in a set of its own) positions it in the
      // layer's frame but is no part of the type the layer reports, so a
      // chart's chrome never re-types it (#1170).
      const nameIndex = buildNameIndex(childNodes);
      const posDomains = collectPositionDomains(constraints, (c, axis) =>
        c.children.every((r) => {
          const i = nameIndex.get(r.name);
          return i === undefined || sharing.sets[axis][i] === 0;
        })
      );
      // The children the layer's own union leaves out on each axis: those
      // its sharing sets detach (a literal `position` places them
      // elsewhere), and those a datum position places (their own extent is
      // nested at the datum, which is what they add to the domain).
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
          // Each child's own plot claim, before the nest padding.
          const ownPlots = node.children.map((c) =>
            c instanceof GoFishNode ? plotIn(c, node) : c.resolveExtent()
          );
          const overhang = (i: number) => {
            const c = node.children[i];
            return c instanceof GoFishNode ? c.claimedOverhang : 0;
          };
          // A node a nest sizes from its inner whose outline reaches past
          // its box: its claim is no longer its plot.
          const outlinedNest = [...(t.nestPlan?.byDerived ?? [])].some(
            ([i, edges]) => overhang(i) > 0 && edges.some((e) => e.dir === "in")
          );
          const effectiveExtents = applyNestExtentPlan(
            childExtents,
            t.effectiveChildren,
            t.nestPlan,
            fillsRoom,
            { plots: ownPlots, overhang }
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
          // A node drawn from refs takes room where the claim walk places it.
          const fromRefs = node.children.flatMap((c, i) =>
            c instanceof GoFishNode && c.placedFromRefs !== undefined ? [i] : []
          );
          for (const axis of [0, 1] as const)
            claimPlaced[axis] =
              modes[axis] === "placed"
                ? new Set([
                    ...t.placed[axis],
                    ...constrainedOn(axis, node.constraints, operands),
                    ...fromRefs,
                  ])
                : t.placed[axis];
          const placements: [
            ClaimPlacement | undefined,
            ClaimPlacement | undefined,
          ] = [undefined, undefined];
          for (const axis of [0, 1] as const) {
            inkChildren[axis] = new Set();
            dressingChildren[axis] = new Set();
            if (modes[axis] !== "placed" || claimPlaced[axis].size === 0)
              continue;
            const p = placeChildren(
              axis,
              effectiveExtents,
              placedStandIns[axis]
            );
            placements[axis] = p;
            inkChildren[axis] = p.ink;
            dressingChildren[axis] = p.dressing;
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
          // Each child's plot claim, and what a chain reads to lay it
          // (`composePlanExtents`' `parts`).
          const childPlots = applyNestExtentPlan(
            ownPlots,
            t.effectiveChildren,
            t.nestPlan,
            fillsRoom
          );
          const ring = isRing(node);
          const parts = {
            plots: childPlots,
            dressed: node.children.map(
              (c) =>
                c instanceof GoFishNode &&
                c.resolvePlotExtent() !== c.resolveExtent()
            ),
            standIn: node.children.map((c) => c instanceof GoFishRef),
            chrome: node.children.map((_, i) => ring && i > 0),
          };
          const fold =
            t.plan !== undefined && t.composed !== undefined
              ? composePlanExtents(
                  t.plan,
                  t.composed,
                  effectiveExtents,
                  t.effectiveChildren,
                  reflected,
                  parts,
                  false
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
            !outlinedNest &&
            node.children.every(
              (_, i) => !parts.standIn[i] && !parts.dressed[i]
            ) &&
            placements.every((p) => p === undefined || p.plot === p.hull);
          const plotOf = () => {
            return claimFrom(
              childPlots,
              modes.includes("fold")
                ? composePlanExtents(
                    t.plan!,
                    t.composed!,
                    effectiveExtents,
                    t.effectiveChildren,
                    reflected,
                    parts,
                    true
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
          // Its content is widened to its keyed domain and niced, and
          // solved once against the literal size through the registry
          // (`solveFixed`), whose solution `layout` reuses. The box's 0 is
          // its start edge, as its parent lays it out whole (#1032): the
          // scope seats the content past it, so the claim is the content's
          // at that σ, from the start edge. Content that maps no domain
          // (`mapsDomain`) is laid out in the box, which claims its pixels
          // from its start edge too (#493: fixed-size nodes report their
          // size).
          // A literal size on both axes over one declared unit keeps one
          // data unit the same length on x and y (#582): both scopes take
          // the binding σ (`equalizeFixed`), so both are solved before
          // either claim is read. The node still claims its size: its
          // content sits at the box's top-left, and the leftover stays
          // empty.
          const session = node.tryGetRenderSession();
          const keyed: KeyedDomains | undefined = session?.keyedDomains;
          const scopes = getScopeRegistry(session);
          const fixedPx = ([0, 1] as const).map((axis) => {
            const size = dims[axis].size;
            return typeof size === "number"
              ? size + chartChrome(node, axis, size)
              : undefined;
          });
          const solvesDomain = (axis: 0 | 1) =>
            fixedPx[axis] !== undefined &&
            mapsDomain(t.resolved[axis], resolved[axis]);
          for (const axis of [0, 1] as const) {
            const px = fixedPx[axis];
            if (px === undefined || !solvesDomain(axis)) continue;
            const [space, wide] = keyed?.scope(
              node,
              axis,
              t.resolved[axis],
              resolved[axis]!
            ) ?? [t.resolved[axis], resolved[axis]];
            scopes.solveFixed(
              node,
              keyed?.axisKey(node, axis, t.resolved[axis]),
              { kind: "sized", rootKey: node.key ?? node.type, axis },
              space,
              wide,
              px
            );
          }
          if (solvesDomain(0) && solvesDomain(1))
            scopes.equalizeFixed(
              node,
              node.key ?? node.type,
              node.yFrame.direction
            );
          const fixedClaim = (axis: 0 | 1, px: number): Extent | undefined => {
            if (!solvesDomain(axis)) return Extent(Monotonic.linear(0, px));
            const solved = scopes.fixedSolve(node, axis);
            if (solved === undefined) return resolved[axis];
            const { claim, solution, space } = solved;
            const ascent = claim.ascent.run(solution.sigma);
            const descent = claim.descent.run(solution.sigma);
            // Where the scope seats its content (`seatInScope`, as `layout`
            // does): by its baseline, the content keeps its split about its
            // data 0, as the node reports its content's type upward and a
            // parent reads the claim of a type with a data 0 from there. By
            // its box, the content starts at the start edge, so its claim
            // runs from there.
            return seatInScope(solution, space).seat.anchor === "baseline"
              ? Extent(
                  Monotonic.linear(0, ascent),
                  Monotonic.linear(0, descent)
                )
              : Extent(Monotonic.linear(0, ascent + descent));
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
            const px = fixedPx[axis];
            if (px !== undefined) return at(axis, fixedClaim(axis, px));
            return at(axis, resolved[axis]);
          }) as [Extent | undefined, Extent | undefined];
          // A ring has its content's plot. (Where its plot is its whole box,
          // `GoFishNode.resolvePlotExtent` reads its claim instead.)
          const chromeContent = node.chrome?.content.resolvePlotExtent();
          node._plotExtent =
            plotIsClaim && chromeContent === undefined
              ? undefined
              : (([0, 1] as const).map((axis) =>
                  at(axis, (chromeContent ?? plot)[axis])
                ) as [Extent | undefined, Extent | undefined]);
          return claims;
        },
        layout: (size, scales, children, node, region) => {
          // This layer's y direction: its children and constraints are read
          // in this axis order (see `axisDirection.ts`).
          const direction = node.yFrame.direction;
          // Whether this layer is a ring of chrome, whose shapes are no part
          // of its plot.
          const ring = isRing(node);
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

          // `position` constraints with a datum coordinate resolve against
          // the layer's frame. A child such a constraint places at a datum
          // point gets no map on that axis (`childPosScalesFor`).
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
          // On an axis where this layer was handed a span and shares its
          // parent's frame (it is pinned: its frame is the map it was
          // handed), its children's data positions are in its parent's
          // frame, so the region stays in that frame too, and the layer sits
          // at 0 there (see `translate` below) instead of being centered in
          // the span.
          const sharedInSpan = ([0, 1] as const).map(
            (axis) =>
              region?.spans[axis] !== undefined &&
              inheritedPosScales[axis] !== undefined &&
              effectivePosScales[axis] === inheritedPosScales[axis]
          ) as [boolean, boolean];
          const proposals = buildChildProposals(
            node.constraints,
            effectivePosScales,
            region,
            sharedInSpan
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
          // Place a child no constraint places (`unplacedOnly`: on the axes
          // the constraints left it unplaced) at its seat in this layer's
          // scope (`seatInScope`): its baseline, or, where this layer solved
          // a scope with no data 0, its box at this layer's start edge. So a
          // node with a size of its own starts at its start edge on every
          // axis: a frame with a data 0 seats its content there (`originPx`
          // counts what reaches below data 0), and one without places the
          // box. A label hanging before a chart's first bar then sits inside
          // the chart's box, as one below its bars does (#1032).
          //
          // A seat is a position along this layer's axis order. A child whose
          // y grows upward inside this layer that reads top-down has its
          // baseline seated from the bottom of the band this layer allocated
          // it (`childFrames`, else its own box): its axis starts there, as
          // the root's starts at the bottom of the canvas (`placeRoot` in
          // gofish.tsx). A child that reads top-down hangs from its origin,
          // which is its top, in either kind of layer.
          const childFrames: number[] = new Array(children.length);
          const seatChild = (
            cp: (typeof childPlaceables)[number],
            i: number,
            unplacedOnly = false
          ) => {
            for (const axis of [0, 1] as const) {
              if (unplacedOnly && cp.dims[axis].min !== undefined) continue;
              const { seat } = seatInScope(
                layerScales.scopes[axis],
                cp.spaceOn?.(axis)
              );
              const fromBand =
                axis === 1 &&
                seat.anchor === "baseline" &&
                direction === 1 &&
                children[i].yFrame.direction !== 1;
              const band = !fromBand
                ? 0
                : Number.isFinite(childFrames[i])
                  ? childFrames[i]
                  : (cp.dims[1].size ?? 0);
              cp.place(axis === 0 ? "x" : "y", seat.px + band, seat.anchor);
            }
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
            const proposedParts = applyNestLayoutProposal(
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
            // A part of a chain that slices its room (a facet panel) gets
            // its slice as its plot: what dresses it (its chrome) adds
            // around the slice, into the gaps and past the chain's ends, as
            // the chain lays it by its plot (#1032). A ring's own shapes
            // are chrome, and take their slices whole, and so does a part
            // whose plot is its whole box (a chart: its chrome is in its
            // slice).
            const slice =
              childName === undefined ? undefined : sliceByName?.get(childName);
            const proposed = proposedParts.map((v, axis) =>
              slice !== undefined &&
              v === slice[axis] &&
              v !== size[axis] &&
              !ring &&
              child instanceof GoFishNode &&
              !child.plotIsBox(axis as 0 | 1)
                ? v + sum(guttersAroundPlot(child, axis as 0 | 1, v))
                : v
            ) as Size;
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
              seatChild(childPlaceable, i);
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

            // The children that are no part of this layer's plot, per
            // axis: its dressing and ink there, and a ring's shapes (its
            // chrome; a ring's plot is the ring inside it). A chain lays
            // the parts of the plot by their plots, and places one of these
            // past the whole box of what it dresses (#1032).
            const apart: [Set<string>, Set<string>] = [new Set(), new Set()];
            for (const [name] of nameToPlaceable) {
              const i = childOfName.get(name)!;
              for (const axis of [0, 1] as const)
                if (
                  (ring && i > 0) ||
                  inkChildren[axis].has(i) ||
                  dressingChildren[axis].has(i)
                )
                  apart[axis].add(name);
            }

            applyConstraints(
              placementConstraints(node.constraints, proposals.regionByName),
              nameToPlaceable,
              size,
              effectivePosScales,
              gridTracks,
              dataPositioned,
              rigid,
              freeOrigin,
              apart
            );

            // Place any child the constraints left unplaced at its seat
            // (`seatChild`), the same rule as the phase-1 placement in
            // `layoutChild`. A layer without constraints needs no step here:
            // phase 1 already placed every child. A drawing clause that reads the
            // constrained positions is laid out after this (see
            // `relateOrder`), not by a re-layout pass here.
            childPlaceables.forEach((cp, i) => {
              if (cp) seatChild(cp, i, true);
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
            dims[axis].min !== undefined
              ? dims[axis].min - min
              : sharedInSpan[axis]
                ? 0
                : undefined;

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
      dressing: dressingChildren,
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
    // found anywhere in this layer's subtree, kept apart so a later
    // `.relate()` keeps them (see `applyRelationalZBelowDefaults`).
    node._paintDefaults = applyRelationalZBelowDefaults(node, children);
    return node;
  }
);

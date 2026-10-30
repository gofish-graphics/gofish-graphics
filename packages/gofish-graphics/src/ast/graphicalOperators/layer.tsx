// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { GoFishNode, placedByOwnData, type ToPixel } from "../_node";
import type { DisplayList } from "gofish-ir";
import { getScopeRegistry, seatInBand, seatInScope } from "../solver/scopes";
import { isToken } from "../createName";
import { Size, elaborateOwnDims, FancyDims, displayTranslate } from "../dims";
import { UnderlyingSpace, isUNDEFINED, magnitude } from "../underlyingSpace";
import { Extent, impliedExtent, padExtent, shiftExtent } from "../extent";
import * as Pwl from "../solver/pwl";
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
import {
  applyConstraints,
  collectPositionDomains,
  gridSpaces,
  gridCellSizesAt,
  cellBoxesOf,
  cellsOf,
  type ConstraintSpec,
  type ZOrderConstraint,
} from "../constraints";
import {
  GoFishRef,
  resolution,
  type ResolvedConstraints,
  type ResolvedOperand,
} from "../_ref";
import { applyRelationalZBelowDefaults } from "../constraints/relationalPaint";
import {
  axisIndex,
  axisName,
  type ConstraintPosScales,
} from "../constraints/shared";
import {
  applyNestExtentPlan,
  applyNestLayoutProposal,
  applyNestSpacePlan,
  buildNestPlan,
} from "../constraints/nestPlan";
import {
  composePlanSpaces,
  planConstraintComposition,
  planSharing,
  type LayerSharingPlan,
  resolveLayerBaseSpaces,
} from "../constraints/compose";
import {
  buildLayerConstraintLayoutPlan,
  buildChildSpans,
  childLayoutSizeProposal,
  childPosScalesFor,
  selectGridConstraint,
  solveLayerScales,
} from "../constraints/proposalPlan";
import {
  actsOn,
  literalSeats,
  type ClaimChild,
  type Placement,
} from "../constraints/claimPlacement";
import {
  buildPlan,
  planPlacement,
  planPlacementInChild,
  plotIn,
  type LayerPlan,
} from "../solver/plan";
import { evaluate } from "../solver/formula";
import {
  aroundPlot,
  chromeForms,
  contentSeat,
  guttersAt,
  setChromeForms,
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
        lo: Pwl.addConstant(p.lo, -o),
        hi: Pwl.addConstant(p.hi, o),
        extent: padExtent(p.extent, o),
      };

/** Whether `node` is a ring of chrome (`GoFishNode.chrome`): a layer whose
 *  first child is the ring inside it and whose other children are chrome.
 *  (Not every `_transparent` wrapper: a label ring's labels are no chrome.) */
const isRing = (node: GoFishNode): boolean => {
  for (let o: GoFishNode | undefined = node; o !== undefined; o = o.parent)
    if (o.chrome?.rings.includes(node)) return true;
  return false;
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

    // A length for its own size (`w: percent(30)`, `w: fr(2)`, #1176 step
    // 6) is laid out in the room the layer is given, which is known only
    // once the layer is in its tree. The size it fixes for itself is its
    // pixels then, and none where it is a share of its scope, which sizes
    // it (`fixedSize`): it is then a scope for its content, but not a sized
    // node. A length is never data (`sizeForType`).
    const own = elaborateOwnDims<number>(options);
    const { dims, dataSize } = own;

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
    // Per axis, the children that are ink there (`placeByClaims`): they
    // draw, but take no room in the claim, nor in the box.
    const inkChildren: [Set<number>, Set<number>] = [new Set(), new Set()];
    // Per axis, the children that are dressing there (`placeByClaims`).
    const dressingChildren: [Set<number>, Set<number>] = [new Set(), new Set()];
    // Where each child that is a `ref` stand-in has its target land in this
    // layer's frame on `axis` (`planPlacement`), and where each child drawn
    // from refs lands (`GoFishNode.placedFromRefs`), by child index, its
    // outline included (`GoFishNode.claimedOverhang`), as a claim includes it.
    const standInPlacements = (axis: 0 | 1): (Placement | undefined)[] =>
      node.children.map((c) =>
        c instanceof GoFishRef
          ? c.targetNode !== undefined
            ? planPlacement(c.targetNode, node, axis)
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
      let held: boolean | undefined;
      return node.children.map((c, i) => ({
        key: c.uid,
        extent: extents[i]?.[axis],
        space: c.resolveUnderlyingSpace()[axis],
        standIn: c instanceof GoFishRef,
        fromRefs: c instanceof GoFishNode && c.placedFromRefs !== undefined,
        placed: placed[i],
        inkOn:
          (c as GoFishNode).inkOn?.[axis] === true ||
          (c instanceof GoFishNode &&
            c.placedFromRefs !== undefined &&
            placed[i] === undefined) ||
          (alongOwnAxis(c, axis) && (held ??= heldInChain(axis))),
        dataPositioned: placedByOwnData(node, i, axis),
      }));
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
        if (p.claimWalk?.ownSize(axis) !== undefined) return false;
      }
      return false;
    };
    // Where an operand nested in a child lands in that child's own frame,
    // by its key.
    const nestedPlacement =
      (axis: 0 | 1, operands: ReadonlyMap<string, ResolvedOperand>) =>
      (key: string) => {
        const op = operands.get(key);
        const container = op && node.children[op.child];
        return op !== undefined &&
          op.node instanceof GoFishNode &&
          container instanceof GoFishNode
          ? planPlacementInChild(op.node, container, axis)
          : undefined;
      };
    // How this layer seats its children (`ClaimWalk.seating`), read once
    // for the operands it was read from.
    let seatingMemo:
      | {
          of: ResolvedConstraints;
          seating: ReturnType<NonNullable<GoFishNode["claimWalk"]>["seating"]>;
        }
      | undefined;
    const seating = () => {
      const resolved = resolution(node);
      if (seatingMemo?.of === resolved) return seatingMemo.seating;
      const { operands, keyOf } = resolved;
      const acting: [
        Map<number, ConstraintSpec[]>,
        Map<number, ConstraintSpec[]>,
      ] = [new Map(), new Map()];
      for (const c of node.constraints)
        for (const axis of [0, 1] as const) {
          if (!actsOn(c, axis)) continue;
          const kids = new Set<number>();
          for (const r of c.children) {
            const op = operands.get(keyOf(r));
            if (op !== undefined) kids.add(op.child);
          }
          for (const k of kids) {
            const list = acting[axis].get(k);
            if (list === undefined) acting[axis].set(k, [c]);
            else list.push(c);
          }
        }
      const fresh = {
        acting,
        seats: literalSeats(node.constraints, keyOf),
      };
      seatingMemo = { of: resolved, seating: fresh };
      return fresh;
    };
    // The layer's composed per-axis types: the types of its content. A pure
    // function of the children's types: the type hook computes it, reports it
    // (a data-valued size reports its magnitude instead), and keeps it in
    // `layerTypes` for the claim hook, which follows the same steps.
    const composeLayerTypes = (
      children: Size<UnderlyingSpace>[],
      childNodes: readonly GoFishAST[],
      constraints: readonly ConstraintSpec[]
    ) => {
      // A grid constraint makes this layer a grid. Stage 6e: the grid no
      // longer bypasses the fold — it participates. Its categorical track
      // axes (ORDINAL over columns / rows, for axis rendering) are composed
      // in at the END of this function, overriding the covered axes, while
      // any sibling constraint (align / position) still contributes to the
      // fold below. Its size claim (Σ max-of-cell-claims + gaps) is the
      // layer's claim (`gridTracks`), not its type: a categorical axis
      // cannot also be a SIZE magnitude.
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
      const nestPlan = buildNestPlan(childNodes, constraints, resolution(node));
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
      const { operands, keyOf } = resolution(node);
      const posDomains = collectPositionDomains(constraints, (c, axis) =>
        c.children.every((r) => {
          const op = operands.get(keyOf(r));
          return op?.direct !== true || sharing.sets[axis][op.child] === 0;
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
      const resolved = resolveLayerBaseSpaces(
        effectiveChildren,
        posDomains,
        placed
      );

      // A simple spread expressed as align + distribute. When the
      // constraints match that operator image (see planConstraintComposition),
      // override the constrained axes with spread's own type folds (the
      // distribute fold on the distribute axis, the alignment fold on the
      // cross axis); the claim hook folds their claims the same way. A sized
      // layer maps the folded type into its box, exactly like spread.
      const plan = planConstraintComposition(
        constraints,
        childNodes,
        resolution(node)
      );
      const composed =
        plan !== undefined
          ? composePlanSpaces(plan, effectiveChildren)
          : undefined;
      if (composed !== undefined) {
        for (const axis of [0, 1] as const) {
          const s = composed[axis];
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
        gridC !== undefined ? gridSpaces(gridC, cellsOf(node)) : undefined;
      if (gridAxes !== undefined) {
        for (const axis of [0, 1] as const) {
          if (!isUNDEFINED(gridAxes[axis])) resolved[axis] = gridAxes[axis];
        }
      }
      return {
        nestPlan,
        effectiveChildren,
        plan,
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
          const plan = planSharing(constraints, childNodes, resolution(node));
          for (const axis of [0, 1] as const)
            if (isValue(dataSize(axis)))
              childNodes.forEach((_, i) => plan.nested[axis].add(i));
          return plan;
        },
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: readonly GoFishAST[],
          constraints: readonly ConstraintSpec[]
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
            const dsize = dataSize(axis);
            return isValue(dsize)
              ? magnitude(dsize)
              : layerTypes!.resolved[axis];
          }) as Size<UnderlyingSpace>;
        },
        // The claim half: the nest padding on the children's claims, then
        // the layer's plan on each axis.
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
            c instanceof GoFishNode ? plotIn(node, c) : c.resolveExtent()
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
          const refs = resolution(node);
          const ring = isRing(node);
          // The layer's plan on each axis (`buildPlan`): one solve over
          // every child, by its box, where its constraints place it. Its
          // claim is the envelope of what its children draw there, and its
          // plot the envelope of their plots, leaving out the dressing and
          // the ink. On a grid's track axis it places its cells in their
          // tracks, and its claim is the tracks and gaps (`gridTracks`).
          const plans = ([0, 1] as const).map((axis) =>
            buildPlan(
              node,
              axis,
              claimChildren(axis, effectiveExtents, standInPlacements(axis)),
              node.constraints,
              refs,
              nestedPlacement(axis, refs.operands),
              ring,
              scale[axis]
            )
          ) as [LayerPlan | undefined, LayerPlan | undefined];
          node._claimMemo.plans = plans;
          const session = node.tryGetRenderSession();
          for (const axis of [0, 1] as const) {
            inkChildren[axis] = plans[axis]?.placement.ink ?? new Set();
            dressingChildren[axis] =
              plans[axis]?.placement.dressing ?? new Set();
            if (inkChildren[axis].size > 0 && session !== undefined)
              (session.inkLayers ??= new Set()).add(node);
          }
          const resolved = plans.map((p) => p?.summary?.whole) as [
            Extent | undefined,
            Extent | undefined,
          ];
          // A layer whose children are no stand-ins and have their claims
          // as their plots, with no dressing placed (no child it places is
          // dressing), has its claim as its plot.
          const plotIsClaim =
            !outlinedNest &&
            node.children.every(
              (c) =>
                !(c instanceof GoFishRef) &&
                !(
                  c instanceof GoFishNode &&
                  c.resolvePlotExtent() !== c.resolveExtent()
                )
            ) &&
            plans.every(
              (p) =>
                p === undefined ||
                ![...p.placement.boxes().keys()].some((i) =>
                  p.placement.dressing.has(i)
                )
            );
          const plot = plotIsClaim
            ? resolved
            : (plans.map((p) => p?.summary?.plot) as [
                Extent | undefined,
                Extent | undefined,
              ]);
          // The content's claim, which `layout` solves against the layer's box
          // when the layer is sized. A data-valued size reports the claim of
          // its magnitude instead; the content's claim stays inside the box.
          contentExtents[0] = resolved[0];
          contentExtents[1] = resolved[1];
          // What the layer claims upward. A data-valued size claims its
          // magnitude. A literal size claims its own pixels: the box is a
          // sized node, so its content's σ is its own, and the parent must
          // not solve against the content as if it were data-scaled room.
          // A node's own size is its plot (#1032): its content's chrome
          // and dressing add around it. So its chrome forms are its
          // content's claim and plot, widened to its keyed domain and
          // niced (`setChromeForms`), and the literal size is solved once
          // as the plot through the registry (`solveFixed`), whose
          // solution `layout` reuses; the node claims the whole at that σ.
          // The node claims its own size and the reach of what dresses it
          // (#493: fixed-size nodes report their size), whether its
          // content fits or overflows it: the one fit (`ScopeRegistry.fit`)
          // warns once where the content's fixed parts need more than the
          // size, and the content draws past it. Where the fit solved a
          // scope, the scope seats the content in the box, so the claim
          // keeps the content's split about its data 0 at that σ; content
          // that maps no domain is laid out in the box from its start edge
          // (`aroundPlot`).
          // A literal size on both axes over one declared unit keeps one
          // data unit the same length on x and y (#582): both scopes take
          // the binding σ (`equalizeFixed`), so both are solved before
          // either claim is read. The node still claims its size: its
          // content sits at the box's top-left, and the leftover stays
          // empty.
          const keyed: KeyedDomains | undefined = session?.keyedDomains;
          const scopes = getScopeRegistry(session);
          for (const axis of [0, 1] as const)
            if (node.fixedSize(axis) !== undefined)
              setChromeForms(
                node,
                axis,
                resolved[axis],
                plot[axis],
                (claim) =>
                  keyed?.scope(
                    node,
                    axis,
                    t.resolved[axis],
                    claim,
                    !isValue(dataSize(axis))
                  )[1] ?? claim
              );
          const fixedPx = ([0, 1] as const).map((axis) => {
            const size = node.fixedSize(axis);
            return typeof size === "number" ? size : undefined;
          });
          for (const axis of [0, 1] as const) {
            const px = fixedPx[axis];
            if (px === undefined) continue;
            const space =
              keyed?.scope(node, axis, t.resolved[axis], resolved[axis]!)[0] ??
              t.resolved[axis];
            scopes.solveFixed(
              node,
              keyed?.axisKey(node, axis, t.resolved[axis]),
              { kind: "sized", rootKey: node.key ?? node.type, axis },
              space,
              chromeForms(node, axis),
              px
            );
          }
          if (fixedPx[0] !== undefined && fixedPx[1] !== undefined)
            scopes.equalizeFixed(
              node,
              node.key ?? node.type,
              node.yFrame.direction
            );
          const fixedClaim = (axis: 0 | 1, px: number): Extent => {
            const solved = scopes.fixedSolve(node, axis);
            if (solved === undefined)
              return Extent(Pwl.constant(aroundPlot(node, axis, px)));
            const { claim, solution, space, box } = solved;
            const descent = Pwl.at(claim.descent, solution.sigma);
            // Where the scope seats its content (`seatInScope`, as `layout`
            // does): by its baseline, the content keeps its split about its
            // data 0, as the node reports its content's type upward and a
            // parent reads the claim of a type with a data 0 from there. By
            // its box, the content starts at the start edge, so its claim
            // runs from there.
            return seatInScope(solution, space).seat.anchor === "baseline"
              ? Extent(Pwl.constant(box - descent), Pwl.constant(descent))
              : Extent(Pwl.constant(box));
          };
          // A literal start places the layer that many pixels from its
          // parent's origin (`translate` in `layout`), so its claim moves
          // with it.
          const at = (axis: 0 | 1, claim: Extent | undefined) => {
            const min = dims[axis].min;
            return claim === undefined || typeof min !== "number"
              ? claim
              : shiftExtent(claim, Pwl.constant(min));
          };
          const claims = ([0, 1] as const).map((axis) => {
            if (isValue(dataSize(axis))) return impliedExtent(spaces[axis]);
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
        layout: (size, scales, children, node) => {
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
          // node's own size is its plot's: what dresses its content adds
          // around it (`aroundPlot`).
          size = ([0, 1] as const).map((axis) => {
            const fixed = node.fixedSize(axis);
            return fixed === undefined
              ? size[axis]
              : aroundPlot(
                  node,
                  axis,
                  computeSize(fixed, inheritedScaleFactors[axis]!, size[axis])
                );
          }) as Size;

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
          const viaSet = (axis: 0 | 1) => !isValue(dataSize(axis));
          const scopes = getScopeRegistry(node.tryGetRenderSession());
          const layerScales = solveLayerScales(
            [node.fixedSize(0) !== undefined, node.fixedSize(1) !== undefined],
            layerTypes?.resolved,
            contentExtents,
            node._underlyingSpace,
            (axis) => node.isScope(axis),
            size,
            inheritedScaleFactors,
            inheritedPosScales,
            (axis, space, claim) =>
              keyed?.scope(node, axis, space, claim, viaSet(axis)) ?? [
                space,
                claim,
              ],
            scopes,
            node,
            [scopes.fixedSolve(node, 0), scopes.fixedSolve(node, 1)]
          );
          const childScaleFactors = layerScales.sigmas;
          // Every reference as the last `resolveReferences` round resolved
          // it: each placement operand, by key, and the order of the
          // drawing clauses.
          const { operands, keyOf, schedule: relateOrder } = resolution(node);
          const gridC = selectGridConstraint(node.constraints);
          // A grid's cells at the σ they are laid out at
          // (`gridCellSizesAt`): each cell is proposed its track's extent,
          // by the cells' boxes in this layer's plan, as the claim walk
          // sized the tracks (`cellBoxesOf`), and the plan centers it in
          // its track from its laid-out size.
          const gridCellByKey = gridC
            ? gridCellSizesAt(
                gridC,
                keyOf,
                cellBoxesOf(node),
                childScaleFactors
              )
            : undefined;
          // A node dressed in chrome reads its gutters off its chrome forms
          // at the σ it is laid out at (#1032). It seats its content past
          // them (`seatsOf`).
          if (node.chrome !== undefined) {
            node.chrome.gutters = [
              guttersAt(node, 0, childScaleFactors[0]),
              guttersAt(node, 1, childScaleFactors[1]),
            ];
          }

          // `position` constraints with a datum coordinate resolve against
          // the layer's frame. A child such a constraint places at a datum
          // point gets no map on that axis (`childPosScalesFor`).
          const effectivePosScales = layerScales.frames;
          // The span each child's position constraints hand it, which it is
          // laid out in: an interval it is pinned across, or its cell (#1059).
          const spanByKey = buildChildSpans(
            node.constraints,
            keyOf,
            effectivePosScales
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
          // here; constrained ones get the same pixel from the plan, which
          // reads it as its `origin`. A pinned child shares the frame and
          // stays at 0.
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
          // the root's starts at the bottom of the canvas (`seatInBand`, as
          // `placeRoot` in gofish.tsx). A child that reads top-down hangs from its origin,
          // which is its top, in either kind of layer.
          const childFrames: number[] = new Array(children.length);
          const seatOf = (
            cp: (typeof childPlaceables)[number],
            i: number,
            axis: 0 | 1
          ): { px: number; anchor: "baseline" | "min" } => {
            const { seat } = seatInScope(
              layerScales.scopes[axis],
              cp.spaceOn?.(axis)
            );
            // A scope's seat is in this layer's axis order. With no scope a
            // child's baseline is at its own axis start, which, for a child
            // whose y grows upward in a layer that reads top-down, is its
            // band's bottom.
            const fromBand =
              axis === 1 &&
              layerScales.scopes[axis] === undefined &&
              direction === 1 &&
              children[i].yFrame.direction !== 1;
            if (!fromBand) return seat;
            const band = Number.isFinite(childFrames[i])
              ? childFrames[i]
              : (cp.dims[1].size ?? 0);
            return seatInBand(seat, band, -1);
          };
          const seatChild = (
            cp: (typeof childPlaceables)[number],
            i: number,
            unplacedOnly = false
          ) => {
            for (const axis of [0, 1] as const) {
              if (unplacedOnly && cp.dims[axis].min !== undefined) continue;
              const seat = seatOf(cp, i, axis);
              cp.place(axisName(axis), seat.px, seat.anchor);
            }
          };

          const childPlaceables: ReturnType<
            (typeof children)[number]["layout"]
          >[] = new Array(children.length);

          const layoutPlan = buildLayerConstraintLayoutPlan(
            node.children,
            node.constraints,
            { operands, keyOf }
          );
          // A child skips phase-1 baseline placement only when a positioning
          // operand names the child itself. A nested operand does not: it is
          // a fixed reference into its container, which stays where its own
          // placement puts it unless the container is named too (then the
          // two move together — see `NestedOperand`).
          const constrainedChildren = new Set<number>();
          for (const key of layoutPlan.constrainedKeys) {
            const op = operands.get(key);
            if (op?.direct) constrainedChildren.add(op.child);
          }
          // Where a literal position pins each child's origin, read once. A
          // node dressed in chrome seats its content past its start gutters
          // instead (`contentSeat`).
          const literalSeatsByKey = seating().seats;
          const seatsOf = (
            i: number
          ): [number | undefined, number | undefined] => {
            const lit = literalSeatsByKey.get(node.children[i].uid) ?? [
              undefined,
              undefined,
            ];
            return i === 0 && node.chrome !== undefined
              ? [contentSeat(node, 0, lit[0]), contentSeat(node, 1, lit[1])]
              : lit;
          };

          const layoutChild = (i: number) => {
            const child = children[i];
            const childKey = node.children[i].uid;
            const targetDims = layoutPlan.positionTargetDims.get(childKey);
            // Nest proposal: override the DERIVED node's size from its
            // SOURCE on each derived axis — `outer = inner + 2p` for 'in',
            // `inner = outer − 2p` for 'out'. The source is already laid out
            // (ahead of us in layoutOrder, since the plan orders source before
            // derived). Clamp ≥ 0; non-derived axes keep the normal child
            // proposal, so nest composes with — and wins on its derived axes
            // over — any other proposal.
            // In a share scope (`sharesRoom`) a child is laid out at its
            // claim at σ: a band is one σ, and a node that holds bands is
            // what its claim says at the σ the scope solved. So is a share
            // in a scope that data sizes (a part whose size flexes).
            const own = ([0, 1] as const).map((axis) => {
              const sigma = childScaleFactors[axis];
              const claim =
                child instanceof GoFishNode
                  ? child.resolveExtent()[axis]
                  : undefined;
              return claim !== undefined &&
                sigma !== undefined &&
                Number.isFinite(sigma) &&
                (node.sharesRoom(axis) || (child as GoFishNode).flexes(axis))
                ? Pwl.at(claim.width, sigma)
                : undefined;
            }) as Size<number | undefined>;
            const proposed = applyNestLayoutProposal(
              childLayoutSizeProposal(
                childKey,
                size,
                gridCellByKey,
                spanByKey,
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
            const seats = seatsOf(i);
            const childMaps = childPosScalesFor(
              (children[i] as GoFishNode)._underlyingSpace,
              targetDims,
              effectivePosScales,
              seats
            );
            childFrames[i] = layoutSize[1];
            const childPlaceable = child.layout(layoutSize, [
              axisScale(childScaleFactors[0], childMaps[0]),
              axisScale(childScaleFactors[1], childMaps[1]),
            ]);
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

          // Drawing clauses of `.relate()` run in dependency order around the
          // solve (`relateOrder`): a clause that reads positions lays out
          // after the solve that writes them (#878). Plain children lay out
          // before it, as always.
          for (const i of layoutPlan.layoutOrder) {
            if (!relateOrder.clauses.has(i)) layoutChild(i);
          }
          for (const i of relateOrder.beforeSolve) layoutChild(i);

          if (node.constraints.length > 0) {
            // Constraint-based placement: the placeable of each operand, by
            // its key. A direct operand is its child's placeable (a drawing
            // clause laid out after the solve has none yet); a nested one is
            // a `NestedOperand` rigidly tied to the child that contains it,
            // its container, keyed by that child's uid whether or not the
            // child is an operand too.
            const keyToPlaceable = new Map<
              string,
              (typeof childPlaceables)[number]
            >();
            node.children.forEach((c, i) => {
              // A drawing clause laid out after the solve has no placeable
              // yet, and nothing in the solve can address it.
              if (childPlaceables[i])
                keyToPlaceable.set(c.uid, childPlaceables[i]);
            });
            // A nested operand is a `NestedOperand` held at a fixed offset
            // inside the child that contains it (`gaps`).
            const gaps = new Map<string, [number, number]>();
            for (const [key, op] of operands) {
              if (op.direct) continue;
              // The operand sits at a fixed pixel offset inside its container
              // (`nestedGap`), in this layer's axis order.
              const containerPx = rawPlaceable(childPlaceables[op.child]);
              const gapPx = nestedGap(op.node, node.children[op.child]);
              const operand = new NestedOperand(
                op.name,
                op.node,
                containerPx,
                gapPx
              );
              keyToPlaceable.set(
                key,
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
              gaps.set(key, gap);
            }

            // What the plan reads off layout on `axis` (`PlanInput`), for a
            // child by its index and for a nested operand by its key
            // (`@key`): a target's laid box about its origin (`lo`, `hi`)
            // and plot (`plo`, `phi`; its box where its plot is its box),
            // where a target placed before the solve has its origin (`at`),
            // where this layer's frame seats a child no constraint places
            // (`seat`, `seatInScope`), a nested operand's offset in its
            // container (`gap`), the pixel a literal position seats a
            // child's origin at (`lit`), the pixel of data 0 (`origin`), and
            // the layer's box (`size`).
            const inputOf =
              (axis: 0 | 1) =>
              (key: string): number | undefined => {
                if (key === "origin") return effectivePosScales[axis]?.originPx;
                if (key === "size")
                  return Number.isFinite(size[axis]) ? size[axis] : undefined;
                const colon = key.indexOf(":");
                const kind = key.slice(0, colon);
                const who = key.slice(colon + 1);
                const nestedKey = who.startsWith("@")
                  ? who.slice(1)
                  : undefined;
                if (kind === "gap") return gaps.get(nestedKey!)?.[axis];
                const i = nestedKey === undefined ? Number(who) : undefined;
                const p =
                  i !== undefined
                    ? childPlaceables[i]
                    : keyToPlaceable.get(nestedKey!);
                if (p === undefined) return undefined;
                const lo = p.localAnchor?.(axis, "min");
                const hi = p.localAnchor?.(axis, "max");
                switch (kind) {
                  case "lit":
                    return seatsOf(i!)[axis];
                  case "lo":
                    return lo;
                  case "hi":
                    return hi;
                  case "plo":
                    return p.localPlotSpan?.(axis)?.[0] ?? lo;
                  case "phi":
                    return p.localPlotSpan?.(axis)?.[1] ?? hi;
                  case "at": {
                    const min = p.dims[axis].min;
                    return min === undefined || lo === undefined
                      ? undefined
                      : min - lo;
                  }
                  case "seat": {
                    // Seating leaves a child that placed itself where it is.
                    const min = p.dims[axis].min;
                    if (min !== undefined)
                      return lo === undefined ? undefined : min - lo;
                    const seat = seatOf(p, i!, axis);
                    return seat.anchor === "baseline"
                      ? seat.px
                      : lo === undefined
                        ? undefined
                        : seat.px - lo;
                  }
                }
                return undefined;
              };
            // Write the plan's seats back: each placed cell's box start, and
            // its size where the plan sets one, at the σ this layer hands
            // its children, with the inputs measured above.
            const seatByPlan = () => {
              const evaluated = ([0, 1] as const).map((axis) => {
                const seats = node._claimMemo.plans[axis]?.placement.seats;
                if (seats === undefined) return undefined;
                const sigma =
                  effectivePosScales[axis]?.sigma ??
                  childScaleFactors[axis] ??
                  0;
                return {
                  seats,
                  v: evaluate(seats.tape, sigma, inputOf(axis)),
                };
              });
              // Two constraints that place one child at two places are an
              // error: each over-determination the solve kept must agree
              // where layout evaluates it.
              evaluated.forEach((e, axis) => {
                if (e === undefined) return;
                for (const c of e.seats.tape.checks) {
                  const [a, b] = [e.v[c.a], e.v[c.b]];
                  if (!(Math.abs(a - b) <= c.tolerance))
                    throw new Error(
                      `Constraint placement conflict on ${axisName(axis as 0 | 1)}: ` +
                        `${c.owner} asserts ${a}, but ${c.priorOwner} implies ${b}`
                    );
                }
              });
              evaluated.forEach((e, i) => {
                if (e === undefined) return;
                const axis = i as 0 | 1;
                const { seats, v } = e;
                const label = axisName(axis);
                for (const [key, cell] of seats.cells) {
                  const t = keyToPlaceable.get(key);
                  if (t === undefined) continue;
                  const min = v[cell.min];
                  if (cell.sizeStrong && cell.size !== undefined && t.setExtent)
                    t.setExtent(
                      label,
                      { min, max: min + v[cell.size] },
                      cell.sizeOwner
                    );
                  else if (t.pinAnchor) t.pinAnchor(axis, min, "min");
                  else t.place(axis, min, "min");
                }
                for (const [key, { size, owner }] of seats.sizeOnly)
                  keyToPlaceable.get(key)?.setSizeOnly?.(label, v[size], owner);
              });
            };

            applyConstraints(
              node.constraints,
              keyOf,
              keyToPlaceable,
              size,
              effectivePosScales,
              seatByPlan
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
      dressing: dressingChildren,
      seating,
      // Both read live: a `dims` option names its axes only once the scopes
      // around the layer are known (`deferAxisDims`), and then sets them.
      literalStart: (axis) => {
        const min = dims[axis].min;
        return typeof min === "number" ? min : undefined;
      },
      ownSize: (axis) => node.fixedSize(axis),
      plan: (axis) => {
        node.resolveExtent();
        return node._claimMemo.plans[axis];
      },
    };
    // Give it its own box, and defer the axis-name-keyed `dims` option to
    // the resolveAliases pass.
    own.bind(node);
    // A size of its own makes it a scope of its own there.
    node.ownsScopeOn = (axis) => node.fixedSize(axis) !== undefined;
    // Default zBelow(connector, operand) for relational marks (line/ribbon/…)
    // found anywhere in this layer's subtree, kept apart so a later
    // `.relate()` keeps them (see `applyRelationalZBelowDefaults`).
    node._paintDefaults = applyRelationalZBelowDefaults(node, children);
    return node;
  }
);

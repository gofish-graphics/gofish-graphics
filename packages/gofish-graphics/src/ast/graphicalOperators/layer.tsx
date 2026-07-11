// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { GoFishNode, placeUnplacedChild, type ToPixel } from "../_node";
import type { DisplayList } from "gofish-ir";
import { shadowCheckScaleRoot } from "../solver/shadow";
import { getScopeRegistry } from "../solver/scopes";
import { isToken } from "../createName";
import {
  Size,
  elaborateDims,
  extractAliasCandidates,
  FancyDims,
  displayTranslate,
} from "../dims";
import {
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  hasBaseline,
  isCONTINUOUS,
  isUNDEFINED,
} from "../underlyingSpace";
import { getMeasure, getValue, isValue } from "../data";
import * as Monotonic from "../../util/monotonic";
import { computeSize, foldFinite } from "../../util";
import { axisScale } from "../domain";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { coord } from "../coordinateTransforms/coord";
import { bakeChildren } from "../coordinateTransforms/bake";
import { createNodeOperatorSequential } from "../withGoFish";
import { GoFishAST } from "../_ast";
import {
  applyConstraints,
  collectPositionDomains,
  gridSpaces,
  resolveGridTracks,
  gridCellSizeByName,
  gridTracksFromSizes,
  Constraint,
  type ConstraintSpec,
  type ZOrderConstraint,
} from "../constraints";
import { GoFishRef, findPathToRoot } from "../_ref";
import { childNameKey, type ConstraintPosScales } from "../constraints/shared";
import { anchorOffset } from "../constraints/placementProgramLowerer";
import {
  applyNestLayoutProposal,
  applyNestSpacePlan,
  buildNestPlan,
} from "../constraints/nestPlan";
import {
  composeConstraintSpaces,
  resolveLayerBaseSpaces,
  type ComposeBudget,
} from "../constraints/compose";
import {
  buildDistributeSliceMap,
  buildChildScalePlan,
  buildLayerConstraintLayoutPlan,
  buildPositionScalePlan,
  childLayoutSizeProposal,
  childPosScalesFor,
  selectGridConstraint,
} from "../constraints/proposalPlan";

// ── Z-order resolution ────────────────────────────────────────────────────
//
// When a layer has `Constraint.zAbove` / `zBelow` constraints, it flattens
// its (non-component) subtree into a single paint list, topologically sorts
// it against the constraints, and emits the result in resolved order.

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
function targetOf(n: GoFishAST): GoFishNode | undefined {
  return n instanceof GoFishRef ? n.targetNode : (n as GoFishNode);
}

/** Give `node` a resolvable constraint name if it doesn't already have one
 *  (mirrors `ensureChildNames`'s synthesis, scoped to this one-off use). */
function ensureConstraintName(node: GoFishNode, synth: string): string {
  if (node._name !== undefined) {
    return typeof node._name === "string" ? node._name : synth;
  }
  node._name = synth;
  return synth;
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
 * as an author decision) or `.constrain(...)` (a non-empty constraints array)
 * is left alone — the explicit choice wins over the default.
 *
 * A connector whose referenced node lies outside `children`'s subtrees (e.g.
 * both live several `.layer()` tiers up) is left tagged so an OUTER `layer()`
 * call gets a chance to resolve it — the tag is only cleared once consumed.
 *
 * Returns the auto-derived zBelow constraints (merged with any that already
 * existed on `node` — there are none for a freshly built layer, but this
 * stays defensive) to install via `node.constrain(...)`-equivalent direct
 * assignment (this runs before any user `.constrain()` chain, which replaces
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
  let synthIdx = 0;
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
      // resolve. NB: the constraint targets `target` ITSELF (the operand's
      // own node), not whichever top-level `children` entry contains it — a
      // chart tier's resolved root is typically itself a (non-component)
      // `layer`/`frame` node that `orderChildrenForPaint`'s flatten pass
      // hoists through transparently, so naming *it* would never match once
      // hoisted. `target` is exactly what the flatten pass leaves in the
      // paint list, and for a per-item mark it's already carrying the
      // tier's auto-assigned name (every instance shares it), so no
      // synthesis is usually needed.
      const path = findPathToRoot(target);
      const withinScope = children.some(
        (c) => c !== connector && path.includes(c as GoFishAST)
      );
      if (!withinScope) continue;
      const connectorName = ensureConstraintName(
        connector,
        `__gofish_z_${synthIdx++}`
      );
      const targetName = ensureConstraintName(
        target,
        `__gofish_z_${synthIdx++}`
      );
      pairs.push([connectorName, targetName]);
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
    const pendingAliases = extractAliasCandidates(options);

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
    let constraintBudget: ComposeBudget | undefined;

    const node = new GoFishNode(
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
          // A grid constraint makes this layer a grid. Stage 6e: the grid no
          // longer bypasses the fold — it participates. Its categorical track
          // axes (ORDINAL over columns / rows, for axis rendering) are composed
          // in at the END of this function, overriding the covered axes, while
          // any sibling constraint (align / position) still contributes to the
          // fold below. Its size claim (Σ max-of-cell-claims + gaps) is consumed
          // at layout time by `resolveGridTracks`, not reported as the axis space
          // — a categorical axis cannot also be a SIZE magnitude.
          const gridC = selectGridConstraint(constraints ?? []);

          // Nest space fold: only INSIDE_OUT edges (`dir: 'in'`) derive a
          // space — `outer = inner + 2·padding` when inner is SIZE — so a
          // nested pair participates in the union below, hence in a parent's
          // auto-fit solve. Computed in dependency (source-first) order so
          // chained nests compose (A⊇B⊇C: C feeds B feeds A). OUTSIDE_IN
          // edges derive NOTHING here: the outer is a normal child whose own
          // claim (or fill/undefined) flows through the union, and `inner =
          // outer − 2p` is purely a layout-time proposal. When inner isn't SIZE,
          // `nestedSpace` leaves outer as-is and the proposal handles sizing.
          const nestPlan = buildNestPlan(_childNodes, constraints ?? []);
          const effectiveChildren = applyNestSpacePlan(children, nestPlan);

          // `position` constraints contribute a POSITION-domain fragment per
          // axis: the union of their data values is this layer's domain on that
          // axis, merged with any POSITION domain bubbled up from children. This
          // is what lets the layer build a position scale at layout time so
          // `Constraint.position` can map data values to pixels.
          const posDomains = collectPositionDomains(constraints ?? []);
          const resolved = resolveLayerBaseSpaces(
            effectiveChildren,
            [
              options.transform?.scale?.x ?? 1,
              options.transform?.scale?.y ?? 1,
            ],
            posDomains
          );

          // A simple spread expressed as align + distribute. When the
          // constraints match that operator image (see composeConstraintSpaces),
          // override the constrained axes with spread's own space folds (SIZE
          // sum + spacing on the distribute axis, the alignment fold on the
          // cross axis). Applied BEFORE the self-scaling stash below so an
          // explicit-size layer builds its LOCAL scale from the folded space,
          // exactly like spread.
          const shape = composeConstraintSpaces(
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

          // Grid track axes compose LAST, overriding the covered axes with the
          // categorical ORDINAL space (columns on x, rows on y) that axis
          // rendering consumes — the grid's contribution to the fold. A pure
          // grid therefore reports exactly `gridSpaces` (as before); a grid mixed
          // with a sibling constraint keeps that sibling's fold on any axis the
          // grid leaves UNDEFINED (no keys).
          if (gridC !== undefined) {
            const gridAxes = gridSpaces(gridC, _childNodes);
            for (const axis of [0, 1] as const) {
              if (!isUNDEFINED(gridAxes[axis])) resolved[axis] = gridAxes[axis];
            }
          }

          // Stash the absorbed anchored extent and report UNDEFINED upward for
          // any dim with an explicit pixel size — self-scaling region; see
          // selfScaledSpaces above. (last write wins — may run more than once.)
          // `node.selfScaledSpace` mirrors the stash for the axis-demand walk
          // (issue #659): a stashed dim roots its own σ-scope, so an enclosing
          // scope's nicing-demand walk must not descend past it (presence,
          // not a separate boolean, is the "self-scaled" marker).
          selfScaledSpaces[0] = undefined;
          selfScaledSpaces[1] = undefined;
          node.selfScaledSpace[0] = undefined;
          node.selfScaledSpace[1] = undefined;
          for (const axis of [0, 1] as const) {
            const composed = resolved[axis];
            const dsize = dims[axis].size;
            if (dsize === undefined) continue;
            // DATA-DRIVEN operator extent (#4/#20 — nested mosaic). Report a
            // SIZE claim UPWARD so the ENCLOSING shared scale solves this
            // operator's pixel extent: the operator is a *leaf* in its
            // ancestor's scale scope, exactly like a leaf rect with `w:"count"`.
            // Its subtree is then a fresh scale scope, resolved against the
            // solved box in `layout` via computeSize. (A LITERAL pixel size
            // below stays a self-scaling region — a fixed box with its own
            // units, e.g. a marginal histogram, which must NOT pollute the
            // ancestor's data domain.)
            if (isValue(dsize)) {
              // A data-valued size claim (e.g. `w: "count"`) overrides the
              // composed content space with its own SIZE claim. If that
              // composed space had a baseline (an anchored POSITION or a
              // "free" magnitude — the normal case for a subtree with real
              // content), stash it before overriding: without this, a
              // subtree under a data-valued size silently consumed the
              // ancestor's σ instead of getting its own local scope (#651
              // smell 1). The stash is baseline-MAGNITUDE form (SIZE) so a
              // nested sized layer's own descendants get a scale factor, not
              // just an anchored map. This makes "data-valued size ⇒
              // self-scaling region" the general rule: the node's box is
              // solved by the ancestor scope, its interior is a fresh scope
              // resolved against that box.
              if (hasBaseline(composed)) {
                selfScaledSpaces[axis] = SIZE(composed.width, composed.measure);
              }
              resolved[axis] = SIZE(
                Monotonic.linear(getValue(dsize)!, 0),
                getMeasure(dsize)
              );
              continue;
            }
            const sp = resolved[axis];
            // Stash anything with a baseline (an anchored POSITION or a "free"
            // magnitude); a difference / ORDINAL is left untouched (no stash).
            if (hasBaseline(sp)) {
              selfScaledSpaces[axis] = sp;
              // Persist the stashed space itself (presence IS the "self-scaled"
              // marker) — `resolveAxes` reads this to detect SIBLING self-scaled regions
              // that genuinely share one domain+extent (e.g. a spread's
              // per-group scatter facets all given the same explicit pixel
              // width over the same padded data domain), so it can hoist a
              // single axis claim to their common ancestor instead of letting
              // each self-scaled sibling either draw its own duplicate or
              // (since its space reports UNDEFINED upward) draw none at all.
              node.selfScaledSpace[axis] = sp;
              resolved[axis] = UNDEFINED;
            }
          }
          return resolved;
        },
        layout: (shared, size, scales, children, node) => {
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
          // Compute size using dims (w and h) before passing to children
          size = [
            computeSize(dims[0].size, inheritedScaleFactors[0]!, size[0]) ??
              size[0],
            computeSize(dims[1].size, inheritedScaleFactors[1]!, size[1]) ??
              size[1],
          ];

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
          // fresh array — never mutate the parent's inherited σ (unlike
          // spread, which mutates intentionally for sibling sharing).
          // Demand-driven nicing (issue #659): any scope this layer roots
          // (self-scaled stash, shared-scale, datum-position) nices its
          // POSITION domain only if some node in the scope renders an axis on
          // that dim — read off the persistent axis-demand stamps.
          const axisDemand: Size<boolean> = [
            node.scopeRendersAxis(0),
            node.scopeRendersAxis(1),
          ];
          const childScalePlan = buildChildScalePlan(
            selfScaledSpaces,
            node._underlyingSpace,
            size,
            inheritedScaleFactors,
            inheritedPosScales,
            constraintBudget,
            shared,
            axisDemand,
            // Stage 6b: derive every scale this layer roots through the render's
            // one σ-scope registry (shared with the root and coord boundaries).
            getScopeRegistry(node.tryGetRenderSession()),
            node.key ?? node.type
          );
          const { basePosScales, childScaleFactors } = childScalePlan;
          for (const failure of childScalePlan.budgetFailures) {
            // A non-invertible fold-produced Monotonic would otherwise silently
            // vanish the content (spread's `?? 0`); name the axis and budget so
            // the failure is visible, then keep the inherited factor.
            console.warn(
              `layer: could not invert distribute SIZE claim on ${
                failure.axis === 0 ? "x" : "y"
              } axis for budget ${failure.budget}px; keeping inherited scale factor.`,
              constraintBudget
            );
          }
          for (const check of childScalePlan.sharedScaleChecks) {
            // Solver shadow (#39): assert the frame equation content(σ)=allocated
            // closes for this σ-scope. No-op unless GOFISH_SOLVER_CHECK is set.
            shadowCheckScaleRoot(
              check.space,
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

          // `position` constraints with a datum coordinate contribute a data
          // domain on their axis (see collectPositionDomains); the union is what
          // those constraints resolve against. `ownsAxis` is consumed again by
          // the per-child posScale forwarding below (`childScalesFor`).
          const constraintDomains = collectPositionDomains(node.constraints);
          const ownsAxis: [boolean, boolean] = [
            constraintDomains.x !== undefined,
            constraintDomains.y !== undefined,
          ];

          // Scale for resolving this layer's datum `position` constraints: an
          // inherited posScale, else a local one mapping the layer's own
          // POSITION domain onto its pixel size (the shared fallback recipe,
          // `posScaleFromSpace` — scatter uses the same one). Only built when
          // the layer actually owns such an axis — it is used solely by
          // applyConstraints below, not passed to children.
          const space = node._underlyingSpace;
          // `basePosScales` (the inherited scales with any self-scaled dim
          // overridden — see selfScaledSpaces above) is the floor here.
          const positionScalePlan = buildPositionScalePlan(
            ownsAxis,
            space,
            size,
            basePosScales,
            axisDemand
          );
          const effectivePosScales = positionScalePlan.effectivePosScales;

          const childPlaceables: ReturnType<
            (typeof children)[number]["layout"]
          >[] = new Array(children.length);

          const layoutPlan = buildLayerConstraintLayoutPlan(
            node.children,
            node.constraints
          );

          for (const i of layoutPlan.layoutOrder) {
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
            const layoutSize = applyNestLayoutProposal(
              childLayoutSizeProposal(
                childName,
                size,
                gridCellByName,
                sliceByName
              ),
              layoutPlan.nestPlan?.byDerived.get(i),
              childPlaceables
            );
            // Recombine the two forwarding decisions into the single carrier: σ
            // forwards uniformly (childScaleFactors), the anchored map forwards
            // per child (childPosScalesFor — stripped where a constraint consumed
            // the scale). A stripped map keeps the child's σ.
            const childMaps = childPosScalesFor(
              (children[i] as GoFishNode)._underlyingSpace,
              targetDims,
              ownsAxis,
              basePosScales,
              effectivePosScales
            );
            const childPlaceable = child.layout(layoutSize, [
              axisScale(childScaleFactors[0], childMaps[0]),
              axisScale(childScaleFactors[1], childMaps[1]),
            ]);
            if (!childName || !layoutPlan.constrainedNames.has(childName)) {
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
            // fact (`dataDomain` present on a continuous axis) and hands it to the
            // placement solve's ownership plan — the constraint path no longer
            // consults the space pass's free/determined/conflict lattice.
            const dataPositioned: [Set<string>, Set<string>] = [
              new Set(),
              new Set(),
            ];
            for (const [name, cp] of nameToPlaceable) {
              const childSpace = (cp as GoFishNode)._underlyingSpace;
              if (childSpace === undefined) continue;
              for (const axis of [0, 1] as const) {
                const s = childSpace[axis];
                if (
                  s !== undefined &&
                  isCONTINUOUS(s) &&
                  s.dataDomain !== undefined
                )
                  dataPositioned[axis].add(name);
              }
            }

            applyConstraints(
              node.constraints,
              nameToPlaceable,
              size,
              effectivePosScales,
              gridTracks,
              dataPositioned
            );

            // Place any child the constraints left unplaced at the layer's
            // baseline origin — consistent with the phase-1 baseline placement
            // of unconstrained children. A ref-consuming child (e.g. connect)
            // that must observe constrained siblings should live in an outer
            // tier laid out after them (see notes/nested-layer-tiers.md), not
            // rely on a re-layout pass here.
            for (const cp of childPlaceables) {
              placeUnplacedChild(cp);
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
          //
          // A FIXED-PITCH chained child (`Placeable.pitchAnchorY`) that will
          // self-mirror at paint (continuous y — it opens its own y-up flip
          // scope, mirroring about its chained anchor; see `scopeBox` in
          // coordinateTransforms/bake.ts) truly occupies the MIRROR of its
          // layout band about that anchor. Fold THAT band, so the layer's box
          // gains the amplitude allowance on the side where content actually
          // paints (above a baseline-chained ridge row) instead of phantom
          // space on the other side (below the chain tail, where nothing ever
          // paints — which pushed the x axis far below the last row). Exact
          // no-op for `"middle"` (a band mirrored about its own center is
          // itself). Assumes no enclosing y-up scope is active above the chain
          // — the fixed-pitch-under-ordinal-spread case; inside a whole-plot
          // flip the rows would inherit that scope instead of self-mirroring,
          // and the plain layout band would be the honest one.
          const paintedYBand = (
            cp: (typeof childPlaceables)[number]
          ): { min: number | undefined; max: number | undefined } => {
            const d = cp.dims[1];
            const band = { min: d.min, max: d.max };
            const gn = cp instanceof GoFishNode ? cp : undefined;
            const anchor = gn?.pitchAnchorY;
            if (anchor === undefined || d.min === undefined) return band;
            const sy = gn?._underlyingSpace?.[1];
            const selfMirrors =
              sy !== undefined &&
              isCONTINUOUS(sy) &&
              gn?._scopeTransparent !== true &&
              gn?._ambientYDown !== true;
            if (!selfMirrors) return band;
            const off = anchorOffset(gn!, "y", anchor);
            if (off === undefined || d.max === undefined) return band;
            const a = d.min + off;
            return { min: 2 * a - d.max, max: 2 * a - d.min };
          };
          // Compute each child's painted y-band ONCE (it's otherwise called
          // twice per child below — once for the min fold, once for the max —
          // and each call re-derives `anchorOffset`/`localAnchor` internally).
          const paintedYBands = childPlaceables.map(paintedYBand);
          const minX = foldFinite(
            childPlaceables.map((cp) => cp.dims[0].min),
            Math.min
          );
          const maxX = foldFinite(
            childPlaceables.map((cp) => cp.dims[0].max),
            Math.max
          );
          const minY = foldFinite(
            paintedYBands.map((b) => b.min),
            Math.min
          );
          const maxY = foldFinite(
            paintedYBands.map((b) => b.max),
            Math.max
          );
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;

          const translateY =
            dims[1].min !== undefined ? dims[1].min - minY : undefined;

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
              translate: [
                dims[0].min !== undefined ? dims[0].min - minX : undefined,
                translateY,
              ],
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
    // Stash alias-keyed dims (theta/r/…) for the resolveAliases pass.
    node._pendingAliases = pendingAliases;
    // Default zBelow(connector, operand) for relational marks (line/ribbon/…)
    // found anywhere in this layer's subtree — see the doc comment above.
    applyRelationalZBelowDefaults(node, children);
    return node;
  }
);

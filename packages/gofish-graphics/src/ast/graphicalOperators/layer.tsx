// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { GoFishNode, type ToPixel } from "../_node";
import type { DisplayList } from "gofish-ir";
import { shadowCheckScaleRoot } from "../solver/shadow";
import { flattenForZOrder, topoSortByZOrder } from "../paintOrder";
import { isToken } from "../createName";
import {
  Size,
  elaborateDims,
  extractAliasCandidates,
  FancyDims,
  displayTranslate,
} from "../dims";
import { UNDEFINED, UnderlyingSpace, hasBaseline } from "../underlyingSpace";
import { computeSize, foldFinite } from "../../util";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { coord } from "../coordinateTransforms/coord";
import { createNodeOperatorSequential } from "../withGoFish";
import { GoFishAST } from "../_ast";
import {
  applyConstraints,
  collectPositionDomains,
  gridSpaces,
  gridCellSize,
  isZOrderConstraint,
  type ConstraintSpec,
  type ZOrderConstraint,
} from "../constraints";
import { childNameKey } from "../constraints/shared";
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
          // A grid constraint makes this layer a grid: its axes are categorical
          // (ORDINAL over columns / rows) and the cells fill flex tracks (sized
          // in `layout`). It's exclusive — no union/nest/position fold applies.
          const gridC = selectGridConstraint(constraints ?? []);
          if (gridC !== undefined) return gridSpaces(gridC, _childNodes);

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

          // Stash the absorbed anchored extent and report UNDEFINED upward for
          // any dim with an explicit pixel size — self-scaling region; see
          // selfScaledSpaces above. (last write wins — may run more than once.)
          selfScaledSpaces[0] = undefined;
          selfScaledSpaces[1] = undefined;
          for (const axis of [0, 1] as const) {
            if (dims[axis].size === undefined) continue;
            const sp = resolved[axis];
            // Stash anything with a baseline (an anchored POSITION or a "free"
            // magnitude); a difference / ORDINAL is left untouched (no stash).
            if (hasBaseline(sp)) {
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

          // Grid budget: a grid layer is exclusively cells (table elaboration),
          // and every cell fills its flex track — so all children get the equal
          // track size (box-division); the placement solver then centers them.
          const gridC = selectGridConstraint(node.constraints);
          const gridCell = gridC ? gridCellSize(gridC, size) : undefined;

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
          const childScalePlan = buildChildScalePlan(
            selfScaledSpaces,
            node._underlyingSpace,
            size,
            scaleFactors,
            posScales,
            constraintBudget,
            shared
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
            basePosScales
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
              childLayoutSizeProposal(childName, size, gridCell, sliceByName),
              layoutPlan.nestPlan?.byDerived.get(i),
              childPlaceables
            );
            const childPlaceable = child.layout(
              layoutSize,
              childScaleFactors,
              childPosScalesFor(
                (children[i] as GoFishNode)._underlyingSpace,
                targetDims,
                ownsAxis,
                basePosScales,
                effectivePosScales
              )
            );
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
        // IR lowering — mirror of the box/layer render. The box's translate is
        // composed into a child-local `toPixel` (so children land in the right
        // pixels); a non-identity scale can't be folded into coordinates, so it
        // becomes a `group` item wrapping the children. Z-order mirrors render.
        lower: ({ transform, coordinateTransform }, _children, node) => {
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const [wrapTx, wrapTy] = displayTranslate(transform);
          // A `box` is a coordinate-transform barrier: its children render in
          // linear box-local space (the box positions itself in the parent
          // coord, but its content does not warp). Mirror INTERNAL_render's
          // `this.type !== "box" ? coordinateTransform : undefined`.
          const childCoord =
            node.type === "box" ? undefined : coordinateTransform;

          const session = node.getRenderSession();
          const outer = session.toPixel!;
          // Translate-only composition (scale handled by the group below).
          const composed: ToPixel = ([cx, cy]) =>
            outer([wrapTx + cx, wrapTy + cy]);

          // Lower the (z-ordered) children under `composed`, restoring `toPixel`
          // afterward. A per-child accTranslate (z-constraint flatten) is folded
          // into the mapping for that child.
          const lowerChildren = (): DisplayList.DisplayItem[] => {
            const zConstraints = (node.constraints ?? []).filter(
              isZOrderConstraint
            );
            const items: DisplayList.DisplayItem[] = [];
            const withToPixel = (
              fn: ToPixel,
              run: () => DisplayList.DisplayItem[]
            ) => {
              session.toPixel = fn;
              try {
                return run();
              } finally {
                session.toPixel = composed;
              }
            };

            if (zConstraints.length === 0) {
              const ordered = node.children
                .map((child, index) => ({
                  child,
                  index,
                  zOrder: child instanceof GoFishNode ? child.getZOrder() : 0,
                }))
                .sort((a, b) => a.zOrder - b.zOrder || a.index - b.index);
              session.toPixel = composed;
              try {
                for (const { child } of ordered)
                  items.push(...child.INTERNAL_lower(childCoord));
              } finally {
                session.toPixel = outer;
              }
              return items;
            }

            const flat = flattenForZOrder(node.children);
            const sorted = topoSortByZOrder(flat, zConstraints, {
              node: (it) => it.node,
              z: (it) => it.defaultZ,
              order: (it) => it.defaultOrder,
            });
            try {
              for (const item of sorted) {
                const [ax, ay] = item.accTranslate;
                const map: ToPixel =
                  ax === 0 && ay === 0
                    ? composed
                    : ([cx, cy]) => composed([cx + ax, cy + ay]);
                items.push(
                  ...withToPixel(map, () =>
                    item.node.INTERNAL_lower(childCoord)
                  )
                );
              }
            } finally {
              session.toPixel = outer;
            }
            return items;
          };

          const childItems = lowerChildren();

          if (scaleX === 1 && scaleY === 1) return childItems;

          // Scale about the box's pixel origin: p ↦ origin + s·(p − origin).
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
    return node;
  }
);

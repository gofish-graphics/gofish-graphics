// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import * as Monotonic from "../../util/monotonic";
import { GoFishNode } from "../_node";
import { shadowCheckScaleRoot } from "../solver/shadow";
import { isToken } from "../createName";
import { Size, elaborateDims, FancyDims, displayTranslate } from "../dims";
import {
  CONTINUOUS,
  POSITION,
  UNDEFINED,
  UnderlyingSpace,
  continuousInterval,
  hasBaseline,
  isBaselineMagnitude,
  isCONTINUOUS,
  isPOSITION,
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
  nestedSpace,
  getPositioningConstraintRefs,
  gridSpaces,
  gridCellSize,
  isZOrderConstraint,
  type ConstraintPosScales,
  type ConstraintSpec,
  type ZOrderConstraint,
} from "../constraints";
import { childNameKey } from "../constraints/shared";
import {
  applyNestLayoutProposal,
  buildNestPlan,
} from "../constraints/nestPlan";
import {
  composeConstraintSpaces,
  type ComposeBudget,
} from "../constraints/compose";
import {
  buildDistributeSliceMap,
  buildPositionTargetDims,
  childPosScalesFor,
  selectGridConstraint,
} from "../constraints/proposalPlan";
import { type Measure } from "../data";
import { unionChildSpaces } from "./alignment";

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
        // Stage 3 (#39): read the LEDGER projection, not the raw
        // `transform.translate` — a placed nested layer has its written translate
        // cleared on solved axes, so `displayTranslate(child.transform)` would
        // hoist its children at [0,0]. `projectedTranslate` derives the real
        // offset (the same retirement bake.ts/`_ref` already use).
        const childTx = child.projectedTranslate(0) ?? 0;
        const childTy = child.projectedTranslate(1) ?? 0;
        walk(child.children, accTx + childTx, accTy + childTy);
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
    let constraintBudget: ComposeBudget | undefined;

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
          // A grid constraint makes this layer a grid: its axes are categorical
          // (ORDINAL over columns / rows) and the cells fill flex tracks (sized
          // in `layout`). It's exclusive — no union/nest/position fold applies.
          const gridC = selectGridConstraint(constraints ?? []);
          if (gridC !== undefined) return gridSpaces(gridC, _childNodes);

          // Apply layer's own transform.scale to any baseline magnitude
          // (origin 0) produced by unionChildSpaces (the symbolic-Monotonic
          // overlay path).
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const applyScale = (
            space: UnderlyingSpace,
            scale: number
          ): UnderlyingSpace =>
            isBaselineMagnitude(space) && scale !== 1
              ? CONTINUOUS(
                  Monotonic.smul(scale, space.width),
                  "free",
                  space.measure
                )
              : space;

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
          let effectiveChildren = children;
          if (nestPlan !== undefined) {
            effectiveChildren = children.map(
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
            iv: Interval.Interval | undefined,
            ivMeasure: Measure | undefined
          ): UnderlyingSpace => {
            const base = applyScale(
              unionChildSpaces(effectiveChildren, axis),
              scale
            );
            if (iv === undefined) return base;
            const baseIv = continuousInterval(base);
            const merged = baseIv ? Interval.unionAll(baseIv, iv) : iv;
            // The position/span constraints' OWN measure is the authoritative
            // unit for this axis's data domain (they define it); it wins, falling
            // back to the children's POSITION measure when the constraints are
            // untagged (literal-pixel coords). We do NOT strict-unify the two: a
            // self-scaling child (e.g. a pie glyph) can leak its inner unit into
            // `base`, and that is not a competing claim about the scatter axis.
            // Same-layer conflicts ARE caught — inside collectPositionDomains.
            return POSITION(merged, ivMeasure ?? spaceMeasure(base));
          };
          const resolved: [UnderlyingSpace, UnderlyingSpace] = [
            resolveAxis(0, scaleX, posDomains.x, posDomains.xMeasure),
            resolveAxis(1, scaleY, posDomains.y, posDomains.yMeasure),
          ];

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
            // Build the LOCAL scale against our own box: an anchored POSITION
            // gives a posScale (its data-positioned children read it); a "free"
            // magnitude gives a scale factor (its sized children read it). A
            // stashed space is exactly one of the two.
            if (isPOSITION(stashed)) {
              basePosScales[dim] =
                posScaleFromSpace(stashed, size[dim]) ?? posScales[dim];
            }
            if (isBaselineMagnitude(stashed)) {
              childScaleFactors[dim] =
                stashed.width.inverse(size[dim]) ?? scaleFactors?.[dim];
            }
          }

          // Layer budget solve. For each axis whose composed claim is SIZE
          // (the max-plus longest path), invert it against this layer's resolved
          // size to derive the child scale factor (the same Monotonic.inverse
          // recipe as the selfScaled path, but driven by the *allotted* size,
          // not only an explicit w/h, and passing `upperBoundGuess` like spread
          // does). Idempotent with the root's own inversion of the same SIZE.
          if (constraintBudget) {
            for (const axis of [0, 1] as const) {
              const dom = constraintBudget.sizeDomain[axis];
              if (dom === undefined || !Number.isFinite(size[axis])) continue;
              const sf = dom.inverse(size[axis], {
                upperBoundGuess: size[axis],
              });
              if (sf !== undefined) childScaleFactors[axis] = sf;
              else
                // A non-invertible fold-produced Monotonic would otherwise
                // silently vanish the content (spread's `?? 0`); name the axis
                // and budget so the failure is visible, then keep the inherited
                // factor.
                console.warn(
                  `layer: could not invert distribute SIZE claim on ${
                    axis === 0 ? "x" : "y"
                  } axis for budget ${size[axis]}px; keeping inherited scale factor.`,
                  constraintBudget
                );
            }
          }

          // `sharedScale` scale scope (claim hoisting, #549): on an axis this
          // layer is a scope for (set by `spread`'s `sharedScale`; default
          // [false,false] → no-op for every plain layer/table), solve σ locally
          // from its composed claim against its own box and hand it to
          // descendants via the FRESH array — one rule for every continuous
          // extent: σ = width.inverse(box) (a former POSITION/DIFFERENCE width
          // is linear(extent, 0), so this is the old size/width divide).
          for (const axis of [0, 1] as const) {
            if (!shared[axis] || !Number.isFinite(size[axis])) continue;
            const sp = selfScaledSpaces[axis] ?? node._underlyingSpace?.[axis];
            if (sp === undefined) continue;
            let sf: number | undefined;
            if (isCONTINUOUS(sp)) {
              sf =
                sp.width.inverse(size[axis], {
                  upperBoundGuess: size[axis],
                }) ?? 0;
            }
            if (sf !== undefined) childScaleFactors[axis] = sf;
            // Solver shadow (#39): assert the frame equation content(σ)=allocated
            // closes for this σ-scope. No-op unless GOFISH_SOLVER_CHECK is set.
            shadowCheckScaleRoot(sp, size[axis], sf, axis);
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
          const childSizeFor = (childName: string | undefined): Size => {
            // Grid is exclusive: every child is a cell, so all get the track size.
            if (gridCell !== undefined) return gridCell;
            if (
              sliceByName === undefined ||
              childName === undefined ||
              !sliceByName.has(childName)
            ) {
              return size;
            }
            return sliceByName.get(childName)!;
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

          // Nest layout order: source before derived, so the derived node
          // can be proposed `source.dims ± 2·padding` on its constrained axes
          // (see buildNestPlan / the nest fold in resolveUnderlyingSpace).
          const nestPlan = buildNestPlan(node.children, node.constraints);
          const layoutOrder = nestPlan?.order ?? children.map((_, i) => i);

          // Per-AXIS targets of *datum*-pinned `position` constraints (e.g. axis
          // ticks pinned via `Constraint.position({ y: datum(v) })`). A datum pin
          // consumes the scale, so the target must not also receive it; a literal
          // *pixel* pin (`Constraint.position({ y: 0 })`) does not consume the
          // scale, so it's deliberately NOT tracked here — content pinned at its
          // raw pixel origin still needs its posScale. Tracked per axis, not
          // per child: a child pinned on one axis may still need the scale on
          // the other (an axis line position-seated on its cross axis resolves
          // its own-axis datum endpoints through the scale).
          const positionTargetDims = buildPositionTargetDims(node.constraints);

          for (const i of layoutOrder) {
            const child = children[i];
            const childName = childNameKey(node.children[i]);
            const targetDims =
              childName !== undefined
                ? positionTargetDims.get(childName)
                : undefined;
            // Nest proposal: override the DERIVED node's size from its
            // SOURCE on each derived axis — `outer = inner + 2p` for 'in',
            // `inner = outer − 2p` for 'out'. The source is already laid out
            // (ahead of us in layoutOrder, since the plan orders source before
            // derived). Clamp ≥ 0; non-derived axes keep the normal proposal
            // (`childSizeFor`), so nest composes with — and wins on its
            // derived axes over — any budget slice.
            const layoutSize = applyNestLayoutProposal(
              childSizeFor(childName),
              nestPlan?.byDerived.get(i),
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
        render: ({ transform, coordinateTransform }, children, node) => {
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const [wrapTx, wrapTy] = displayTranslate(transform);
          const wrapTransform = `translate(${wrapTx}, ${wrapTy}) scale(${scaleX}, ${scaleY})`;

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

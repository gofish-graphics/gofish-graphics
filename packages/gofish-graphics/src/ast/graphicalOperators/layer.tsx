import * as Monotonic from "../../util/monotonic";
import { GoFishNode } from "../_node";
import { isToken } from "../createName";
import { Size, elaborateDims, FancyDims } from "../dims";
import {
  POSITION,
  SIZE,
  UnderlyingSpace,
  isPOSITION,
  isSIZE,
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
  getPositioningConstraintRefs,
  isZOrderConstraint,
  type ConstraintPosScales,
  type ZOrderConstraint,
} from "../constraints";
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
              ? SIZE(Monotonic.smul(scale, space.domain))
              : space;

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
            const base = applyScale(unionChildSpaces(children, axis), scale);
            if (iv === undefined) return base;
            const merged =
              isPOSITION(base) && base.domain
                ? Interval.unionAll(base.domain, iv)
                : iv;
            return POSITION(merged);
          };
          return [
            resolveAxis(0, scaleX, posDomains.x),
            resolveAxis(1, scaleY, posDomains.y),
          ];
        },
        layout: (
          shared,
          size,
          scaleFactors,
          children,
          posScales,
          node,
          posDomains
        ) => {
          // Compute size using dims (w and h) before passing to children
          size = [
            computeSize(dims[0].size, scaleFactors?.[0]!, size[0]) ?? size[0],
            computeSize(dims[1].size, scaleFactors?.[1]!, size[1]) ?? size[1],
          ];

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
          const effectivePosScales: ConstraintPosScales = ownsPositionAxis
            ? [
                posScales[0] ?? posScaleFromSpace(space?.[0], size[0]),
                posScales[1] ?? posScaleFromSpace(space?.[1], size[1]),
              ]
            : [posScales[0], posScales[1]];

          const childPlaceables = [];

          // Collect *positioning* constraint refs only — children skipped
          // here forgo phase-1 baseline placement so a constraint can place
          // them. Z-order constraints don't position; including them here
          // would erroneously rob their referents of baseline placement.
          const constrainedNames =
            node.constraints.length > 0
              ? getPositioningConstraintRefs(node.constraints)
              : new Set<string>();

          // Per-AXIS targets of `position` constraints (e.g. axis ticks pinned
          // via `Constraint.position({ y: datum(v) })`). Tracked per axis, not
          // per child: a child pinned on one axis may still need the scale on
          // the other (an axis line position-seated on its cross axis resolves
          // its own-axis datum endpoints through the scale).
          const positionTargetDims = new Map<string, Set<0 | 1>>();
          for (const c of node.constraints) {
            if (c.type === "position") {
              for (const r of c.children) {
                if (!r) continue;
                const dims = positionTargetDims.get(r.name) ?? new Set();
                if (c.x !== undefined) dims.add(0);
                if (c.y !== undefined) dims.add(1);
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
              if (!ownsAxis[dim]) return posScales[dim]; // inherited, unchanged
              if (targetDims?.has(dim)) return undefined; // placed by the constraint
              return sp && isPOSITION(sp[dim])
                ? effectivePosScales[dim]
                : undefined;
            };
            return [pick(0), pick(1)];
          };

          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childName = childNameKey(node.children[i]);
            const targetDims =
              childName !== undefined
                ? positionTargetDims.get(childName)
                : undefined;
            const childPlaceable = child.layout(
              size,
              scaleFactors,
              childScalesFor(i, targetDims),
              posDomains
            );
            if (!childName || !constrainedNames.has(childName)) {
              childPlaceable.place("x", 0, "baseline");
              childPlaceable.place("y", 0, "baseline");
            }
            childPlaceables.push(childPlaceable);
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
              {
                x: { start: 0, middle: size[0] / 2, end: size[0] },
                y: { start: 0, middle: size[1] / 2, end: size[1] },
              },
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

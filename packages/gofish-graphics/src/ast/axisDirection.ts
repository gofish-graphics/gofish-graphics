// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { Anchor, Dimensions, Interval, Transform } from "./dims";
import type { AxisMap, AxisScale } from "./domain";
import type { Size } from "./dims";
import type { Placeable } from "./_node";
import type { BBoxKey } from "./constraints/bbox";
import type { Geometry } from "./geometry";
import {
  isCONTINUOUS,
  isUNDEFINED,
  type UnderlyingSpace,
} from "./underlyingSpace";

/**
 * Axis direction: which way a node's AXIS ORDER runs on the screen.
 *
 * The canvas is always y-down pixels. Layout stores every node's geometry
 * (its local box, its translate, the bbox ledger) in those pixels. What
 * differs between nodes is only how their own axis order maps onto them:
 *
 *   - `+1`: axis order runs with the pixels. Every x axis, and a discrete
 *     (ordinal) y axis: the first item is at the top.
 *   - `-1`: axis order runs against the pixels. A continuous (quantity) y
 *     axis grows upward from its origin, so a larger value, a positive
 *     magnitude, and the end of the axis sit higher on the screen, while the
 *     first series of a stack and the `start` edge sit at the bottom.
 *
 * A node's operators (spread, stack, align, distribute, the σ maps, baseline
 * seating) reason in the node's own axis order. The ONE conversion between
 * that order and the stored pixels is a reflection about the node's local
 * origin, `pixel = direction · order`, applied where geometry crosses a node
 * boundary: the node's own layout result (`orientDims`, `orientTranslate`),
 * the scale it hands down when its children run the other way
 * (`orientScale`), and the view a parent gets of each child (`orientView`).
 *
 * The direction is LOCAL: it is read off the node's own resolved underlying
 * space, never inherited from a node that has an axis. An ordinal spread
 * nested in a continuous chart reads top-down inside, and a bar chart nested
 * in an ordinal spread grows upward inside. A spread along y is discrete even
 * when its children carry no keys (its space is then UNDEFINED), so it reads
 * top-down too. A node with NO y axis (an UNDEFINED y that orders nothing
 * along y: a fixed-size shape, a text label, a layer of such) has no
 * direction of its own, so it takes the direction of the frame it sits in,
 * its parent's; on the canvas, that is top-down.
 *
 * A coordinate space (`coord`) declares its own handedness: its transform is
 * math-handed, so its coordinate y runs upward whatever the data type. So a
 * `coord` and everything inside it has y direction `-1` (its own box too: it
 * is seated from its bottom, like a chart), and the coord reflects y where
 * its interior meets the canvas (`inPixels` in coord.tsx).
 */
export type AxisDirection = 1 | -1;

/** The minimal node shape `axisDirection` reads (duck-typed to avoid an
 *  import cycle with `_node.ts`). */
type DirectionalNode = {
  type?: string;
  parent?: DirectionalNode;
  _underlyingSpace?: Size<UnderlyingSpace>;
  selfScaledSpace?: [UnderlyingSpace | undefined, UnderlyingSpace | undefined];
  axisDir?: 0 | 1;
};

/** Is `node` a `coord` or inside one? */
const inCoordinateSpace = (node: DirectionalNode): boolean => {
  for (let n: DirectionalNode | undefined = node; n; n = n.parent)
    if (n.type === "coord") return true;
  return false;
};

/**
 * The direction of `node`'s axis `dim` (see the module doc). `undefined` is
 * the canvas, which is y-down. A `ref` stand-in stores a pixel copy of its
 * target and lays out nothing, so it reads `+1`.
 *
 * The node's OWN space is the one it lays its children out in. A node that
 * roots its own σ-scope on y (an explicit pixel size over data) reports
 * UNDEFINED upward, so that its parent's union ignores it, and keeps its own
 * space in `selfScaledSpace`; that kept space is the one read here.
 */
export const axisDirection = (
  node: DirectionalNode | undefined,
  dim: 0 | 1
): AxisDirection => {
  if (dim === 0 || node === undefined) return 1;
  if (node.type === "ref") return 1;
  if (inCoordinateSpace(node)) return -1;
  const space = node.selfScaledSpace?.[1] ?? node._underlyingSpace?.[1];
  if (space !== undefined && isCONTINUOUS(space)) return -1;
  // A discrete y: an ordinal space, or a spread that orders its children
  // along y (whose space is UNDEFINED when they carry no keys).
  if (space !== undefined && !isUNDEFINED(space)) return 1;
  if (node.axisDir === dim) return 1;
  return axisDirection(node.parent, dim);
};

/**
 * The direction of a layer that will wrap `node` in its place (an elaboration
 * wrapper: axes, labels, titles, a legend). The wrapper reports the node's
 * spaces (chrome adds no axis to them) and takes the node's parent, so this
 * is the direction of a node with those. Its constraints run in this order.
 */
export const wrapperDirection = (
  node: DirectionalNode,
  dim: 0 | 1
): AxisDirection =>
  axisDirection(
    {
      type: "layer",
      parent: node.parent,
      _underlyingSpace: node._underlyingSpace,
    },
    dim
  );

/**
 * A position inside a frame `[0, size]` (a canvas, a cell, a pixel-native
 * layout's box), measured in axis order from the frame's START edge. Axis
 * order starts at the frame's top for `+1` and at its bottom for `-1` (a
 * continuous y grows upward from the bottom of its frame), so offset `p` is
 * the pixel `p` from the top, or `size − p`. Read the other way it turns a
 * pixel offset from the frame's top into axis order. It is its own inverse.
 */
export const fromFrameStart = (
  p: number,
  size: number,
  direction: AxisDirection
): number => (direction === 1 ? p : size - p);

// ── The reflection, applied at node boundaries ──────────────────────────────

/** An interval reflected about 0 (`x ↦ −x`): min and max swap. `size` is a
 *  magnitude and does not change. An interval with only a `min` (a placed
 *  point with no size yet) reflects to that point. */
export const reflectInterval = (iv: Interval): Interval => {
  const size = iv.size;
  const max =
    iv.max ??
    (iv.min !== undefined && size !== undefined
      ? iv.min + Math.abs(size)
      : undefined);
  return {
    ...iv,
    min: max !== undefined ? -max : iv.min !== undefined ? -iv.min : undefined,
    max: iv.min !== undefined ? -iv.min : undefined,
    center: iv.center !== undefined ? -iv.center : undefined,
    size,
  };
};

/** A node's local box in pixels from its box in its own axis order. */
export const orientDims = (
  dims: Dimensions,
  direction: AxisDirection
): Dimensions => (direction === 1 ? dims : [dims[0], reflectInterval(dims[1])]);

/** A node's translate in pixels from its translate in its own axis order. */
export const orientTransform = (
  transform: Transform,
  direction: AxisDirection
): Transform => {
  const ty = transform.translate?.[1];
  if (direction === 1 || ty === undefined) return transform;
  return {
    ...transform,
    translate: [transform.translate[0], -ty],
  };
};

/** An axis map read in the opposite direction: `px ↦ −px`. */
export const reflectMap = (map: AxisMap): AxisMap => ({
  sigma: -map.sigma,
  originPx: -map.originPx,
});

/** The scales a node with direction `self` receives from a parent with
 *  direction `parent`: the y map is reflected when the two run opposite
 *  ways. σ (a pixels-per-unit magnitude) never changes. */
export const orientScales = (
  scales: Size<AxisScale | undefined>,
  self: AxisDirection,
  parent: AxisDirection
): Size<AxisScale | undefined> => {
  const y = scales[1];
  if (self === parent || y?.map === undefined) return scales;
  return [scales[0], { ...y, map: reflectMap(y.map) }];
};

const FLIP_ANCHOR: Record<Anchor, Anchor> = {
  min: "max",
  max: "min",
  center: "center",
  baseline: "baseline",
};

const FLIP_KEY: Record<BBoxKey, BBoxKey> = {
  min: "max",
  max: "min",
  center: "center",
  size: "size",
} as Record<BBoxKey, BBoxKey>;

const isY = (axis: unknown): boolean => axis === 1 || axis === "y";

const reflectGeometry = (g: Geometry): Geometry => {
  const box = {
    min: [g.box.min[0], -g.box.max[1]] as [number, number],
    max: [g.box.max[0], -g.box.min[1]] as [number, number],
  };
  const circle = g.enclosingCircle;
  return {
    box,
    enclosingCircle:
      circle === undefined
        ? undefined
        : () => {
            const c = circle();
            return { ...c, cy: -c.cy };
          },
  } as Geometry;
};

/** The unwrapped target of an oriented view (see {@link orientView}). */
export const RAW_PLACEABLE = Symbol("gofish.rawPlaceable");

/** The pixel-stored placeable behind `p`, unwrapping an oriented view. */
export const rawPlaceable = <T>(p: T): T =>
  ((p as { [RAW_PLACEABLE]?: T })[RAW_PLACEABLE] ?? p) as T;

/**
 * A child as its parent's operators see it: its pixel-stored geometry read in
 * the parent's axis order (`direction` = the parent's direction). For `+1`
 * this is the child itself. For `-1` it is a view that reflects every y read
 * (box, anchors, translate, shape) and every y write (placements, extents)
 * about the parent's local origin, so the parent's operators run unchanged in
 * axis order while the child's stored geometry stays in pixels. Every other
 * member passes through to the child.
 */
export function orientView<T extends Placeable>(
  p: T,
  direction: AxisDirection
): T {
  if (direction === 1) return p;
  const target = rawPlaceable(p);
  const override: Record<PropertyKey, () => unknown> = {
    [RAW_PLACEABLE]: () => target,
    dims: () => {
      const d = target.dims;
      return [d[0], reflectInterval(d[1])];
    },
    transform: () => {
      const t = target.transform;
      if (!t) return t;
      const ty = t.translate?.[1];
      return {
        ...t,
        translate: [t.translate?.[0], ty === undefined ? undefined : -ty],
      };
    },
    projectedTranslate: () =>
      target.projectedTranslate === undefined
        ? undefined
        : (dir: 0 | 1) => {
            const v = target.projectedTranslate!(dir);
            return dir === 1 && v !== undefined ? -v : v;
          },
    localAnchor: () =>
      target.localAnchor === undefined
        ? undefined
        : (axis: unknown, anchor: Anchor) => {
            if (!isY(axis)) return target.localAnchor!(axis as any, anchor);
            const v = target.localAnchor!(axis as any, FLIP_ANCHOR[anchor]);
            return v === undefined ? undefined : -v;
          },
    place:
      () =>
      (axis: unknown, value: number, anchor: Anchor = "min") =>
        isY(axis)
          ? target.place(axis as any, -value, FLIP_ANCHOR[anchor])
          : target.place(axis as any, value, anchor),
    pinAnchor: () =>
      target.pinAnchor === undefined
        ? undefined
        : (axis: unknown, value: number, anchor: Anchor) =>
            isY(axis)
              ? target.pinAnchor!(axis as any, -value, FLIP_ANCHOR[anchor])
              : target.pinAnchor!(axis as any, value, anchor),
    setExtent: () =>
      target.setExtent === undefined
        ? undefined
        : (
            axis: unknown,
            owned: Partial<Record<BBoxKey, number>>,
            owner?: string
          ) => {
            if (!isY(axis)) return target.setExtent!(axis as any, owned, owner);
            const flipped: Partial<Record<BBoxKey, number>> = {};
            for (const [k, v] of Object.entries(owned) as [
              BBoxKey,
              number | undefined,
            ][]) {
              if (v === undefined) continue;
              flipped[FLIP_KEY[k]] = k === "size" ? v : -v;
            }
            return target.setExtent!(axis as any, flipped, owner);
          },
    geometry: () => () => reflectGeometry(target.geometry()),
  };
  return new Proxy(target, {
    get(t, prop, _receiver) {
      if (Object.prototype.hasOwnProperty.call(override, prop))
        return override[prop]();
      const v = Reflect.get(t, prop, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
    set(t, prop, value) {
      return Reflect.set(t, prop, value, t);
    },
  }) as T;
}

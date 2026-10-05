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
 * Only y has a direction to resolve: x always runs with the pixels.
 *
 * A node's operators (spread, stack, align, distribute, the σ maps, baseline
 * seating) reason in the node's own axis order. The ONE conversion between
 * that order and the stored pixels is a reflection about the node's local
 * origin, `pixel = direction · order`, applied where geometry crosses a node
 * boundary: the node's own layout result (`orientDims`, `orientTransform`),
 * the scale it hands down when its children run the other way
 * (`orientScales`), the view a parent gets of each child (`orientView`), and
 * the geometry a node keeps for its own drawing (the `local` map its `lower`
 * receives, see `Lower` in `_node.ts`).
 *
 * The direction is LOCAL: it is read off the node's own resolved underlying
 * space, never inherited from a node that has an axis. An ordinal spread
 * nested in a continuous chart reads top-down inside, and a bar chart nested
 * in an ordinal spread grows upward inside. A spread along y is discrete even
 * when its children carry no keys (its space is then UNDEFINED), so it reads
 * top-down too. A node with NO y axis (an UNDEFINED y that orders nothing
 * along y: a fixed-size shape, a text label, a layer of such) has no
 * direction of its own, so it takes the direction of the frame it sits in,
 * its parent's; on the canvas, that is top-down. A `ref` stand-in takes its
 * target's direction.
 *
 * A coordinate space (`coord`) declares its own handedness: its transform is
 * math-handed, so its coordinate y runs upward whatever the data type. So a
 * `coord` and everything inside it has y direction `-1` (its own box too: it
 * is seated from its bottom, like a chart), and the coord reflects y where
 * its interior meets the canvas (`inPixels` in coord.tsx).
 *
 * Each node resolves its direction once, top-down, into its {@link YFrame}
 * (`GoFishNode.yFrame`), from its resolved spaces and its parent's frame; the
 * frame is cleared with the spaces.
 */
export type AxisDirection = 1 | -1;

/**
 * The y frame a node lays out in: its direction, and whether it is a `coord`
 * or inside one.
 */
export type YFrame = {
  readonly direction: AxisDirection;
  readonly inCoord: boolean;
};

const DOWN: YFrame = { direction: 1, inCoord: false };
const UP: YFrame = { direction: -1, inCoord: false };
const COORD: YFrame = { direction: -1, inCoord: true };

/** The canvas: y-down pixels, no coordinate space. */
export const CANVAS_FRAME: YFrame = DOWN;

/** The spaces a node's y frame is read from (duck-typed to avoid an import
 *  cycle with `_node.ts`). */
type SpacedNode = {
  type?: string;
  _underlyingSpace?: Size<UnderlyingSpace>;
  selfScaledSpace?: [UnderlyingSpace | undefined, UnderlyingSpace | undefined];
  axisDir?: 0 | 1;
};

/** A node whose y frame is resolved: a `GoFishNode`, or a `ref`, which
 *  takes its target's. */
export type FramedNode = { readonly yFrame: YFrame };

/**
 * The y frame of a node with these spaces, sitting in the frame `parent`
 * (see the module doc).
 *
 * The node's OWN space is the one it lays its children out in. A node that
 * roots its own σ-scope on y (an explicit pixel size over data) reports
 * UNDEFINED upward, so that its parent's union ignores it, and keeps its own
 * space in `selfScaledSpace`; that kept space is the one read here.
 */
export const yFrameIn = (node: SpacedNode, parent: YFrame): YFrame => {
  if (parent.inCoord || node.type === "coord") return COORD;
  const space = node.selfScaledSpace?.[1] ?? node._underlyingSpace?.[1];
  if (space !== undefined && isCONTINUOUS(space)) return UP;
  // A discrete y: an ordinal space, or a spread that orders its children
  // along y (whose space is UNDEFINED when they carry no keys).
  if ((space !== undefined && !isUNDEFINED(space)) || node.axisDir === 1)
    return DOWN;
  return parent;
};

/** The y direction of `node` (see the module doc). `undefined` is the
 *  canvas, which is y-down. */
export const yDirection = (node: FramedNode | undefined): AxisDirection =>
  node === undefined ? 1 : node.yFrame.direction;

/** Is `node` a `coord` or inside one? */
export const inCoordinateSpace = (node: FramedNode): boolean =>
  node.yFrame.inCoord;

/**
 * The y direction of a layer that will wrap `node` in its place (an
 * elaboration wrapper: axes, labels, titles, a legend). The wrapper reports
 * the node's spaces (chrome adds no axis to them) and takes the node's
 * parent, so this is the direction of a node with those. Its constraints run
 * in this order.
 */
export const wrapperDirection = (node: {
  parent?: FramedNode;
  _underlyingSpace?: Size<UnderlyingSpace>;
}): AxisDirection =>
  yFrameIn(
    { type: "layer", _underlyingSpace: node._underlyingSpace },
    node.parent?.yFrame ?? CANVAS_FRAME
  ).direction;

/**
 * A side of a frame, read the other way along its axis when `direction` is
 * `-1`: `min` and `max` swap, and so do `start` and `end`; anything else
 * (`center`, `baseline`, `middle`, `size`) is the same both ways. It turns a
 * side in pixel order (`start` = the top, `min` = the smaller pixel) into the
 * same side in a frame's axis order, and back. So in a frame with y
 * direction `d`, the top of the screen is the side `orientSide("start", d)`
 * and the bottom is `orientSide("end", d)`.
 */
export function orientSide<S extends string>(
  side: S,
  direction: AxisDirection
): S {
  if (direction === 1) return side;
  switch (side) {
    case "min":
      return "max" as S;
    case "max":
      return "min" as S;
    case "start":
      return "end" as S;
    case "end":
      return "start" as S;
    default:
      return side;
  }
}

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

/** The scales a node with direction `self` receives from a parent with
 *  direction `parent`: the y map is read the other way (`px ↦ −px`) when the
 *  two run opposite ways. σ (a pixels-per-unit magnitude) never changes. */
export const orientScales = (
  scales: Size<AxisScale | undefined>,
  self: AxisDirection,
  parent: AxisDirection
): Size<AxisScale | undefined> => {
  const y = scales[1];
  if (self === parent || y?.map === undefined) return scales;
  const map: AxisMap = { sigma: -y.map.sigma, originPx: -y.map.originPx };
  return [scales[0], { ...y, map }];
};

const isY = (axis: unknown): boolean => axis === 1 || axis === "y";

/** A local shape reflected about its origin's y. */
const reflectGeometry = (g: Geometry): Geometry => {
  const circle = g.enclosingCircle;
  let reflectedCircle: ReturnType<NonNullable<typeof circle>> | undefined;
  return {
    box: {
      min: [g.box.min[0], -g.box.max[1]],
      max: [g.box.max[0], -g.box.min[1]],
    },
    enclosingCircle:
      circle === undefined
        ? undefined
        : () => {
            if (reflectedCircle === undefined) {
              const c = circle();
              reflectedCircle = { ...c, cy: -c.cy };
            }
            return reflectedCircle;
          },
  } as Geometry;
};

/** The unwrapped target of an oriented view (see {@link orientView}). */
const RAW_PLACEABLE = Symbol("gofish.rawPlaceable");

/** The pixel-stored placeable behind `p`, unwrapping an oriented view. */
export const rawPlaceable = <T>(p: T): T =>
  ((p as { [RAW_PLACEABLE]?: T })[RAW_PLACEABLE] ?? p) as T;

/** Each placeable's reflected view, built once (its target never changes). */
const reflectedViews = new WeakMap<object, Placeable>();

/**
 * A child as its parent's operators see it: its pixel-stored geometry read in
 * the parent's axis order (`direction` = the parent's direction). For `+1`
 * this is the child itself. For `-1` it is a view that reflects every y read
 * (box, anchors, translate, shape) and every y write (placements, extents)
 * about the parent's local origin, so the parent's operators run unchanged in
 * axis order while the child's stored geometry stays in pixels. Every other
 * member passes through to the child. The view is built once per child.
 */
export function orientView<T extends Placeable>(
  p: T,
  direction: AxisDirection
): T {
  if (direction === 1) return p;
  const target = rawPlaceable(p);
  let view = reflectedViews.get(target);
  if (view === undefined)
    reflectedViews.set(target, (view = reflectedView(target)));
  return view as T;
}

function reflectedView(target: Placeable): Placeable {
  const {
    projectedTranslate,
    localAnchor,
    pinAnchor,
    setExtent,
  }: Partial<Placeable> = target;
  // The reflected shape, rebuilt when the target's own memo is (each layout).
  let geometry: Geometry | undefined;
  let reflected: Geometry | undefined;
  const override: Record<PropertyKey, unknown> = {
    [RAW_PLACEABLE]: target,
    get dims() {
      return orientDims(target.dims, -1);
    },
    get transform() {
      const t = target.transform;
      return t && orientTransform(t, -1);
    },
    projectedTranslate:
      projectedTranslate &&
      ((dir: 0 | 1) => {
        const v = projectedTranslate.call(target, dir);
        return dir === 1 && v !== undefined ? -v : v;
      }),
    localAnchor:
      localAnchor &&
      ((axis: any, anchor: Anchor) => {
        if (!isY(axis)) return localAnchor.call(target, axis, anchor);
        const v = localAnchor.call(target, axis, orientSide(anchor, -1));
        return v === undefined ? undefined : -v;
      }),
    place: (axis: any, value: number, anchor: Anchor = "min") =>
      isY(axis)
        ? target.place(axis, -value, orientSide(anchor, -1))
        : target.place(axis, value, anchor),
    pinAnchor:
      pinAnchor &&
      ((axis: any, value: number, anchor: Anchor) =>
        isY(axis)
          ? pinAnchor.call(target, axis, -value, orientSide(anchor, -1))
          : pinAnchor.call(target, axis, value, anchor)),
    setExtent:
      setExtent &&
      ((axis: any, owned: Partial<Record<BBoxKey, number>>, owner?: string) => {
        if (!isY(axis)) return setExtent.call(target, axis, owned, owner);
        const flipped: Partial<Record<BBoxKey, number>> = {};
        for (const [k, v] of Object.entries(owned) as [
          BBoxKey,
          number | undefined,
        ][]) {
          if (v === undefined) continue;
          flipped[orientSide(k, -1)] = k === "size" ? v : -v;
        }
        return setExtent.call(target, axis, flipped, owner);
      }),
    geometry: () => {
      const g = target.geometry();
      if (g !== geometry) {
        geometry = g;
        reflected = reflectGeometry(g);
      }
      return reflected!;
    },
  };
  // Every other member passes through, its methods bound to the target once.
  const bound = new Map<PropertyKey, [unknown, unknown]>();
  return new Proxy(target, {
    get(t, prop) {
      if (Object.prototype.hasOwnProperty.call(override, prop))
        return override[prop];
      const v = Reflect.get(t, prop, t);
      if (typeof v !== "function") return v;
      const b = bound.get(prop);
      if (b !== undefined && b[0] === v) return b[1];
      const fn = v.bind(t);
      bound.set(prop, [v, fn]);
      return fn;
    },
    set(t, prop, value) {
      return Reflect.set(t, prop, value, t);
    },
  });
}

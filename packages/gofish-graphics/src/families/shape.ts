/**
 * The `Shape` family: the outlines `enclose` draws, the values of its `shape`
 * option.
 *
 * `lib.ts` binds this module as `Shape` (`Shape.hull({ roundness: 8 })`), and
 * `gofish-graphics/shape` exports the same module. A strategy is a plain
 * object made by a function call, `{ kind, ...params }`. `hull()` and
 * `spine()` are `blob()` with other params preset, so their objects have
 * kind `"blob"`, the way `sina()` and `jitter()` are `noise()`. The kinds,
 * their params and the presets are declared once, in gofish-ir's
 * `STRATEGIES` table. The outline itself is built in
 * `ast/graphicalOperators/enclose/`.
 *
 * On the wire, a blob's `avoiding` is the IR of the nodes it names
 * (`Frontend.NodeSelectionIR`); in JS it holds the nodes themselves.
 */
import type { Frontend } from "gofish-ir";
import type { GoFishAST } from "../ast/_ast";
import type { GoFishRef } from "../ast/_ref";

type BlobIR = Extract<Frontend.ShapeIR, { kind: "blob" }>;

/** Nodes a blob keeps out: a list of nodes or refs (a `.relate()` operand,
 *  `ref(...)`), or a `selectAll(name)` selection. */
export type Nodes = GoFishAST[] | GoFishRef;

/** `box()`: the padded bounding box. See {@link box}. */
export type BoxShape = Extract<Frontend.ShapeIR, { kind: "box" }>;

/** `blob()`: a smooth region. See {@link blob}. `hull()` and `spine()` make
 *  this same object with other params preset. */
export type BlobShape = Omit<BlobIR, "avoiding"> & { avoiding?: Nodes };

/** Every built-in outline: the value of `enclose`'s `shape`. */
export type Shape = BoxShape | BlobShape;

/** The options `blob()`, `hull()` and `spine()` share. */
export type BlobOptions = Omit<BlobShape, "kind">;

/** The options that were given: an option left `undefined` does not
 *  override a preset. */
const given = <T extends object>(opts: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(opts).filter(([, v]) => v !== undefined)
  ) as Partial<T>;

/**
 * The members' bounding box, grown by `enclose`'s `padding`, with rounded
 * corners. The default shape.
 *
 * @param rx Corner radius in pixels, x. Default 2.
 * @param ry Corner radius in pixels, y. Default 2.
 */
export function box(opts: Omit<BoxShape, "kind"> = {}): BoxShape {
  return { kind: "box", ...given(opts) };
}

/**
 * A smooth region around the members: each member grown by `enclose`'s
 * `padding`, the links of a spanning tree between them (routed around the
 * avoided nodes, so the set stays in one piece), and the Delaunay triangles
 * of their points, filled smallest gaps first up to `convexity` of their
 * convex hull. The outline is rounded so its curvature never jumps.
 *
 * @param convexity The share of the convex hull that is filled, from 0 (the
 *   spanning tree alone) to 1 (the whole hull). Default 0.5.
 * @param holes Whether a gap left open inside the silhouette stays a hole.
 *   Default false: every hole is filled, and each avoided node it held is cut
 *   back out as its clearance circle.
 * @param roundness How far corners are rounded, in pixels. It never fills a
 *   gap, opens a hole or joins two pieces. Default: `padding`.
 * @param neck How far the outline is not pulled in between members, 0 to 1.
 *   Default 1 (not pulled in).
 * @param avoiding Nodes to keep out: a list of nodes or refs, or a
 *   `selectAll(name)` selection. A listed member is ignored.
 * @param clearance Pixels kept between the outline and each avoided node.
 *   Default 4.
 */
export function blob(opts: BlobOptions = {}): BlobShape {
  return { kind: "blob", ...given(opts) };
}

/**
 * The padded convex hull, rounded: `blob()` with `convexity: 1` and
 * `neck: 1`. Any option overrides the preset.
 */
export function hull(opts: BlobOptions = {}): BlobShape {
  return { kind: "blob", convexity: 1, neck: 1, ...given(opts) };
}

/**
 * The routed spanning tree of tubes and nothing else: `blob()` with
 * `convexity: 0`. Any option overrides the preset.
 */
export function spine(opts: BlobOptions = {}): BlobShape {
  return { kind: "blob", convexity: 0, ...given(opts) };
}

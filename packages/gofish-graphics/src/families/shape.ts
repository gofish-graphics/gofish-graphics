// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The `Shape` family: the outlines `enclose` draws, the values of its `shape`
 * option.
 *
 * `lib.ts` binds this module as `Shape` (`Shape.hull({ roundness: 8 })`), and
 * `gofish-graphics/shape` exports the same module. A strategy is a plain
 * object, `{ kind, ...params }`. No shape has a required option, so each is
 * a value as it is, and calling it sets options: `Shape.hull` is
 * `Shape.hull()` (#1133, `ast/strategyKind.ts`). `hull()` and
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
import { bareKind, given } from "../ast/strategyKind";
import type { GoFishAST } from "../ast/_ast";
import type { GoFishRef } from "../ast/_ref";

type BlobIR = Extract<Frontend.ShapeIR, { kind: "blob" }>;

/** Nodes a blob keeps out: a list of nodes or refs (a `.relate()` operand,
 *  `ref(...)`), or one `selectAll(name)` selection, the value as a whole. */
export type Nodes =
  | GoFishAST[]
  | (GoFishRef & { readonly multiplicity: "all" });

/** `box()`: the padded bounding box. See {@link box}. */
export type BoxShape = Extract<Frontend.ShapeIR, { kind: "box" }>;

/** `blob()`: a smooth region. See {@link blob}. `hull()` and `spine()` make
 *  this same object with other params preset. */
export type BlobShape = Omit<BlobIR, "avoiding"> & { avoiding?: Nodes };

/** `oval()`: the minimum-area enclosing ellipse. See {@link oval}. */
export type OvalShape = Extract<Frontend.ShapeIR, { kind: "oval" }>;

/** `arcs()`: the padded members, closed by a disc. See {@link arcs}.
 *  PROTOTYPE #1221 */
export type ArcsShape = Extract<Frontend.ShapeIR, { kind: "arcs" }>;

/** Every built-in outline: the value of `enclose`'s `shape`. */
export type Shape = BoxShape | OvalShape | ArcsShape | BlobShape;

/** The options `blob()`, `hull()` and `spine()` share. */
export type BlobOptions = Omit<BlobShape, "kind">;

/**
 * The members' bounding box, grown by `enclose`'s `padding`, with rounded
 * corners. The default shape.
 *
 * @param rx Corner radius in pixels, x. Default: `ry`, or 2 when neither
 *   is given.
 * @param ry Corner radius in pixels, y. Default: `rx`, or 2 when neither
 *   is given.
 */
export const box = bareKind(
  "Shape.box",
  (opts: Omit<BoxShape, "kind"> = {}): BoxShape => ({
    kind: "box",
    ...given(opts),
  })
);

/**
 * The smallest-area ellipse that holds every member grown by `enclose`'s
 * `padding`. It may be rotated: it follows the members, not the axes.
 */
export const oval = bareKind(
  "Shape.oval",
  // It has no options; any given ones go through, for enclose's check to
  // name, as the other kinds' unknown options do.
  (opts: Omit<OvalShape, "kind"> = {}): OvalShape => ({
    kind: "oval",
    ...given(opts),
  })
);

// PROTOTYPE #1221
/**
 * The members grown by `enclose`'s `padding`, with every gap a disc of
 * `radius` cannot reach into filled: the morphological closing of the padded
 * members by that disc, with holes filled (the contour of a bubble treemap,
 * Görtler et al. 2018). Each concave corner is a circular arc of `radius`
 * and the convex parts are the padded members' own boundaries, so around
 * circles the outline is made of circular arcs only. The geometry is in
 * `ast/graphicalOperators/enclose/arcs.ts`.
 *
 * @param radius The radius of the closing disc, in pixels. 0 is the padded
 *   union; a large radius nears the padded convex hull. Default 12.
 */
export const arcs = bareKind(
  "Shape.arcs",
  (opts: Omit<ArcsShape, "kind"> = {}): ArcsShape => ({
    kind: "arcs",
    ...given(opts),
  })
);

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
 * @param neck How far the outline is not pulled in between members, above 0
 *   and at most 1 (at 0 a link would have no width).
 *   Default 1 (not pulled in).
 * @param avoiding Nodes to keep out: a list of nodes or refs, or a
 *   `selectAll(name)` selection. A listed member is ignored.
 * @param clearance Pixels kept between the outline and each avoided node.
 *   Default 4.
 */
export const blob = bareKind(
  "Shape.blob",
  (opts: BlobOptions = {}): BlobShape => ({ kind: "blob", ...given(opts) })
);

/**
 * The padded convex hull, rounded: `blob()` with `convexity: 1` and
 * `neck: 1`. Any option overrides the preset.
 */
export const hull = bareKind(
  "Shape.hull",
  (opts: BlobOptions = {}): BlobShape => ({
    kind: "blob",
    convexity: 1,
    neck: 1,
    ...given(opts),
  })
);

/**
 * The routed spanning tree of tubes and nothing else: `blob()` with
 * `convexity: 0`. Any option overrides the preset.
 */
export const spine = bareKind(
  "Shape.spine",
  (opts: BlobOptions = {}): BlobShape => ({
    kind: "blob",
    convexity: 0,
    ...given(opts),
  })
);

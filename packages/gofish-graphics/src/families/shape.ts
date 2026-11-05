// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The `Shape` family: the outlines `enclose` draws, the values of its `shape`
 * option.
 *
 * `lib.ts` binds this module as `Shape` (`Shape.blob({ convexity: 0.8 })`), and
 * `gofish-graphics/shape` exports the same module. A strategy is a plain
 * object, `{ kind, ...params }`. No shape has a required option, so each is
 * a value as it is, and calling it sets options: `Shape.hull` is
 * `Shape.hull()` (#1133, `ast/strategyKind.ts`). `hull()` and
 * `spine()` are `blob()` with other params preset, so their objects have
 * kind `"blob"`, the way `sina()` and `jitter()` are `noise()`. The kinds,
 * their params and the presets are declared once, in gofish-ir's
 * `STRATEGIES` table. The outline itself is built in
 * `ast/graphicalOperators/enclose/`. The nodes an outline keeps out of
 * (`avoiding`) are `enclose`'s option, typed {@link Nodes} here.
 */
import type { Frontend } from "gofish-ir";
import { bareKind, given } from "../ast/strategyKind";
import type { GoFishAST } from "../ast/_ast";
import type { GoFishRef } from "../ast/_ref";

/** Nodes an outline keeps out (`enclose`'s `avoiding`): a list of nodes or refs (a `.relate()` operand,
 *  `ref(...)`), or one `selectAll(name)` selection, the value as a whole. */
export type Nodes =
  | GoFishAST[]
  | (GoFishRef & { readonly multiplicity: "all" });

/** `box()`: the padded bounding box. See {@link box}. */
export type BoxShape = Extract<Frontend.ShapeIR, { kind: "box" }>;

/** `blob()`: a smooth region. See {@link blob}. `hull()` and `spine()` make
 *  this same object with other params preset. */
export type BlobShape = Extract<Frontend.ShapeIR, { kind: "blob" }>;

/** `oval()`: the minimum-area enclosing ellipse. See {@link oval}. */
export type OvalShape = Extract<Frontend.ShapeIR, { kind: "oval" }>;

/** `fillet()`: the padded members, closed by a disc. See {@link fillet}. */
export type FilletShape = Extract<Frontend.ShapeIR, { kind: "fillet" }>;

/** Every built-in outline: the value of `enclose`'s `shape`. */
export type Shape = BoxShape | OvalShape | FilletShape | BlobShape;

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

/**
 * The members grown by `enclose`'s `padding`, with every gap a disc of
 * `radius` cannot reach into filled: the morphological closing of the padded
 * members by that disc (the contour of a bubble treemap, Görtler et al.
 * 2018). Each concave corner is a circular arc of `radius` and the convex
 * parts are the padded members' own boundaries, so around circles the
 * outline is made of circular arcs only. Two pieces nearer than 2 · `radius`
 * are joined by a link, and each piece is closed on its own. The geometry is
 * in `ast/graphicalOperators/enclose/outline.ts`.
 *
 * @param radius The radius of the closing disc, in pixels. 0 is the padded
 *   union; a large radius nears the padded convex hull. Default: `padding`.
 * @param neck The width of each link between two pieces, as a share of the
 *   padded members it joins, 0 to 1. 0 draws no links. Default 0.5.
 * @param holes Whether a gap the outline closes around stays a hole.
 *   Default false.
 */
export const fillet = bareKind(
  "Shape.fillet",
  (opts: Omit<FilletShape, "kind"> = {}): FilletShape => ({
    kind: "fillet",
    ...given(opts),
  })
);

/**
 * A smooth region around the members: the members split into pieces by
 * `connection`, each piece's members grown by `enclose`'s `padding` and
 * joined by a spanning tree of tubes (routed around the avoided nodes), and
 * the gaps between them filled up to `convexity`. The outline is smoothed,
 * then moved out just enough to hold every padded member again.
 *
 * @param convexity How much of each gap is filled: 0 is the spanning tree
 *   alone, 1 the padded convex hull, 2 the oval. Default 0.5.
 * @param connection The share of the links between members that are kept,
 *   the strongest first: 0 joins only members whose padding touches, 1 is
 *   one piece. Default 1.
 * @param neck The width of each link, as a share of the padded members it
 *   joins, above 0 and at most 1. Default 1 (no neck).
 * @param holes Whether a gap left open inside the silhouette stays a hole.
 *   Default false: every hole is filled.
 * @param separate With `connection` below 1, whether the pieces keep apart
 *   (each outline `enclose`'s `clearance` from the other pieces' padded
 *   members and links). Default false: each piece is filled on its own, and
 *   two may overlap.
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

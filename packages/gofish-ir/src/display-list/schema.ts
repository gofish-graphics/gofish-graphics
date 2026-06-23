// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * GoFish Display List IR — schema types.
 *
 * The display list is the *render IR*: the output of GoFish's layout pass,
 * captured just before backend emission, as a flat ordered list of positioned
 * primitives in absolute pixels. It is viewport-baked (solved at one `{w, h}`)
 * and backend-agnostic — an SVG, Canvas, or WebGPU emitter can each consume it.
 *
 * Unlike the {@link Frontend} IR (source-level, pre-elaboration), the display
 * list carries no operators, no constraints, no underlying-space tags, and no
 * channels — the solve consumed all of them. What survives is geometry +
 * resolved style + datum provenance + a node/overlay role.
 *
 * See the design notes at /internals/design/core-ir and
 * /internals/core/rendering.
 */

/** Top-level wrapper for a serialized display list. */
export interface DisplayListDocument {
  irVersion: 0;
  ir: "gofish-display-list";
  /** Optional URL of the JSON Schema this document claims to conform to. */
  $schema?: string;
  /** The viewport size this list was solved at. Layout is size-dependent, so a
   *  display list is only valid at this `{w, h}`; a resize requires a re-emit. */
  viewport: { w: number; h: number };
  items: DisplayItem[];
}

/**
 * A single positioned primitive. Geometry is absolute pixels with all
 * transforms (including coordinate transforms — a warped petal is already a
 * `path`) folded in. Colors are resolved through their scales.
 */
export type DisplayItem =
  | RectItem
  | EllipseItem
  | PathItem
  | TextItem
  | ImageItem
  | GroupItem
  | CompositeItem
  | MaskItem;

/** Source-data provenance carried by a primitive: one row, or rows for an
 *  aggregate mark. */
export type Datum = Record<string, unknown> | Record<string, unknown>[];

/** Properties shared by every primitive. */
export interface BaseDisplayItem {
  /** Resolved paint. */
  style?: Style;
  /** The source data this primitive was elaborated from — the hit-testing /
   *  accessibility target. Provenance, not a data binding. A single row for a
   *  one-to-one mark (a bar = one row), or the array of rows for an aggregate
   *  mark (a bar summarizing a group). */
  datum?: Datum;
  /** Whether this is a data-bearing primitive (`node`) or decorative chrome
   *  such as a label, axis, or glyph detail (`overlay`). Defaults to `node`. */
  role?: "node" | "overlay";
  /** Optional stable id (e.g. for keyed transitions in a host runtime). */
  id?: string;
}

export interface RectItem extends BaseDisplayItem {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radii. */
  rx?: number;
  ry?: number;
}

export interface EllipseItem extends BaseDisplayItem {
  kind: "ellipse";
  /** Center. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface PathItem extends BaseDisplayItem {
  kind: "path";
  /** SVG path data, in absolute pixels (coordinate transform already applied). */
  d: string;
}

export interface TextItem extends BaseDisplayItem {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontFamily?: string;
  textAnchor?: "start" | "middle" | "end";
  dominantBaseline?: "auto" | "central" | "middle" | "hanging" | "mathematical";
  /** Rotation in degrees about `(x, y)`, in final screen space (SVG
   *  `rotate(deg, x, y)` convention). */
  rotate?: number;
}

export interface ImageItem extends BaseDisplayItem {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  href: string;
  preserveAspectRatio?: string;
}

/**
 * A transform group — children painted under an affine `transform` (the
 * display-list analogue of an SVG `<g transform>` / a Canvas save+transform).
 * Used for the rare cases the flat-absolute fold can't express on its own: a
 * `box`/`frame` `scale`. Children are in the group's local pixel space.
 */
export interface GroupItem extends BaseDisplayItem {
  kind: "group";
  transform: { translate?: [number, number]; scale?: [number, number] };
  children: DisplayItem[];
}

/**
 * A Porter-Duff composite of two sub-lists (Figma-style operator names). The
 * SVG backend reconstructs the `feImage`/`feComposite`/`feBlend` filter graph;
 * a Canvas/WebGPU backend maps `operator`/`blendMode` to its own blend state.
 */
export interface CompositeItem extends BaseDisplayItem {
  kind: "composite";
  operator: "over" | "atop" | "in" | "out" | "xor";
  /** CSS `mix-blend-mode` applied between the two layers. */
  blendMode?: string;
  bbox: { x: number; y: number; w: number; h: number };
  source: DisplayItem[];
  dest: DisplayItem[];
}

/** Clip `content` by the alpha of `mask`. */
export interface MaskItem extends BaseDisplayItem {
  kind: "mask";
  bbox: { x: number; y: number; w: number; h: number };
  mask: DisplayItem[];
  content: DisplayItem[];
}

export interface Style {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
  /** CSS `mix-blend-mode`. */
  mixBlendMode?: string;
  /** SVG `stroke-dasharray`. */
  strokeDasharray?: string;
  /** A `url(#id)` reference to a user-supplied filter def. */
  filter?: string;
}

export const DISPLAY_ITEM_KINDS = [
  "rect",
  "ellipse",
  "path",
  "text",
  "image",
  "group",
  "composite",
  "mask",
] as const;

export type DisplayItemKind = (typeof DISPLAY_ITEM_KINDS)[number];

// ---------------------------------------------------------------------------
// Discriminator helpers
// ---------------------------------------------------------------------------

export function isRectItem(item: DisplayItem): item is RectItem {
  return item.kind === "rect";
}
export function isEllipseItem(item: DisplayItem): item is EllipseItem {
  return item.kind === "ellipse";
}
export function isPathItem(item: DisplayItem): item is PathItem {
  return item.kind === "path";
}
export function isTextItem(item: DisplayItem): item is TextItem {
  return item.kind === "text";
}
export function isImageItem(item: DisplayItem): item is ImageItem {
  return item.kind === "image";
}
export function isGroupItem(item: DisplayItem): item is GroupItem {
  return item.kind === "group";
}
export function isCompositeItem(item: DisplayItem): item is CompositeItem {
  return item.kind === "composite";
}
export function isMaskItem(item: DisplayItem): item is MaskItem {
  return item.kind === "mask";
}

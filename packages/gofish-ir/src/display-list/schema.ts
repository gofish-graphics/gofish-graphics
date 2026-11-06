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
  | CompositeItem;

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
  fontStyle?: string;
  fontWeight?: number | string;
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
 * display-list analogue of an SVG `<g transform>` / a Canvas save+transform),
 * and under a `filter` when it has one. Used for the cases the flat-absolute
 * fold can't express on its own: a `box`/`frame` `scale`, and a node with a
 * `filter` option, whose drawing is filtered as one picture. Children are in
 * the group's local pixel space.
 */
export interface GroupItem extends BaseDisplayItem {
  kind: "group";
  transform: { translate?: [number, number]; scale?: [number, number] };
  /** A filter over the group's whole drawing. */
  filter?: DisplayFilter;
  children: DisplayItem[];
}

/**
 * A filter over a group's drawing. `css` is a CSS `filter` value
 * (`url(#shadow)`, `blur(2px)`), which SVG takes as the `filter` attribute.
 * The other kinds are the `Filter` strategies; an SVG backend draws each as
 * an SVG `<filter>` def of one `feColorMatrix` (`filterDef`): `grayscale`
 * as CSS `grayscale(amount)` does, and `luminanceToAlpha` making each pixel
 * black with an alpha of its luminance, both in sRGB.
 */
export type DisplayFilter =
  | { kind: "css"; value: string }
  | { kind: "grayscale"; amount?: number }
  | { kind: "luminanceToAlpha" };

/**
 * A region composite: a set operation over its operands' regions (#1267).
 * `operator` is the public operator's name: Figma's `union`, `intersect`,
 * `subtract` and `exclude`, and Porter-Duff's `atop`. An operand's region is its alpha coverage: where its
 * `shape` puts ink, at that ink's alpha.
 *
 * With `fill`, the result is a new shape in that paint: the fill items are
 * drawn where the result's region is, and no operand's paint is drawn. With
 * none, each operand's own `paint` is drawn where the operator keeps it, and
 * where two operands' kept paint overlaps the later one is drawn over the
 * earlier with `blendMode` (PiCCL's coverage-blend rule). Which operand is
 * drawn where, and which masks clip it, is `compositeLayers` (composite.ts),
 * the one table both SVG backends read.
 *
 * The items of `operands` and `fill` are in absolute pixels, like every
 * other item.
 */
export interface CompositeItem extends BaseDisplayItem {
  kind: "composite";
  operator: "union" | "intersect" | "subtract" | "exclude" | "atop";
  /** CSS `mix-blend-mode` between kept paint that overlaps. Default
   *  `"normal"`. */
  blendMode?: string;
  bbox: { x: number; y: number; w: number; h: number };
  operands: CompositeOperand[];
  /** The result's own paint, drawn over the bbox and clipped to the
   *  result's region. */
  fill?: DisplayItem[];
}

/** One operand of a {@link CompositeItem}. */
export interface CompositeOperand {
  /** The operand as it draws: empty for a hidden one (`.hidden()`), and for
   *  every operand of a composite with a `fill`, whose operands give shape
   *  only. */
  paint: DisplayItem[];
  /** The operand's shape, where it differs from `paint`: a hidden part is
   *  drawn here, and gives shape but no paint. Omitted, it is `paint`. */
  shape?: DisplayItem[];
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
  /** SVG `paint-order`: `"stroke"` paints the stroke under the fill (a
   *  text halo). */
  paintOrder?: string;
  /** SVG `stroke-linejoin`. */
  strokeLinejoin?: string;
}

export const DISPLAY_ITEM_KINDS = [
  "rect",
  "ellipse",
  "path",
  "text",
  "image",
  "group",
  "composite",
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

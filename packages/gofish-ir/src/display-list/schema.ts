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
 * /internals/design/display-list-plan.
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
  | ImageItem;

/** Properties shared by every primitive. */
export interface BaseDisplayItem {
  /** Resolved paint. */
  style?: Style;
  /** The source data row this primitive was elaborated from — the hit-testing
   *  / accessibility target. Provenance, not a data binding. */
  datum?: Record<string, unknown>;
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
  textAnchor?: "start" | "middle" | "end";
}

export interface ImageItem extends BaseDisplayItem {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  href: string;
}

export interface Style {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
}

export const DISPLAY_ITEM_KINDS = [
  "rect",
  "ellipse",
  "path",
  "text",
  "image",
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

/**
 * Library-neutral checks over a RenderRecord (record.ts).
 *
 * A check states a fact about the PICTURE, never about the program: "there
 * are six bars whose lengths are proportional to these values, left to
 * right". Every check tolerates chrome it does not ask about (axes,
 * gridlines, background panels, legend swatches), because each library draws
 * different chrome. Positions are compared up to an unknown linear scale per
 * axis, so no check depends on margins, padding or tick choices.
 *
 * Shared vocabulary:
 *   ink(mark)      the color a reader sees: the fill, or the stroke when the
 *                  fill is missing, near-white or transparent.
 *   background     a mark with no ink, or a rect (a <rect>, or any shape
 *                  that nearly fills its box) covering >= 40% of the chart
 *                  (panels, plot backgrounds). Wedges, circles and other
 *                  paths are never background by size.
 *   same color     RGBA distance <= SAME_COLOR (alpha scaled to 0-255).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import type { Box, Mark, RenderRecord, RGBA } from "./record";
import type { Aspect, Size } from "./tasks";

type Row = Record<string, unknown>;

export interface CheckResult {
  pass: boolean;
  detail: string;
}

export interface CheckContext {
  data: Row[];
  size: Size;
}

type Orientation = "vertical" | "horizontal";
/** Order of categories along the category axis: "forward" is left to right
 *  (vertical bars) or top to bottom (horizontal bars). */
type Direction = "forward" | "reverse" | "either";

/** Values for a bar-like check: either given literally, or summed from the
 *  task data by category (categories in order of first appearance). */
type BarValues =
  | {
      values: number[];
      category?: undefined;
      value?: undefined;
      sort?: undefined;
    }
  | {
      category: string;
      value: string;
      /** Order categories by their summed value instead of data order. */
      sort?: "asc" | "desc";
      values?: undefined;
    };

/** Which items a highlight picks: every listed field must match, either
 *  equal to the value (compared as strings) or within { min, max }. For
 *  field-based bars the items are the categories, with the category and
 *  value fields; for points, the rows. */
type Where = Record<string, string | number | { min?: number; max?: number }>;

/** A highlight: the picked items' marks are drawn in `color` (RGB, alpha
 *  ignored), and every other item's mark shares one other color. */
interface Highlight {
  where: Where;
  color: string;
}

/** Values for a stacked/grouped check: summed from the task data by
 *  category x series (both in order of first appearance). */
interface SeriesValues {
  category: string;
  series: string;
  value: string;
}

/** One level of a mosaic: split along `dir` by the categories of `by`. */
export interface MosaicLevel {
  by: string;
  dir: "x" | "y";
  from?: "left" | "right" | "top" | "bottom" | "any";
}

export type Check =
  /** One rect-like filled mark per value, on a common baseline, lengths
   *  proportional to the values (a zero baseline; negative values extend
   *  the other way). `ordered` (default true) requires the values' order
   *  along the category axis in `direction` (default "forward").
   *  `valueLabels`: each bar also has a text reading exactly its value
   *  (en-US, thousands separators, `decimals` places, default 0) just
   *  beyond its end and centered across it. `highlight`: the picked bars
   *  have the given color and every other bar shares one other color. */
  | ({
      check: "bars";
      orientation: Orientation;
      ordered?: boolean;
      direction?: Direction;
      tol?: number;
      valueLabels?: { decimals?: number };
      highlight?: Highlight;
    } & BarValues)
  /** `bars` (ordered, within `tol`), plus a straight line across the value
   *  axis at `at` (a number, or "mean" of the bar values) on the bars'
   *  scale (within `lineTol`, default 0.005, of the largest value + 1.5px),
   *  spanning from the first bar's outer edge to the last bar's; `dashed`
   *  requires a dash pattern. A text containing `label` lies within 30px of
   *  the line and alongside it. */
  | ({
      check: "referenceLine";
      orientation: Orientation;
      direction?: Direction;
      at: number | "mean";
      label: string;
      dashed?: boolean;
      tol?: number;
      lineTol?: number;
    } & BarValues)
  /** One stack per category (in category order); within a stack, abutting
   *  segments whose lengths are proportional to the series values (any stack
   *  order); each series has one color across stacks, distinct from the
   *  other series. Positive values only. */
  | ({
      check: "stackedBars";
      orientation: Orientation;
      direction?: Direction;
      tol?: number;
    } & SeriesValues)
  /** Bars on a common baseline, category-major then series order along the
   *  category axis, lengths proportional; each series has one color across
   *  categories, distinct from the other series. */
  | ({
      check: "groupedBars";
      orientation: Orientation;
      direction?: Direction;
      tol?: number;
    } & SeriesValues)
  /** One circle-like mark per row, centered at an affine image of (x, y)
   *  with y pointing up. `colorBy`: rows sharing the field's value share a
   *  color; different values get different colors. `size`: each circle's
   *  area is proportional to the field (radius^2 = k * value for one k),
   *  within 0.5px + `sizeTol` (0.03) of the largest radius; with
   *  `maxRadius`, the largest radius is within 25% of it. `highlight`:
   *  the picked rows' circles have the given color and every other circle
   *  shares one other color. */
  | {
      check: "points";
      x: string;
      y: string;
      colorBy?: string;
      size?: string;
      maxRadius?: number;
      highlight?: Highlight;
      tol?: number;
      sizeTol?: number;
    }
  /** One stroked line per group (or one line), passing through the rows'
   *  (x, y) under one affine map with y up, and running in one x direction
   *  (points joined in x order). With `groupBy`, the lines have distinct
   *  colors. */
  | {
      check: "lineSeries";
      x: string;
      y: string;
      groupBy?: string;
      tol?: number;
    }
  /** A line through the rows as `lineSeries` finds it, and at the row with
   *  the largest (`at: "max"`) or smallest `y`: a filled circle (radius at
   *  least 2.5px) centered on that point (within 1.5% of the plot, at least
   *  2px), and a text containing `text` within `near` px (30) of it. */
  | {
      check: "annotation";
      x: string;
      y: string;
      at: "max" | "min";
      text: string;
      near?: number;
      tol?: number;
    }
  /** Pie/donut slices around one center whose angular shares match the
   *  values' shares (any order); slices have distinct colors. `hole`: true
   *  requires a donut (every slice's inner radius is at least 20% of its
   *  outer radius), false a pie (at most 5%); unset allows either. */
  | ({ check: "wedges"; hole?: boolean; tol?: number } & BarValues)
  /** Pie glyphs: one complete pie (slices around one center whose sweeps
   *  add up to 360 degrees, within 3, and whose inner radius is at most 5%
   *  of the outer) per `by` category, centered at an
   *  affine image of its (x, y) with y up (as `points`, within `placeTol`
   *  of the plotted extent); its slices' angular shares match the shares
   *  of `value` by `category` (any order, within `tol`, default 0.01); each
   *  `category` has one color across pies, distinct from the others. */
  | {
      check: "pieGlyphs";
      by: string;
      x: string;
      y: string;
      category: string;
      value: string;
      tol?: number;
      placeTol?: number;
    }
  /** A mosaic: one rectangle split recursively, one level per entry of
   *  `levels`. Level i splits every cell of level i-1 along its `dir` into
   *  one piece per category of its `by` field, each piece as long as that
   *  category's share of the cell's summed `value` (within `tol` of the
   *  cell), and spanning the cell's full extent the other way. `from` names
   *  the side the first category (in order of first appearance) starts at;
   *  "any" (the default) allows any order. Small gaps between pieces are
   *  allowed. The categories of the last level each have one color, distinct
   *  from the others. A Marimekko chart is two levels: columns along x, then
   *  segments along y. */
  | {
      check: "mosaic";
      levels: MosaicLevel[];
      value: string;
      tol?: number;
    }
  /** A rows x cols regular grid of equal squares (and no more squares of
   *  that size on the grid's lattice) whose colors count out the values: one
   *  color per category, as many squares as its value (within `tol`
   *  squares, default 0). `order: "rows"` also requires the fill order:
   *  reading row by row from the top-left, one run of squares per category,
   *  in the values' order. */
  | ({
      check: "waffle";
      rows: number;
      cols: number;
      order?: "rows" | "any";
      tol?: number;
    } & BarValues)
  /** Unit blocks, a waffle with ragged edges: one block of equal unit
   *  squares per `category` (in order of first appearance), holding its
   *  summed `value` / `per` (default 1) squares. The blocks sit left to
   *  right in category order, separated by gaps at least one square wide,
   *  with their start edges (bottoms for a bottom `start`, tops for a top
   *  one) on one line. All squares lie on one regular lattice. Each block is
   *  `width` columns wide and fills rows from its `start` corner: row by row
   *  away from that corner, each row from that corner's side, so every row
   *  is full except the last, whose squares sit at that side. Each block is
   *  one color, distinct from the others. Square marks of another size, and
   *  groups of lattice-adjacent squares that are not a block, are ignored.
   *  `labels`: a text containing each category's name is centered under its
   *  block (within half the block's width) and at most 40px below it. */
  | {
      check: "unitBlocks";
      category: string;
      value: string;
      per?: number;
      width: number;
      start: "bottom-left" | "bottom-right" | "top-left" | "top-right";
      labels?: boolean;
    }
  /** A ribbon chart: `stackedBars`, plus, for every series and every pair of
   *  neighboring stacks, a filled band whose cross-section at the first
   *  stack's far edge spans the series' segment there and at the next
   *  stack's near edge spans its segment there (within max(2px, tol of the
   *  segment)), in that series' color or a tint of it (its hue, composited
   *  over white, is nearest that series' hue). */
  | ({
      check: "ribbons";
      orientation: Orientation;
      direction?: Direction;
      tol?: number;
    } & SeriesValues)
  /** A ridgeline: per `category` (in order of first appearance), a filled
   *  shape whose top edge, measured up from its own baseline (its lowest
   *  edge), passes through the category's (x, y) points (within `tol` of
   *  the tallest peak, at least 2px), under one horizontal map (the shapes
   *  span the same x range) and one height scale (within 5%). Baselines run
   *  top to bottom in category order, evenly spaced (within 5%, at least
   *  2px), and the tallest peak is `overlap` ([1.5, 2.5]) times the spacing,
   *  so ridges overlap the row above. */
  | {
      check: "ridgeline";
      category: string;
      x: string;
      y: string;
      overlap?: [number, number];
      tol?: number;
    }
  /** Bottle fills: one bottle outline per `category`, left to right in
   *  order (stroked, unfilled, closed, not a rectangle, all the same height
   *  within 5%). Inside each, the painted pixels of the filled marks there
   *  (after any clip path or mask) form the liquid: it starts at the
   *  outline's bottom, rises to `value / max` of the outline's height
   *  (within `tol`, default 0.02, plus 1.5px), stays inside the outline (at
   *  most 1% of its pixels more than 1.5px outside), and a quarter of the
   *  way up it spans at least 85% of the outline's width. */
  | {
      check: "bottleFill";
      category: string;
      value: string;
      max?: number;
      tol?: number;
    }
  /** Image fill, judged on the rendered pixels (the PNG screenshot), since
   *  compositing and blending only exist there. `image` is a file in
   *  tests/llm-bench/assets/, drawn `height` px tall at its own aspect
   *  ratio, once per `category` (left to right in order, bottoms on one
   *  line within 3px). Each copy is found by its silhouette: 90% of its
   *  opaque pixels are painted and 90% of its transparent ones do not look
   *  like gray glass. Then, in each copy, among the opaque pixels of middle
   *  brightness: below the level (`value / max` of `height` up from the
   *  bottom, within `levelTol` px, default 3) 85% have the hue of `color`
   *  (within 25 degrees, chroma at least 40) and above it 85% are gray
   *  (chroma at most 30). The rendered brightness follows the image's gray
   *  brightness (correlation at least 0.6) on each side of the level. No
   *  transparent pixel of the image, nor any pixel within 12px left or
   *  right of it, has the tint (at most 1%, and at least 4 pixels, of
   *  them). A gray line or thin rect (from the record) lies at the level
   *  and spans the image's width. */
  | {
      check: "imageFill";
      image: string;
      height: number;
      color: string;
      category: string;
      value: string;
      max?: number;
      levelTol?: number;
    }
  /** Circle packing, two levels: one circle per `leaf` (its `value` summed
   *  by `parent` and `leaf`) with area proportional to the value (radius^2
   *  = k * value for one k, within 0.5px + `tol` (0.03) of the largest
   *  radius). A leaf circle contains no other circle, and the smallest
   *  circle containing it is its parent circle. The leaves under each
   *  parent circle are exactly one `parent`'s leaves (matched by their
   *  radii), leaf circles do not overlap each other, and parent circles do
   *  not overlap each other (both within 1px + 2% of the smaller radius).
   *  Each `parent`'s leaves share one color, distinct from the other
   *  parents'. Positions are free: any valid packing passes. */
  | {
      check: "circlePack";
      parent: string;
      leaf: string;
      value: string;
      tol?: number;
    }
  /** Two-level rectangular treemap with a circle in every leaf cell. Leaf
   *  cells are rects (filled or outline only), each the smallest rect
   *  around one circle; circles whose smallest enclosing rect is the
   *  background (or that have none) are ignored. There is one cell per
   *  `leaf` (its `value` summed by `parent` and `leaf`), and each holds
   *  exactly one circle, centered in it (within 1.5px) with diameter
   *  min(cell w, cell h) - `padding` (default 0; within 1.5px). Cells do
   *  not overlap (1.5px) and fill their bounding box (areas sum to it
   *  within 3%). Cell areas are proportional to the values (area = k *
   *  value for one k, within `tol` (0.05) plus half the cell's perimeter
   *  in px^2, for rounding). Circles take one color per `parent`, distinct
   *  across parents; each color's cells are exactly one `parent`'s leaves
   *  (matched by area) and fill their own bounding box (within 3%), so each
   *  parent is one contiguous rectangle with area k * its total. Any
   *  tiling passes. */
  | {
      check: "treemapCircles";
      parent: string;
      leaf: string;
      value: string;
      padding?: number;
      tol?: number;
    }
  /** A line through the rows (as `lineSeries` finds it) with the area
   *  between it and zero filled. Probed at each row's x (with its value)
   *  and halfway between neighboring rows on the same side of zero (with
   *  the drawn line's height there): the fill spans from zero to the line
   *  (sampled at 20%, 50% and 80% of the way), does not reach past the line
   *  or cross to the other side of zero (checked 2% of the largest value,
   *  at least 3px, beyond each), and is one color above zero and one other
   *  color below. */
  | { check: "signedArea"; x: string; y: string; tol?: number }
  /** A grid of equal rects, one per row: columns are the `x` categories
   *  left to right and rows the `y` categories top to bottom (both in order
   *  of first appearance). The fill follows `value` on a sequential scale
   *  from light (low) to dark (high); see `sequentialProblem`. */
  | { check: "heatmap"; x: string; y: string; value: string }
  /** Hexagonal binning in pixels, as d3-hexbin does: pointy-top hexagons
   *  of `radius` px (center to corner, within `tol`, default 0.15) on one
   *  lattice whose spacing and offset are read from the drawn hexagons (no
   *  origin is assumed). Some linear x and y scales (y up) put every row
   *  inside a drawn hexagon, by the nearest lattice center, leave no drawn
   *  hexagon empty, and give counts that the fills show on a sequential
   *  scale from light (few) to dark (many). */
  | { check: "hexbin"; x: string; y: string; radius: number; tol?: number }
  /** Lollipops: one circle per value, each joined by a stem (a line or a
   *  thin rect along the value axis) to one shared baseline. The stems'
   *  lengths, from the baseline to the circle centers, are proportional to
   *  the values as `bars` measures bar lengths (with `ordered` and
   *  `direction` as there). */
  | ({
      check: "lollipop";
      orientation: Orientation;
      ordered?: boolean;
      direction?: Direction;
      tol?: number;
    } & BarValues)
  /** Strips: one horizontal lane per `category`, top to bottom in order of
   *  first appearance, and one mark per row in its category's lane, at a
   *  linear image of `value` along x (within `tol` of the plotted extent,
   *  default 0.01, at least 1.5px). A lane is a set of marks sharing one
   *  vertical center (within 1.5px). `mark`: "circle" (default) or "tick"
   *  (a short vertical line or thin rect). ISO dates count as times.
   *  `colorBy` and `size` (area proportional, within `sizeTol`) as in
   *  `points`. */
  | {
      check: "strips";
      category: string;
      value: string;
      mark?: "circle" | "tick";
      colorBy?: string;
      size?: string;
      tol?: number;
      sizeTol?: number;
    }
  /** A beeswarm: one circle per row, all the same radius (within 1px or
   *  5%), centered within `slack` px (default 2) of a linear image of `x`,
   *  so a force layout that settles near the exact positions passes. No two circles overlap (by more
   *  than 1px or 10% of the radius), and every circle off the swarm's base
   *  line (the vertical position most circles share, within 2px) touches
   *  another circle (within 1.5px or 15% of the radius), so the circles
   *  pile up from the base line instead of scattering. `colorBy`: rows
   *  sharing the field's value share a color, and different values differ
   *  (circles at the same x may be matched in any order). */
  | { check: "beeswarm"; x: string; colorBy?: string; slack?: number }
  /** A stacked area chart: per `series` (bottom to top in order of first
   *  appearance), a filled shape whose cross-section at each `x` spans that
   *  series' stacked interval (from the sum of the series below it to that
   *  sum plus its own `y`), within `tol` (0.02) of the plot height, at
   *  least 2px. All shapes share one linear x and y scale with zero at the
   *  bottom. The series' colors differ. */
  | { check: "stackedArea"; x: string; y: string; series: string; tol?: number }
  /** Circular bars: wedges around one center, all starting at one inner
   *  radius (a hole of at least 10% of the largest radius), one per value,
   *  with radial lengths (outer minus inner radius) proportional to the
   *  values as `bars` measures lengths, and equal angular widths (within 1
   *  degree or 5%). With `ordered` (default true) they run clockwise in the
   *  values' order from 12 o'clock (the first may start up to 15 degrees
   *  before it). */
  | ({ check: "radialBars"; ordered?: boolean; tol?: number } & BarValues)
  /** Horizontal bullet charts, one per row, top to bottom in data order,
   *  on one shared scale from one left baseline: range rects whose right
   *  edges fall at each of the `ranges` fields (drawn nested from the
   *  baseline or end to end), each range band a different color; a thinner
   *  bar (at most 80% of the range rects' thickness) of length `value`,
   *  centered on them; and a mark across the bar (a vertical line or thin
   *  rect at least as tall as the bar) at `target`. Within `tol` (0.02) of
   *  the largest range plus 1.5px. */
  | {
      check: "bullet";
      category: string;
      value: string;
      target: string;
      ranges: string[];
      tol?: number;
    }
  /** A two-ring sunburst around one center: an inner ring with one wedge
   *  per `parent`, whose angular shares match the parents' summed `value`
   *  shares, and an outer ring (starting where the inner ring ends, within
   *  3px or 5%) with one wedge per `leaf`, each inside its parent's angle
   *  (within 1 degree), with angular shares of the whole circle matching
   *  the leaves' shares (any order within a parent). Shares within `tol`
   *  (0.01). The parents' wedges have distinct colors. */
  | {
      check: "sunburst";
      parent: string;
      leaf: string;
      value: string;
      tol?: number;
    }
  /** A vertical waterfall: one rect per row, left to right in data order,
   *  then one more for the total. The first row's bar runs from zero to its
   *  value, each later row's bar floats from the running total before it
   *  to the running total after it, and the total's bar runs from zero to
   *  the final sum, all on one linear scale with y up (within `tol`, 0.02,
   *  of the largest running total plus 1px). Increases share one color,
   *  decreases share another, and the first and total bars share a third. */
  | { check: "waterfall"; category: string; value: string; tol?: number }
  /** A chord diagram of undirected links: around one center, one annular
   *  wedge per node, with angular shares matching each node's summed link
   *  `value`, in distinct colors, and a text containing the node's name in
   *  the direction of its wedge (within 5 degrees). For every link, a filled ribbon whose two
   *  ends lie on the circle just inside the node wedges (between 80% and
   *  100% of their inner radius), one end within each of the two nodes'
   *  angles (within 1 degree), each end as wide as the link's value on the
   *  wedges' angular scale (within 2 degrees or 8%). */
  | { check: "chord"; source: string; target: string; value: string }
  /** A dendrogram of a tree given as rows of (`name`, `parent`, `height`),
   *  root at the top: each leaf's name is a text below its leaf, the leaves
   *  stand on one baseline (height 0), each internal node sits at the
   *  middle of its children, and its elbow is drawn: a horizontal line at
   *  the node's height across its children, and a vertical line from each
   *  child up to it (every sampled point within max(2px, `tol` (0.01) of
   *  the tree's height) of a drawn line), heights on one linear scale. */
  | {
      check: "dendrogram";
      name: string;
      parent: string;
      height: string;
      tol?: number;
    }
  /** An alluvial diagram: one column of stacked node rects per step (the
   *  fields in `steps`), left to right; in each column one rect per
   *  category (top to bottom in order of first appearance, with gaps
   *  allowed) whose height is proportional to the category's summed
   *  `value`, on one scale for all columns. Ribbons run through: in each
   *  gap, bands (cross-sections read just inside the gap) leave one node
   *  and reach one node, as thick at both ends. At each middle node, cut
   *  at every band end, each slice continues from the band arriving there
   *  to the band leaving there, every slice of an arriving band leaves
   *  toward one node and every slice of a leaving band came from one
   *  ribbon, so ribbons keep their slot (one path per ribbon, one per
   *  gap, or split lodes all pass). The slices of each (previous, this,
   *  next) combination add up to its summed `value` (within 2.5px or
   *  `tol`, 0.05), and each ribbon keeps its first step's color, one color
   *  per first-step category. */
  | { check: "alluvial"; steps: string[]; value: string; tol?: number }
  /** A spine chart: horizontal bars from one shared baseline, one pair per
   *  `category` (top to bottom in order of first appearance); the first
   *  `series` extends left and the second right, lengths proportional to
   *  `value` on one scale (the two sides' scales within `tol`, 0.03), the
   *  pair centered on one line. Each series has one color, and they
   *  differ. */
  | ({ check: "spine"; tol?: number } & SeriesValues)
  /** Each string appears (case-insensitive substring) in some text. */
  | { check: "textIncludes"; strings: string[] }
  /** Data marks use at least `k` distinct colors. */
  | { check: "distinctColors"; k: number }
  /** The largest <svg> is within `tol` (relative, default 0.25: a loose sanity bound) of w x h;
   *  defaults to the task's size. */
  | { check: "sizeAbout"; w?: number; h?: number; tol?: number };

export const SAME_COLOR = 24;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export function colorDist(a: RGBA, b: RGBA): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], 255 * (a[3] - b[3]));
}

function nearWhite(c: RGBA): boolean {
  return (c[0] >= 235 && c[1] >= 235 && c[2] >= 235) || c[3] < 0.05;
}

export function ink(m: Mark): RGBA | null {
  if (m.fill && !nearWhite(m.fill)) return m.fill;
  if (m.stroke && !nearWhite(m.stroke)) return m.stroke;
  return null;
}

function chartArea(rec: RenderRecord): number {
  const s = rec.svgs[0];
  return s ? s.w * s.h : Infinity;
}

/** A panel behind the chart: a mark with no ink, or a rect covering at least
 *  40% of the chart. Only rects count by size: a large wedge, circle or
 *  filled path is a data mark however much of the chart its box covers (the
 *  biggest slice of a pie, say). */
function isBackground(m: Mark, rec: RenderRecord): boolean {
  return !ink(m) || (m.kind === "rect" && m.w * m.h >= 0.4 * chartArea(rec));
}

/** Marks that encode data: filled rects, circles, wedges and filled paths
 *  that are not background, and not hairlines (thinner than 2px, e.g. an
 *  axis or tick drawn as a rect). Lines and text are chrome as far as this
 *  set is concerned. */
export function dataMarks(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) =>
      (m.kind === "rect" ||
        m.kind === "circle" ||
        m.kind === "wedge" ||
        (m.kind === "path" && m.fill)) &&
      Math.min(m.w, m.h) >= 2 &&
      !isBackground(m, rec)
  );
}

/** Group colors into clusters of "same color"; returns one representative
 *  per cluster, in first-seen order. */
export function colorClusters(colors: RGBA[]): RGBA[] {
  const reps: RGBA[] = [];
  for (const c of colors)
    if (!reps.some((r) => colorDist(r, c) <= SAME_COLOR)) reps.push(c);
  return reps;
}

const rgbaText = (c: RGBA | null) =>
  c ? `rgba(${c[0]},${c[1]},${c[2]},${c[3]})` : "none";

/** A data value as a number. An ISO date string ("2017-03-01") counts as
 *  its time in milliseconds, since a time axis places dates linearly. */
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
    return Date.parse(v);
  return Number(v);
}

function uniqueInOrder(rows: Row[], field: string): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = String(r[field]);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function barValues(
  spec: BarValues,
  data: Row[]
): { labels: string[]; values: number[]; items: Row[] } {
  if (spec.values)
    return {
      labels: spec.values.map(String),
      values: spec.values,
      items: spec.values.map((value) => ({ value })),
    };
  const cats = uniqueInOrder(data, spec.category!).map((label) => ({
    label,
    value: data
      .filter((r) => String(r[spec.category!]) === label)
      .reduce((s, r) => s + num(r[spec.value!]), 0),
  }));
  if (spec.sort)
    cats.sort((a, b) =>
      spec.sort === "asc" ? a.value - b.value : b.value - a.value
    );
  return {
    labels: cats.map((c) => c.label),
    values: cats.map((c) => c.value),
    items: cats.map((c) => ({
      [spec.category!]: c.label,
      [spec.value!]: c.value,
    })),
  };
}

function picked(item: Row, where: Where): boolean {
  return Object.entries(where).every(([field, want]) => {
    const got = item[field];
    if (typeof want === "object") {
      const v = num(got);
      return (
        Number.isFinite(v) &&
        (want.min === undefined || v >= want.min) &&
        (want.max === undefined || v <= want.max)
      );
    }
    return String(got) === String(want);
  });
}

/** Parse "#rrggbb" or "#rgb" into RGBA. */
function hexColor(hex: string): RGBA {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16))
    .concat(1) as RGBA;
}

/** marks[i] draws items[i]. The picked items' marks have the highlight
 *  color (RGB within SAME_COLOR; alpha ignored, since a fill may keep the
 *  chart's opacity), and all other marks share one color that is not it. */
function highlightProblem(
  h: Highlight,
  items: Row[],
  marks: Mark[]
): string | null {
  const want = hexColor(h.color);
  const rgb = (c: RGBA) =>
    Math.hypot(c[0] - want[0], c[1] - want[1], c[2] - want[2]);
  const pick = items.map((it) => picked(it, h.where));
  const n = pick.filter(Boolean).length;
  if (n === 0) return `no item matches ${JSON.stringify(h.where)}`;
  const wrong = marks.filter((m, i) => pick[i] && rgb(ink(m)!) > SAME_COLOR);
  if (wrong.length > 0)
    return `${wrong.length} of ${n} highlighted marks are not ${h.color} (${rgbaText(ink(wrong[0])!)})`;
  const rest = marks.filter((_, i) => !pick[i]).map((m) => ink(m)!);
  const reps = colorClusters(rest);
  if (reps.length > 1)
    return `the other marks use ${reps.length} colors (${reps.slice(0, 4).map(rgbaText).join(" ")}), not one shared color`;
  if (reps.length === 1 && rgb(reps[0]) <= SAME_COLOR)
    return `the other marks are also ${h.color}`;
  return null;
}

function seriesValues(spec: SeriesValues, data: Row[]) {
  const categories = uniqueInOrder(data, spec.category);
  const series = uniqueInOrder(data, spec.series);
  const values = categories.map((c) =>
    series.map((s) =>
      data
        .filter(
          (r) => String(r[spec.category]) === c && String(r[spec.series]) === s
        )
        .reduce((acc, r) => acc + num(r[spec.value]), 0)
    )
  );
  return { categories, series, values };
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

interface Bar {
  /** Center along the category axis. */
  pos: number;
  /** Signed length along the value axis from the baseline (up/right = +). */
  len: number;
  mark: Mark;
}

/** Filled, non-background rect marks. */
function barCandidates(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) =>
      m.kind === "rect" && m.fill && !nearWhite(m.fill) && !isBackground(m, rec)
  );
}

/** For each candidate baseline (an edge shared by rects along the value
 *  axis), the rects standing on it with their signed lengths. */
function barsByBaseline(cands: Mark[], orientation: Orientation): Bar[][] {
  const edges = new Set<number>();
  for (const m of cands) {
    if (orientation === "vertical") {
      edges.add(Math.round(m.y + m.h));
      edges.add(Math.round(m.y));
    } else {
      edges.add(Math.round(m.x));
      edges.add(Math.round(m.x + m.w));
    }
  }
  const groups: Bar[][] = [];
  for (const b of edges) {
    const bars: Bar[] = [];
    for (const m of cands) {
      if (orientation === "vertical") {
        const pos = m.x + m.w / 2;
        if (Math.abs(m.y + m.h - b) <= 1) bars.push({ pos, len: m.h, mark: m });
        else if (Math.abs(m.y - b) <= 1) bars.push({ pos, len: -m.h, mark: m });
      } else {
        const pos = m.y + m.h / 2;
        if (Math.abs(m.x - b) <= 1) bars.push({ pos, len: m.w, mark: m });
        else if (Math.abs(m.x + m.w - b) <= 1)
          bars.push({ pos, len: -m.w, mark: m });
      }
    }
    if (bars.length > 0) groups.push(bars);
  }
  return groups;
}

function directions(d: Direction): ("forward" | "reverse")[] {
  return d === "either" ? ["forward", "reverse"] : [d];
}

/** Find bars (one per value) whose lengths are k * value for one k > 0,
 *  within `tol` of the largest value (plus 1px for rounding). Ordered: the
 *  bars appear in value order along the category axis. */
function matchBars(
  groups: Bar[][],
  values: number[],
  opts: { ordered: boolean; direction: Direction; tol: number }
): { bars: Bar[]; best: number } {
  const maxAbs = Math.max(...values.map(Math.abs));
  let best = 0;
  for (const group of groups) {
    for (const dir of directions(opts.direction)) {
      const sorted = [...group].sort((a, b) =>
        dir === "forward" ? a.pos - b.pos : b.pos - a.pos
      );
      const scales = new Set<number>();
      for (const bar of sorted)
        for (const v of values)
          if (v !== 0 && Math.sign(v) === Math.sign(bar.len))
            // Rounded to 5 significant digits (not to a fixed number of
            // decimals), so large values keep a precise scale.
            scales.add(Number((bar.len / v).toPrecision(5)));
      for (const k of scales) {
        const slack = opts.tol * k * maxAbs + 1;
        const fits = (bar: Bar, v: number) =>
          Math.abs(bar.len - k * v) <= slack;
        let matched: Bar[] = [];
        if (opts.ordered) {
          let j = 0;
          for (const bar of sorted) {
            if (j < values.length && fits(bar, values[j])) {
              matched.push(bar);
              j++;
            }
          }
        } else {
          const pool = [...sorted];
          for (const v of values) {
            const i = pool.findIndex((bar) => fits(bar, v));
            if (i < 0) break;
            matched.push(pool.splice(i, 1)[0]);
          }
        }
        best = Math.max(best, matched.length);
        if (matched.length === values.length) return { bars: matched, best };
        matched = [];
      }
    }
  }
  return { bars: [], best };
}

/** A number as en-US text with thousands separators and a fixed number of
 *  decimals, e.g. 1240 -> "1,240". */
function formatNumber(v: number, decimals: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** For each bar, a text reading exactly its formatted value, just beyond
 *  the bar's end (its outer edge at most 16px past the end, and at most 30%
 *  of the text overlapping the bar) and centered across the bar (within
 *  max(3px, 10% of its thickness)). Returns the problems, or []. */
function valueLabelProblems(
  bars: Bar[],
  values: number[],
  orientation: Orientation,
  decimals: number,
  rec: RenderRecord
): string[] {
  const texts = rec.marks.filter((m) => m.kind === "text");
  const v = orientation === "vertical";
  const problems: string[] = [];
  bars.forEach((bar, i) => {
    const want = formatNumber(values[i], decimals);
    const same = texts.filter((t) => t.text!.trim() === want);
    if (same.length === 0) {
      problems.push(`no text "${want}"`);
      return;
    }
    const m = bar.mark;
    const ok = same.some((t) => {
      const across = v
        ? Math.abs(t.x + t.w / 2 - (m.x + m.w / 2)) <= Math.max(3, 0.1 * m.w)
        : Math.abs(t.y + t.h / 2 - (m.y + m.h / 2)) <= Math.max(3, 0.1 * m.h);
      // Gap from the bar's end to the near side of the text, measured
      // outward (negative when the text overlaps the bar).
      const gap = v
        ? bar.len >= 0
          ? m.y - (t.y + t.h)
          : t.y - (m.y + m.h)
        : bar.len >= 0
          ? t.x - (m.x + m.w)
          : m.x - (t.x + t.w);
      const depth = v ? t.h : t.w;
      return across && gap >= -0.3 * depth && gap <= 16;
    });
    if (!ok)
      problems.push(
        `"${want}" is not just beyond its bar's end, centered on it`
      );
  });
  return problems;
}

function checkBars(
  c: Extract<Check, { check: "bars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values, items } = barValues(c, ctx.data);
  const cands = barCandidates(rec);
  const { bars, best } = matchBars(
    barsByBaseline(cands, c.orientation),
    values,
    {
      ordered: c.ordered ?? true,
      direction: c.direction ?? "forward",
      tol: c.tol ?? 0.03,
    }
  );
  if (bars.length !== values.length)
    return {
      pass: false,
      detail: `expected ${values.length} ${c.orientation} bars proportional to [${values.join(", ")}]; ${cands.length} filled rects, best baseline matched ${best}`,
    };
  let matched = `${values.length} ${c.orientation} bars match [${values.join(", ")}]`;
  if (c.highlight) {
    const problem = highlightProblem(
      c.highlight,
      items,
      bars.map((b) => b.mark)
    );
    if (problem)
      return { pass: false, detail: `${matched}, but highlight: ${problem}` };
    matched += `, highlighted ${JSON.stringify(c.highlight.where)} in ${c.highlight.color}`;
  }
  if (c.valueLabels) {
    const problems = valueLabelProblems(
      bars,
      values,
      c.orientation,
      c.valueLabels.decimals ?? 0,
      rec
    );
    if (problems.length > 0)
      return {
        pass: false,
        detail: `${matched}, but value labels: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
      };
    return { pass: true, detail: `${matched}, each labeled with its value` };
  }
  return { pass: true, detail: matched };
}

function checkReferenceLine(
  c: Extract<Check, { check: "referenceLine" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const tol = c.tol ?? 0.03;
  const { bars } = matchBars(
    barsByBaseline(barCandidates(rec), c.orientation),
    values,
    { ordered: true, direction: c.direction ?? "forward", tol }
  );
  if (bars.length !== values.length)
    return {
      pass: false,
      detail: `no ${c.orientation} bars proportional to [${values.join(", ")}] to measure the line against`,
    };
  const at =
    c.at === "mean" ? values.reduce((a, b) => a + b, 0) / values.length : c.at;
  const v = c.orientation === "vertical";
  // The value axis: screen position = base + k * value, along y (up) for
  // vertical bars and x (right) for horizontal ones.
  const ref = bars.find((b, i) => values[i] !== 0)!;
  const vi = bars.indexOf(ref);
  const k = ref.len / values[vi];
  const m0 = ref.mark;
  const base = v
    ? ref.len >= 0
      ? m0.y + m0.h
      : m0.y
    : ref.len >= 0
      ? m0.x
      : m0.x + m0.w;
  const target = v ? base - k * at : base + k * at;
  // The line sits at one exact value, so it gets a tighter tolerance than
  // the bars: `lineTol` (0.005) of the largest value, plus 1.5px.
  const slack =
    (c.lineTol ?? 0.005) * Math.abs(k) * Math.max(...values.map(Math.abs)) +
    1.5;
  // The span the line must cover: from the first bar's outer edge to the
  // last bar's.
  const lo = Math.min(...bars.map((b) => (v ? b.mark.x : b.mark.y)));
  const hi = Math.max(
    ...bars.map((b) => (v ? b.mark.x + b.mark.w : b.mark.y + b.mark.h))
  );
  const rules = rec.marks.filter((m) => {
    if (!ink(m)) return false;
    const thin = v ? m.h <= 3 : m.w <= 3;
    return (m.kind === "line" || m.kind === "rect") && thin;
  });
  const pos = (m: Mark) => (v ? m.y + m.h / 2 : m.x + m.w / 2);
  const at1 = rules.filter((m) => Math.abs(pos(m) - target) <= slack);
  const spanning = at1.filter((m) =>
    v
      ? m.x <= lo + 2 && m.x + m.w >= hi - 2
      : m.y <= lo + 2 && m.y + m.h >= hi - 2
  );
  const shown = `${at.toFixed(2)} (expected at ${v ? "y" : "x"} = ${target.toFixed(0)}px)`;
  if (spanning.length === 0)
    return {
      pass: false,
      detail:
        at1.length === 0
          ? `no ${v ? "horizontal" : "vertical"} line at ${shown}`
          : `a line at ${shown}, but it does not span the bars (${lo.toFixed(0)}-${hi.toFixed(0)}px)`,
    };
  const dashed = spanning.filter((m) => (m.dash ?? []).some((d) => d > 0));
  if (c.dashed && dashed.length === 0)
    return { pass: false, detail: `a line at ${shown}, but it is not dashed` };
  const line = (c.dashed ? dashed : spanning)[0];
  const lineLo = v ? line.x : line.y;
  const lineHi = v ? line.x + line.w : line.y + line.h;
  const label = rec.marks.find((t) => {
    if (
      t.kind !== "text" ||
      !t.text!.toLowerCase().includes(c.label.toLowerCase())
    )
      return false;
    // Within 30px of the line across it, and alongside it.
    const [a0, a1] = v ? [t.y, t.y + t.h] : [t.x, t.x + t.w];
    const [b0, b1] = v ? [t.x, t.x + t.w] : [t.y, t.y + t.h];
    const off = Math.max(a0 - target, 0, target - a1);
    return off <= 30 && b1 >= lineLo - 30 && b0 <= lineHi + 30;
  });
  if (!label)
    return {
      pass: false,
      detail: `a ${c.dashed ? "dashed " : ""}line at ${shown}, but no text "${c.label}" next to it`,
    };
  return {
    pass: true,
    detail: `a ${c.dashed ? "dashed " : ""}line at ${shown} spans the bars, labeled "${label.text}"`,
  };
}

/** Each series' matched marks share one color, and the series' colors are
 *  pairwise distinct. `bySeries[s]` lists the marks of series s. */
function seriesColorsConsistent(
  bySeries: Mark[][],
  names: string[]
): CheckResult {
  const colors: RGBA[] = [];
  for (let s = 0; s < bySeries.length; s++) {
    const inks = bySeries[s].map((m) => ink(m)!);
    if (inks.length === 0) continue;
    if (inks.some((c) => colorDist(c, inks[0]) > SAME_COLOR))
      return {
        pass: false,
        detail: `series "${names[s]}" is drawn in more than one color`,
      };
    colors.push(inks[0]);
  }
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++)
      if (colorDist(colors[i], colors[j]) <= SAME_COLOR)
        return {
          pass: false,
          detail: `series "${names[i]}" and "${names[j]}" share a color`,
        };
  return { pass: true, detail: "" };
}

function checkGroupedBars(
  c: Extract<Check, { check: "groupedBars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series, values } = seriesValues(c, ctx.data);
  const flat = values.flat();
  const { bars, best } = matchBars(
    barsByBaseline(barCandidates(rec), c.orientation),
    flat,
    {
      ordered: true,
      direction: c.direction ?? "forward",
      tol: c.tol ?? 0.03,
    }
  );
  if (bars.length !== flat.length)
    return {
      pass: false,
      detail: `expected ${flat.length} grouped bars (${categories.length} categories x ${series.length} series); best baseline matched ${best}`,
    };
  const bySeries = series.map((_, s) =>
    categories.map((_, ci) => bars[ci * series.length + s].mark)
  );
  const colors = seriesColorsConsistent(bySeries, series);
  if (!colors.pass) return colors;
  return {
    pass: true,
    detail: `${categories.length} groups x ${series.length} series match`,
  };
}

interface Stack {
  pos: number;
  /** Extent across the category axis (the bar's thickness). */
  width: number;
  segs: { len: number; mark: Mark }[];
}

/** Columns of abutting rects: rects sharing a category-axis interval, chained
 *  where one ends within 1.5px of where the next begins. */
function stacksOf(cands: Mark[], orientation: Orientation): Stack[] {
  const v = orientation === "vertical";
  const cross = (m: Mark): [number, number] =>
    v ? [m.x, m.x + m.w] : [m.y, m.y + m.h];
  const along = (m: Mark): [number, number] =>
    v ? [m.y, m.y + m.h] : [m.x, m.x + m.w];
  const columns: Mark[][] = [];
  for (const m of cands) {
    const [a, b] = cross(m);
    const col = columns.find((cm) => {
      const [c0, c1] = cross(cm[0]);
      return Math.abs(c0 - a) <= 1 && Math.abs(c1 - b) <= 1;
    });
    if (col) col.push(m);
    else columns.push([m]);
  }
  const stacks: Stack[] = [];
  for (const col of columns) {
    col.sort((p, q) => along(p)[0] - along(q)[0]);
    let chain: Mark[] = [col[0]];
    const flush = () => {
      const [a, b] = cross(chain[0]);
      stacks.push({
        pos: (a + b) / 2,
        width: b - a,
        segs: chain.map((m) => ({ len: v ? m.h : m.w, mark: m })),
      });
    };
    for (let i = 1; i < col.length; i++) {
      const gap = along(col[i])[0] - along(chain[chain.length - 1])[1];
      if (gap >= -1 && gap <= 1.5) chain.push(col[i]);
      else {
        flush();
        chain = [col[i]];
      }
    }
    flush();
  }
  return stacks;
}

interface StackSeg {
  mark: Mark;
  /** Series this segment's length is consistent with. */
  fits: Set<number>;
  /** Index of its stack among the matched stacks. */
  stack: number;
}

/** Assign series to segments through their colors: each color cluster means
 *  one series, allowed only when every segment of that color fits it;
 *  distinct clusters mean distinct series, and no stack uses a series twice.
 *  Returns the series index of each segment, or null. */
function assignSeriesByColor(
  segs: StackSeg[],
  nSeries: number
): number[] | null {
  const reps = colorClusters(segs.map((s) => ink(s.mark)!));
  const clusterOf = (m: Mark) =>
    reps.findIndex((r) => colorDist(r, ink(m)!) <= SAME_COLOR);
  const allowed = reps.map((_, ri) => {
    const mine = segs.filter((s) => clusterOf(s.mark) === ri);
    return Array.from({ length: nSeries }, (_, si) => si).filter((si) =>
      mine.every((s) => s.fits.has(si))
    );
  });
  const assign = new Array<number>(reps.length).fill(-1);
  const used = new Set<number>();
  const solve = (ri: number): boolean => {
    if (ri === reps.length) return true;
    for (const si of allowed[ri]) {
      if (used.has(si)) continue;
      used.add(si);
      assign[ri] = si;
      if (solve(ri + 1)) return true;
      used.delete(si);
    }
    return false;
  };
  if (!solve(0)) return null;
  const out = segs.map((s) => assign[clusterOf(s.mark)]);
  for (const st of new Set(segs.map((s) => s.stack))) {
    const seen = out.filter((_, i) => segs[i].stack === st);
    if (new Set(seen).size !== seen.length) return null;
  }
  return out;
}

/** Which segment in each stack belongs to which series, from
 *  `assignSeriesByColor`: seriesOf[stack][series] (undefined when that
 *  series has no segment there). */
function segmentsBySeries(
  segs: StackSeg[],
  assigned: number[],
  nStacks: number,
  nSeries: number
): (Mark | undefined)[][] {
  const out = Array.from({ length: nStacks }, () =>
    new Array<Mark | undefined>(nSeries).fill(undefined)
  );
  segs.forEach((s, i) => (out[s.stack][assigned[i]] = s.mark));
  return out;
}

interface StackMatch {
  /** The matched stacks, in category order. */
  stacks: Stack[];
  /** seriesOf[ci][si]: the segment of series si in stack ci (undefined when
   *  that value is zero). */
  seriesOf: (Mark | undefined)[][];
}

/** Find one stack per category, in category order along the category axis,
 *  whose segments hold that category's nonzero values (any stack order) at
 *  one common scale, with each series in one color. */
function matchStacks(
  rec: RenderRecord,
  spec: SeriesValues & { orientation: Orientation; direction?: Direction },
  data: Row[],
  tol: number
): { match: StackMatch | null; found: number; best: number } {
  const { categories, series, values } = seriesValues(spec, data);
  const stacks = stacksOf(barCandidates(rec), spec.orientation);
  const totals = values.map((row) => row.reduce((a, b) => a + b, 0));
  const maxTotal = Math.max(...totals);
  let best = 0;
  for (const dir of directions(spec.direction ?? "forward")) {
    const sorted = [...stacks].sort((a, b) =>
      dir === "forward" ? a.pos - b.pos : b.pos - a.pos
    );
    const scales = new Set<number>();
    for (const st of sorted)
      for (const t of totals)
        if (t > 0)
          scales.add(
            Math.round((st.segs.reduce((a, s) => a + s.len, 0) / t) * 1e4) / 1e4
          );
    for (const k of scales) {
      const slack = tol * k * maxTotal + 1;
      // Does this stack hold exactly category ci's nonzero values (any order)?
      const holds = (st: Stack, ci: number) => {
        const want = values[ci]
          .filter((x) => x > 0)
          .map((x) => k * x)
          .sort((a, b) => a - b);
        const got = st.segs.map((s) => s.len).sort((a, b) => a - b);
        return (
          want.length === got.length &&
          want.every((w, i) => Math.abs(w - got[i]) <= slack)
        );
      };
      const matched: Stack[] = [];
      let ci = 0;
      for (const st of sorted) {
        if (ci < categories.length && holds(st, ci)) {
          matched.push(st);
          ci++;
        }
      }
      best = Math.max(best, matched.length);
      if (matched.length !== categories.length) continue;
      const segs: StackSeg[] = matched.flatMap((st, ci) =>
        st.segs.map((s) => ({
          mark: s.mark,
          fits: new Set(
            series
              .map((_, si) => si)
              .filter(
                (si) =>
                  values[ci][si] > 0 &&
                  Math.abs(s.len - k * values[ci][si]) <= slack
              )
          ),
          stack: ci,
        }))
      );
      const assigned = assignSeriesByColor(segs, series.length);
      if (!assigned) continue;
      return {
        match: {
          stacks: matched,
          seriesOf: segmentsBySeries(
            segs,
            assigned,
            matched.length,
            series.length
          ),
        },
        found: stacks.length,
        best,
      };
    }
  }
  return { match: null, found: stacks.length, best };
}

function checkStackedBars(
  c: Extract<Check, { check: "stackedBars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series } = seriesValues(c, ctx.data);
  const { match, found, best } = matchStacks(rec, c, ctx.data, c.tol ?? 0.03);
  return match
    ? {
        pass: true,
        detail: `${categories.length} stacks x ${series.length} series match`,
      }
    : {
        pass: false,
        detail: `expected ${categories.length} stacks of ${series.length} series with one color per series; ${found} stacks found, best matched ${best}`,
      };
}

// ---------------------------------------------------------------------------
// Points and lines
// ---------------------------------------------------------------------------

interface Affine {
  a: number;
  b: number;
}

/** Affine maps sending the data range [lo, hi] onto some pair of screen
 *  coordinates, with the sign of `a` fixed (x right, y up). Deduplicated. */
function hypotheses(
  screen: number[],
  lo: number,
  hi: number,
  sign: 1 | -1
): Affine[] {
  const out = new Map<string, Affine>();
  if (hi === lo) return [];
  for (const s0 of screen)
    for (const s1 of screen) {
      const a = (s1 - s0) / (hi - lo);
      if (a * sign <= 0) continue;
      const h = { a, b: s0 - a * lo };
      out.set(`${a.toFixed(3)}|${h.b.toFixed(1)}`, h);
    }
  return [...out.values()];
}

/** Every mapped data value finds its own screen value within tol (sorted
 *  two-pointer match of a multiset into a larger multiset). */
function fits1d(mapped: number[], screen: number[], tol: number): boolean {
  const ms = [...mapped].sort((a, b) => a - b);
  const ss = [...screen].sort((a, b) => a - b);
  let j = 0;
  for (const m of ms) {
    while (j < ss.length && ss[j] < m - tol) j++;
    if (j >= ss.length || ss[j] > m + tol) return false;
    j++;
  }
  return true;
}

function extent(xs: number[]): [number, number] {
  return [Math.min(...xs), Math.max(...xs)];
}

/** The least-squares line ys = a xs + b. */
function leastSquares(xs: number[], ys: number[]): Affine {
  const n = xs.length;
  const mx = xs.reduce((t, v) => t + v, 0) / n;
  const my = ys.reduce((t, v) => t + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const a = sxx > 0 ? sxy / sxx : 0;
  return { a, b: my - a * mx };
}

/** Place data points (xs[i], ys[i]) on screen centers under one affine map
 *  per axis (x right, y up): every point gets its own center within `tolFrac`
 *  of the plotted extent (at least 1.5px). Returns the center index of each
 *  point, or null, plus how many maps fit each axis alone (for details). */
function placePoints(
  xs: number[],
  ys: number[],
  cx: number[],
  cy: number[],
  tolFrac: number
): { match: number[] | null; nx: number; ny: number } {
  const [xlo, xhi] = extent(xs);
  const [ylo, yhi] = extent(ys);
  const tolFor = (h: Affine, lo: number, hi: number) =>
    Math.max(1.5, tolFrac * Math.abs(h.a * (hi - lo)));
  const hx = hypotheses(cx, xlo, xhi, 1).filter((h) =>
    fits1d(
      xs.map((x) => h.a * x + h.b),
      cx,
      tolFor(h, xlo, xhi)
    )
  );
  const hy = hypotheses(cy, ylo, yhi, -1).filter((h) =>
    fits1d(
      ys.map((y) => h.a * y + h.b),
      cy,
      tolFor(h, ylo, yhi)
    )
  );
  for (const X of hx)
    for (const Y of hy) {
      const tx = tolFor(X, xlo, xhi);
      const ty = tolFor(Y, ylo, yhi);
      const used = new Set<number>();
      const match: number[] = [];
      for (let i = 0; i < xs.length; i++) {
        const px = X.a * xs[i] + X.b;
        const py = Y.a * ys[i] + Y.b;
        let bestJ = -1;
        let bestD = Infinity;
        for (let j = 0; j < cx.length; j++) {
          if (used.has(j)) continue;
          const dx = Math.abs(cx[j] - px);
          const dy = Math.abs(cy[j] - py);
          if (dx > tx || dy > ty) continue;
          const d = dx + dy;
          if (d < bestD) {
            bestD = d;
            bestJ = j;
          }
        }
        if (bestJ < 0) break;
        used.add(bestJ);
        match.push(bestJ);
      }
      if (match.length === xs.length)
        return { match, nx: hx.length, ny: hy.length };
    }
  return { match: null, nx: hx.length, ny: hy.length };
}

/** Marks colored by a field: rows sharing its value share a color, and
 *  different values get different colors. marks[i] draws rows[i]. */
function colorsBy(field: string, rows: Row[], marks: Mark[]): CheckResult {
  const groups = uniqueInOrder(rows, field);
  return seriesColorsConsistent(
    groups.map((g) => marks.filter((_, i) => String(rows[i][field]) === g)),
    groups
  );
}

function checkPoints(
  c: Extract<Check, { check: "points" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const circles = rec.marks.filter(
    (m) => m.kind === "circle" && !isBackground(m, rec)
  );
  if (circles.length < rows.length)
    return {
      pass: false,
      detail: `expected ${rows.length} circles, found ${circles.length}`,
    };
  const { match, nx, ny } = placePoints(
    rows.map((r) => num(r[c.x])),
    rows.map((r) => num(r[c.y])),
    circles.map((m) => m.x + m.w / 2),
    circles.map((m) => m.y + m.h / 2),
    c.tol ?? 0.01
  );
  if (!match)
    return {
      pass: false,
      detail: `no affine placement of ${rows.length} points onto ${circles.length} circles (${nx} x-fits, ${ny} y-fits)`,
    };
  const mine = match.map((j) => circles[j]);
  const notes: string[] = [];
  if (c.size) {
    // Area proportional to the value: r^2 = k * v for one k.
    const vs = rows.map((r) => num(r[c.size!]));
    const rs = mine.map((m) => (m.w + m.h) / 4);
    const ks = vs
      .map((v, i) => (rs[i] * rs[i]) / v)
      .filter((k) => Number.isFinite(k) && k > 0)
      .sort((a, b) => a - b);
    const k = ks[Math.floor(ks.length / 2)] ?? 0;
    const slack = 0.5 + (c.sizeTol ?? 0.03) * Math.max(...rs);
    const off = rs.filter((r, i) => Math.abs(r - Math.sqrt(k * vs[i])) > slack);
    if (off.length > 0) {
      const pairs = rows
        .map((_, i) => `${vs[i]}:${rs[i].toFixed(1)}`)
        .slice(0, 8)
        .join(", ");
      return {
        pass: false,
        detail: `${rows.length} points placed, but ${off.length} radii are not proportional to the square root of ${c.size} (value:radius ${pairs}${rows.length > 8 ? ", ..." : ""})`,
      };
    }
    if (c.maxRadius !== undefined) {
      const rmax = Math.max(...rs);
      if (Math.abs(rmax - c.maxRadius) > 0.25 * c.maxRadius)
        return {
          pass: false,
          detail: `${rows.length} points placed with areas proportional to ${c.size}, but the largest radius is ${rmax.toFixed(1)}px, expected about ${c.maxRadius}px`,
        };
    }
    notes.push(`areas proportional to ${c.size}`);
  }
  if (c.colorBy) {
    const colors = colorsBy(c.colorBy, rows, mine);
    if (!colors.pass) return colors;
    notes.push(`colored by ${c.colorBy}`);
  }
  if (c.highlight) {
    const problem = highlightProblem(c.highlight, rows, mine);
    if (problem)
      return {
        pass: false,
        detail: `${rows.length} points placed, but highlight: ${problem}`,
      };
    notes.push(
      `highlighted ${JSON.stringify(c.highlight.where)} in ${c.highlight.color}`
    );
  }
  return {
    pass: true,
    detail: `${rows.length} points match${notes.length ? `, ${notes.join(", ")}` : ""}`,
  };
}

function distToPolyline(p: [number, number], pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)
          );
    best = Math.min(
      best,
      Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))
    );
  }
  return best;
}

/** The polyline runs in one x direction: it never steps back by more than
 *  `tol` px from the furthest x reached so far (smoothed curves may
 *  overshoot a little). Either direction counts, since a path may be drawn
 *  right to left. A line that zigzags back and forth in x connects the
 *  points out of x order. */
function monotoneX(pts: [number, number][], tol: number): boolean {
  const runs = (sign: 1 | -1) => {
    let best = -Infinity;
    for (const [x] of pts) {
      if (sign * x < best - tol) return false;
      best = Math.max(best, sign * x);
    }
    return true;
  };
  return runs(1) || runs(-1);
}

interface LineFit {
  /** The data-to-screen maps (y up) under which every series has a line. */
  X: Affine;
  Y: Affine;
  /** The line drawn for each series, in series order. */
  chosen: Mark[];
  names: string[];
}

/** Find one stroked line per series (or one line) through the rows' (x, y)
 *  under one affine map with y up; see the `lineSeries` check. */
function fitLineSeries(
  c: { x: string; y: string; groupBy?: string; tol?: number },
  rec: RenderRecord,
  data: Row[]
): LineFit | { fail: string } {
  const rows = data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const names = c.groupBy ? uniqueInOrder(rows, c.groupBy) : ["(all)"];
  const series = names.map((n) =>
    rows
      .filter((r) => !c.groupBy || String(r[c.groupBy]) === n)
      .map((r) => [num(r[c.x]), num(r[c.y])] as [number, number])
      .sort((a, b) => a[0] - b[0])
  );
  const lines = rec.marks.filter(
    (m) =>
      (m.kind === "path" || m.kind === "line") &&
      m.stroke &&
      ink(m) &&
      m.points &&
      m.points.length >= 2
  );
  const tolFrac = c.tol ?? 0.015;
  for (const P of lines) {
    const [px0, px1] = extent(P.points!.map((p) => p[0]));
    const [py0, py1] = extent(P.points!.map((p) => p[1]));
    for (const S of series) {
      const [sx0, sx1] = extent(S.map((d) => d[0]));
      const [sy0, sy1] = extent(S.map((d) => d[1]));
      if (sx1 === sx0 || sy1 === sy0 || px1 === px0 || py1 === py0) continue;
      const X: Affine = { a: (px1 - px0) / (sx1 - sx0), b: 0 };
      X.b = px0 - X.a * sx0;
      const Y: Affine = { a: (py0 - py1) / (sy1 - sy0), b: 0 };
      Y.b = py1 - Y.a * sy0;
      const tol = Math.max(2, tolFrac * Math.max(px1 - px0, py1 - py0));
      // A line only a few tolerances tall (or wide), such as an axis
      // baseline, squeezes the data into its own extent and cannot show
      // whether the points fit; it is not a candidate for the scale.
      if (Math.min(px1 - px0, py1 - py0) < 5 * tol) continue;
      const used = new Set<Mark>();
      const chosen: Mark[] = [];
      for (const T of series) {
        const mapped = T.map(
          ([x, y]) => [X.a * x + X.b, Y.a * y + Y.b] as [number, number]
        );
        const [mx0, mx1] = extent(mapped.map((p) => p[0]));
        const hit = lines.find((Q) => {
          if (used.has(Q)) return false;
          const [qx0, qx1] = extent(Q.points!.map((p) => p[0]));
          if (qx0 < mx0 - tol || qx1 > mx1 + tol) return false;
          if (!monotoneX(Q.points!, tol)) return false;
          return mapped.every((p) => distToPolyline(p, Q.points!) <= tol);
        });
        if (!hit) break;
        used.add(hit);
        chosen.push(hit);
      }
      if (chosen.length === series.length) return { X, Y, chosen, names };
    }
  }
  return {
    fail: `expected ${series.length} line series; ${lines.length} stroked lines, none fit`,
  };
}

function checkLineSeries(
  c: Extract<Check, { check: "lineSeries" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const fit = fitLineSeries(c, rec, ctx.data);
  if ("fail" in fit) return { pass: false, detail: fit.fail };
  if (c.groupBy) {
    const colors = seriesColorsConsistent(
      fit.chosen.map((m) => [m]),
      fit.names
    );
    if (!colors.pass) return colors;
  }
  return { pass: true, detail: `${fit.names.length} line series match` };
}

/** Distance from a point to a box (0 inside it). */
function distToBox([x, y]: [number, number], b: Box): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

function checkAnnotation(
  c: Extract<Check, { check: "annotation" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const fit = fitLineSeries(c, rec, ctx.data);
  if ("fail" in fit)
    return { pass: false, detail: `no line to annotate: ${fit.fail}` };
  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const pick = rows.reduce((best, r) =>
    (
      c.at === "max"
        ? num(r[c.y]) > num(best[c.y])
        : num(r[c.y]) < num(best[c.y])
    )
      ? r
      : best
  );
  const p: [number, number] = [
    fit.X.a * num(pick[c.x]) + fit.X.b,
    fit.Y.a * num(pick[c.y]) + fit.Y.b,
  ];
  const where = `(${c.x} ${pick[c.x]}, ${c.y} ${pick[c.y]}) at (${p[0].toFixed(0)}, ${p[1].toFixed(0)})`;
  const plot = Math.max(
    Math.abs(fit.X.a) *
      (Math.max(...rows.map((r) => num(r[c.x]))) -
        Math.min(...rows.map((r) => num(r[c.x])))),
    Math.abs(fit.Y.a) *
      (Math.max(...rows.map((r) => num(r[c.y]))) -
        Math.min(...rows.map((r) => num(r[c.y]))))
  );
  const reach = Math.max(2, 0.015 * plot);
  const marker = rec.marks.find(
    (m) =>
      m.kind === "circle" &&
      m.fill &&
      ink(m) &&
      m.w / 2 >= 2.5 &&
      Math.hypot(m.x + m.w / 2 - p[0], m.y + m.h / 2 - p[1]) <= reach
  );
  if (!marker)
    return {
      pass: false,
      detail: `no filled circle (radius at least 2.5px) centered on the ${c.at} point ${where}`,
    };
  const near = c.near ?? 30;
  const texts = rec.marks.filter(
    (m) =>
      m.kind === "text" && m.text!.toLowerCase().includes(c.text.toLowerCase())
  );
  if (texts.length === 0)
    return { pass: false, detail: `marker found, but no text "${c.text}"` };
  const d = Math.min(...texts.map((t) => distToBox(p, t)));
  return d <= near
    ? {
        pass: true,
        detail: `marker and "${c.text}" (${d.toFixed(0)}px away) at the ${c.at} point ${where}`,
      }
    : {
        pass: false,
        detail: `marker found, but "${c.text}" is ${d.toFixed(0)}px from the ${c.at} point ${where} (at most ${near})`,
      };
}

// ---------------------------------------------------------------------------
// Wedges, text, colors, size
// ---------------------------------------------------------------------------

function checkWedges(
  c: Extract<Check, { check: "wedges" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const tol = c.tol ?? 0.01;
  const centers = wedgesByCenter(rec);
  const wedges = centers.flat();
  const want = values
    .map((v) => v / values.reduce((a, b) => a + b, 0))
    .sort((a, b) => a - b);
  for (const g of centers) {
    if (g.length !== values.length) continue;
    const total = g.reduce((a, w) => a + w.wedge!.sweep, 0);
    const got = g.map((w) => w.wedge!.sweep / total).sort((a, b) => a - b);
    if (!want.every((s, i) => Math.abs(s - got[i]) <= tol)) continue;
    const reps = colorClusters(g.map((w) => ink(w)!));
    if (reps.length !== g.length)
      return { pass: false, detail: "slices share colors" };
    if (c.hole !== undefined) {
      const ratios = g.map((w) => w.wedge!.r0 / w.wedge!.r);
      const shown = ratios.map((q) => q.toFixed(2)).join(", ");
      const ok = c.hole
        ? ratios.every((q) => q >= 0.2)
        : ratios.every((q) => q <= 0.05);
      return ok
        ? {
            pass: true,
            detail: `${values.length} slices match, a ${c.hole ? "donut" : "pie"} (inner/outer radius ${shown})`,
          }
        : {
            pass: false,
            detail: `${values.length} slices match, but inner/outer radius is [${shown}]; expected a ${c.hole ? "donut (at least 0.2)" : "pie (at most 0.05)"}`,
          };
    }
    return { pass: true, detail: `${values.length} slices match` };
  }
  return {
    pass: false,
    detail: `expected ${values.length} slices; found ${wedges.length} wedges around ${centers.length} centers`,
  };
}

/** Wedges grouped by shared center (within max(2px, 2% of the radius)). */
function wedgesByCenter(rec: RenderRecord): Mark[][] {
  const wedges = rec.marks.filter(
    (m) => m.kind === "wedge" && m.wedge && !isBackground(m, rec)
  );
  const centers: Mark[][] = [];
  for (const w of wedges) {
    const g = centers.find(
      (g) =>
        Math.hypot(
          g[0].wedge!.cx - w.wedge!.cx,
          g[0].wedge!.cy - w.wedge!.cy
        ) <= Math.max(2, 0.02 * w.wedge!.r)
    );
    if (g) g.push(w);
    else centers.push([w]);
  }
  return centers;
}

function checkPieGlyphs(
  c: Extract<Check, { check: "pieGlyphs" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.01;
  const cats = uniqueInOrder(ctx.data, c.category);
  const glyphs = uniqueInOrder(ctx.data, c.by).map((name) => {
    const rows = ctx.data.filter((r) => String(r[c.by]) === name);
    const sums = cats.map((cat) =>
      rows
        .filter((r) => String(r[c.category]) === cat)
        .reduce((s, r) => s + num(r[c.value]), 0)
    );
    const total = sums.reduce((a, b) => a + b, 0);
    return {
      name,
      x: num(rows[0][c.x]),
      y: num(rows[0][c.y]),
      shares: sums.map((s) => s / total),
    };
  });
  // Complete pies only: the slices around a center fill the circle, with
  // no hole.
  const pies = wedgesByCenter(rec).filter(
    (g) =>
      Math.abs(g.reduce((a, w) => a + w.wedge!.sweep, 0) - 360) <= 3 &&
      g.every((w) => w.wedge!.r0 <= 0.05 * w.wedge!.r)
  );
  if (pies.length < glyphs.length)
    return {
      pass: false,
      detail: `expected ${glyphs.length} complete pies (no hole), found ${pies.length}`,
    };
  const { match, nx, ny } = placePoints(
    glyphs.map((g) => g.x),
    glyphs.map((g) => g.y),
    pies.map((g) => g[0].wedge!.cx),
    pies.map((g) => g[0].wedge!.cy),
    c.placeTol ?? 0.01
  );
  if (!match)
    return {
      pass: false,
      detail: `no affine placement of ${glyphs.length} ${c.by} positions onto ${pies.length} pie centers (${nx} x-fits, ${ny} y-fits)`,
    };
  const segs: StackSeg[] = [];
  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    const pie = pies[match[gi]];
    const want = g.shares.filter((s) => s > 0).sort((a, b) => a - b);
    const got = pie.map((w) => w.wedge!.sweep / 360).sort((a, b) => a - b);
    if (
      want.length !== got.length ||
      !want.every((s, i) => Math.abs(s - got[i]) <= tol)
    )
      return {
        pass: false,
        detail: `the pie at ${g.name} has slice shares [${got.map((s) => s.toFixed(3)).join(", ")}], expected [${want.map((s) => s.toFixed(3)).join(", ")}]`,
      };
    for (const w of pie)
      segs.push({
        mark: w,
        stack: gi,
        fits: new Set(
          g.shares
            .map((s, ci) => [s, ci] as const)
            .filter(([s]) => s > 0 && Math.abs(s - w.wedge!.sweep / 360) <= tol)
            .map(([, ci]) => ci)
        ),
      });
  }
  if (!assignSeriesByColor(segs, cats.length))
    return {
      pass: false,
      detail: `${glyphs.length} pies placed with the right shares, but slice colors do not name one ${c.category} each`,
    };
  return {
    pass: true,
    detail: `${glyphs.length} pies at their ${c.by} positions, slices by ${c.category} share, one color per ${c.category}`,
  };
}

interface Disc {
  cx: number;
  cy: number;
  r: number;
  mark: Mark;
}

/** Two-level leaves: `value` summed by (`parent`, `leaf`), positive sums
 *  only, each with the index of its parent in `parents` (first-seen order). */
function twoLevelLeaves(
  data: Row[],
  parent: string,
  leaf: string,
  value: string
): { parents: string[]; leaves: { parent: number; value: number }[] } {
  const parents = uniqueInOrder(data, parent);
  const sums = new Map<string, { parent: number; value: number }>();
  for (const r of data) {
    const p = String(r[parent]);
    const key = JSON.stringify([p, String(r[leaf])]);
    const cur = sums.get(key) ?? { parent: parents.indexOf(p), value: 0 };
    cur.value += num(r[value]);
    sums.set(key, cur);
  }
  return { parents, leaves: [...sums.values()].filter((l) => l.value > 0) };
}

/** Painted with something other than (near-)pure white or transparency. */
const visiblePaint = (m: Mark) =>
  [m.fill, m.stroke].some(
    (p) => p && p[3] >= 0.05 && !(p[0] >= 250 && p[1] >= 250 && p[2] >= 250)
  );

/** Every visible circle, with near-duplicates (a fill and an outline drawn
 *  as two elements) merged, keeping the one that has an ink. */
function visibleDiscs(rec: RenderRecord): Disc[] {
  const discs: Disc[] = [];
  for (const m of rec.marks) {
    if (m.kind !== "circle" || !visiblePaint(m)) continue;
    const d = {
      cx: m.x + m.w / 2,
      cy: m.y + m.h / 2,
      r: (m.w + m.h) / 4,
      mark: m,
    };
    const twin = discs.findIndex(
      (e) =>
        Math.hypot(e.cx - d.cx, e.cy - d.cy) <= 0.5 &&
        Math.abs(e.r - d.r) <= 0.5
    );
    if (twin < 0) discs.push(d);
    else if (!ink(discs[twin].mark) && ink(m)) discs[twin] = d;
  }
  return discs;
}

function checkCirclePack(
  c: Extract<Check, { check: "circlePack" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.03;
  const { parents, leaves } = twoLevelLeaves(
    ctx.data,
    c.parent,
    c.leaf,
    c.value
  );
  const n = leaves.length;
  const discs = visibleDiscs(rec);
  // `outer` contains `inner` (a small tolerance for rounding and padding).
  const contains = (outer: Disc, inner: Disc) =>
    outer !== inner &&
    outer.r > inner.r &&
    Math.hypot(outer.cx - inner.cx, outer.cy - inner.cy) + inner.r <=
      outer.r + 1.5 + 0.01 * outer.r;
  const innermost = discs.filter((d) => !discs.some((e) => contains(d, e)));
  const parentOf = (d: Disc): Disc | undefined =>
    discs.filter((e) => contains(e, d)).sort((a, b) => a.r - b.r)[0];
  const nested = innermost.filter((d) => parentOf(d));
  if (nested.length < n)
    return {
      pass: false,
      detail: `expected ${n} ${c.leaf} circles nested inside a larger circle, found ${nested.length} (${innermost.length - nested.length} innermost circles are not inside any other circle)`,
    };

  // Sizes: fit radius^2 = k * value. Seed k from the largest value on the
  // largest candidate, match each value to the nearest unused radius, then
  // refit k as the median.
  const order = leaves
    .map((_, i) => i)
    .sort((a, b) => leaves[b].value - leaves[a].value);
  const cands = [...nested].sort((a, b) => b.r - a.r);
  const k0 = (cands[0].r * cands[0].r) / leaves[order[0]].value;
  const used = new Set<number>();
  const circleOf: Disc[] = new Array(n);
  for (const i of order) {
    const want = Math.sqrt(k0 * leaves[i].value);
    let best = -1;
    for (let j = 0; j < cands.length; j++)
      if (
        !used.has(j) &&
        (best < 0 ||
          Math.abs(cands[j].r - want) < Math.abs(cands[best].r - want))
      )
        best = j;
    used.add(best);
    circleOf[i] = cands[best];
  }
  const ks = leaves
    .map((l, i) => (circleOf[i].r * circleOf[i].r) / l.value)
    .sort((a, b) => a - b);
  const k = ks[Math.floor(ks.length / 2)];
  const rmax = Math.max(...circleOf.map((d) => d.r));
  const slack = 0.5 + tol * rmax;
  const expR = (i: number) => Math.sqrt(k * leaves[i].value);
  const off = order.filter((i) => Math.abs(circleOf[i].r - expR(i)) > slack);
  if (off.length > 0)
    return {
      pass: false,
      detail: `${off.length} of ${n} ${c.leaf} circles have radii not proportional to the square root of ${c.value} (value:radius ${order
        .slice(0, 8)
        .map((i) => `${leaves[i].value}:${circleOf[i].r.toFixed(1)}`)
        .join(", ")}${n > 8 ? ", ..." : ""})`,
    };

  // Nesting: group the leaf circles by the smallest circle containing each,
  // and match the groups to parents by their leaves' radii.
  const groups = new Map<Disc, Disc[]>();
  for (const d of circleOf) {
    const p = parentOf(d)!;
    groups.set(p, [...(groups.get(p) ?? []), d]);
  }
  if (groups.size !== parents.length)
    return {
      pass: false,
      detail: `the ${n} ${c.leaf} circles sit in ${groups.size} enclosing circles, expected one per ${c.parent} (${parents.length})`,
    };
  const pDiscs = [...groups.keys()];
  const radiiOf = (ds: Disc[]) => ds.map((d) => d.r).sort((a, b) => b - a);
  const wanted = parents.map((_, pi) =>
    leaves
      .map((l, i) => (l.parent === pi ? expR(i) : -1))
      .filter((r) => r >= 0)
      .sort((a, b) => b - a)
  );
  const fits = pDiscs.map((pd) => {
    const got = radiiOf(groups.get(pd)!);
    return wanted.map(
      (w) =>
        w.length === got.length &&
        w.every((r, i) => Math.abs(r - got[i]) <= slack)
    );
  });
  const parentAt: number[] = new Array(pDiscs.length).fill(-1);
  const taken = new Set<number>();
  const solve = (g: number): boolean => {
    if (g === pDiscs.length) return true;
    for (let pi = 0; pi < parents.length; pi++) {
      if (taken.has(pi) || !fits[g][pi]) continue;
      taken.add(pi);
      parentAt[g] = pi;
      if (solve(g + 1)) return true;
      taken.delete(pi);
    }
    return false;
  };
  if (!solve(0))
    return {
      pass: false,
      detail: `${n} ${c.leaf} circles sized by ${c.value}, but the circles inside each enclosing circle are not one ${c.parent}'s ${c.leaf}s (group sizes ${pDiscs
        .map((pd) => groups.get(pd)!.length)
        .join(", ")})`,
    };

  // No overlaps among leaves, nor among parents.
  const overlap = (ds: Disc[]) => {
    for (let i = 0; i < ds.length; i++)
      for (let j = i + 1; j < ds.length; j++) {
        const [a, b] = [ds[i], ds[j]];
        const gap = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r);
        if (gap < -(1 + 0.02 * Math.min(a.r, b.r))) return -gap;
      }
    return 0;
  };
  const leafOverlap = overlap(circleOf);
  if (leafOverlap > 0)
    return {
      pass: false,
      detail: `${n} ${c.leaf} circles nested by ${c.parent}, but two of them overlap by ${leafOverlap.toFixed(1)}px`,
    };
  const parentOverlap = overlap(pDiscs);
  if (parentOverlap > 0)
    return {
      pass: false,
      detail: `${n} ${c.leaf} circles nested by ${c.parent}, but two ${c.parent} circles overlap by ${parentOverlap.toFixed(1)}px`,
    };

  // Colors: one per parent, distinct across parents.
  if (circleOf.some((d) => !ink(d.mark)))
    return {
      pass: false,
      detail: `some ${c.leaf} circles have no visible color`,
    };
  const byParent = parents.map((_, pi) =>
    pDiscs
      .filter((_, g) => parentAt[g] === pi)
      .flatMap((pd) => groups.get(pd)!)
      .map((d) => d.mark)
  );
  const colors = seriesColorsConsistent(byParent, parents);
  if (!colors.pass)
    return {
      pass: false,
      detail: `${n} ${c.leaf} circles nested by ${c.parent} without overlaps, but ${colors.detail}`,
    };
  return {
    pass: true,
    detail: `${n} ${c.leaf} circles with areas proportional to ${c.value}, packed without overlap inside ${parents.length} non-overlapping ${c.parent} circles, one color per ${c.parent}`,
  };
}

function checkTreemapCircles(
  c: Extract<Check, { check: "treemapCircles" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.05;
  const pad = c.padding ?? 0;
  const { parents, leaves } = twoLevelLeaves(
    ctx.data,
    c.parent,
    c.leaf,
    c.value
  );
  const n = leaves.length;
  const area = (b: Box) => b.w * b.h;
  const bboxOf = (bs: Box[]): Box => {
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return {
      x,
      y,
      w: Math.max(...bs.map((b) => b.x + b.w)) - x,
      h: Math.max(...bs.map((b) => b.y + b.h)) - y,
    };
  };

  // Rects, filled or outline only, with twins (a fill and an outline drawn
  // as two elements over one box) merged.
  const rects: Mark[] = [];
  for (const m of rec.marks) {
    if (m.kind !== "rect" || !visiblePaint(m) || Math.min(m.w, m.h) < 1)
      continue;
    const twin = rects.some(
      (e) =>
        Math.abs(e.x - m.x) <= 0.75 &&
        Math.abs(e.y - m.y) <= 0.75 &&
        Math.abs(e.w - m.w) <= 0.75 &&
        Math.abs(e.h - m.h) <= 0.75
    );
    if (!twin) rects.push(m);
  }
  // Each circle's cell is the smallest rect around it. Circles in no rect,
  // or only in a background panel, are not in the treemap (a legend, say).
  const holds = (r: Box, d: Disc) =>
    d.cx - d.r >= r.x - 1.5 &&
    d.cx + d.r <= r.x + r.w + 1.5 &&
    d.cy - d.r >= r.y - 1.5 &&
    d.cy + d.r <= r.y + r.h + 1.5;
  const dots: Disc[] = [];
  const cells: Mark[] = [];
  for (const d of visibleDiscs(rec)) {
    const around = rects
      .filter((r) => holds(r, d))
      .sort((a, b) => area(a) - area(b))[0];
    if (!around || area(around) >= 0.4 * chartArea(rec)) continue;
    dots.push(d);
    cells.push(around);
  }
  if (dots.length !== n)
    return {
      pass: false,
      detail: `expected ${n} circles, each inside a ${c.leaf} cell drawn as a rect, found ${dots.length}`,
    };
  if (new Set(cells).size < n)
    return {
      pass: false,
      detail: `${n} circles inside rects, but some rect holds more than one circle (${new Set(cells).size} distinct cells)`,
    };

  // Each circle is centered in its cell and spans its shorter side, less
  // the padding.
  const offCenter = dots.filter(
    (d, i) =>
      Math.hypot(
        d.cx - (cells[i].x + cells[i].w / 2),
        d.cy - (cells[i].y + cells[i].h / 2)
      ) > 1.5
  ).length;
  if (offCenter > 0)
    return {
      pass: false,
      detail: `${offCenter} of ${n} circles are not centered in their cells`,
    };
  const wantD = (b: Box) => Math.min(b.w, b.h) - pad;
  const badSize = dots
    .map((d, i) => ({ got: 2 * d.r, want: wantD(cells[i]) }))
    .filter((s) => Math.abs(s.got - s.want) > 1.5);
  if (badSize.length > 0)
    return {
      pass: false,
      detail: `${badSize.length} of ${n} circles do not have diameter = shorter cell side - ${pad}px (diameter:expected ${badSize
        .slice(0, 6)
        .map((s) => `${s.got.toFixed(1)}:${s.want.toFixed(1)}`)
        .join(", ")}${badSize.length > 6 ? ", ..." : ""})`,
    };

  // The cells tile their bounding box: no overlaps, no gaps.
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const [a, b] = [cells[i], cells[j]];
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 1.5 && iy > 1.5)
        return {
          pass: false,
          detail: `${n} cells with inscribed circles, but two cells overlap by ${ix.toFixed(1)}x${iy.toFixed(1)}px`,
        };
    }
  const cover = (bs: Box[]) =>
    bs.reduce((s, b) => s + area(b), 0) / area(bboxOf(bs));
  const all = cover(cells);
  if (Math.abs(all - 1) > 0.03)
    return {
      pass: false,
      detail: `${n} cells with inscribed circles, but they cover ${(100 * all).toFixed(1)}% of their bounding box, not all of it`,
    };

  // Areas: area = k * value. Sorted pairing is the only candidate match
  // when the areas are proportional; k is the median ratio.
  const slack = (b: Box, want: number) => tol * want + (b.w + b.h) / 2;
  const byArea = [...cells].sort((a, b) => area(b) - area(a));
  const byValue = leaves.map((l) => l.value).sort((a, b) => b - a);
  const ks = byArea.map((b, i) => area(b) / byValue[i]).sort((a, b) => a - b);
  const k = ks[Math.floor(n / 2)];
  const offArea = byArea.filter(
    (b, i) => Math.abs(area(b) - k * byValue[i]) > slack(b, k * byValue[i])
  );
  if (offArea.length > 0)
    return {
      pass: false,
      detail: `${offArea.length} of ${n} cell areas are not proportional to ${c.value} (value:area ${byValue
        .slice(0, 6)
        .map((v, i) => `${v}:${Math.round(area(byArea[i]))}`)
        .join(", ")}, ...)`,
    };

  // Parents: circles take one color per parent, and each color's cells are
  // one parent's leaves forming one rectangle.
  const inks = dots.map((d) => ink(d.mark));
  if (inks.some((x) => !x))
    return { pass: false, detail: `some circles have no visible color` };
  const reps = colorClusters(inks as RGBA[]);
  if (reps.length !== parents.length)
    return {
      pass: false,
      detail: `the circles use ${reps.length} colors, expected one per ${c.parent} (${parents.length})`,
    };
  const groupOf = inks.map((x) => {
    const ds = reps.map((r) => colorDist(r, x!));
    return ds.indexOf(Math.min(...ds));
  });
  const groups = reps.map((_, g) => cells.filter((_, i) => groupOf[i] === g));
  for (const g of groups) {
    const f = cover(g);
    if (f < 0.97)
      return {
        pass: false,
        detail: `${n} cells sized by ${c.value}, but the cells of one ${c.parent} color are not one contiguous rectangle (they cover ${(100 * f).toFixed(1)}% of their bounding box)`,
      };
  }
  const wanted = parents.map((_, pi) =>
    leaves
      .filter((l) => l.parent === pi)
      .map((l) => k * l.value)
      .sort((a, b) => b - a)
  );
  const fits = groups.map((g) => {
    const got = [...g].sort((a, b) => area(b) - area(a));
    return wanted.map(
      (w) =>
        w.length === got.length &&
        w.every((a, i) => Math.abs(area(got[i]) - a) <= slack(got[i], a))
    );
  });
  const parentAt: number[] = new Array(groups.length).fill(-1);
  const taken = new Set<number>();
  const solve = (g: number): boolean => {
    if (g === groups.length) return true;
    for (let pi = 0; pi < parents.length; pi++) {
      if (taken.has(pi) || !fits[g][pi]) continue;
      taken.add(pi);
      parentAt[g] = pi;
      if (solve(g + 1)) return true;
      taken.delete(pi);
    }
    return false;
  };
  if (!solve(0))
    return {
      pass: false,
      detail: `${n} cells sized by ${c.value}, but the cells of each circle color are not one ${c.parent}'s ${c.leaf}s (group sizes ${groups
        .map((g) => g.length)
        .join(", ")})`,
    };
  const colors = seriesColorsConsistent(
    parents.map((_, pi) =>
      dots.filter((_, i) => parentAt[groupOf[i]] === pi).map((d) => d.mark)
    ),
    parents
  );
  if (!colors.pass) return colors;
  return {
    pass: true,
    detail: `${n} ${c.leaf} cells tiling a rectangle with areas proportional to ${c.value}, grouped into ${parents.length} contiguous ${c.parent} rectangles, each with a centered circle of diameter shorter side - ${pad}px, one color per ${c.parent}`,
  };
}

function checkTextIncludes(
  c: Extract<Check, { check: "textIncludes" }>,
  rec: RenderRecord
): CheckResult {
  const texts = rec.marks
    .filter((m) => m.kind === "text")
    .map((m) => m.text!.toLowerCase());
  const missing = c.strings.filter(
    (s) => !texts.some((t) => t.includes(s.toLowerCase()))
  );
  return missing.length === 0
    ? { pass: true, detail: `all ${c.strings.length} strings present` }
    : {
        pass: false,
        detail: `missing text: ${missing.map((s) => JSON.stringify(s)).join(", ")}`,
      };
}

function checkDistinctColors(
  c: Extract<Check, { check: "distinctColors" }>,
  rec: RenderRecord
): CheckResult {
  const reps = colorClusters(dataMarks(rec).map((m) => ink(m)!));
  return {
    pass: reps.length >= c.k,
    detail: `${reps.length} distinct data-mark colors (need ${c.k}): ${reps.map(rgbaText).join(" ")}`,
  };
}

function checkSize(
  c: Extract<Check, { check: "sizeAbout" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const w = c.w ?? ctx.size.w;
  const h = c.h ?? ctx.size.h;
  const tol = c.tol ?? 0.25;
  const s: Box | undefined = rec.svgs[0];
  if (!s) return { pass: false, detail: "no svg" };
  const ok = Math.abs(s.w - w) <= tol * w && Math.abs(s.h - h) <= tol * h;
  return { pass: ok, detail: `svg is ${s.w}x${s.h}, asked ${w}x${h}` };
}

// ---------------------------------------------------------------------------
// Mosaic, waffle, ribbons
// ---------------------------------------------------------------------------

/** Groups of marks whose boxes lie within `gap` px of each other (chained),
 *  largest total area first. */
function clusters(marks: Mark[], gap: number): Mark[][] {
  const parent = marks.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const near = (a: Mark, b: Mark) =>
    a.x <= b.x + b.w + gap &&
    b.x <= a.x + a.w + gap &&
    a.y <= b.y + b.h + gap &&
    b.y <= a.y + a.h + gap;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++)
      if (near(marks[i], marks[j])) parent[find(i)] = find(j);
  const groups = new Map<number, Mark[]>();
  marks.forEach((m, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(m);
  });
  const area = (g: Mark[]) => g.reduce((a, m) => a + m.w * m.h, 0);
  return [...groups.values()].sort((a, b) => area(b) - area(a));
}

/** Every way to cut `n` ordered items into `k` consecutive runs (at most
 *  `limit` ways), as the start index of each run. */
function cutsInto(n: number, k: number, limit = 5000): number[][] {
  const out: number[][] = [];
  const go = (starts: number[]) => {
    if (out.length >= limit) return;
    if (starts.length === k) {
      out.push(starts);
      return;
    }
    const last = starts[starts.length - 1];
    const left = k - starts.length;
    for (let s = last + 1; s <= n - left; s++) go([...starts, s]);
  };
  if (k >= 1 && k <= n) go([0]);
  return out;
}

/** Orders of `n` categories to try against `n` pieces in axis order: the
 *  stated order (identity) when `fixed`, else every permutation whose sizes
 *  fit. order[pi] is the category of piece pi. */
function* orders(
  n: number,
  fixed: boolean,
  fits: (piece: number, cat: number) => boolean
): Generator<number[]> {
  if (fixed) {
    const id = Array.from({ length: n }, (_, i) => i);
    if (id.every((ci, pi) => fits(pi, ci))) yield id;
    return;
  }
  const used = new Set<number>();
  const perm: number[] = [];
  function* go(pi: number): Generator<number[]> {
    if (pi === n) {
      yield [...perm];
      return;
    }
    for (let ci = 0; ci < n; ci++) {
      if (used.has(ci) || !fits(pi, ci)) continue;
      used.add(ci);
      perm.push(ci);
      yield* go(pi + 1);
      perm.pop();
      used.delete(ci);
    }
  }
  yield* go(0);
}

type MosaicSplit =
  | { ok: true; leaves: { cat: string; mark: Mark }[] }
  | { ok: false; why: string; depth: number };

/** Split one mosaic cell (its leaf rects and its data rows) at `level` and
 *  below; see the `mosaic` check. On failure, reports the deepest level any
 *  attempt reached, since that is the most informative reason. */
function splitMosaic(
  leaves: Mark[],
  rows: Row[],
  levels: MosaicLevel[],
  level: number,
  value: string,
  tol: number,
  path: string
): MosaicSplit {
  const where = path || "the chart";
  const fail = (why: string, depth = level): MosaicSplit => ({
    ok: false,
    why: `${where}: ${why}`,
    depth,
  });
  const L = levels[level];
  const xDir = L.dir === "x";
  const a = (m: Mark) => (xDir ? m.x : m.y);
  const b = (m: Mark) => (xDir ? m.x + m.w : m.y + m.h);
  const pa = (m: Mark) => (xDir ? m.y : m.x);
  const pb = (m: Mark) => (xDir ? m.y + m.h : m.x + m.w);
  const cats = uniqueInOrder(rows, L.by)
    .map((name) => {
      const mine = rows.filter((r) => String(r[L.by]) === name);
      return {
        name,
        rows: mine,
        sum: mine.reduce((s, r) => s + num(r[value]), 0),
      };
    })
    .filter((cat) => cat.sum > 0);
  const total = cats.reduce((s, cat) => s + cat.sum, 0);
  // The finest split along the axis: runs of leaves that no leaf crosses.
  const atoms: Mark[][] = [];
  let reach = -Infinity;
  for (const m of [...leaves].sort((p, q) => a(p) - a(q))) {
    if (atoms.length === 0 || a(m) >= reach - 1) atoms.push([m]);
    else atoms[atoms.length - 1].push(m);
    reach = Math.max(reach, b(m));
  }
  if (atoms.length < cats.length)
    return fail(
      `splits into ${atoms.length} pieces along ${L.dir}, expected ${cats.length} (one per ${L.by})`
    );
  const ext = (
    ms: Mark[],
    lo: (m: Mark) => number,
    hi: (m: Mark) => number
  ): [number, number] => [Math.min(...ms.map(lo)), Math.max(...ms.map(hi))];
  const [p0, p1] = ext(leaves, pa, pb);
  const [c0, c1] = ext(leaves, a, b);
  const slack = tol * (c1 - c0) + 1;
  const pslack = tol * (p1 - p0) + 1;
  const from = L.from ?? "any";
  // Screen coordinates grow right and down, so a first category at the
  // right or bottom means reading the pieces backwards.
  const backwards = from === "right" || from === "bottom";
  let deepest: MosaicSplit | null = null;
  const keep = (r: MosaicSplit) => {
    if (!r.ok && (!deepest || (!deepest.ok && r.depth > deepest.depth)))
      deepest = r;
  };
  for (const starts of cutsInto(atoms.length, cats.length)) {
    let pieces = starts.map((s, i) =>
      atoms.slice(s, starts[i + 1] ?? atoms.length).flat()
    );
    if (backwards) pieces = pieces.reverse();
    const sizes = pieces.map((p) => {
      const [lo, hi] = ext(p, a, b);
      return hi - lo;
    });
    const sizeSum = sizes.reduce((s, x) => s + x, 0);
    const full = pieces.every((p) => {
      const [q0, q1] = ext(p, pa, pb);
      return Math.abs(q0 - p0) <= pslack && Math.abs(q1 - p1) <= pslack;
    });
    if (!full) {
      keep(
        fail(
          `the pieces along ${L.dir} do not all span the cell's full ${xDir ? "height" : "width"}`
        )
      );
      continue;
    }
    // Sizes are compared as shares of the pieces' summed length, so gaps
    // between pieces do not count.
    const fits = (pi: number, ci: number) =>
      Math.abs(sizes[pi] - (cats[ci].sum / total) * sizeSum) <= slack;
    let any = false;
    for (const order of orders(cats.length, from !== "any", fits)) {
      any = true;
      const out: { cat: string; mark: Mark }[] = [];
      let bad: MosaicSplit | null = null;
      for (let pi = 0; pi < pieces.length && !bad; pi++) {
        const cat = cats[order[pi]];
        const sub = `${path ? `${path} > ` : ""}${cat.name}`;
        if (level === levels.length - 1) {
          if (pieces[pi].length === 1)
            out.push({ cat: cat.name, mark: pieces[pi][0] });
          else
            bad = {
              ok: false,
              why: `${sub}: ${pieces[pi].length} rects where one was expected`,
              depth: level + 1,
            };
        } else {
          const r = splitMosaic(
            pieces[pi],
            cat.rows,
            levels,
            level + 1,
            value,
            tol,
            sub
          );
          if (r.ok) out.push(...r.leaves);
          else bad = r;
        }
      }
      if (!bad) return { ok: true, leaves: out };
      keep(bad);
    }
    if (!any) {
      const want = cats
        .map((cat) => `${cat.name} ${((100 * cat.sum) / total).toFixed(1)}%`)
        .join(", ");
      const got = sizes
        .map((s) => `${((100 * s) / sizeSum).toFixed(1)}%`)
        .join(", ");
      keep(
        fail(
          `pieces along ${L.dir}${from !== "any" ? ` from the ${from}` : ""} are [${got}], expected ${L.by} shares [${want}]`
        )
      );
    }
  }
  return deepest ?? fail(`no split along ${L.dir} by ${L.by}`);
}

function checkMosaic(
  c: Extract<Check, { check: "mosaic" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.03;
  const last = c.levels[c.levels.length - 1].by;
  const spec = c.levels.map((l) => `${l.by} (${l.dir})`).join(" > ");
  const rects = barCandidates(rec).filter((m) => m.w >= 0.5 && m.h >= 0.5);
  // The mosaic is one cluster of touching (or nearly touching) rects, and
  // legend swatches sit apart from it. Rects thinner than 1.5px (axis lines
  // and ticks drawn as rects, but also a mosaic's thinnest cells) do not
  // join clusters; they count only when inside a cluster's box. Several gap
  // sizes are tried, since some layouts leave a gap between pieces.
  const solid = rects.filter((m) => Math.min(m.w, m.h) >= 1.5);
  const thin = rects.filter((m) => Math.min(m.w, m.h) < 1.5);
  const groups: Mark[][] = [];
  for (const gap of [3, 12, 30])
    for (const g of clusters(solid, gap).slice(0, 4)) {
      const [x0, x1] = [
        Math.min(...g.map((m) => m.x)),
        Math.max(...g.map((m) => m.x + m.w)),
      ];
      const [y0, y1] = [
        Math.min(...g.map((m) => m.y)),
        Math.max(...g.map((m) => m.y + m.h)),
      ];
      const inside = thin.filter(
        (m) =>
          m.x >= x0 - 0.5 &&
          m.x + m.w <= x1 + 0.5 &&
          m.y >= y0 - 0.5 &&
          m.y + m.h <= y1 + 0.5
      );
      const group = [...g, ...inside];
      if (
        !groups.some(
          (o) => o.length === group.length && o.every((m, i) => m === group[i])
        )
      )
        groups.push(group);
    }
  let best: MosaicSplit | null = null;
  for (const group of groups) {
    const res = splitMosaic(group, ctx.data, c.levels, 0, c.value, tol, "");
    if (res.ok) {
      const names = uniqueInOrder(ctx.data, last);
      const colors = seriesColorsConsistent(
        names.map((n) =>
          res.leaves.filter((l) => l.cat === n).map((l) => l.mark)
        ),
        names
      );
      if (!colors.pass) return colors;
      return {
        pass: true,
        detail: `${res.leaves.length} cells match ${spec}, colored by ${last}`,
      };
    }
    if (!best || (!best.ok && res.depth > best.depth)) best = res;
  }
  return {
    pass: false,
    detail: `no mosaic of ${spec} among ${rects.length} filled rects${best && !best.ok ? `; ${best.why}` : ""}`,
  };
}

/** Center of a mark's box. */
const center = (m: Box): [number, number] => [m.x + m.w / 2, m.y + m.h / 2];

/** The rows x cols regular grid of equal squares, as rows of marks (top row
 *  first, each row left to right), or null. The grid must not extend: no
 *  square of the same size sits on the lattice just outside it. */
function findGrid(
  squares: Mark[],
  rows: number,
  cols: number
): Mark[][] | null {
  const near = (m: Mark, x: number, y: number, size: number, tol: number) => {
    const [cx, cy] = center(m);
    return (
      Math.abs(cx - x) <= tol &&
      Math.abs(cy - y) <= tol &&
      Math.abs(m.w - size) <= 1 &&
      Math.abs(m.h - size) <= 1
    );
  };
  for (const s0 of squares) {
    const [x0, y0] = center(s0);
    const size = s0.w;
    const same = squares.filter(
      (m) => m !== s0 && Math.abs(m.w - size) <= 1 && Math.abs(m.h - size) <= 1
    );
    // Pitch: the nearest same-size square to the right in the same row, and
    // below in the same column.
    const right = same
      .filter((m) => Math.abs(center(m)[1] - y0) <= 1 && center(m)[0] > x0 + 1)
      .map((m) => center(m)[0] - x0);
    const down = same
      .filter((m) => Math.abs(center(m)[0] - x0) <= 1 && center(m)[1] > y0 + 1)
      .map((m) => center(m)[1] - y0);
    if (cols > 1 && right.length === 0) continue;
    if (rows > 1 && down.length === 0) continue;
    const px = cols > 1 ? Math.min(...right) : 0;
    const py = rows > 1 ? Math.min(...down) : 0;
    const tol = Math.max(1.5, 0.1 * Math.min(px || size, py || size));
    const at = (r: number, c: number) =>
      squares.find((m) => near(m, x0 + c * px, y0 + r * py, size, tol));
    const grid: Mark[][] = [];
    for (let r = 0; r < rows && grid.length === r; r++) {
      const row: Mark[] = [];
      for (let c = 0; c < cols; c++) {
        const m = at(r, c);
        if (!m) break;
        row.push(m);
      }
      if (row.length === cols) grid.push(row);
    }
    if (grid.length !== rows) continue;
    const outside: [number, number][] = [];
    for (let r = -1; r <= rows; r++) outside.push([r, -1], [r, cols]);
    for (let c = 0; c < cols; c++) outside.push([-1, c], [rows, c]);
    if (outside.some(([r, c]) => at(r, c))) continue;
    return grid;
  }
  return null;
}

/** Rect marks with ink, not background, at least 2px, and square (sides
 *  within 1px or 5%): the cells of a waffle. */
function squareMarks(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) =>
      m.kind === "rect" &&
      ink(m) &&
      !isBackground(m, rec) &&
      Math.min(m.w, m.h) >= 2 &&
      Math.abs(m.w - m.h) <= Math.max(1, 0.05 * Math.max(m.w, m.h))
  );
}

function checkWaffle(
  c: Extract<Check, { check: "waffle" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { labels, values: counts } = barValues(c, ctx.data);
  const slack = c.tol ?? 0;
  const squares = squareMarks(rec);
  const grid = findGrid(squares, c.rows, c.cols);
  if (!grid)
    return {
      pass: false,
      detail: `no ${c.rows} x ${c.cols} grid of equal squares among ${squares.length} square marks`,
    };
  const cells = grid.flat();
  const reps = colorClusters(cells.map((m) => ink(m)!));
  const clusterOf = (m: Mark) =>
    reps.findIndex((r) => colorDist(r, ink(m)!) <= SAME_COLOR);
  const want = labels.map((l, i) => `${l} ${counts[i]}`).join(", ");
  if (c.order === "rows") {
    // Runs of one color, reading row by row from the top-left.
    const runs: { cluster: number; n: number }[] = [];
    for (const m of cells) {
      const k = clusterOf(m);
      if (runs.length && runs[runs.length - 1].cluster === k)
        runs[runs.length - 1].n++;
      else runs.push({ cluster: k, n: 1 });
    }
    const got = runs.map((r) => r.n).join(", ");
    const ok =
      runs.length === counts.length &&
      new Set(runs.map((r) => r.cluster)).size === runs.length &&
      runs.every((r, i) => Math.abs(r.n - counts[i]) <= slack);
    return ok
      ? {
          pass: true,
          detail: `${c.rows} x ${c.cols} grid filled row by row as ${want}`,
        }
      : {
          pass: false,
          detail: `${c.rows} x ${c.cols} grid found, but reading row by row from the top-left gives color runs [${got}]; expected ${want}, each in its own color`,
        };
  }
  const got = reps
    .map((_, ri) => cells.filter((m) => clusterOf(m) === ri).length)
    .sort((a, b) => a - b);
  const exp = [...counts].sort((a, b) => a - b);
  const ok =
    got.length === exp.length &&
    got.every((n, i) => Math.abs(n - exp[i]) <= slack);
  return ok
    ? { pass: true, detail: `${c.rows} x ${c.cols} grid with counts ${want}` }
    : {
        pass: false,
        detail: `${c.rows} x ${c.cols} grid found, but its color counts are [${got.join(", ")}]; expected [${exp.join(", ")}]`,
      };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function checkUnitBlocks(
  c: Extract<Check, { check: "unitBlocks" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { labels: names, values } = barValues(
    { category: c.category, value: c.value },
    ctx.data
  );
  const counts = values.map((v) => Math.round(v / (c.per ?? 1)));
  const want = names.map((n, i) => `${n} ${counts[i]}`).join(", ");
  const fail = (why: string): CheckResult => ({
    pass: false,
    detail: `expected unit blocks ${want}; ${why}`,
  });
  const squares = squareMarks(rec);
  // The unit square: the most common square size (within 1px).
  let size = 0;
  let most = 0;
  for (const s of squares) {
    const n = squares.filter((m) => Math.abs(m.w - s.w) <= 1).length;
    if (n > most) [most, size] = [n, s.w];
  }
  const unit = squares.filter(
    (m) => Math.abs(m.w - size) <= 1 && Math.abs(m.h - size) <= 1
  );
  const cs = unit.map(center);
  // Lattice pitch: the median distance to the nearest square to the right
  // in the same row, and below in the same column.
  const nearest = (i: number, axis: 0 | 1) => {
    let best = Infinity;
    cs.forEach((q, j) => {
      const d = q[axis] - cs[i][axis];
      if (
        j !== i &&
        Math.abs(q[1 - axis] - cs[i][1 - axis]) <= 1 &&
        d > size - 1
      )
        best = Math.min(best, d);
    });
    return best;
  };
  const rights = cs.map((_, i) => nearest(i, 0)).filter(Number.isFinite);
  const downs = cs.map((_, i) => nearest(i, 1)).filter(Number.isFinite);
  if (rights.length === 0 || downs.length === 0)
    return fail(
      `${unit.length} squares of ${size.toFixed(1)}px form no rows and columns`
    );
  const px = median(rights);
  const py = median(downs);
  const tol = Math.max(1.5, 0.15 * Math.min(px, py));
  // Blocks: squares joined through lattice neighbors (one pitch apart along
  // a row or a column), left to right.
  const parent = unit.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const dx = Math.abs(cs[i][0] - cs[j][0]);
      const dy = Math.abs(cs[i][1] - cs[j][1]);
      if (
        (Math.abs(dx - px) <= tol && dy <= tol) ||
        (dx <= tol && Math.abs(dy - py) <= tol)
      )
        parent[find(i)] = find(j);
    }
  const groups = new Map<number, Mark[]>();
  unit.forEach((m, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(m);
  });
  const left = (g: Mark[]) => Math.min(...g.map((m) => m.x));
  const right = (g: Mark[]) => Math.max(...g.map((m) => m.x + m.w));
  const comps = [...groups.values()].sort((a, b) => left(a) - left(b));
  const blocks: Mark[][] = [];
  for (const g of comps)
    if (blocks.length < counts.length && g.length === counts[blocks.length])
      blocks.push(g);
  if (blocks.length !== counts.length)
    return fail(
      `the blocks of ${size.toFixed(1)}px squares hold [${comps.map((g) => g.length).join(", ")}] squares, left to right`
    );
  for (let i = 1; i < blocks.length; i++) {
    const gap = left(blocks[i]) - right(blocks[i - 1]);
    if (gap < size - 1)
      return fail(
        `the gap between the blocks of ${names[i - 1]} and ${names[i]} is ${gap.toFixed(1)}px, less than one square (${size.toFixed(1)}px)`
      );
  }
  const bottom = c.start.startsWith("bottom");
  const fromLeft = c.start.endsWith("left");
  const rowSide = bottom ? "bottom" : "top";
  const colSide = fromLeft ? "left" : "right";
  let edge0 = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const n = counts[i];
    const xs = b.map((m) => center(m)[0]);
    const ys = b.map((m) => center(m)[1]);
    const ox = fromLeft ? Math.min(...xs) : Math.max(...xs);
    const oy = bottom ? Math.max(...ys) : Math.min(...ys);
    if (i === 0) edge0 = oy;
    else if (Math.abs(oy - edge0) > tol)
      return fail(
        `the ${rowSide} rows of ${names[0]} and ${names[i]} are ${Math.abs(oy - edge0).toFixed(1)}px apart, not on one line`
      );
    // Lattice cell of each square, counted from the start corner.
    const got = new Set<string>();
    const rowLen = new Map<number, number>();
    for (const [x, y] of b.map(center)) {
      const col = (fromLeft ? x - ox : ox - x) / px;
      const row = (bottom ? oy - y : y - oy) / py;
      const ci = Math.round(col);
      const ri = Math.round(row);
      if (Math.abs(col - ci) * px > tol || Math.abs(row - ri) * py > tol)
        return fail(`a square of ${names[i]} is off the block's lattice`);
      got.add(`${ri},${ci}`);
      rowLen.set(ri, (rowLen.get(ri) ?? 0) + 1);
    }
    // Square k of the fill order sits at row k / width, column k % width.
    const expected = Array.from(
      { length: n },
      (_, k) => `${Math.floor(k / c.width)},${k % c.width}`
    );
    if (got.size === n && expected.every((e) => got.has(e))) continue;
    const lens = [...rowLen.keys()]
      .sort((a, b) => a - b)
      .map((r) => rowLen.get(r));
    const expLens = Array.from({ length: Math.ceil(n / c.width) }, (_, r) =>
      Math.min(c.width, n - r * c.width)
    );
    const sameLens = lens.join() === expLens.join();
    return fail(
      `${names[i]}'s rows from the ${rowSide} hold [${lens.join(", ")}] squares, ${
        sameLens
          ? `but the last row's squares do not start at the ${colSide}`
          : `expected [${expLens.join(", ")}] (${c.width} wide, only the last row partial, at the ${colSide})`
      }`
    );
  }
  const colors = seriesColorsConsistent(blocks, names);
  if (!colors.pass) return colors;
  let detail = `${blocks.length} blocks, left to right, ${want}, ${c.width} wide, filled from the ${c.start}, one color each`;
  if (c.labels) {
    const texts = rec.marks.filter((m) => m.kind === "text");
    const missing = names.filter((name, i) => {
      const b = blocks[i];
      const x0 = left(b);
      const x1 = right(b);
      const y1 = Math.max(...b.map((m) => m.y + m.h));
      return !texts.some(
        (t) =>
          t.text!.toLowerCase().includes(name.toLowerCase()) &&
          Math.abs(t.x + t.w / 2 - (x0 + x1) / 2) <= (x1 - x0) / 2 &&
          t.y >= y1 - 2 &&
          t.y <= y1 + 40
      );
    });
    if (missing.length > 0)
      return {
        pass: false,
        detail: `${detail}, but no label centered under the block of ${missing.join(", ")}`,
      };
    detail += ", each labeled underneath";
  }
  return { pass: true, detail };
}

/** The extent [lo, hi] across the category axis where the outline of `m`
 *  crosses the line at `t` along the category axis (x for vertical bars),
 *  or null if it does not reach it. Rects use their box. */
function crossSection(
  m: Mark,
  t: number,
  vertical: boolean
): [number, number] | null {
  const along = (p: [number, number]) => (vertical ? p[0] : p[1]);
  const across = (p: [number, number]) => (vertical ? p[1] : p[0]);
  if (!m.points) {
    const [a0, a1] = vertical ? [m.x, m.x + m.w] : [m.y, m.y + m.h];
    if (t < a0 || t > a1) return null;
    return vertical ? [m.y, m.y + m.h] : [m.x, m.x + m.w];
  }
  const pts = m.points;
  const hits: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const a = along(p);
    const b = along(q);
    if ((a <= t && b > t) || (b <= t && a > t)) {
      const f = (t - a) / (b - a);
      hits.push(across(p) + f * (across(q) - across(p)));
    }
  }
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
}

/** Hue in degrees of a color composited over white, or null when it is
 *  nearly gray. Mixing a color with white (a tint, or a semi-transparent
 *  fill on a white page) keeps its hue, so a lighter band still names its
 *  series. */
function hueOf(c: RGBA): number | null {
  const [r, g, b] = [0, 1, 2].map((i) => c[i] * c[3] + 255 * (1 - c[3]));
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 12) return null;
  const h =
    max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDist(a: number, b: number): number {
  const x = Math.abs(a - b) % 360;
  return Math.min(x, 360 - x);
}

function checkRibbons(
  c: Extract<Check, { check: "ribbons" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series } = seriesValues(c, ctx.data);
  const tol = c.tol ?? 0.03;
  const { match, found, best } = matchStacks(rec, c, ctx.data, tol);
  if (!match)
    return {
      pass: false,
      detail: `expected ${categories.length} stacks of ${series.length} series with one color per series; ${found} stacks found, best matched ${best}`,
    };
  const v = c.orientation === "vertical";
  // Near and far edges of a segment along the category axis, and its span
  // across it.
  const lo = (m: Mark) => (v ? m.x : m.y);
  const hi = (m: Mark) => (v ? m.x + m.w : m.y + m.h);
  const span = (m: Mark): [number, number] =>
    v ? [m.y, m.y + m.h] : [m.x, m.x + m.w];
  const seriesInk = series.map((_, si) => {
    const m = match.seriesOf.map((row) => row[si]).find((x) => x);
    return m ? ink(m)! : null;
  });
  // A band is colored like series si when it has si's color, or when its
  // hue is nearer to si's than to any other series' (gray matches gray).
  const colorOf = (col: RGBA): number => {
    const same = seriesInk.findIndex(
      (sc) => sc && colorDist(sc, col) <= SAME_COLOR
    );
    if (same >= 0) return same;
    const h = hueOf(col);
    let bestSi = -1;
    let bestD = Infinity;
    seriesInk.forEach((sc, si) => {
      if (!sc) return;
      const hs = hueOf(sc);
      const d =
        h === null || hs === null ? (h === hs ? 0 : Infinity) : hueDist(h, hs);
      if (d < bestD) {
        bestD = d;
        bestSi = si;
      }
    });
    return bestSi;
  };
  const bars = new Set(
    match.stacks.flatMap((st) => st.segs.map((s) => s.mark))
  );
  const bands = rec.marks.filter(
    (m) =>
      m.fill &&
      ink(m) &&
      !bars.has(m) &&
      !isBackground(m, rec) &&
      (m.points || m.kind === "rect")
  );
  // The band's cross-section at an edge, read 3px and 6px inside the gap
  // and extrapolated linearly back to the edge. Reading it right at the
  // edge would hit the corners, which the sampled outline rounds off by
  // about a pixel; extrapolating measures a sloped band where it meets the
  // bar.
  const INSET = 3;
  const sectionAt = (m: Mark, edge: number, inward: 1 | -1) => {
    const s1 = crossSection(m, edge + inward * INSET, v);
    const s2 = crossSection(m, edge + inward * 2 * INSET, v);
    if (!s1 || !s2) return null;
    return [0, 1].map((i) => 2 * s1[i] - s2[i]) as [number, number];
  };
  const missing: string[] = [];
  for (let si = 0; si < series.length; si++)
    for (let ci = 0; ci + 1 < categories.length; ci++) {
      const a = match.seriesOf[ci][si];
      const b = match.seriesOf[ci + 1][si];
      if (!a || !b) continue;
      const e0 = hi(a);
      const e1 = lo(b);
      const [a0, a1] = span(a);
      const [b0, b1] = span(b);
      const slack = Math.max(2, tol * Math.max(a1 - a0, b1 - b0));
      if (e1 - e0 < 4 * INSET) {
        missing.push(
          `${series[si]} ${categories[ci]}-${categories[ci + 1]} (the gap is under ${4 * INSET}px)`
        );
        continue;
      }
      const ok = bands.some((m) => {
        const s = sectionAt(m, e0, 1);
        const t = sectionAt(m, e1, -1);
        return (
          !!s &&
          !!t &&
          Math.abs(s[0] - a0) <= slack &&
          Math.abs(s[1] - a1) <= slack &&
          Math.abs(t[0] - b0) <= slack &&
          Math.abs(t[1] - b1) <= slack &&
          colorOf(ink(m)!) === si
        );
      });
      if (!ok)
        missing.push(`${series[si]} ${categories[ci]}-${categories[ci + 1]}`);
    }
  if (missing.length === 0)
    return {
      pass: true,
      detail: `${categories.length} stacks x ${series.length} series, with a band for every series between every pair of neighboring stacks`,
    };
  return {
    pass: false,
    detail: `stacks match, but ${missing.length} bands are missing or do not span their segments: ${missing.slice(0, 4).join("; ")}${missing.length > 4 ? "; ..." : ""}`,
  };
}

function checkRidgeline(
  c: Extract<Check, { check: "ridgeline" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.02;
  const [omin, omax] = c.overlap ?? [1.5, 2.5];
  const cats = uniqueInOrder(ctx.data, c.category);
  const series = cats.map((cat) =>
    ctx.data
      .filter((r) => String(r[c.category]) === cat)
      .map((r) => [num(r[c.x]), num(r[c.y])] as [number, number])
      .sort((a, b) => a[0] - b[0])
  );
  const [x0, x1] = extent(series.flat().map((p) => p[0]));
  const ymax = Math.max(...series.flat().map((p) => p[1]));
  const areas = rec.marks.filter(
    (m) =>
      m.fill &&
      ink(m) &&
      m.points &&
      m.points.length >= 3 &&
      !isBackground(m, rec)
  );
  // How well area `m` draws series `s` above its own baseline (its lowest
  // edge): the height scale k by least squares, and the worst miss in px.
  const fitArea = (m: Mark, s: [number, number][]) => {
    const xs = m.points!.map((p) => p[0]);
    const [px0, px1] = extent(xs);
    if (px1 - px0 < 10) return null;
    const base = Math.max(...m.points!.map((p) => p[1]));
    const ax = (px1 - px0) / (x1 - x0);
    const hs: number[] = [];
    for (const [x] of s) {
      const t = Math.min(px1 - 0.5, Math.max(px0 + 0.5, px0 + ax * (x - x0)));
      const cs = crossSection(m, t, true);
      if (!cs) return null;
      hs.push(base - cs[0]);
    }
    const syy = s.reduce((a, [, y]) => a + y * y, 0);
    const k = s.reduce((a, [, y], i) => a + y * hs[i], 0) / syy;
    const miss = Math.max(...s.map(([, y], i) => Math.abs(hs[i] - k * y)));
    return { base, k, miss, xs: [px0, px1] as [number, number] };
  };
  type Fit = NonNullable<ReturnType<typeof fitArea>> & { mark: Mark };
  const used = new Set<Mark>();
  const fits: Fit[] = [];
  for (let ci = 0; ci < cats.length; ci++) {
    let best: Fit | null = null;
    for (const m of areas) {
      if (used.has(m)) continue;
      const f = fitArea(m, series[ci]);
      if (!f || f.k <= 0) continue;
      const slack = Math.max(2, tol * f.k * ymax);
      if (f.miss <= slack && (!best || f.miss < best.miss))
        best = { ...f, mark: m };
    }
    if (!best)
      return {
        pass: false,
        detail: `no filled area traces ${cats[ci]}'s ${c.y} above a baseline (${areas.length} filled shapes, ${fits.length} ${c.category} matched before it)`,
      };
    used.add(best.mark);
    fits.push(best);
  }
  const ks = fits.map((f) => f.k);
  const kMid = [...ks].sort((a, b) => a - b)[Math.floor(ks.length / 2)];
  if (ks.some((k) => Math.abs(k - kMid) > 0.05 * kMid))
    return {
      pass: false,
      detail: `every ${c.category} has an area, but their height scales differ (${ks.map((k) => k.toFixed(2)).join(", ")} px per unit)`,
    };
  const [ax0, ax1] = fits[0].xs;
  if (
    fits.some((f) => Math.abs(f.xs[0] - ax0) > 2 || Math.abs(f.xs[1] - ax1) > 2)
  )
    return {
      pass: false,
      detail: `the areas do not share one horizontal scale`,
    };
  const bases = fits.map((f) => f.base);
  const steps = bases.slice(1).map((b, i) => b - bases[i]);
  const pitch = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
  if (
    pitch <= 0 ||
    steps.some((s) => Math.abs(s - pitch) > Math.max(2, 0.05 * pitch))
  )
    return {
      pass: false,
      detail: `baselines are not evenly spaced top to bottom in ${c.category} order (steps ${steps.map((s) => s.toFixed(1)).join(", ")} px)`,
    };
  const ratio = (kMid * ymax) / pitch;
  if (ratio < omin || ratio > omax)
    return {
      pass: false,
      detail: `ridges match, but the tallest peak is ${ratio.toFixed(2)} times the baseline spacing (expected ${omin}-${omax})`,
    };
  return {
    pass: true,
    detail: `${cats.length} ridges, top to bottom, ${pitch.toFixed(1)}px apart, tallest peak ${ratio.toFixed(2)} times the spacing`,
  };
}

/** Even-odd point-in-polygon. */
function insidePolygon(
  [x, y]: [number, number],
  poly: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** The painted points of a filled mark on a 1px grid (pixel centers),
 *  within `within`: inside its shape (its outline, or its box for a plain
 *  rect) and inside every clip region it is drawn through. */
function paintedPixels(m: Mark, within: Box): [number, number][] {
  const x0 = Math.max(m.x, within.x);
  const y0 = Math.max(m.y, within.y);
  const x1 = Math.min(m.x + m.w, within.x + within.w);
  const y1 = Math.min(m.y + m.h, within.y + within.h);
  const out: [number, number][] = [];
  for (let y = Math.floor(y0) + 0.5; y < y1; y++)
    for (let x = Math.floor(x0) + 0.5; x < x1; x++) {
      if (x < x0 || y < y0) continue;
      const p: [number, number] = [x, y];
      if (m.points && !insidePolygon(p, m.points)) continue;
      if (
        m.clip &&
        !m.clip.every((polys) => polys.some((q) => insidePolygon(p, q)))
      )
        continue;
      out.push(p);
    }
  return out;
}

function checkBottleFill(
  c: Extract<Check, { check: "bottleFill" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { labels, values } = barValues(
    { category: c.category, value: c.value },
    ctx.data
  );
  const tol = c.tol ?? 0.02;
  const max = c.max ?? 100;
  // Bottle outlines: stroked, unfilled, closed non-rectangular shapes, all
  // as tall as the tallest one.
  const outlines = rec.marks.filter(
    (m) =>
      m.kind === "path" &&
      m.points &&
      m.stroke &&
      ink(m) &&
      (!m.fill || nearWhite(m.fill)) &&
      m.h >= 20
  );
  const tallest = Math.max(0, ...outlines.map((m) => m.h));
  const bottles = outlines
    .filter((m) => Math.abs(m.h - tallest) <= 0.05 * tallest + 1)
    .sort((a, b) => a.x - b.x);
  if (bottles.length !== labels.length)
    return {
      pass: false,
      detail: `expected ${labels.length} bottle outlines (stroked, unfilled, not rectangles, the same height), found ${bottles.length}`,
    };
  const liquids = rec.marks.filter(
    (m) =>
      m.kind !== "text" &&
      m.kind !== "line" &&
      m.fill &&
      !nearWhite(m.fill) &&
      !isBackground(m, rec)
  );
  const problems: string[] = [];
  bottles.forEach((b, i) => {
    const name = labels[i];
    const bottom = b.y + b.h;
    const area: Box = { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 };
    const mine = liquids.filter((m) => {
      const [cx, cy] = [m.x + m.w / 2, m.y + m.h / 2];
      return (
        m !== b && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= bottom
      );
    });
    const px = mine.flatMap((m) => paintedPixels(m, area));
    if (px.length === 0) {
      problems.push(`${name}: no liquid inside the bottle`);
      return;
    }
    const top = Math.min(...px.map((p) => p[1])) - 0.5;
    const low = Math.max(...px.map((p) => p[1])) + 0.5;
    const level = (bottom - top) / b.h;
    const want = values[i] / max;
    const edge = Math.max(2, b.strokeWidth) + 1;
    if (Math.abs(low - bottom) > edge) {
      problems.push(
        `${name}: the liquid does not start at the bottle's bottom`
      );
      return;
    }
    if (Math.abs(level - want) > tol + 1.5 / b.h) {
      problems.push(
        `${name}: filled to ${(100 * level).toFixed(1)}% of the bottle's height, expected ${(100 * want).toFixed(1)}%`
      );
      return;
    }
    const outside = px.filter(
      (p) => !insidePolygon(p, b.points!) && distToPolyline(p, b.points!) > 1.5
    );
    if (outside.length > 0.01 * px.length) {
      problems.push(
        `${name}: ${outside.length} of ${px.length} liquid pixels lie outside the bottle's outline`
      );
      return;
    }
    // Low in the liquid (inside the body), it spans the bottle's width.
    const y = Math.floor(low - 0.25 * (low - top)) + 0.5;
    const row = px.filter((p) => p[1] === y).map((p) => p[0]);
    const span = crossSection(b, y, false);
    if (
      span &&
      (row.length === 0 ||
        Math.max(...row) - Math.min(...row) + 1 < 0.85 * (span[1] - span[0]))
    )
      problems.push(`${name}: the liquid does not fill the bottle's width`);
  });
  if (problems.length > 0)
    return {
      pass: false,
      detail: `${labels.length} bottles found, but ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
    };
  return {
    pass: true,
    detail: `${labels.length} bottles, left to right, filled to [${values.map((v) => `${v}%`).join(", ")}] of their height, inside their outlines`,
  };
}

// ---------------------------------------------------------------------------
// Pixel checks: judged on the PNG screenshot (RenderRecord.screenshot)
// ---------------------------------------------------------------------------

const ASSET_DIR = join(import.meta.dirname, "../../llm-bench/assets");

type RGB = [number, number, number];

interface Raster {
  w: number;
  h: number;
  data: Uint8Array;
}

function readRaster(path: string): Raster {
  const png = PNG.sync.read(readFileSync(path));
  return { w: png.width, h: png.height, data: png.data };
}

/** The screenshot's pixel at (x, y), composited over white (white outside
 *  the picture). */
function pixelAt(r: Raster, x: number, y: number): RGB {
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return [255, 255, 255];
  const i = 4 * (y * r.w + x);
  const a = r.data[i + 3] / 255;
  return [0, 1, 2].map((k) => r.data[i + k] * a + 255 * (1 - a)) as RGB;
}

/** Hue in degrees and chroma (max - min, 0-255) of an RGB color. */
function hueChroma(c: RGB | RGBA): [number, number] {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b);
  const chroma = mx - Math.min(r, g, b);
  if (chroma === 0) return [0, 0];
  const h =
    mx === r
      ? ((g - b) / chroma + 6) % 6
      : mx === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return [h * 60, chroma];
}

/** Brightness (luma with the Rec. 601 weights that blend modes use), 0-1. */
function luma(c: RGB): number {
  return (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
}

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** An image resampled to `height` px at its own aspect ratio: per display
 *  pixel, the gray brightness (Rec. 709, as grayscale filters compute it)
 *  of its source pixels, plus two eroded masks: `opaque` (the pixel and its
 *  8 neighbors are opaque) and `clear` (every pixel within 2 is
 *  transparent), so a placement off by a pixel, or antialiased edges, do
 *  not blur the verdict. */
interface Silhouette {
  w: number;
  h: number;
  gray: Float32Array;
  opaque: Uint8Array;
  clear: Uint8Array;
}

function silhouette(img: Raster, height: number): Silhouette {
  const k = img.h / height; // source px per display px
  const w = Math.round(img.w / k);
  const h = Math.round(height);
  const alpha = new Float32Array(w * h);
  const gray = new Float32Array(w * h);
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      let sa = 0;
      let sg = 0;
      let n = 0;
      const x1 = Math.min(img.w, Math.ceil((u + 1) * k));
      const y1 = Math.min(img.h, Math.ceil((v + 1) * k));
      for (let y = Math.floor(v * k); y < y1; y++)
        for (let x = Math.floor(u * k); x < x1; x++) {
          const i = 4 * (y * img.w + x);
          const a = img.data[i + 3] / 255;
          sa += a;
          sg +=
            (a *
              (0.2126 * img.data[i] +
                0.7152 * img.data[i + 1] +
                0.0722 * img.data[i + 2])) /
            255;
          n++;
        }
      alpha[v * w + u] = n ? sa / n : 0;
      gray[v * w + u] = sa ? sg / sa : 1;
    }
  const at = (u: number, v: number) =>
    u < 0 || v < 0 || u >= w || v >= h ? 0 : alpha[v * w + u];
  const opaque = new Uint8Array(w * h);
  const clear = new Uint8Array(w * h);
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      let lo = 1;
      let hi = 0;
      for (let dv = -2; dv <= 2; dv++)
        for (let du = -2; du <= 2; du++) {
          const a = at(u + du, v + dv);
          hi = Math.max(hi, a);
          if (Math.abs(du) <= 1 && Math.abs(dv) <= 1) lo = Math.min(lo, a);
        }
      opaque[v * w + u] = lo >= 0.98 ? 1 : 0;
      clear[v * w + u] = hi <= 0.02 ? 1 : 0;
    }
  return { w, h, gray, opaque, clear };
}

/** Visibly painted: some channel more than 25 below white. */
const paintedPx = (c: RGB) => Math.max(255 - c[0], 255 - c[1], 255 - c[2]) > 25;
/** Looks like gray glass: no hue, and not white. */
const grayGlass = (c: RGB) => hueChroma(c)[1] <= 30 && luma(c) < 0.9;

/** Where `s` sits best in `r` with its left edge in [xa, xb]: the placement
 *  that paints the most of its opaque pixels and leaves the most of its
 *  transparent ones free of gray glass (as shares). Coarse search on a
 *  sample of the pixels, then refined. */
function placeSilhouette(
  r: Raster,
  s: Silhouette,
  xa: number,
  xb: number
): { x: number; y: number; opaque: number; clear: number } {
  const sample = (step: number) => {
    const o: [number, number][] = [];
    const c: [number, number][] = [];
    for (let v = 0; v < s.h; v += step)
      for (let u = 0; u < s.w; u += step) {
        if (s.opaque[v * s.w + u]) o.push([u, v]);
        else if (s.clear[v * s.w + u]) c.push([u, v]);
      }
    return { o, c };
  };
  const score = (pts: ReturnType<typeof sample>, x: number, y: number) => {
    let o = 0;
    let c = 0;
    for (const [u, v] of pts.o) if (paintedPx(pixelAt(r, x + u, y + v))) o++;
    for (const [u, v] of pts.c) if (!grayGlass(pixelAt(r, x + u, y + v))) c++;
    return { o: o / pts.o.length, c: c / pts.c.length };
  };
  const coarse = sample(3);
  let best = { x: xa, y: 0, s: -1 };
  for (let x = xa; x <= xb; x += 2)
    for (let y = 0; y + s.h <= r.h; y += 2) {
      const f = score(coarse, x, y);
      if (f.o + f.c > best.s) best = { x, y, s: f.o + f.c };
    }
  // The silhouette score is flat within a few px (the glass is painted
  // edge to edge), so the final position is where the rendered brightness
  // best follows the image's shading (correlation, which allows any
  // brightness scale, as a multiplied tint has).
  const shade = sample(2).o;
  const src = shade.map(([u, v]) => s.gray[v * s.w + u]);
  let at = { x: best.x, y: best.y };
  let top = -Infinity;
  for (let x = best.x - 6; x <= best.x + 6; x++)
    for (let y = Math.max(0, best.y - 6); y <= best.y + 6; y++) {
      const r2 = correlation(
        shade.map(([u, v]) => luma(pixelAt(r, x + u, y + v))),
        src
      );
      if (r2 > top) [top, at] = [r2, { x, y }];
    }
  const f = score(sample(1), at.x, at.y);
  return { ...at, opaque: f.o, clear: f.c };
}

interface FillPixel {
  /** Row center, in container px. */
  y: number;
  /** Middle brightness in the image (0.2-0.85), where a tint shows. */
  mid: boolean;
  tinted: boolean;
  gray: boolean;
  /** Rendered brightness, and the image's own gray brightness. */
  l: number;
  src: number;
  hue: number;
  chroma: number;
}

function circularMeanHue(hues: number[]): number {
  const rad = hues.map((h) => (h * Math.PI) / 180);
  const a = Math.atan2(
    rad.reduce((s, h) => s + Math.sin(h), 0),
    rad.reduce((s, h) => s + Math.cos(h), 0)
  );
  return ((a * 180) / Math.PI + 360) % 360;
}

function checkImageFill(
  c: Extract<Check, { check: "imageFill" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  if (!rec.screenshot)
    return { pass: false, detail: "no screenshot of the render to read" };
  const { labels, values } = barValues(
    { category: c.category, value: c.value },
    ctx.data
  );
  const max = c.max ?? 100;
  const levelTol = c.levelTol ?? 3;
  const shot = readRaster(rec.screenshot);
  const sil = silhouette(readRaster(join(ASSET_DIR, c.image)), c.height);
  const [tintHue] = hueChroma(hexColor(c.color));
  const isTinted = (q: RGB) => {
    const [h, chroma] = hueChroma(q);
    return chroma >= 40 && hueDist(h, tintHue) <= 12;
  };

  // Candidate columns: runs of columns painted over at least 35% of the
  // image's height (text and thin lines are much shorter).
  const runs: [number, number][] = [];
  for (let x = 0; x < shot.w; x++) {
    let n = 0;
    for (let y = 0; y < shot.h; y++) if (paintedPx(pixelAt(shot, x, y))) n++;
    if (n < 0.35 * sil.h) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] >= x - 2) last[1] = x;
    else runs.push([x, x]);
  }
  const wide = runs.filter(([a, b]) => b - a + 1 >= 0.5 * sil.w);
  if (wide.length !== labels.length)
    return {
      pass: false,
      detail: `expected ${labels.length} images ${sil.w}x${sil.h} px side by side, found ${wide.length} runs of tall painted columns`,
    };
  const places = wide.map(([a, b]) =>
    placeSilhouette(shot, sil, a - 6, Math.max(a - 6, b - sil.w + 7))
  );
  const problems: string[] = [];
  const bottoms = places.map((p) => p.y + sil.h);
  if (Math.max(...bottoms) - Math.min(...bottoms) > 3)
    problems.push(
      `the images' bottoms are not on one line (y = ${bottoms.join(", ")})`
    );
  places.forEach((p, i) => {
    const name = labels[i];
    if (p.opaque < 0.9 || p.clear < 0.9) {
      problems.push(
        `${name}: no ${sil.w}x${sil.h} px copy of the image here (the best fit paints ${(100 * p.opaque).toFixed(0)}% of its opaque pixels and keeps ${(100 * p.clear).toFixed(0)}% of its transparent ones clear)`
      );
      return;
    }
    const want = values[i] / max;
    const levelY = p.y + sil.h * (1 - want);
    const pct = (y: number) => ((100 * (p.y + sil.h - y)) / sil.h).toFixed(1);
    const px: FillPixel[] = [];
    for (let v = 0; v < sil.h; v++)
      for (let u = 0; u < sil.w; u++) {
        const k = v * sil.w + u;
        if (!sil.opaque[k]) continue;
        const q = pixelAt(shot, p.x + u, p.y + v);
        const [hue, chroma] = hueChroma(q);
        px.push({
          y: p.y + v + 0.5,
          mid: sil.gray[k] >= 0.2 && sil.gray[k] <= 0.85,
          tinted: isTinted(q),
          gray: chroma <= 30,
          l: luma(q),
          src: sil.gray[k],
          hue,
          chroma,
        });
      }
    // The measured level: the line that best separates tinted pixels
    // (below it) from the rest (above it), among pixels of middle
    // brightness.
    const mid = px.filter((q) => q.mid);
    let bestErr = Infinity;
    let lo = p.y;
    let hi = p.y;
    for (let y = p.y; y <= p.y + sil.h; y++) {
      const e = mid.filter((q) => q.y > y !== q.tinted).length;
      if (e < bestErr) [bestErr, lo, hi] = [e, y, y];
      else if (e === bestErr) hi = y;
    }
    const measured = (lo + hi) / 2;
    const band = 2;
    const below = mid.filter((q) => q.y > levelY + band);
    const above = mid.filter((q) => q.y < levelY - band);
    const share = (xs: FillPixel[], f: (q: FillPixel) => boolean) =>
      xs.length ? xs.filter(f).length / xs.length : 1;
    const tintedShare = share(below, (q) => q.tinted);
    if (tintedShare < 0.85) {
      const colored = below.filter((q) => q.chroma >= 40);
      if (below.length > 0 && colored.length >= 0.85 * below.length)
        problems.push(
          `${name}: below the level the bottle has hue ${circularMeanHue(colored.map((q) => q.hue)).toFixed(0)}, not the hue of ${c.color} (${tintHue.toFixed(0)})`
        );
      else
        problems.push(
          `${name}: only ${(100 * tintedShare).toFixed(0)}% of the bottle's pixels below the level have ${c.color} (colored up to about ${pct(measured)}% of the image's height, expected ${pct(levelY)}%)`
        );
      return;
    }
    if (Math.abs(measured - levelY) > levelTol) {
      problems.push(
        `${name}: colored up to ${pct(measured)}% of the image's height, expected ${pct(levelY)}%`
      );
      return;
    }
    const grayShare = share(above, (q) => q.gray);
    if (above.length >= 20 && grayShare < 0.85) {
      problems.push(
        `${name}: above the level only ${(100 * grayShare).toFixed(0)}% of the bottle's pixels are gray`
      );
      return;
    }
    for (const [side, xs] of [
      ["below", px.filter((q) => q.y > levelY + band)],
      ["above", px.filter((q) => q.y < levelY - band)],
    ] as const) {
      if (xs.length < 50) continue;
      const r = correlation(
        xs.map((q) => q.l),
        xs.map((q) => q.src)
      );
      if (r < 0.6) {
        problems.push(
          `${name}: ${side} the level the brightness does not follow the image's shading (correlation ${r.toFixed(2)})`
        );
        return;
      }
    }
    // Nothing outside the bottle's shape takes the tint: not the image's
    // transparent pixels, nor a 10px strip beside it on either side.
    let outside = 0;
    let spill = 0;
    for (let v = 0; v < sil.h; v++)
      for (let u = -12; u < sil.w + 12; u++) {
        const inImage = u >= 0 && u < sil.w;
        if (inImage ? !sil.clear[v * sil.w + u] : u >= -2 && u < sil.w + 2)
          continue;
        outside++;
        if (isTinted(pixelAt(shot, p.x + u, p.y + v))) spill++;
      }
    if (spill > Math.max(4, 0.01 * outside)) {
      problems.push(
        `${name}: ${spill} pixels outside the bottle's shape (transparent in the image, or beside it) have the color`
      );
      return;
    }
    // The line at the level: a vector mark, read from the record.
    const line = rec.marks.some((m) => {
      const k = ink(m);
      return (
        !!k &&
        m.kind !== "text" &&
        m.h <= 3 &&
        hueChroma(k)[1] <= 40 &&
        Math.abs(m.y + m.h / 2 - levelY) <= levelTol + 1.5 &&
        m.x <= p.x + 3 &&
        m.x + m.w >= p.x + sil.w - 3
      );
    });
    if (!line)
      problems.push(
        `${name}: no gray line across the image at the level (y = ${levelY.toFixed(1)})`
      );
  });
  if (problems.length > 0)
    return {
      pass: false,
      detail: `${places.length} images found, but ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
    };
  return {
    pass: true,
    detail: `${labels.length} images at x = [${places.map((p) => p.x).join(", ")}], colored ${c.color} up to [${values.map((v) => `${v}%`).join(", ")}] of their height within their shape, gray above, with a line at each level`,
  };
}

// ---------------------------------------------------------------------------
// Corpus pilot: shared helpers
// ---------------------------------------------------------------------------

type Pt = [number, number];

/** Perceived lightness (CIE L*, 0-100) of a color composited over white. */
function lightness(c: RGBA): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 1, 2].map((i) => lin(c[i] * c[3] + 255 * (1 - c[3])));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** marks[i] shows values[i] on a sequential color scale from light (low)
 *  to dark (high): a larger value (by more than 2% of the range) is never
 *  lighter than a smaller one by more than 2 L* units, equal values share a
 *  color, and the colors span at least 20 L* units. Returns the problem,
 *  or null. */
function sequentialProblem(values: number[], marks: Mark[]): string | null {
  const inks = marks.map((m) => m.fill!);
  const ls = inks.map(lightness);
  const span = Math.max(...ls) - Math.min(...ls);
  if (span < 20)
    return `the colors span only ${span.toFixed(0)} units of lightness (L*), not a light-to-dark scale (at least 20)`;
  const [lo, hi] = extent(values);
  for (let i = 0; i < values.length; i++)
    for (let j = 0; j < values.length; j++) {
      if (values[i] === values[j] && colorDist(inks[i], inks[j]) > SAME_COLOR)
        return `two marks with the value ${values[i]} have different colors (${rgbaText(inks[i])}, ${rgbaText(inks[j])})`;
      if (values[j] - values[i] > 0.02 * (hi - lo) && ls[j] > ls[i] + 2)
        return `${values[j]} is drawn lighter (L* ${ls[j].toFixed(0)}) than ${values[i]} (L* ${ls[i].toFixed(0)}); the scale must run from light (low) to dark (high)`;
    }
  return null;
}

/** Whether filled mark `m` paints point `p`: inside its outline (or its box,
 *  for a plain rect) and inside every clip region it is drawn through. */
function covers(m: Mark, p: Pt): boolean {
  if (m.points && m.points.length >= 3) {
    if (!insidePolygon(p, m.points)) return false;
  } else if (p[0] < m.x || p[0] > m.x + m.w || p[1] < m.y || p[1] > m.y + m.h)
    return false;
  return (
    !m.clip || m.clip.every((polys) => polys.some((q) => insidePolygon(p, q)))
  );
}

/** Filled shapes that may be data: not text or lines, not background, and
 *  not hairlines (thinner than 2px, such as gridlines drawn as rects). */
/** Shapes with any visible fill, white and near-white included, since on a
 *  sequential color scale the lightest cells are data too. Not text or
 *  lines, not hairlines, and not rects covering 40% of the chart. */
function paintedShapes(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) =>
      m.kind !== "text" &&
      m.kind !== "line" &&
      m.fill &&
      m.fill[3] >= 0.05 &&
      Math.min(m.w, m.h) >= 2 &&
      !(m.kind === "rect" && m.w * m.h >= 0.4 * chartArea(rec))
  );
}

/** The area a thick stroke paints along an open, unfilled line or path:
 *  its sampled centerline offset by half the stroke width on each side
 *  (butt ends), as a filled shape in the stroke's color. A flow drawn as
 *  one thick stroke (a sankey link) paints the same band as the filled
 *  outline of that band. Null for anything else, or a stroke under 2px
 *  (the thinnest filled shape `filledShapes` keeps). */
function strokeBand(m: Mark): Mark | null {
  const pts = m.points;
  if (
    (m.kind !== "line" && m.kind !== "path") ||
    (m.fill && m.fill[3] > 0) ||
    !m.stroke ||
    m.strokeWidth < 2 ||
    !pts ||
    pts.length < 2 ||
    Math.hypot(
      pts[0][0] - pts[pts.length - 1][0],
      pts[0][1] - pts[pts.length - 1][1]
    ) <= 1
  )
    return null;
  const h = m.strokeWidth / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    left.push([p[0] + nx * h, p[1] + ny * h]);
    right.push([p[0] - nx * h, p[1] - ny * h]);
  });
  const outline = [...left, ...right.reverse()];
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  const band: Mark = {
    ...m,
    kind: "path",
    fill: m.stroke,
    stroke: null,
    strokeWidth: 0,
    dash: undefined,
    points: outline,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
  bandSource.set(band, m);
  return band;
}

/** The mark a stroke band was made from (`strokeBand`). */
const bandSource = new WeakMap<Mark, Mark>();
const sourceOf = (m: Mark): Mark => bandSource.get(m) ?? m;

/** Filled shapes that read as data, and the bands thick strokes paint
 *  (`strokeBand`). */
function filledShapes(rec: RenderRecord): Mark[] {
  return rec.marks
    .map((m) => strokeBand(m) ?? m)
    .filter(
      (m) =>
        m.kind !== "text" &&
        m.kind !== "line" &&
        m.fill &&
        !nearWhite(m.fill) &&
        Math.min(m.w, m.h) >= 2 &&
        !isBackground(m, rec)
    );
}

/** The mark painted on top at `p` among `marks` (the last in document
 *  order that covers it), or null. */
function topAt(marks: Mark[], p: Pt): Mark | null {
  let hit: Mark | null = null;
  for (const m of marks) if (covers(m, p)) hit = m;
  return hit;
}

/** Like fits1d, but returns, for each mapped value, the index of the
 *  screen value it is matched to (or null when some value finds none). */
function match1d(
  mapped: number[],
  screen: number[],
  tol: number
): number[] | null {
  const ms = mapped.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ss = screen.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out: number[] = new Array(mapped.length);
  let j = 0;
  for (const [m, i] of ms) {
    while (j < ss.length && ss[j][0] < m - tol) j++;
    if (j >= ss.length || ss[j][0] > m + tol) return null;
    out[i] = ss[j][1];
    j++;
  }
  return out;
}

/** Values grouped into clusters whose neighbors lie within `tol`; the
 *  clusters' means, ascending. */
function clusterValues(vs: number[], tol: number): number[] {
  const s = [...vs].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of s) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

/** Index of the value in `centers` within `tol` of v, or -1. */
function nearestIndex(centers: number[], v: number, tol: number): number {
  let best = -1;
  let bestD = tol;
  centers.forEach((c, i) => {
    if (Math.abs(c - v) <= bestD) {
      bestD = Math.abs(c - v);
      best = i;
    }
  });
  return best;
}

/** Areas proportional to values: radius^2 = k * value for one k, within
 *  0.5px + sizeTol of the largest radius. Returns the problem, or null. */
function areaProblem(vs: number[], rs: number[], sizeTol: number) {
  const ks = vs
    .map((v, i) => (rs[i] * rs[i]) / v)
    .filter((k) => Number.isFinite(k) && k > 0)
    .sort((a, b) => a - b);
  const k = ks[Math.floor(ks.length / 2)] ?? 0;
  const slack = 0.5 + sizeTol * Math.max(...rs);
  const off = rs.filter((r, i) => Math.abs(r - Math.sqrt(k * vs[i])) > slack);
  if (off.length === 0) return null;
  const pairs = vs
    .map((v, i) => `${v}:${rs[i].toFixed(1)}`)
    .slice(0, 8)
    .join(", ");
  return `${off.length} radii are not proportional to the square root of the value (value:radius ${pairs}${vs.length > 8 ? ", ..." : ""})`;
}

/** Ramer-Douglas-Peucker on an open polyline. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToPolyline(pts[i], [a, b]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  if (farD <= eps) return [a, b];
  const left = rdp(pts.slice(0, far + 1), eps);
  return [...left.slice(0, -1), ...rdp(pts.slice(far), eps)];
}

/** The corners of a closed outline: its vertices after dropping every
 *  point within `eps` of the line through its neighbors. */
function corners(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let far = 0;
  pts.forEach((p, i) => {
    if (
      Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) >
      Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])
    )
      far = i;
  });
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]], eps);
  const ring = [...a.slice(0, -1), ...b.slice(0, -1)];
  // The seams (the first point and the far point) need not be corners.
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i + ring.length - 1) % ring.length];
      const next = ring[(i + 1) % ring.length];
      if (distToPolyline(ring[i], [prev, next]) <= eps) {
        ring.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return ring;
}

/** Straight segments drawn by strokes: `line` marks, the consecutive points
 *  of stroked, unfilled paths, and the center lines of thin filled rects
 *  (at most 3px thick). */
function strokeSegments(rec: RenderRecord): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const m of rec.marks) {
    if (m.kind === "line" && m.points && m.points.length >= 2) {
      out.push([m.points[0], m.points[m.points.length - 1]]);
    } else if (
      m.kind === "path" &&
      m.points &&
      m.stroke &&
      ink(m) &&
      (!m.fill || nearWhite(m.fill))
    ) {
      for (let i = 0; i + 1 < m.points.length; i++)
        out.push([m.points[i], m.points[i + 1]]);
    } else if (m.kind === "rect" && m.fill && ink(m)) {
      if (m.w <= 3 && m.h > m.w)
        out.push([
          [m.x + m.w / 2, m.y],
          [m.x + m.w / 2, m.y + m.h],
        ]);
      else if (m.h <= 3 && m.w > m.h)
        out.push([
          [m.x, m.y + m.h / 2],
          [m.x + m.w, m.y + m.h / 2],
        ]);
    }
  }
  return out;
}

/** Straight marks along one axis: vertical (`dir` "y") or horizontal
 *  lines, and thin filled rects (at most 4px thick, at least twice as long
 *  as thick) the same way. Each has its position across the axis, its
 *  extent [a, b] along it, and its mark. */
function straightMarks(
  rec: RenderRecord,
  dir: "x" | "y"
): { pos: number; a: number; b: number; mark: Mark }[] {
  const out: { pos: number; a: number; b: number; mark: Mark }[] = [];
  for (const m of rec.marks) {
    if (!ink(m)) continue;
    if (m.kind === "line" && m.points && m.points.length >= 2) {
      const [p, q] = [m.points[0], m.points[m.points.length - 1]];
      if (dir === "y" && Math.abs(p[0] - q[0]) <= 1.5)
        out.push({
          pos: (p[0] + q[0]) / 2,
          a: Math.min(p[1], q[1]),
          b: Math.max(p[1], q[1]),
          mark: m,
        });
      if (dir === "x" && Math.abs(p[1] - q[1]) <= 1.5)
        out.push({
          pos: (p[1] + q[1]) / 2,
          a: Math.min(p[0], q[0]),
          b: Math.max(p[0], q[0]),
          mark: m,
        });
    } else if (
      (m.kind === "rect" || m.kind === "path") &&
      m.fill &&
      !nearWhite(m.fill)
    ) {
      if (dir === "y" && m.w <= 4 && m.h >= 2 * m.w)
        out.push({ pos: m.x + m.w / 2, a: m.y, b: m.y + m.h, mark: m });
      if (dir === "x" && m.h <= 4 && m.w >= 2 * m.h)
        out.push({ pos: m.y + m.h / 2, a: m.x, b: m.x + m.w, mark: m });
    }
  }
  return out;
}

/** Legend keys: small marks (at most 30px) with a text label right beside
 *  them (starting or ending within max(8px, the mark's width, 1.5 times the
 *  label's height) of the mark, at the mark's height; a legend may center a
 *  small symbol in a wider key box, which leaves a wider gap), when at
 *  least two such keys line up in a row or a column. A lone labeled mark
 *  may be a labeled data point, so it is not counted. */
function legendKeys(rec: RenderRecord): Set<Mark> {
  const texts = rec.marks.filter((m) => m.kind === "text");
  const keyed = rec.marks.filter((m) => {
    if (m.kind === "text" || Math.max(m.w, m.h) > 30) return false;
    const cy = m.y + m.h / 2;
    return texts.some((t) => {
      const near = Math.max(8, m.w, 1.5 * t.h);
      return (
        t.y <= cy &&
        cy <= t.y + t.h &&
        ((t.x >= m.x + m.w - 1 && t.x - (m.x + m.w) <= near) ||
          (t.x + t.w <= m.x + 1 && m.x - (t.x + t.w) <= near))
      );
    });
  });
  const center = (m: Mark): Pt => [m.x + m.w / 2, m.y + m.h / 2];
  return new Set(
    keyed.filter((m) =>
      keyed.some(
        (o) =>
          o !== m &&
          (Math.abs(center(o)[0] - center(m)[0]) <= 1 ||
            Math.abs(center(o)[1] - center(m)[1]) <= 1)
      )
    )
  );
}

/** Circles that may be data: not background, with ink. */
function inkCircles(rec: RenderRecord): Mark[] {
  return rec.marks.filter(
    (m) => m.kind === "circle" && ink(m) && !isBackground(m, rec)
  );
}

/** Angle in degrees, clockwise from 12 o'clock, of a screen angle measured
 *  clockwise from the positive x axis. */
const fromTop = (a: number) => (((a + 90) % 360) + 360) % 360;

/** Whether the arc [a0, a0 + sweep] (screen degrees) lies inside the arc
 *  [b0, b0 + bsweep], within `tol` degrees. */
function arcInside(
  a0: number,
  sweep: number,
  b0: number,
  bsweep: number,
  tol: number
): boolean {
  const start = (((a0 - b0 + tol) % 360) + 360) % 360;
  return start + sweep <= bsweep + 2 * tol;
}

// ---------------------------------------------------------------------------
// Corpus pilot: checks
// ---------------------------------------------------------------------------

/** The y of the first segment of polyline `pts` that crosses x, or null. */
function yOnPolyline(pts: Pt[], x: number): number | null {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return null;
}

function checkSignedArea(
  c: Extract<Check, { check: "signedArea" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const fit = fitLineSeries({ x: c.x, y: c.y, tol: c.tol }, rec, ctx.data);
  if ("fail" in fit)
    return { pass: false, detail: `no line through the values: ${fit.fail}` };
  const { X, Y } = fit;
  const line = fit.chosen[0];
  const rows = ctx.data
    .filter((r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y])))
    .sort((a, b) => num(a[c.x]) - num(b[c.x]));
  const fills = filledShapes(rec).filter((m) => sourceOf(m) !== line);
  const y0 = Y.b;
  const vmax = Math.max(...rows.map((r) => Math.abs(num(r[c.y]))));
  const reach = Math.max(3, 0.02 * Math.abs(Y.a) * vmax);
  // Probe columns: each row's x, with the value's y, the first and last
  // stepped just inside their points (where the area's edge is), with the
  // drawn line's y there (on a steep end segment the line moves by more
  // than the step); and the middle between neighboring rows on the same
  // side of zero, with the drawn line's y there (so a smoothed line is
  // followed).
  const px = rows.map((r) => X.a * num(r[c.x]) + X.b);
  const py = rows.map((r) => Y.a * num(r[c.y]) + Y.b);
  const probes: { x: number; y: number; name: string }[] = rows.map((r, i) => {
    const step = i === 0 ? 0.75 : i === rows.length - 1 ? -0.75 : 0;
    const x = px[i] + step;
    return {
      x,
      y: step === 0 ? py[i] : (yOnPolyline(line.points!, x) ?? py[i]),
      name: `${c.x} ${r[c.x]}`,
    };
  });
  for (let i = 0; i + 1 < rows.length; i++) {
    if (Math.sign(py[i] - y0) !== Math.sign(py[i + 1] - y0)) continue;
    const xm = (px[i] + px[i + 1]) / 2;
    const ym = yOnPolyline(line.points!, xm);
    if (ym !== null)
      probes.push({
        x: xm,
        y: ym,
        name: `between ${c.x} ${rows[i][c.x]} and ${rows[i + 1][c.x]}`,
      });
  }
  const above: RGBA[] = [];
  const below: RGBA[] = [];
  const problems: string[] = [];
  for (const p of probes) {
    const len = y0 - p.y;
    const dir = Math.sign(len) || 1;
    const tall = Math.abs(len) >= 2 * reach + 2;
    if (tall) {
      // The area here is a shape covering the whole column from zero to
      // the line; a point marker drawn on the line covers only the sample
      // beside it, so it does not count as the fill.
      const samples: Pt[] = [0.2, 0.5, 0.8].map((t) => [p.x, y0 - t * len]);
      const spanning = fills.filter((m) => samples.every((s) => covers(m, s)));
      for (const s of samples) {
        const m = topAt(spanning, s);
        if (!m) {
          problems.push(
            `${p.name}: the area from zero to the line is not filled`
          );
          break;
        }
        (len > 0 ? above : below).push(ink(m)!);
      }
    }
    if (topAt(fills, [p.x, p.y - dir * reach]))
      problems.push(`${p.name}: the fill reaches past the line`);
    if (tall && topAt(fills, [p.x, y0 + dir * reach]))
      problems.push(`${p.name}: the fill crosses zero`);
  }
  if (problems.length > 0)
    return {
      pass: false,
      detail: `the line matches, but ${problems.length} problems: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
    };
  const up = colorClusters(above);
  const down = colorClusters(below);
  if (up.length !== 1 || down.length !== 1)
    return {
      pass: false,
      detail: `the area above zero uses ${up.length} colors and the area below ${down.length}; expected one each`,
    };
  if (colorDist(up[0], down[0]) <= SAME_COLOR)
    return {
      pass: false,
      detail: `the areas above and below zero share a color (${rgbaText(up[0])})`,
    };
  return {
    pass: true,
    detail: `line and filled area match at ${probes.length} columns, ${rgbaText(up[0])} above zero and ${rgbaText(down[0])} below`,
  };
}

function checkHeatmap(
  c: Extract<Check, { check: "heatmap" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const xs = uniqueInOrder(ctx.data, c.x);
  const ys = uniqueInOrder(ctx.data, c.y);
  const groups: Mark[][] = [];
  for (const m of paintedShapes(rec).filter((m) => m.kind === "rect")) {
    const g = groups.find(
      (g) => Math.abs(g[0].w - m.w) <= 1.5 && Math.abs(g[0].h - m.h) <= 1.5
    );
    if (g) g.push(m);
    else groups.push([m]);
  }
  let best = "";
  for (const g of groups) {
    if (g.length < xs.length * ys.length) continue;
    const cols = clusterValues(
      g.map((m) => m.x + m.w / 2),
      1.5
    );
    const rows = clusterValues(
      g.map((m) => m.y + m.h / 2),
      1.5
    );
    if (cols.length !== xs.length || rows.length !== ys.length) {
      best = `${g.length} equal rects form ${cols.length} columns and ${rows.length} rows`;
      continue;
    }
    const grid = rows.map(() => cols.map(() => [] as Mark[]));
    for (const m of g)
      grid[nearestIndex(rows, m.y + m.h / 2, 1.5)][
        nearestIndex(cols, m.x + m.w / 2, 1.5)
      ].push(m);
    if (grid.some((row) => row.some((cell) => cell.length !== 1))) {
      best = `the equal rects do not fill a ${xs.length} x ${ys.length} grid one per cell`;
      continue;
    }
    const values: number[] = [];
    const marks: Mark[] = [];
    for (const r of ctx.data) {
      values.push(num(r[c.value]));
      marks.push(
        grid[ys.indexOf(String(r[c.y]))][xs.indexOf(String(r[c.x]))][0]
      );
    }
    const problem = sequentialProblem(values, marks);
    if (problem)
      return {
        pass: false,
        detail: `a ${xs.length} x ${ys.length} grid of cells, but ${problem}`,
      };
    return {
      pass: true,
      detail: `a ${xs.length} x ${ys.length} grid of cells, ${c.x} left to right and ${c.y} top to bottom, colored light to dark by ${c.value}`,
    };
  }
  return {
    pass: false,
    detail: `expected a ${xs.length} x ${ys.length} grid of equal rects${best ? `; ${best}` : ""}`,
  };
}

function checkHexbin(
  c: Extract<Check, { check: "hexbin" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const R = c.radius;
  const tol = c.tol ?? 0.15;
  const S3 = Math.sqrt(3);
  // Hexagons, measured by their corners: a clip may cut the mark's box.
  const hexes: { mark: Mark; cx: number; cy: number; w: number; h: number }[] =
    [];
  for (const m of paintedShapes(rec)) {
    if (!m.points) continue;
    const cs = corners(m.points, Math.max(1, 0.04 * Math.max(m.w, m.h)));
    if (cs.length !== 6) continue;
    const [x0, x1] = extent(cs.map((p) => p[0]));
    const [y0, y1] = extent(cs.map((p) => p[1]));
    hexes.push({
      mark: m,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      w: x1 - x0,
      h: y1 - y0,
    });
  }
  if (hexes.length === 0)
    return { pass: false, detail: "no six-cornered filled shapes" };
  // A pointy-top hexagon of radius r is sqrt(3) r wide and 2 r tall (a
  // flat-top one is wider than tall).
  const offSize = hexes.filter(
    (hx) =>
      hx.h <= hx.w ||
      Math.abs(hx.w / S3 - R) > tol * R ||
      Math.abs(hx.h / 2 - R) > tol * R
  );
  if (offSize.length > 0)
    return {
      pass: false,
      detail: `${offSize.length} of ${hexes.length} hexagons are not pointy-top with a radius of ${R}px (one is ${offSize[0].w.toFixed(1)}x${offSize[0].h.toFixed(1)}px, expected ${(S3 * R).toFixed(1)}x${(2 * R).toFixed(1)}px)`,
    };

  // The lattice: center (i, j) at (ox + i dx / 2, oy + j dy), i + j even.
  // Hexagons are indexed nearest first, starting from the first one, and the
  // spacing and offset are refitted after each, so no origin is assumed.
  let dx = median(hexes.map((hx) => hx.w));
  let dy = 0.75 * median(hexes.map((hx) => hx.h));
  let ox = hexes[0].cx;
  let oy = hexes[0].cy;
  const ij: ([number, number] | null)[] = hexes.map(() => null);
  ij[0] = [0, 0];
  // A least-squares fit, keeping the step while all indices are equal.
  const fit = (ks: number[], ps: number[], step: number): Affine => {
    if (ks.every((k) => k === ks[0])) {
      const pm = ps.reduce((t, v) => t + v, 0) / ps.length;
      return { a: step, b: pm - step * ks[0] };
    }
    return leastSquares(ks, ps);
  };
  for (let n = 1; n < hexes.length; n++) {
    let best: [number, number] = [-1, -1];
    let bestD = Infinity;
    hexes.forEach((h, k) => {
      if (ij[k]) return;
      ij.forEach((g, l) => {
        if (!g) return;
        const d = Math.hypot(h.cx - hexes[l].cx, h.cy - hexes[l].cy);
        if (d < bestD) {
          bestD = d;
          best = [k, l];
        }
      });
    });
    const [k, l] = best;
    const [gi, gj] = ij[l]!;
    const j = gj + Math.round((hexes[k].cy - hexes[l].cy) / dy);
    const t = gi + (hexes[k].cx - hexes[l].cx) / (dx / 2);
    ij[k] = [j + 2 * Math.round((t - j) / 2), j];
    const done = hexes.map((_, q) => q).filter((q) => ij[q]);
    const fx = fit(
      done.map((q) => ij[q]![0]),
      done.map((q) => hexes[q].cx),
      dx / 2
    );
    const fy = fit(
      done.map((q) => ij[q]![1]),
      done.map((q) => hexes[q].cy),
      dy
    );
    [dx, ox, dy, oy] = [2 * fx.a, fx.b, fy.a, fy.b];
  }
  // Lattice positions as one integer key each, i + j * SPAN (|i| < SPAN / 2).
  const SPAN = 1 << 16;
  const site = new Map<number, number>();
  for (let k = 0; k < hexes.length; k++) {
    const [i, j] = ij[k]!;
    const off = Math.hypot(
      hexes[k].cx - (ox + (i * dx) / 2),
      hexes[k].cy - (oy + j * dy)
    );
    if (off > Math.max(1.5, 0.1 * R))
      return {
        pass: false,
        detail: `${hexes.length} hexagons, but they do not lie on one hexagonal lattice (one is ${off.toFixed(1)}px off it)`,
      };
    const key = i + j * SPAN;
    if (site.has(key))
      return {
        pass: false,
        detail: `${hexes.length} hexagons, but two share one lattice position`,
      };
    site.set(key, k);
  }
  if (
    hexes.length > 1 &&
    (Math.abs(dx - S3 * R) > tol * S3 * R ||
      Math.abs(dy - 1.5 * R) > tol * 1.5 * R)
  )
    return {
      pass: false,
      detail: `the hexagons' centers are ${dx.toFixed(1)}px apart in a row and their rows ${dy.toFixed(1)}px apart; bins of radius ${R}px are ${(S3 * R).toFixed(1)}px and ${(1.5 * R).toFixed(1)}px apart`,
    };

  // The drawn hexagons whose lattice centers are within `eps` px of the
  // nearest lattice center to a pixel, nearest first, or null when none is
  // drawn. Distances are taken on the lattice made regular, so a program
  // that bins in data units on a stretched lattice is read the same way.
  const unit = dx / S3; // px per unit of the regular lattice
  // The four lattice positions around a pixel: two rows, two in each.
  const keys = [0, 0, 0, 0];
  const ds = [0, 0, 0, 0];
  const near = (px: number, py: number, eps: number): number[] | null => {
    const a = (px - ox) / (dx / 2);
    const b = (py - oy) / dy;
    const j0 = Math.floor(b);
    let best = Infinity;
    for (let q = 0; q < 4; q++) {
      const j = j0 + (q >> 1);
      const i = j + 2 * Math.floor((a - j) / 2) + 2 * (q & 1);
      keys[q] = i + j * SPAN;
      ds[q] = Math.hypot(((a - i) * S3) / 2, (b - j) * 1.5);
      best = Math.min(best, ds[q]);
    }
    const lim = best + eps / unit;
    let out: number[] | null = null;
    for (let q = 0; q < 4; q++) {
      if (ds[q] > lim) continue;
      const k = site.get(keys[q]);
      if (k !== undefined) (out ??= []).push(k);
    }
    return out;
  };

  const rows = ctx.data.filter(
    (r) => Number.isFinite(num(r[c.x])) && Number.isFinite(num(r[c.y]))
  );
  const norm = (f: string) => {
    const vs = rows.map((r) => num(r[f]));
    const [lo, hi] = extent(vs);
    return vs.map((v) => (v - lo) / (hi - lo || 1));
  };
  const us = norm(c.x);
  const vs = norm(c.y);
  // A scale is searched as the pixel positions of the data's extremes. The
  // leftmost row lies in a drawn hexagon and the leftmost hexagon holds a
  // row, so the left end is within half a hexagon of the leftmost center;
  // likewise for the other three ends (y up).
  const hw = Math.max(dx, median(hexes.map((hx) => hx.w))) / 2 + 1;
  const hh = Math.max((4 / 3) * dy, median(hexes.map((hx) => hx.h))) / 2 + 1;
  const [cxLo, cxHi] = extent(hexes.map((hx) => hx.cx));
  const [cyLo, cyHi] = extent(hexes.map((hx) => hx.cy));
  const ranges: [number, number][] = [
    [cxLo - hw, cxLo + hw],
    [cxHi - hw, cxHi + hw],
    [cyHi - hh, cyHi + hh],
    [cyLo - hh, cyLo + hh],
  ];
  // Each row's candidate hexagons under one scale, or null when a row falls
  // outside the drawn hexagons or some hexagon can hold no row.
  const cover = (p: number[], eps: number): number[][] | null => {
    const out: number[][] = [];
    const hit = new Uint8Array(hexes.length);
    for (let n = 0; n < rows.length; n++) {
      const ks = near(
        p[0] + (p[1] - p[0]) * us[n],
        p[2] + (p[3] - p[2]) * vs[n],
        eps
      );
      if (!ks) return null;
      for (const k of ks) hit[k] = 1;
      out.push(ks);
    }
    return hit.every((v) => v) ? out : null;
  };
  // A grid point is within step / 2 of the true scale at each end, which
  // moves a row by up to step / sqrt(2) px, so the row's true hexagon is
  // within sqrt(2) step of its nearest (plus 0.5 px for rounding). A coarse
  // grid finds the scales worth refining on a fine one.
  const COARSE = 2;
  const FINE = 1;
  const grid = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  };
  const axes = ranges.map(([lo, hi]) => grid(lo, hi, COARSE));
  const coarse: number[][] = [];
  for (const a of axes[0])
    for (const b of axes[1])
      for (const e of axes[2])
        for (const f of axes[3])
          if (cover([a, b, e, f], Math.SQRT2 * COARSE + 0.5))
            coarse.push([a, b, e, f]);
  const seen = new Set<string>();
  const tried = new Set<string>();
  const steps = grid(-COARSE / 2, COARSE / 2, FINE);
  const marks = hexes.map((hx) => hx.mark);
  let problem = "";
  for (const p0 of coarse)
    for (const s0 of steps)
      for (const s1 of steps)
        for (const s2 of steps)
          for (const s3 of steps) {
            const p = [p0[0] + s0, p0[1] + s1, p0[2] + s2, p0[3] + s3];
            const key = p.map((v) => v.toFixed(2)).join();
            if (seen.has(key)) continue;
            seen.add(key);
            const cands = cover(p, Math.SQRT2 * FINE + 0.5);
            if (!cands) continue;
            const sig = cands.map((ks) => ks.join(" ")).join();
            if (tried.has(sig)) continue;
            tried.add(sig);
            // Rows near a hexagon's edge may go either way: try each choice.
            const fixed = new Array(hexes.length).fill(0);
            const open: number[][] = [];
            for (const ks of cands)
              if (ks.length === 1) fixed[ks[0]]++;
              else open.push(ks);
            if (open.length > 12) continue;
            const total = open.reduce((t, ks) => t * ks.length, 1);
            for (let code = 0; code < total; code++) {
              const counts = [...fixed];
              let rest = code;
              for (const ks of open) {
                counts[ks[rest % ks.length]]++;
                rest = Math.floor(rest / ks.length);
              }
              if (counts.some((n) => n === 0)) continue;
              const why = sequentialProblem(counts, marks);
              if (!why)
                return {
                  pass: true,
                  detail: `${hexes.length} pointy-top hexagons of radius ${R}px on one lattice, one per nonempty bin, colored light to dark by count`,
                };
              problem ||= why;
            }
          }
  if (problem)
    return {
      pass: false,
      detail: `${hexes.length} hexagons of radius ${R}px hold the rows, but ${problem}`,
    };
  return {
    pass: false,
    detail: `${hexes.length} hexagons of radius ${R}px, but no linear scales put every row inside a drawn hexagon and leave none empty`,
  };
}

function checkLollipop(
  c: Extract<Check, { check: "lollipop" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const vertical = c.orientation === "vertical";
  const stems = straightMarks(rec, vertical ? "y" : "x");
  const circles = inkCircles(rec);
  const ends = new Set<number>();
  for (const s of stems) {
    ends.add(Math.round(s.a));
    ends.add(Math.round(s.b));
  }
  const groups: Bar[][] = [];
  for (const e of ends) {
    const bars: Bar[] = [];
    for (const m of circles) {
      const r = (m.w + m.h) / 4;
      const pos = vertical ? m.x + m.w / 2 : m.y + m.h / 2;
      const at = vertical ? m.y + m.h / 2 : m.x + m.w / 2;
      const stem = stems.find((s) => {
        if (Math.abs(s.pos - pos) > Math.max(1.5, r / 2)) return false;
        const other =
          Math.abs(s.a - e) <= 1.5
            ? s.b
            : Math.abs(s.b - e) <= 1.5
              ? s.a
              : null;
        return other !== null && Math.abs(other - at) <= r + 1.5;
      });
      if (stem) bars.push({ pos, len: vertical ? e - at : at - e, mark: m });
    }
    if (bars.length > 0) groups.push(bars);
  }
  const { bars, best } = matchBars(groups, values, {
    ordered: c.ordered ?? true,
    direction: c.direction ?? "forward",
    tol: c.tol ?? 0.03,
  });
  if (bars.length !== values.length)
    return {
      pass: false,
      detail: `expected ${values.length} ${c.orientation} lollipops proportional to [${values.join(", ")}]; ${circles.length} circles, ${stems.length} stems, best baseline matched ${best}`,
    };
  return {
    pass: true,
    detail: `${values.length} ${c.orientation} lollipops match [${values.join(", ")}]`,
  };
}

function checkStrips(
  c: Extract<Check, { check: "strips" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data.filter((r) => Number.isFinite(num(r[c.value])));
  const cats = uniqueInOrder(rows, c.category);
  const vals = rows.map((r) => num(r[c.value]));
  const [lo, hi] = extent(vals);
  // Normalized, so a date's milliseconds do not swamp the map's precision.
  const norm = vals.map((v) => (v - lo) / (hi - lo || 1));
  const items: { x: number; y: number; mark: Mark }[] =
    c.mark === "tick"
      ? straightMarks(rec, "y")
          .filter((s) => s.b - s.a >= 4)
          .map((s) => ({ x: s.pos, y: (s.a + s.b) / 2, mark: s.mark }))
      : inkCircles(rec).map((m) => ({
          x: m.x + m.w / 2,
          y: m.y + m.h / 2,
          mark: m,
        }));
  const laneYs = clusterValues(
    items.map((i) => i.y),
    1.5
  );
  const lanes = laneYs.map((y) =>
    items.filter((i) => Math.abs(i.y - y) <= 1.5 + 1e-9)
  );
  const xs = items.map((i) => i.x);
  const tolFor = (a: number) => Math.max(1.5, (c.tol ?? 0.01) * a);
  const hs = hypotheses(xs, 0, 1, 1).filter((h) =>
    fits1d(
      norm.map((v) => h.a * v + h.b),
      xs,
      tolFor(h.a)
    )
  );
  const what = c.mark === "tick" ? "ticks" : "circles";
  let bestCats = 0;
  for (const X of hs) {
    const tol = tolFor(X.a);
    const assigned: Mark[] = new Array(rows.length);
    let li = 0;
    let done = 0;
    for (const cat of cats) {
      const idx = rows
        .map((r, i) => (String(r[c.category]) === cat ? i : -1))
        .filter((i) => i >= 0);
      const mapped = idx.map((i) => X.a * norm[i] + X.b);
      let found = false;
      for (; li < lanes.length; li++) {
        const m = match1d(
          mapped,
          lanes[li].map((i) => i.x),
          tol
        );
        if (m) {
          idx.forEach((ri, k) => (assigned[ri] = lanes[li][m[k]].mark));
          li++;
          found = true;
          break;
        }
      }
      if (!found) break;
      done++;
    }
    bestCats = Math.max(bestCats, done);
    if (done < cats.length) continue;
    const notes: string[] = [];
    if (c.size) {
      const problem = areaProblem(
        rows.map((r) => num(r[c.size!])),
        assigned.map((m) => (m.w + m.h) / 4),
        c.sizeTol ?? 0.03
      );
      if (problem)
        return {
          pass: false,
          detail: `${rows.length} ${what} in ${cats.length} lanes, but ${problem}`,
        };
      notes.push(`areas proportional to ${c.size}`);
    }
    if (c.colorBy) {
      const colors = colorsBy(c.colorBy, rows, assigned);
      if (!colors.pass)
        return {
          pass: false,
          detail: `${rows.length} ${what} in ${cats.length} lanes, but ${colors.detail}`,
        };
      notes.push(`colored by ${c.colorBy}`);
    }
    return {
      pass: true,
      detail: `${rows.length} ${what} in ${cats.length} lanes top to bottom, placed by ${c.value}${notes.length ? `, ${notes.join(", ")}` : ""}`,
    };
  }
  return {
    pass: false,
    detail: `expected ${cats.length} lanes of ${what} placed by ${c.value}, top to bottom; ${items.length} ${what} in ${lanes.length} lanes, ${hs.length} x-scales fit, at most ${bestCats} ${c.category} lanes matched`,
  };
}

function checkBeeswarm(
  c: Extract<Check, { check: "beeswarm" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data.filter((r) => Number.isFinite(num(r[c.x])));
  const vals = rows.map((r) => num(r[c.x]));
  const [lo, hi] = extent(vals);
  const norm = vals.map((v) => (v - lo) / (hi - lo || 1));
  const keys = legendKeys(rec);
  const circles = inkCircles(rec).filter((m) => !keys.has(m));
  const xs = circles.map((m) => m.x + m.w / 2);
  const slack = c.slack ?? 2;
  // A scale through two circles that are each up to `slack` off is itself
  // up to 2 `slack` off, so candidates are matched loosely, refitted to all
  // the circles by least squares, and then held to `slack`.
  const hs = hypotheses(xs, 0, 1, 1).filter((h) =>
    fits1d(
      norm.map((v) => h.a * v + h.b),
      xs,
      2 * slack
    )
  );
  if (hs.length === 0)
    return {
      pass: false,
      detail: `no linear x scale places ${rows.length} circles within ${slack}px of their ${c.x} (${circles.length} circles)`,
    };
  const problems: string[] = [];
  for (const h of hs) {
    const rough = match1d(
      norm.map((v) => h.a * v + h.b),
      xs,
      2 * slack
    )!;
    const X = leastSquares(
      norm,
      rough.map((j) => xs[j])
    );
    const idx = match1d(
      norm.map((v) => X.a * v + X.b),
      xs,
      slack + 0.05
    );
    if (!idx) {
      problems.push(`some circles are more than ${slack}px from their ${c.x}`);
      continue;
    }
    const mine = idx.map((j) => circles[j]);
    const ctr = mine.map((m) => [m.x + m.w / 2, m.y + m.h / 2] as Pt);
    const rs = mine.map((m) => (m.w + m.h) / 4);
    const rMid = median(rs);
    if (rs.some((r) => Math.abs(r - rMid) > Math.max(1, 0.05 * rMid))) {
      problems.push(
        `the circles' radii differ (${Math.min(...rs).toFixed(1)} to ${Math.max(...rs).toFixed(1)}px)`
      );
      continue;
    }
    const d = (i: number, j: number) =>
      Math.hypot(ctr[i][0] - ctr[j][0], ctr[i][1] - ctr[j][1]);
    let overlap = "";
    for (let i = 0; i < mine.length && !overlap; i++)
      for (let j = i + 1; j < mine.length; j++)
        if (d(i, j) < rs[i] + rs[j] - Math.max(1, 0.1 * rMid)) {
          overlap = `the circles of ${rows[i][c.x]} and ${rows[j][c.x]} overlap by ${(rs[i] + rs[j] - d(i, j)).toFixed(1)}px`;
          break;
        }
    if (overlap) {
      problems.push(overlap);
      continue;
    }
    const ys = ctr.map((p) => p[1]);
    let base = ys[0];
    let most = 0;
    for (const y of ys) {
      const n = ys.filter((v) => Math.abs(v - y) <= 2).length;
      if (n > most) {
        most = n;
        base = y;
      }
    }
    const loose = ctr.findIndex(
      (p, i) =>
        Math.abs(p[1] - base) > 2 &&
        !ctr.some(
          (_, j) =>
            j !== i && d(i, j) <= rs[i] + rs[j] + Math.max(1.5, 0.15 * rMid)
        )
    );
    if (loose >= 0) {
      problems.push(
        `the circle of ${rows[loose][c.x]} is off the base line and touches no other circle`
      );
      continue;
    }
    if (c.colorBy) {
      // Rows at the same x may take their circles in any order, so compare
      // colors per x: learn each value's color from the x positions that
      // hold one value only, then compare the multisets everywhere.
      const inks = mine.map((m) => ink(m)!);
      const reps = colorClusters(inks);
      const clusterOf = (col: RGBA) =>
        reps.findIndex((r) => colorDist(r, col) <= SAME_COLOR);
      const byX = new Map<number, number[]>();
      norm.forEach((v, i) => byX.set(v, [...(byX.get(v) ?? []), i]));
      const colorOf = new Map<string, number>();
      let bad = "";
      for (const is of byX.values()) {
        const vs = new Set(is.map((i) => String(rows[i][c.colorBy!])));
        if (vs.size !== 1) continue;
        const v = [...vs][0];
        for (const i of is) {
          const k = clusterOf(inks[i]);
          if ((colorOf.get(v) ?? k) !== k)
            bad = `"${v}" is drawn in more than one color`;
          colorOf.set(v, k);
        }
      }
      const groups = uniqueInOrder(rows, c.colorBy);
      const unknown = groups.filter((g) => !colorOf.has(g));
      const used = [...colorOf.values()];
      if (!bad && new Set(used).size !== used.length)
        bad = `two ${c.colorBy} values share a color`;
      if (!bad && unknown.length > 0)
        bad = `no color found for ${unknown.join(", ")}`;
      if (!bad)
        for (const is of byX.values()) {
          const want = is
            .map((i) => colorOf.get(String(rows[i][c.colorBy!]))!)
            .sort();
          const got = is.map((i) => clusterOf(inks[i])).sort();
          if (want.join() !== got.join()) {
            bad = `the circles at ${c.x} ${rows[is[0]][c.x]} are not colored by ${c.colorBy}`;
            break;
          }
        }
      if (bad) {
        problems.push(bad);
        continue;
      }
    }
    return {
      pass: true,
      detail: `${rows.length} circles placed by ${c.x}, none overlapping, piled from one base line${c.colorBy ? `, colored by ${c.colorBy}` : ""}`,
    };
  }
  return {
    pass: false,
    detail: `${rows.length} circles placed by ${c.x}, but ${problems[0]}`,
  };
}

function checkStackedArea(
  c: Extract<Check, { check: "stackedArea" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const sv = seriesValues(
    { category: c.x, series: c.series, value: c.y },
    ctx.data
  );
  const order = sv.categories
    .map((x, i) => ({ x: num(x), i }))
    .sort((a, b) => a.x - b.x);
  const xv = order.map((o) => o.x);
  const vals = order.map((o) => sv.values[o.i]);
  const cum = vals.map((row) => {
    let s = 0;
    return row.map((v) => (s += v));
  });
  const maxTot = Math.max(...cum.map((row) => row[row.length - 1]));
  const [x0, x1] = extent(xv);
  const tol = c.tol ?? 0.02;
  const shapes = filledShapes(rec);
  let best = 0;
  for (const B of shapes)
    for (const T of shapes) {
      if (Math.abs(T.x - B.x) > 2 || Math.abs(T.x + T.w - (B.x + B.w)) > 2)
        continue;
      const px0 = B.x;
      const px1 = B.x + B.w;
      // The first and last x are sampled just inside the ends, by more than
      // the padding a library may add there: ggplot2's geom_area closes
      // each series with a zero 0.1% of the x range outside its first and
      // last x, so its box ends on a steep ramp down to the baseline.
      const inset = 0.5 + 0.002 * (px1 - px0);
      const yBase = B.y + B.h;
      const k = (yBase - T.y) / maxTot;
      if (yBase - T.y < 10 || px1 - px0 < 10) continue;
      const ax = (px1 - px0) / (x1 - x0);
      const slack = Math.max(2, tol * k * maxTot);
      const used = new Set<Mark>();
      const chosen: Mark[] = [];
      for (let s = 0; s < sv.series.length; s++) {
        const hit = shapes.find((m) => {
          if (used.has(m)) return false;
          return xv.every((x, i) => {
            const t = Math.min(
              px1 - inset,
              Math.max(px0 + inset, px0 + ax * (x - x0))
            );
            const cs = crossSection(m, t, true);
            if (!cs) return false;
            const top = yBase - k * cum[i][s];
            const bottom = yBase - k * (cum[i][s] - vals[i][s]);
            return (
              Math.abs(cs[0] - top) <= slack &&
              Math.abs(cs[1] - bottom) <= slack
            );
          });
        });
        if (!hit) break;
        used.add(hit);
        chosen.push(hit);
      }
      best = Math.max(best, chosen.length);
      if (chosen.length < sv.series.length) continue;
      const colors = seriesColorsConsistent(
        chosen.map((m) => [m]),
        sv.series
      );
      if (!colors.pass) return colors;
      return {
        pass: true,
        detail: `${sv.series.length} stacked areas match, bottom to top`,
      };
    }
  return {
    pass: false,
    detail: `expected ${sv.series.length} stacked areas (${sv.series.join(", ")} from the bottom); ${shapes.length} filled shapes, at most ${best} series matched from the bottom`,
  };
}

/** The outline vertices of `m` grouped by distance from `c`, cut at the
 *  gaps of at least max(2px, 10% of the range of distances): the outer arc
 *  (past the last cut), the inner arc (before the first cut; empty when
 *  there is no cut), and the vertices between them. A wedge's corners lie
 *  on its two arcs (or at the center), also when the straight edges are
 *  padded apart and so do not point at the center; a vertex between them
 *  lies on a straight edge that is drawn as a polyline (as ggplot2's polar
 *  coordinates draw it). */
function arcsAbout(
  m: Mark,
  c: Pt
): { outer: Pt[]; inner: Pt[]; between: Pt[] } {
  const pts = m.points ?? [];
  const d = (p: Pt) => Math.hypot(p[0] - c[0], p[1] - c[1]);
  const ds = pts.map(d).sort((a, b) => a - b);
  const gap = Math.max(2, 0.1 * (ds[ds.length - 1] - ds[0]));
  let lo = -Infinity;
  let hi = -Infinity;
  for (let i = 1; i < ds.length; i++)
    if (ds[i] - ds[i - 1] >= gap) {
      const cut = (ds[i] + ds[i - 1]) / 2;
      if (lo === -Infinity) lo = cut;
      hi = cut;
    }
  return {
    outer: pts.filter((p) => d(p) > hi),
    inner: pts.filter((p) => d(p) <= lo),
    between: pts.filter((p) => d(p) > lo && d(p) <= hi),
  };
}

/** Whether every vertex of `m`'s outline in `between` lies within `tol` of
 *  the straight segment joining the nearest vertices on either side of it
 *  (in drawing order) that are not in `between`. */
function onStraightEdges(m: Mark, between: Pt[], tol: number): boolean {
  if (between.length === 0) return true;
  const pts = m.points ?? [];
  const n = pts.length;
  const mid = pts.map((p) => between.includes(p));
  if (mid.every(Boolean)) return false;
  for (let i = 0; i < n; i++) {
    if (!mid[i]) continue;
    let a = i;
    while (mid[a]) a = (a - 1 + n) % n;
    let b = i;
    while (mid[b]) b = (b + 1) % n;
    if (distToPolyline(pts[i], [pts[a], pts[b]]) > tol) return false;
  }
  return true;
}

/** The least-squares center shared by circles through each point set (one
 *  radius per set; the algebraic fit), or null when the sets do not pin
 *  it down. */
function concentricFit(sets: Pt[][]): Pt | null {
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (const s of sets) {
    if (s.length < 2) continue;
    const z = s.map((p) => p[0] * p[0] + p[1] * p[1]);
    const mx = s.reduce((a, p) => a + p[0], 0) / s.length;
    const my = s.reduce((a, p) => a + p[1], 0) / s.length;
    const mz = z.reduce((a, b) => a + b, 0) / s.length;
    s.forEach((p, i) => {
      const dx = p[0] - mx;
      const dy = p[1] - my;
      const dz = z[i] - mz;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
      sxz += dx * dz;
      syz += dy * dz;
    });
  }
  const det = sxx * syy - sxy * sxy;
  if (!(det > 1e-6 * (sxx * syy + 1e-9))) return null;
  return [(syy * sxz - sxy * syz) / det / 2, (sxx * syz - sxy * sxz) / det / 2];
}

/**
 * The center shared by the picture's wedges, and the shapes that are
 * wedges about it. A wedge's own fitted center is inexact when its radial
 * edges are short, and wrong when a pad angle offsets its edges sideways
 * (they then cross away from the center), but its arcs are still
 * concentric with every other wedge's. So one center is fitted to all the
 * wedges' arcs at once, starting from the median of their own centers.
 * Then every outlined filled shape (also one the extractor could not fit
 * as a wedge by itself) counts when its outline lies on one or two
 * circles about that center, plus possibly the center itself. Assumes one
 * radial chart per picture.
 */
function sharedCenter(rec: RenderRecord): { center: Pt; marks: Mark[] } | null {
  const shapes = rec.marks.filter(
    (m) =>
      (m.kind === "wedge" || (m.kind === "path" && m.fill)) &&
      (m.points?.length ?? 0) >= 3 &&
      !isBackground(m, rec)
  );
  const wedges = shapes.filter((m) => m.kind === "wedge" && m.wedge);
  if (wedges.length === 0) return null;
  const onCircles = (m: Mark, c: Pt) => {
    const { outer, inner, between } = arcsAbout(m, c);
    if (outer.length < 2) return false;
    const d = (p: Pt) => Math.hypot(p[0] - c[0], p[1] - c[1]);
    const spread = (ps: Pt[]) =>
      ps.length ? Math.max(...ps.map(d)) - Math.min(...ps.map(d)) : 0;
    const r = Math.max(...outer.map(d));
    // The outline is sampled every 2px, so a corner's vertex may sit up to
    // that far along the straight edge, off the arc.
    const tol = 2 + 0.005 * r;
    const r0 = inner.length ? Math.max(...inner.map(d)) : 0;
    return (
      spread(outer) <= tol &&
      (spread(inner) <= tol || r0 <= Math.max(3, 0.05 * r)) &&
      onStraightEdges(m, between, tol)
    );
  };
  let c: Pt = [
    median(wedges.map((w) => w.wedge!.cx)),
    median(wedges.map((w) => w.wedge!.cy)),
  ];
  let fitTo = wedges;
  for (let k = 0; k < 30; k++) {
    const next = concentricFit(
      fitTo.flatMap((m) => {
        const { outer, inner } = arcsAbout(m, c);
        return [outer, inner];
      })
    );
    if (!next) return null;
    const moved = Math.hypot(next[0] - c[0], next[1] - c[1]);
    c = next;
    // Once close, fit only to the shapes that are wedges about the center
    // (dropping, say, a wedge-like legend symbol).
    if (k >= 4) {
      const fits = shapes.filter((m) => onCircles(m, c));
      if (fits.length >= 2) fitTo = fits;
    }
    if (k >= 5 && moved < 0.01) break;
  }
  return { center: c, marks: shapes.filter((m) => onCircles(m, c)) };
}

/** A wedge's radii and angular extent measured from its outline about
 *  (cx, cy), the center shared with the other wedges. */
function wedgeAbout(
  m: Mark,
  cx: number,
  cy: number
): NonNullable<Mark["wedge"]> {
  const pts = m.points ?? [];
  if (pts.length < 3) return m.wedge!;
  const d = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  // A pie slice's apex sits on the center, where a point has no direction.
  const apex = Math.max(3, 0.05 * Math.max(...d));
  const as = pts
    .filter((_, i) => d[i] > apex)
    .map(
      (p) => ((Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 360) % 360
    )
    .sort((a, b) => a - b);
  let gap = as[0] + 360 - as[as.length - 1];
  let a0 = as[0];
  for (let i = 1; i < as.length; i++)
    if (as[i] - as[i - 1] > gap) {
      gap = as[i] - as[i - 1];
      a0 = as[i];
    }
  return {
    cx,
    cy,
    r: Math.max(...d),
    r0: Math.min(...d),
    a0,
    sweep: 360 - gap,
  };
}

function checkRadialBars(
  c: Extract<Check, { check: "radialBars" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { values } = barValues(c, ctx.data);
  const around = sharedCenter(rec);
  const g = around?.marks ?? [];
  if (!around || g.length < values.length)
    return {
      pass: false,
      detail: `expected ${values.length} circular bars; found ${g.length} wedges around one center`,
    };
  const [cx, cy] = around.center;
  const geo = new Map(g.map((w) => [w, wedgeAbout(w, cx, cy)]));
  const r0 = median(g.map((w) => geo.get(w)!.r0));
  const ring = g.filter((w) => Math.abs(geo.get(w)!.r0 - r0) <= 1.5);
  if (ring.length < values.length)
    return {
      pass: false,
      detail: `expected ${values.length} circular bars; ${g.length} wedges around one center, ${ring.length} of them from one inner circle`,
    };
  const rmax = Math.max(...ring.map((w) => geo.get(w)!.r));
  if (r0 < 0.1 * rmax)
    return {
      pass: false,
      detail: `${ring.length} wedges start at radius ${r0.toFixed(1)}px, not at an inner circle (a hole of at least 10% of ${rmax.toFixed(0)}px)`,
    };
  const bars: Bar[] = ring.map((w) => {
    const e = geo.get(w)!;
    return {
      pos: (fromTop(e.a0 + e.sweep / 2) + 15) % 360,
      len: e.r - e.r0,
      mark: w,
    };
  });
  const ordered = c.ordered ?? true;
  const { bars: got, best } = matchBars([bars], values, {
    ordered,
    direction: "forward",
    tol: c.tol ?? 0.03,
  });
  if (got.length !== values.length)
    return {
      pass: false,
      detail: `${ring.length} wedges on an inner circle of ${r0.toFixed(1)}px, but at most ${best} radial lengths match [${values.join(", ")}]${ordered ? " clockwise from 12 o'clock" : ""}`,
    };
  const sw = got.map((b) => geo.get(b.mark)!.sweep);
  const mid = median(sw);
  if (sw.some((s) => Math.abs(s - mid) > Math.max(1, 0.05 * mid)))
    return {
      pass: false,
      detail: `${values.length} radial lengths match, but the bars' angular widths differ (${Math.min(...sw).toFixed(1)} to ${Math.max(...sw).toFixed(1)} degrees)`,
    };
  return {
    pass: true,
    detail: `${values.length} circular bars on an inner circle of ${r0.toFixed(1)}px match [${values.join(", ")}]${ordered ? " clockwise from 12 o'clock" : ""}`,
  };
}

function checkBullet(
  c: Extract<Check, { check: "bullet" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const rows = ctx.data;
  const tol = c.tol ?? 0.02;
  const maxRange = Math.max(
    ...rows.flatMap((r) => c.ranges.map((f) => num(r[f])))
  );
  const rects = barCandidates(rec);
  const laneYs = clusterValues(
    rects.map((m) => m.y + m.h / 2),
    3
  );
  const lanes = laneYs.map((y) =>
    rects.filter((m) => Math.abs(m.y + m.h / 2 - y) <= 3 + 1e-9)
  );
  const targets = straightMarks(rec, "y");
  const bases = [...new Set(rects.map((m) => Math.round(m.x)))];
  let best = 0;
  // The reason reported is the one from the attempt that got furthest:
  // most bullets matched, then the latest stage (bar, bands, colors,
  // target) of the next one.
  let why = "";
  let whyRank = -1;
  const miss = (rank: number, msg: string) => {
    if (rank >= whyRank) {
      whyRank = rank;
      why = msg;
    }
  };
  for (const b of bases) {
    const from = (m: Mark) => Math.abs(m.x - b) <= 1;
    const cand = lanes.filter((l) => l.some(from));
    if (cand.length < rows.length) continue;
    // The measure bar is the thinnest rect from the baseline in a lane.
    const measureOf = (l: Mark[]) =>
      l.filter(from).reduce((a, m) => (m.h < a.h ? m : a));
    const ks = new Set<number>();
    for (const l of cand)
      for (const r of rows) ks.add(measureOf(l).w / num(r[c.value]));
    for (const k of ks) {
      const slack = Math.max(1.5, tol * k * maxRange);
      let li = 0;
      let done = 0;
      for (const r of rows) {
        let ok = false;
        for (; li < cand.length && !ok; li++) {
          const l = cand[li];
          const bar = measureOf(l);
          if (Math.abs(bar.w - k * num(r[c.value])) > slack) {
            miss(
              4 * done + 0,
              `the bar for ${r[c.category]} is not ${r[c.value]} long`
            );
            continue;
          }
          const ranges = l.filter(
            (m) => m !== bar && m.h >= bar.h / 0.8 && m.x >= b - 1
          );
          const ends = ranges.map((m) => m.x + m.w);
          const want = c.ranges.map((f) => b + k * num(r[f]));
          if (
            ranges.length === 0 ||
            !want.every((e) => ends.some((x) => Math.abs(x - e) <= slack)) ||
            Math.max(...ends) > Math.max(...want) + slack
          ) {
            miss(
              4 * done + 1,
              `the range bands for ${r[c.category]} do not end at its ${c.ranges.join(", ")} (or are not thicker than the bar)`
            );
            continue;
          }
          const top = Math.min(...ranges.map((m) => m.y));
          const y = top + Math.min(2, (bar.y - top) / 2);
          const bounds = [0, ...c.ranges.map((f) => num(r[f]))];
          const inks = c.ranges.map((_, i) => {
            const m = topAt(ranges, [
              b + (k * (bounds[i] + bounds[i + 1])) / 2,
              y,
            ]);
            return m ? ink(m)! : null;
          });
          if (
            inks.some((x) => !x) ||
            colorClusters(inks as RGBA[]).length !== inks.length
          ) {
            miss(
              4 * done + 2,
              `the range bands for ${r[c.category]} are not each their own color`
            );
            continue;
          }
          const tx = b + k * num(r[c.target]);
          const cy = bar.y + bar.h / 2;
          const hit = targets.some(
            (t) =>
              Math.abs(t.pos - tx) <= slack &&
              t.a <= cy &&
              t.b >= cy &&
              t.b - t.a >= 0.9 * bar.h &&
              t.mark !== bar
          );
          if (!hit) {
            miss(
              4 * done + 3,
              `no target mark across the bar for ${r[c.category]} at ${r[c.target]}`
            );
            continue;
          }
          ok = true;
        }
        if (!ok) break;
        done++;
      }
      best = Math.max(best, done);
      if (done === rows.length)
        return {
          pass: true,
          detail: `${rows.length} bullets, top to bottom, with range bands, bars and target marks on one scale`,
        };
    }
  }
  return {
    pass: false,
    detail: `expected ${rows.length} horizontal bullets on one scale; at most ${best} matched${why ? ` (${why})` : ""}`,
  };
}

function checkSunburst(
  c: Extract<Check, { check: "sunburst" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.01;
  const parents = uniqueInOrder(ctx.data, c.parent);
  const leafVals = parents.map((p) =>
    ctx.data
      .filter((r) => String(r[c.parent]) === p)
      .map((r) => num(r[c.value]))
  );
  const totals = leafVals.map((vs) => vs.reduce((a, b) => a + b, 0));
  const total = totals.reduce((a, b) => a + b, 0);
  const nLeaves = leafVals.flat().length;
  let why = "no wedges";
  // Every wedge measured about the chart's one center: a thin wedge's own
  // fitted center drifts when a pad angle offsets its edges.
  const around = sharedCenter(rec);
  const centered: Mark[] = around
    ? around.marks.map((m) => ({
        ...m,
        kind: "wedge",
        wedge: wedgeAbout(m, around.center[0], around.center[1]),
      }))
    : [];
  for (const g of centered.length ? [centered] : []) {
    const ringR0 = clusterValues(
      g.map((w) => w.wedge!.r0),
      3
    );
    const rings = ringR0.map((r0) =>
      g.filter((w) => Math.abs(w.wedge!.r0 - r0) <= 3 + 1e-9)
    );
    for (let i = 0; i + 1 < rings.length; i++) {
      const inner = rings[i];
      if (inner.length !== parents.length) continue;
      const rIn = median(inner.map((w) => w.wedge!.r));
      const outer = rings
        .slice(i + 1)
        .find(
          (ring) =>
            ring.length === nLeaves &&
            Math.abs(ring[0].wedge!.r0 - rIn) <= Math.max(3, 0.05 * rIn)
        );
      if (!outer) {
        why = `an inner ring of ${inner.length} wedges, but no outer ring of ${nLeaves} wedges starting where it ends`;
        continue;
      }
      const full = inner.reduce((a, w) => a + w.wedge!.sweep, 0);
      // Match parents to inner wedges by share (both sorted).
      const byShare = parents
        .map((p, k) => ({ k, share: totals[k] / total }))
        .sort((a, b) => a.share - b.share);
      const wedgesBy = [...inner].sort(
        (a, b) => a.wedge!.sweep - b.wedge!.sweep
      );
      if (
        byShare.some(
          (p, j) => Math.abs(wedgesBy[j].wedge!.sweep / full - p.share) > tol
        )
      ) {
        why = `the inner ring's shares do not match the ${c.parent} totals`;
        continue;
      }
      const wedgeOf = new Map<number, Mark>();
      byShare.forEach((p, j) => wedgeOf.set(p.k, wedgesBy[j]));
      if (colorClusters(inner.map((w) => ink(w)!)).length !== inner.length)
        return {
          pass: false,
          detail: `the inner ring matches, but its wedges share colors`,
        };
      let bad = "";
      for (let k = 0; k < parents.length && !bad; k++) {
        const pw = wedgeOf.get(k)!.wedge!;
        const kids = outer.filter((w) =>
          arcInside(w.wedge!.a0, w.wedge!.sweep, pw.a0, pw.sweep, 1)
        );
        const want = leafVals[k].map((v) => v / total).sort((a, b) => a - b);
        const got = kids
          .map((w) => w.wedge!.sweep / full)
          .sort((a, b) => a - b);
        if (
          got.length !== want.length ||
          want.some((s, j) => Math.abs(s - got[j]) > tol)
        )
          bad = `the outer wedges inside ${parents[k]} do not match its ${c.leaf} shares (${got.length} wedges, expected ${want.length})`;
      }
      if (bad) {
        why = bad;
        continue;
      }
      return {
        pass: true,
        detail: `${parents.length} ${c.parent} wedges and ${nLeaves} ${c.leaf} wedges in two rings, shares match`,
      };
    }
  }
  return {
    pass: false,
    detail: `expected an inner ring of ${parents.length} wedges and an outer ring of ${nLeaves}: ${why}`,
  };
}

function checkWaterfall(
  c: Extract<Check, { check: "waterfall" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.02;
  const amounts = ctx.data.map((r) => num(r[c.value]));
  // Value intervals, left to right: the first bar, the changes, the total.
  const spans: [number, number][] = [];
  let run = 0;
  amounts.forEach((a, i) => {
    const next = run + a;
    spans.push(i === 0 ? [0, a] : [Math.min(run, next), Math.max(run, next)]);
    run = next;
  });
  spans.push([Math.min(0, run), Math.max(0, run)]);
  const kinds = spans.map((_, i) =>
    i === 0 || i === spans.length - 1
      ? "total"
      : amounts[i] >= 0
        ? "up"
        : "down"
  );
  const top = Math.max(...spans.map((s) => s[1]));
  const rects = barCandidates(rec).sort(
    (a, b) => a.x + a.w / 2 - (b.x + b.w / 2)
  );
  let best = 0;
  for (let f = 0; f < rects.length; f++) {
    const first = rects[f];
    const y0 = first.y + first.h;
    const k = first.h / spans[0][1];
    const slack = tol * k * top + 1;
    const fits = (m: Mark, [lo, hi]: [number, number]) =>
      Math.abs(m.y + m.h - (y0 - k * lo)) <= slack &&
      Math.abs(m.y - (y0 - k * hi)) <= slack;
    const got: Mark[] = [first];
    for (let j = f + 1; j < rects.length && got.length < spans.length; j++)
      if (fits(rects[j], spans[got.length])) got.push(rects[j]);
    best = Math.max(best, got.length);
    if (got.length < spans.length) continue;
    const reps = (kind: string) =>
      colorClusters(
        got.filter((_, i) => kinds[i] === kind).map((m) => ink(m)!)
      );
    const [up, down, tot] = ["up", "down", "total"].map(reps);
    if (up.length !== 1 || down.length !== 1 || tot.length !== 1)
      return {
        pass: false,
        detail: `${spans.length} bars match, but increases use ${up.length} colors, decreases ${down.length} and the first and total bars ${tot.length}; expected one each`,
      };
    if (
      colorDist(up[0], down[0]) <= SAME_COLOR ||
      colorDist(up[0], tot[0]) <= SAME_COLOR ||
      colorDist(down[0], tot[0]) <= SAME_COLOR
    )
      return {
        pass: false,
        detail: `${spans.length} bars match, but increases, decreases and totals do not have three different colors`,
      };
    return {
      pass: true,
      detail: `${spans.length} waterfall bars match, with increases, decreases and totals in three colors`,
    };
  }
  return {
    pass: false,
    detail: `expected ${spans.length} waterfall bars left to right; ${rects.length} filled rects, at most ${best} matched in order`,
  };
}

function checkChord(
  c: Extract<Check, { check: "chord" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const nodes: string[] = [];
  for (const r of ctx.data)
    for (const f of [c.source, c.target])
      if (!nodes.includes(String(r[f]))) nodes.push(String(r[f]));
  const totals = nodes.map((n) =>
    ctx.data
      .filter((r) => String(r[c.source]) === n || String(r[c.target]) === n)
      .reduce((a, r) => a + num(r[c.value]), 0)
  );
  const sum = totals.reduce((a, b) => a + b, 0);
  let why = "no ring of node wedges";
  for (const g of wedgesByCenter(rec)) {
    const ring = g.filter((w) => w.wedge!.r0 >= 0.6 * w.wedge!.r);
    if (ring.length !== nodes.length) continue;
    const { cx, cy } = ring[0].wedge!;
    const r0 = median(ring.map((w) => w.wedge!.r0));
    const full = ring.reduce((a, w) => a + w.wedge!.sweep, 0);
    const byShare = nodes
      .map((_, k) => ({ k, share: totals[k] / sum }))
      .sort((a, b) => a.share - b.share);
    const sorted = [...ring].sort((a, b) => a.wedge!.sweep - b.wedge!.sweep);
    if (
      byShare.some(
        (n, j) => Math.abs(sorted[j].wedge!.sweep / full - n.share) > 0.01
      )
    ) {
      why = `the node wedges' shares do not match the nodes' totals`;
      continue;
    }
    if (colorClusters(ring.map((w) => ink(w)!)).length !== ring.length)
      return { pass: false, detail: "the node wedges share colors" };
    const wedgeOf = new Map<string, Mark>();
    byShare.forEach((n, j) => wedgeOf.set(nodes[n.k], sorted[j]));
    // Shares alone cannot tell apart nodes whose totals trade places, so
    // each wedge must also carry its node's label in its direction.
    const texts = rec.marks.filter((m) => m.kind === "text");
    const unlabeled = nodes.filter((n) => {
      const w = wedgeOf.get(n)!.wedge!;
      return !texts.some((t) => {
        if (!t.text!.toLowerCase().includes(n.toLowerCase())) return false;
        const a =
          (Math.atan2(t.y + t.h / 2 - cy, t.x + t.w / 2 - cx) * 180) / Math.PI;
        return arcInside((a + 360) % 360, 0, w.a0, w.sweep, 5);
      });
    });
    if (unlabeled.length > 0)
      return {
        pass: false,
        detail: `the node wedges' shares match, but no label in the direction of the wedge for ${unlabeled.join(", ")}`,
      };
    const degPer = full / sum;
    // Each ribbon's two ends: the two runs of its outline (in drawing order)
    // that stay near its largest radius. Between them the outline dips
    // toward the center, however close the two ends sit on the circle, so
    // the runs are told apart by the outline, not by gaps in angle (which
    // the outline's sampling can make wider than the gap between ends).
    const ends = (m: Mark): { a0: number; sweep: number }[] | null => {
      const polar = m.points!.map((p) => ({
        d: Math.hypot(p[0] - cx, p[1] - cy),
        a: (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI,
      }));
      const rEnd = Math.max(...polar.map((p) => p.d));
      if (rEnd < 0.8 * r0 - 2 || rEnd > r0 + 2) return null;
      const onRim = polar.map((p) => p.d >= rEnd - (1.5 + 0.01 * rEnd));
      const n = polar.length;
      const start = onRim.findIndex((on, i) => !on && onRim[(i + 1) % n]);
      if (start < 0) return null;
      const runs: number[][] = [];
      for (let k = 1; k <= n; k++) {
        const i = (start + k) % n;
        if (!onRim[i]) continue;
        if (!onRim[(i - 1 + n) % n]) runs.push([]);
        runs[runs.length - 1].push(polar[i].a);
      }
      if (runs.length !== 2) return null;
      return runs.map((as) => {
        // Unwrap the angles along the run, then take its extent.
        const un = [as[0]];
        for (let i = 1; i < as.length; i++)
          un.push(
            un[i - 1] + ((((as[i] - as[i - 1] + 180) % 360) + 360) % 360) - 180
          );
        const lo = Math.min(...un);
        return { a0: ((lo % 360) + 360) % 360, sweep: Math.max(...un) - lo };
      });
    };
    const ribbons = filledShapes(rec).filter(
      (m) => m.kind !== "wedge" && m.points && m.points.length >= 4
    );
    const used = new Set<Mark>();
    const missing: string[] = [];
    for (const r of ctx.data) {
      const s = wedgeOf.get(String(r[c.source]))!.wedge!;
      const t = wedgeOf.get(String(r[c.target]))!.wedge!;
      const width = num(r[c.value]) * degPer;
      const slack = Math.max(2, 0.08 * width);
      const inside = (e: { a0: number; sweep: number }, w: typeof s) =>
        arcInside(e.a0, e.sweep, w.a0, w.sweep, 1) &&
        Math.abs(e.sweep - width) <= slack;
      const hit = ribbons.find((m) => {
        if (used.has(m)) return false;
        const e = ends(m);
        return (
          !!e &&
          ((inside(e[0], s) && inside(e[1], t)) ||
            (inside(e[0], t) && inside(e[1], s)))
        );
      });
      if (hit) used.add(hit);
      else missing.push(`${r[c.source]}-${r[c.target]}`);
    }
    if (missing.length > 0)
      return {
        pass: false,
        detail: `${nodes.length} node wedges match, but no ribbon of the right widths joins ${missing.join(", ")}`,
      };
    return {
      pass: true,
      detail: `${nodes.length} node wedges and ${ctx.data.length} ribbons match`,
    };
  }
  return {
    pass: false,
    detail: `expected ${nodes.length} node wedges: ${why}`,
  };
}

function checkDendrogram(
  c: Extract<Check, { check: "dendrogram" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const names = ctx.data.map((r) => String(r[c.name]));
  const parentOf = new Map(
    ctx.data.map((r) => [String(r[c.name]), String(r[c.parent])])
  );
  const heightOf = new Map(
    ctx.data.map((r) => [String(r[c.name]), num(r[c.height])])
  );
  const kids = new Map<string, string[]>();
  for (const n of names) {
    const p = parentOf.get(n)!;
    if (p) kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  const root = names.find((n) => !parentOf.get(n))!;
  const leaves = names.filter((n) => !kids.has(n));
  const segs = strokeSegments(rec);
  const verticals = segs.filter(([p, q]) => Math.abs(p[0] - q[0]) <= 1);
  const texts = rec.marks.filter((m) => m.kind === "text");
  // Each leaf: its label, and the vertical line standing above it.
  const x = new Map<string, number>();
  const bottoms: number[] = [];
  for (const leaf of leaves) {
    const label = texts.find(
      (t) => t.text!.trim().toLowerCase() === leaf.toLowerCase()
    );
    if (!label) return { pass: false, detail: `no label reading "${leaf}"` };
    // The stem stands over the label's box: over its middle for a level
    // label, over its end for one rotated about its end. Of the lines over
    // the box, the leaf's reaches lowest; among equals, the nearest the
    // label's middle.
    const lx = label.x + label.w / 2;
    const bottom = ([p, q]: Pt[]) => Math.max(p[1], q[1]);
    const stem = verticals
      .filter(
        ([p, q]) =>
          p[0] >= label.x - 3 &&
          p[0] <= label.x + label.w + 3 &&
          bottom([p, q]) <= label.y + label.h / 2
      )
      .sort((a, b) =>
        Math.abs(bottom(b) - bottom(a)) > 1
          ? bottom(b) - bottom(a)
          : Math.abs(a[0][0] - lx) - Math.abs(b[0][0] - lx)
      )[0];
    if (!stem)
      return {
        pass: false,
        detail: `no vertical line above the label "${leaf}"`,
      };
    x.set(leaf, (stem[0][0] + stem[1][0]) / 2);
    bottoms.push(Math.max(stem[0][1], stem[1][1]));
  }
  const y0 = median(bottoms);
  const post = (n: string): number => {
    if (x.has(n)) return x.get(n)!;
    const xs = kids.get(n)!.map(post);
    const v = (Math.min(...xs) + Math.max(...xs)) / 2;
    x.set(n, v);
    return v;
  };
  post(root);
  const hRoot = heightOf.get(root)!;
  const rootKids = kids.get(root)!.map((k) => x.get(k)!);
  const [rx0, rx1] = extent(rootKids);
  const distTo = (p: Pt) => Math.min(...segs.map((s) => distToPolyline(p, s)));
  // Candidate heights for the root: horizontal segments above the leaves
  // whose line (possibly drawn in pieces) spans the root's children.
  const tops = clusterValues(
    segs
      .filter(([p, q]) => Math.abs(p[1] - q[1]) <= 1)
      .map(([p, q]) => (p[1] + q[1]) / 2)
      .filter((y) => y < y0 - 5),
    0.5
  ).filter((y) =>
    [0, 0.25, 0.5, 0.75, 1].every(
      (t) => distTo([rx0 + t * (rx1 - rx0), y]) <= 2
    )
  );
  let why = `no horizontal line across the root's children`;
  for (const yr of tops) {
    const k = (y0 - yr) / hRoot;
    const Y = (h: number) => y0 - k * h;
    const reach = Math.max(2, (c.tol ?? 0.01) * (y0 - yr));
    const miss: string[] = [];
    for (const [n, cs] of kids) {
      const yn = Y(heightOf.get(n)!);
      const xs = cs.map((k2) => x.get(k2)!);
      const [a, b] = extent(xs);
      for (const t of [0, 0.25, 0.5, 0.75, 1])
        if (distTo([a + t * (b - a), yn]) > reach) {
          miss.push(`the horizontal line of ${n}`);
          break;
        }
      for (const ch of cs) {
        const yc = Y(heightOf.get(ch)!);
        for (const t of [0.1, 0.5, 0.9])
          if (distTo([x.get(ch)!, yc + t * (yn - yc)]) > reach) {
            miss.push(`the vertical line from ${ch} to ${n}`);
            break;
          }
      }
    }
    if (miss.length === 0)
      return {
        pass: true,
        detail: `${leaves.length} labeled leaves and ${kids.size} elbows at their heights`,
      };
    why = `${miss.length} lines are missing or off: ${miss.slice(0, 3).join("; ")}${miss.length > 3 ? "; ..." : ""}`;
  }
  return { pass: false, detail: `leaves found, but ${why}` };
}

function checkAlluvial(
  c: Extract<Check, { check: "alluvial" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const tol = c.tol ?? 0.05;
  const cats = c.steps.map((f) => uniqueInOrder(ctx.data, f));
  const sumWhere = (pred: (r: Row) => boolean) =>
    ctx.data.filter(pred).reduce((a, r) => a + num(r[c.value]), 0);
  const totals = c.steps.map((f, s) =>
    cats[s].map((v) => sumWhere((r) => String(r[f]) === v))
  );
  const grand = totals[0].reduce((a, b) => a + b, 0);
  // Node rects: filled or only outlined (a node drawn as an outline, with
  // the ribbons' colors showing through it, is a node too).
  const rects = rec.marks.filter(
    (m) => m.kind === "rect" && !isBackground(m, rec)
  );
  // Columns: rects sharing one x extent (within 1.5px), left to right.
  const columns: Mark[][] = [];
  for (const m of rects) {
    const col = columns.find(
      (col) =>
        Math.abs(col[0].x - m.x) <= 1.5 && Math.abs(col[0].w - m.w) <= 1.5
    );
    if (col) col.push(m);
    else columns.push([m]);
  }
  // In each column, rects drawn inside another (the ribbons' slices through
  // an outlined node, or a second copy of a node) belong to the outer one:
  // keep only the outermost, largest first.
  const inside = (m: Mark, o: Mark) =>
    m.y >= o.y - 0.5 && m.y + m.h <= o.y + o.h + 0.5;
  for (const col of columns) {
    const kept: Mark[] = [];
    for (const m of [...col].sort((a, b) => b.h - a.h))
      if (!kept.some((o) => inside(m, o))) kept.push(m);
    col.splice(0, col.length, ...kept.sort((a, b) => a.y - b.y));
  }
  columns.sort((a, b) => a[0].x - b[0].x);
  // One column per step, in order; k from the first column's total height.
  const picked: Mark[][] = [];
  let k = NaN;
  let ci = 0;
  for (let s = 0; s < c.steps.length; s++) {
    let found = false;
    for (; ci < columns.length && !found; ci++) {
      const col = columns[ci];
      if (col.length !== cats[s].length) continue;
      const kk = Number.isNaN(k) ? col.reduce((a, m) => a + m.h, 0) / grand : k;
      if (
        col.every(
          (m, i) =>
            Math.abs(m.h - kk * totals[s][i]) <=
            Math.max(2, tol * kk * totals[s][i])
        )
      ) {
        k = kk;
        picked.push(col);
        found = true;
      }
    }
    if (!found)
      return {
        pass: false,
        detail: `expected a column of ${cats[s].length} ${c.steps[s]} nodes (${cats[s].join(", ")}, top to bottom, heights proportional to their totals); found ${picked.length} of ${c.steps.length} columns`,
      };
  }
  const nodes = new Set(picked.flat());
  const bands = filledShapes(rec).filter((m) => !nodes.has(m));
  const INSET = 3;
  const sectionAt = (m: Mark, edge: number, inward: 1 | -1) => {
    const s1 = crossSection(m, edge + inward * INSET, true);
    const s2 = crossSection(m, edge + inward * 2 * INSET, true);
    if (!s1 || !s2) return null;
    return [0, 1].map((i) => 2 * s1[i] - s2[i]) as [number, number];
  };
  const within = (sec: [number, number], m: Mark) =>
    sec[0] >= m.y - 2 && sec[1] <= m.y + m.h + 2;
  // Pieces: in each gap, every band's cross-sections where it leaves the
  // left column and reaches the right one, with those nodes. A band drawn
  // across several gaps (one path per ribbon) is a piece in each.
  interface Piece {
    a: [number, number];
    b: [number, number];
    from: number;
    to: number;
    mark: Mark;
    /** The first step's category of the ribbon this piece belongs to. */
    first?: string;
  }
  const pieces: Piece[][] = [];
  for (let s = 0; s + 1 < c.steps.length; s++) {
    const left = picked[s];
    const right = picked[s + 1];
    const e0 = left[0].x + left[0].w;
    const e1 = right[0].x;
    if (e1 - e0 < 4 * INSET)
      return {
        pass: false,
        detail: `the gap between the ${c.steps[s]} and ${c.steps[s + 1]} columns is under ${4 * INSET}px`,
      };
    const ps: Piece[] = [];
    for (const m of bands) {
      const a = sectionAt(m, e0, 1);
      const b = sectionAt(m, e1, -1);
      if (!a || !b) continue;
      const from = left.findIndex((n) => within(a, n));
      const to = right.findIndex((n) => within(b, n));
      if (from < 0 || to < 0) continue;
      const [ta, tb] = [a[1] - a[0], b[1] - b[0]];
      if (Math.abs(ta - tb) > Math.max(2, 0.05 * Math.max(ta, tb)))
        return {
          pass: false,
          detail: `a band from ${cats[s][from]} to ${cats[s + 1][to]} is ${ta.toFixed(1)}px thick where it leaves and ${tb.toFixed(1)}px where it arrives`,
        };
      ps.push({ a, b, from, to, mark: m });
    }
    pieces.push(ps);
  }
  for (const p of pieces[0]) p.first = cats[0][p.from];
  // Through each middle node: cut the node at every end of a piece that
  // arrives or leaves, and follow each slice from the piece arriving there
  // to the piece leaving there. A ribbon keeps its slot, so every slice of
  // an arriving piece leaves toward one node, and every slice of a leaving
  // piece came from one node. Pieces may be split (lodes), so a ribbon may
  // be several pieces side by side.
  const problems: string[] = [];
  for (let s = 1; s + 1 < c.steps.length; s++) {
    picked[s].forEach((_, j) => {
      const here = cats[s][j];
      const ins = pieces[s - 1].filter((p) => p.to === j);
      const outs = pieces[s].filter((p) => p.from === j);
      const cuts = clusterValues(
        [...ins.flatMap((p) => p.b), ...outs.flatMap((p) => p.a)],
        0.75
      );
      const thick = new Map<string, number>();
      const targets = new Map<Piece, Set<number>>();
      const sources = new Map<Piece, Set<string>>();
      for (let i = 0; i + 1 < cuts.length; i++) {
        if (cuts[i + 1] - cuts[i] < 0.75) continue;
        const mid = (cuts[i] + cuts[i + 1]) / 2;
        const pin = ins.find((p) => p.b[0] <= mid && mid <= p.b[1]);
        const pout = outs.find((p) => p.a[0] <= mid && mid <= p.a[1]);
        if (!pin && !pout) continue;
        if (!pin || !pout) {
          problems.push(
            `at ${here}, a band ${pin ? "arrives" : "leaves"} at ${mid.toFixed(0)}px with no band ${pin ? "leaving" : "arriving"} at that height`
          );
          continue;
        }
        targets.set(pin, (targets.get(pin) ?? new Set()).add(pout.to));
        const src = `${pin.first}|${pin.from}`;
        sources.set(pout, (sources.get(pout) ?? new Set()).add(src));
        pout.first = pin.first;
        const key = `${pin.from}|${pout.to}`;
        thick.set(key, (thick.get(key) ?? 0) + cuts[i + 1] - cuts[i]);
      }
      for (const [p, t] of targets)
        if (t.size > 1)
          problems.push(
            `a band arriving at ${here} from ${cats[s - 1][p.from]} leaves toward ${t.size} different ${c.steps[s + 1]} nodes`
          );
      for (const [p, f] of sources)
        if (f.size > 1)
          problems.push(
            `a band leaving ${here} toward ${cats[s + 1][p.to]} gathers ${f.size} different ribbons`
          );
      cats[s - 1].forEach((A, ai) =>
        cats[s + 1].forEach((B, bi) => {
          const want = sumWhere(
            (r) =>
              String(r[c.steps[s - 1]]) === A &&
              String(r[c.steps[s]]) === here &&
              String(r[c.steps[s + 1]]) === B
          );
          const got = thick.get(`${ai}|${bi}`) ?? 0;
          if (Math.abs(got - k * want) > Math.max(2.5, tol * k * want))
            problems.push(
              `${A} to ${here} to ${B} (${want}) is ${got.toFixed(1)}px thick through ${here}, expected ${(k * want).toFixed(1)}px`
            );
        })
      );
    });
  }
  if (problems.length > 0)
    return {
      pass: false,
      detail: `${c.steps.length} columns of nodes match, but the ribbons do not run through: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; ..." : ""}`,
    };
  const byFirst = cats[0].map((v) =>
    pieces
      .flat()
      .filter((p) => p.first === v)
      .map((p) => p.mark)
  );
  const colors = seriesColorsConsistent(byFirst, cats[0]);
  if (!colors.pass)
    return {
      pass: false,
      detail: `the ribbons run through, but they are not colored by ${c.steps[0]} along their length: ${colors.detail}`,
    };
  return {
    pass: true,
    detail: `${c.steps.length} columns of nodes, and ribbons that keep their slot through the middle nodes, colored by ${c.steps[0]}`,
  };
}

function checkSpine(
  c: Extract<Check, { check: "spine" }>,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  const { categories, series, values } = seriesValues(c, ctx.data);
  const tol = c.tol ?? 0.03;
  const left = values.map((v) => -v[0]);
  const right = values.map((v) => v[1]);
  const opts = { ordered: true, direction: "forward" as const, tol };
  let best = 0;
  for (const group of barsByBaseline(barCandidates(rec), "horizontal")) {
    const L = matchBars([group.filter((b) => b.len < 0)], left, opts);
    const R = matchBars([group.filter((b) => b.len > 0)], right, opts);
    best = Math.max(best, Math.min(L.best, R.best));
    if (
      L.bars.length !== categories.length ||
      R.bars.length !== categories.length
    )
      continue;
    const k = (bars: Bar[], vs: number[]) =>
      median(bars.map((b, i) => b.len / vs[i]));
    const kl = k(L.bars, left);
    const kr = k(R.bars, right);
    if (Math.abs(kl - kr) > tol * Math.max(kl, kr))
      return {
        pass: false,
        detail: `both sides match, but on different scales (${kl.toFixed(2)} and ${kr.toFixed(2)} px per unit)`,
      };
    const apart = L.bars.findIndex(
      (b, i) =>
        Math.abs(b.pos - R.bars[i].pos) >
        Math.max(2, 0.25 * Math.min(b.mark.h, R.bars[i].mark.h))
    );
    if (apart >= 0)
      return {
        pass: false,
        detail: `both sides match, but the two bars for ${categories[apart]} are not on one line`,
      };
    const colors = seriesColorsConsistent(
      [L.bars.map((b) => b.mark), R.bars.map((b) => b.mark)],
      series
    );
    if (!colors.pass) return colors;
    return {
      pass: true,
      detail: `${categories.length} pairs of bars, ${series[0]} to the left and ${series[1]} to the right`,
    };
  }
  return {
    pass: false,
    detail: `expected ${categories.length} pairs of back-to-back bars (${series[0]} left, ${series[1]} right); at most ${best} matched on one baseline`,
  };
}

export function runCheck(
  c: Check,
  rec: RenderRecord,
  ctx: CheckContext
): CheckResult {
  switch (c.check) {
    case "bars":
      return checkBars(c, rec, ctx);
    case "groupedBars":
      return checkGroupedBars(c, rec, ctx);
    case "stackedBars":
      return checkStackedBars(c, rec, ctx);
    case "points":
      return checkPoints(c, rec, ctx);
    case "lineSeries":
      return checkLineSeries(c, rec, ctx);
    case "annotation":
      return checkAnnotation(c, rec, ctx);
    case "referenceLine":
      return checkReferenceLine(c, rec, ctx);
    case "wedges":
      return checkWedges(c, rec, ctx);
    case "pieGlyphs":
      return checkPieGlyphs(c, rec, ctx);
    case "ridgeline":
      return checkRidgeline(c, rec, ctx);
    case "bottleFill":
      return checkBottleFill(c, rec, ctx);
    case "imageFill":
      return checkImageFill(c, rec, ctx);
    case "circlePack":
      return checkCirclePack(c, rec, ctx);
    case "treemapCircles":
      return checkTreemapCircles(c, rec, ctx);
    case "textIncludes":
      return checkTextIncludes(c, rec);
    case "distinctColors":
      return checkDistinctColors(c, rec);
    case "sizeAbout":
      return checkSize(c, rec, ctx);
    case "mosaic":
      return checkMosaic(c, rec, ctx);
    case "waffle":
      return checkWaffle(c, rec, ctx);
    case "unitBlocks":
      return checkUnitBlocks(c, rec, ctx);
    case "ribbons":
      return checkRibbons(c, rec, ctx);
    case "signedArea":
      return checkSignedArea(c, rec, ctx);
    case "heatmap":
      return checkHeatmap(c, rec, ctx);
    case "hexbin":
      return checkHexbin(c, rec, ctx);
    case "lollipop":
      return checkLollipop(c, rec, ctx);
    case "strips":
      return checkStrips(c, rec, ctx);
    case "beeswarm":
      return checkBeeswarm(c, rec, ctx);
    case "stackedArea":
      return checkStackedArea(c, rec, ctx);
    case "radialBars":
      return checkRadialBars(c, rec, ctx);
    case "bullet":
      return checkBullet(c, rec, ctx);
    case "sunburst":
      return checkSunburst(c, rec, ctx);
    case "waterfall":
      return checkWaterfall(c, rec, ctx);
    case "chord":
      return checkChord(c, rec, ctx);
    case "dendrogram":
      return checkDendrogram(c, rec, ctx);
    case "alluvial":
      return checkAlluvial(c, rec, ctx);
    case "spine":
      return checkSpine(c, rec, ctx);
  }
}

export interface ChecksOutcome {
  pass: boolean;
  results: (CheckResult & { check: string })[];
}

export function runChecks(
  checks: Check[],
  rec: RenderRecord,
  ctx: CheckContext
): ChecksOutcome {
  const results = checks.map((c) => ({
    check: c.check,
    ...runCheck(c, rec, ctx),
  }));
  return { pass: results.every((r) => r.pass), results };
}

// ---------------------------------------------------------------------------
// Preservation (edit tasks)
// ---------------------------------------------------------------------------

const NUMERIC = /^[-−+]?[$€£]?[\d.,\s]+(%|[kKMB])?$/;

/** A direction arrow at either end of an axis title, which Observable Plot
 *  adds ("↑ count", "count →"). It points along the title's axis, so it
 *  changes when a title moves to the other axis; the title's words do not. */
const AXIS_ARROW = /^[↑↓←→]\s*|\s*[↑↓←→]$/g;

function wordSet(rec: RenderRecord): Set<string> {
  return new Set(
    rec.marks
      .filter((m) => m.kind === "text" && !NUMERIC.test(m.text!))
      .map((m) => m.text!.replace(AXIS_ARROW, ""))
  );
}

function kindCounts(rec: RenderRecord): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of dataMarks(rec)) out[m.kind] = (out[m.kind] ?? 0) + 1;
  return out;
}

/**
 * Did an edit leave alone what it was not asked to change? Compares the
 * base task's reference render with the edited render on each aspect not in
 * `mayChange` (see `Aspect` in tasks.ts). Deliberately coarse for v0: it
 * compares sets and counts, not geometry, since any requested layout change
 * moves every mark.
 */
export function preserved(
  base: RenderRecord,
  edited: RenderRecord,
  mayChange: Aspect[]
): ChecksOutcome {
  const results: (CheckResult & { check: string })[] = [];
  if (!mayChange.includes("colors")) {
    const a = colorClusters(dataMarks(base).map((m) => ink(m)!));
    const b = colorClusters(dataMarks(edited).map((m) => ink(m)!));
    const lost = a.filter((c) => !b.some((d) => colorDist(c, d) <= SAME_COLOR));
    const added = b.filter(
      (c) => !a.some((d) => colorDist(c, d) <= SAME_COLOR)
    );
    results.push({
      check: "keep colors",
      pass: lost.length === 0 && added.length === 0,
      detail: `lost [${lost.map(rgbaText).join(" ")}] added [${added.map(rgbaText).join(" ")}]`,
    });
  }
  if (!mayChange.includes("text")) {
    const a = wordSet(base);
    const b = wordSet(edited);
    const lost = [...a].filter((t) => !b.has(t));
    const added = [...b].filter((t) => !a.has(t));
    results.push({
      check: "keep text",
      pass: lost.length === 0 && added.length === 0,
      detail: `lost ${JSON.stringify(lost)} added ${JSON.stringify(added)}`,
    });
  }
  if (!mayChange.includes("marks")) {
    const a = kindCounts(base);
    const b = kindCounts(edited);
    const same = [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
      (k) => a[k] === b[k]
    );
    results.push({
      check: "keep marks",
      pass: same,
      detail: `${JSON.stringify(a)} -> ${JSON.stringify(b)}`,
    });
  }
  if (!mayChange.includes("size")) {
    const a = base.svgs[0];
    const b = edited.svgs[0];
    const same =
      !!a &&
      !!b &&
      Math.abs(a.w - b.w) <= 0.03 * a.w &&
      Math.abs(a.h - b.h) <= 0.03 * a.h;
    results.push({
      check: "keep size",
      pass: same,
      detail: `${a?.w}x${a?.h} -> ${b?.w}x${b?.h}`,
    });
  }
  return { pass: results.every((r) => r.pass), results };
}

/**
 * The library-neutral record of a rendered chart.
 *
 * Every arm's output (GoFish, Recharts, D3, and matplotlib's SVG file) is
 * loaded into the same Chromium page and read by the same extractor
 * (extract.ts), so the checks (checks.ts) only ever see this shape. All
 * coordinates are CSS pixels relative to the top-left of the render container,
 * rounded to 0.1px.
 */

/** Normalized color: r, g, b in 0-255 and a in 0-1. `a` already folds in the
 *  `fill-opacity`/`stroke-opacity` of the element and the `opacity` of the
 *  element and all its ancestors. */
export type RGBA = [number, number, number, number];

export type MarkKind =
  /** Axis-aligned rectangle (a <rect>, or any closed shape whose area fills
   *  its bounding box, which tolerates path encodings and rounded corners). */
  | "rect"
  /** Round closed shape: <circle>, round <ellipse>, or a round path. */
  | "circle"
  /** Pie or donut slice: a closed shape made of a circular arc and straight
   *  edges (or two concentric arcs). Best effort. */
  | "wedge"
  /** A single straight segment. */
  | "line"
  /** Any other geometry (polylines, curves, areas, multi-part paths). */
  | "path"
  /** Text, from SVG <text> or from HTML text inside the container. */
  | "text";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mark extends Box {
  kind: MarkKind;
  /** Source element tag, for debugging only. Checks must not read it. */
  tag: string;
  fill: RGBA | null;
  stroke: RGBA | null;
  strokeWidth: number;
  /** The stroke's dash pattern (`stroke-dasharray`, in the element's own
   *  units), present only when the mark has a stroke and a pattern. */
  dash?: number[];
  /** Clip paths and masks the mark is drawn through (its own and its
   *  ancestors'): one entry per clip or mask, each a list of polygons in
   *  container coordinates. The mark shows only where it is inside some
   *  polygon of every entry. The box above is already cut to these regions'
   *  bounding boxes; `points` and `wedge` describe the unclipped shape. */
  clip?: [number, number][][][];
  text?: string;
  /** For `line`, `path` and `wedge`, and for a `rect` drawn by anything
   *  but a <rect> element: points sampled along the geometry, in order. */
  points?: [number, number][];
  /** For `wedge`: center, outer radius, inner radius (0 for a pie slice),
   *  and the start angle and sweep in degrees (screen angles, clockwise from
   *  the positive x axis). */
  wedge?: {
    cx: number;
    cy: number;
    r: number;
    r0: number;
    a0: number;
    sweep: number;
  };
}

export interface RenderRecord {
  /** Bounding boxes of the <svg> elements in the container (largest first). */
  svgs: Box[];
  marks: Mark[];
  /** Absolute path of the PNG screenshot of the container, at 1 CSS px per
   *  pixel, in the same coordinates as the marks. Set by render.ts after
   *  the picture is read; checks that judge rendered pixels (compositing,
   *  blending, images) read it. */
  screenshot?: string;
}

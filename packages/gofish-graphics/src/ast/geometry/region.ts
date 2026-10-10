// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * A region (#1059): the space a parent gives a child to lay itself out in,
 * handed down with the size proposal in the layout call
 * (`GoFishNode.layout(size, scales, region)`).
 *
 * It is the top-down twin of the geometry queries in this folder, which a
 * laid-out node answers about itself: a box, plus an optional closed
 * outline. Two things differ.
 *
 *  - The box may be partial. A parent that divides only one axis (a 1D
 *    `partition`) gives a span on that axis and nothing on the other, where
 *    the child is placed as it would be without a region. So the box is one
 *    optional `[min, max]` per axis, not a {@link Box}.
 *  - It is in the frame the child is placed in: its parent's frame, in the
 *    axis order of whoever holds it (the parent, as it builds it; the child,
 *    once `GoFishNode.layout` has read it into the child's own axis order).
 *
 * A node that gets a region places itself in it on each axis that has a span:
 * it fills the span if it has no size of its own there (it was laid out in
 * the span's length), and is centered in it if it has one. A `partition`
 * hands each child the region it was given, cut down to the child's cell.
 *
 * The outline is a polygon inside the box, for a region that is not a box (a
 * hexagon, a Voronoi cell). A `region` mark draws it; every other node places
 * itself by the box. Today nothing makes an outline yet: `Bin.hex` and
 * `Bin.voronoi` will (#1059 part B).
 */
export type Span = readonly [number, number];
export type Point = readonly [number, number];

export type Region = {
  /** Per axis, the span `[min, max]` (`min <= max`) the child is placed in,
   *  or undefined where the parent gives no span. */
  readonly spans: readonly [Span | undefined, Span | undefined];
  /** A closed outline inside the spans, or undefined for a box. Only a
   *  region with a span on both axes has one. */
  readonly outline?: readonly Point[];
};

/** A span read the other way along its axis (`v ↦ −v`): its ends swap. */
const reflectSpan = (s: Span | undefined): Span | undefined =>
  s === undefined ? undefined : [-s[1], -s[0]];

/**
 * The same region in an axis order whose y runs the other way: what a child
 * whose y direction differs from its parent's reads (see `axisDirection.ts`).
 * Both orders measure from the parent's origin, as a node's `translate`
 * does, so the reflection is about 0.
 */
export function reflectRegionY(region: Region): Region {
  return {
    spans: [region.spans[0], reflectSpan(region.spans[1])],
    outline: region.outline?.map(([x, y]) => [x, -y] as const),
  };
}

/** Whether a region gives a span on any axis. */
export const hasSpan = (region: Region | undefined): region is Region =>
  region !== undefined &&
  (region.spans[0] !== undefined || region.spans[1] !== undefined);

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * Shape geometry: what a laid-out node can say about its shape beyond its box.
 * `GoFishNode.geometry()` returns a {@link Geometry} in the node's LOCAL layout
 * frame (the frame of `intrinsicDims`, with no translate applied). Every query
 * except `box` is optional. Consumers call the query's helper (for example
 * {@link enclosingCircle}), which falls back to the box when a shape does not
 * answer. Each query lives in its own file and joins the interface below with
 * `extends`.
 *
 * Geometry is available only after layout. A sizing-time form, so that an
 * operator like `pack` can fit itself to the space it is given, is #967.
 */
import type { HasBox } from "./box";
import type { HasEnclosingCircle } from "./enclosingCircle";

export interface Geometry extends HasBox, HasEnclosingCircle {}

export { boxOfDims } from "./box";
export type { Box, HasBox } from "./box";
export {
  enclosingCircle,
  circleAroundBox,
  translateCircle,
} from "./enclosingCircle";
export type { Circle, HasEnclosingCircle } from "./enclosingCircle";
export { reflectRegionY, rebaseRegion, hasSpan } from "./region";
export type { Region, Span, Point } from "./region";

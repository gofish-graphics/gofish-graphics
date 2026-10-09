// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { MaybeValue } from "../data";
import type { GoFishNode } from "../_node";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";
import { Rect } from "./rect";

/** What a region takes: paint only. Its shape is the space it is given. */
export type RegionProps = {
  key?: string;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
  filter?: string;
};

/**
 * `region()`'s node (#1059): it draws the region its parent gives it, such as
 * a `partition`'s cell, and has no size or position of its own.
 *
 * A region reaches a child as its layout proposal: the box the parent lays
 * it out in (a partition's region constraint, `PositionRegion`), and the
 * placement that centers it there. Today every region is a box, so a region
 * is a rect with no size of its own, which fills the box on both axes.
 *
 * TODO(#1059 part B): a hexagon or a Voronoi cell is a box plus an outline,
 * the same shape the `boundary` geometry query (#974) returns, but handed
 * from parent to child. The outline would ride the layout proposal next to
 * the box, and this node would draw it as a path, falling back to the box
 * when there is none, as `boundary` falls back to the box corners.
 */
export const Region = (opts: RegionProps): GoFishNode => {
  const node = Rect(opts);
  node.type = "region";
  return node;
};

/** The `region` mark: draws the region its parent gives it (a partition's
 *  cell). IR type `region`. */
export const region = createMark(Region, MARK_CHANNELS.region, "region");

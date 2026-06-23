// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * The lower emit driver — turns a resolved, baked scenegraph into a flat
 * display-list item array.
 *
 * Exact structural mirror of `renderBaked()` in `gofish.tsx`: `bake(root)`
 * flattens + globally z-orders the tree into `{node, transform}` entries, and
 * each node lowers itself (and its boundary subtree) at its absolute transform
 * via {@link GoFishNode.INTERNAL_lower}. The per-shape `scale(1,-1)` and the
 * root flip are folded into `toPixel` (set on the render session by the caller).
 */

import type { DisplayList } from "gofish-ir";
import type { GoFishNode } from "../_node";
import { bake } from "../coordinateTransforms/bake";

export const lowerToDisplayList = (
  root: GoFishNode
): DisplayList.DisplayItem[] =>
  bake(root).flatMap((d) => d.node.INTERNAL_lower(undefined, d.transform));

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * The lower emit driver — turns a resolved, baked scenegraph into a flat
 * display-list item array.
 *
 * Exact structural mirror of `renderBaked()` in `gofish.tsx`: `bake(root)`
 * flattens + z-orders the tree into `{node, transform}` entries, and each node
 * lowers itself (and its boundary subtree) at its absolute transform via
 * {@link GoFishNode.INTERNAL_lower}. Layout geometry is already y-down pixels,
 * so `toPixel` only adds the gutter offset.
 */

import type { DisplayList } from "gofish-ir";
import type { GoFishNode, ToPixel } from "../_node";
import { bake } from "../coordinateTransforms/bake";

/** Drive the lower emit: install `toPixel` on the render session and lower
 *  every baked draw entry at its absolute transform. */
export const lowerToDisplayList = (
  root: GoFishNode,
  toPixel: ToPixel
): DisplayList.DisplayItem[] => {
  const session = root.getRenderSession();
  session.toPixel = toPixel;
  return bake(root).flatMap((d) =>
    d.node.INTERNAL_lower(undefined, d.transform)
  );
};

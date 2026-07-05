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
import type { GoFishNode, ToPixel } from "../_node";
import type { FlipScope } from "../_displayObject";
import { bake } from "../coordinateTransforms/bake";

/**
 * Drive the lower emit (issue #629). Each baked draw entry carries its
 * y-orientation scope (`d.flip`); the driver installs the entry's `toPixel`
 * (and declared `flipsY`) on the shared render session just before lowering it,
 * so a continuous-y subtree mirrors within its own placed band while an
 * ordinal-y neighbor stays y-down. `toPixelFor` maps a scope → pixel map (built
 * by `render()`/`toDisplayList` from the viewport). `ambientFlip` seeds the
 * root scope (`options.yUp` forces a global y-up ambient).
 */
export const lowerToDisplayList = (
  root: GoFishNode,
  toPixelFor: (flip?: FlipScope) => ToPixel,
  ambientFlip?: FlipScope
): DisplayList.DisplayItem[] => {
  const session = root.getRenderSession();
  return bake(root, ambientFlip).flatMap((d) => {
    session.toPixel = toPixelFor(d.flip);
    session.flipsY = d.flip !== undefined;
    return d.node.INTERNAL_lower(undefined, d.transform);
  });
};

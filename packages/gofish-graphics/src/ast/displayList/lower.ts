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
import { mirrorY } from "../_displayObject";
import { bake } from "../coordinateTransforms/bake";
import { installFlip } from "./lowerHelpers";

/**
 * Build the per-scope `toPixel` factory (issue #629) shared by every render
 * terminal. Given the ambient y-DOWN base map (`baseDown`, gutter reserves
 * only), returns `flip → ToPixel`: `undefined` passes through y-down; a
 * `FlipScope` mirrors y about its band (`mirrorY`) before the base offset. The
 * SVG paint path (`render`), the display-list export (`toDisplayList`), and the
 * bake chrome box-mirror all read the mirror formula from this one place, so the
 * paint and export paths cannot diverge.
 *
 * The per-scope maps are memoized on `FlipScope` object identity (undefined → the
 * shared y-down base): inherited scopes share identity, so a whole subtree that
 * lowers under one scope reuses a single closure instead of reallocating per
 * baked entry.
 */
export const makeToPixelFor = (
  baseDown: ToPixel
): ((flip?: FlipScope) => ToPixel) => {
  const cache = new Map<FlipScope | undefined, ToPixel>([
    [undefined, baseDown],
  ]);
  return (flip?: FlipScope): ToPixel => {
    const memo = cache.get(flip);
    if (memo) return memo;
    const map: ToPixel = ([gx, gy]) => baseDown([gx, mirrorY(flip!, gy)]);
    cache.set(flip, map);
    return map;
  };
};

/**
 * Drive the lower emit (issue #629). Each baked draw entry carries its
 * y-orientation scope (`d.flip`); the driver installs the entry's scope and
 * `toPixel` (via `installFlip`) on the shared render session just before lowering
 * it, so a continuous-y subtree mirrors within its own placed band while an
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
  // Publish the scope factory so a bake boundary can re-lower its child subtree
  // through the same scope walk and install each descendant scope's own map (#629).
  session.toPixelFor = toPixelFor;
  return bake(root, ambientFlip).flatMap((d) => {
    installFlip(session, d.flip);
    return d.node.INTERNAL_lower(undefined, d.transform);
  });
};

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * `toDisplayList` — the post-layout *render IR* emitter.
 *
 * Where {@link toJSON} serializes a chart's *spec* (the frontend IR, pre-layout,
 * viewport-independent), `toDisplayList` runs the full layout + bake at a given
 * viewport and lowers every node into a flat list of positioned primitives in
 * **final, absolute, y-down pixels** — the {@link DisplayList.DisplayListDocument}
 * a non-SVG backend (Canvas, WebGPU) or a foreign host (Semiotic) consumes.
 *
 * Coordinate model. Layout geometry is already SVG-native y-DOWN pixels (a
 * continuous y axis grows upward because its operators place it that way, see
 * `axisDirection.ts`), and layout places the graphic on the canvas, so a
 * layout point `(gx, gy)` is its screen point (`canvasToPixel`). The display
 * list needs no further transform — the reference SVG backend
 * (`DisplayList.displayListToSVG`) emits it verbatim.
 *
 * Each primitive owns its lowering (`lower` on the factory → `INTERNAL_lower`);
 * this module only drives layout, reads the viewport, and walks
 * the bake. See /internals/core/rendering.
 */

import type { DisplayList } from "gofish-ir";
import { canvasToPixel, runLayout, type GoFishRenderOptions } from "../gofish";
import { GoFishNode } from "../_node";
import { lowerToDisplayList } from "./lower";
import { reportLayoutWarnings } from "../layoutWarnings";

/**
 * Run layout + bake at `{w, h}` and emit the display list. Async because the
 * layout pass is (font readiness, derived data).
 */
export async function toDisplayList(
  child: GoFishNode | Promise<GoFishNode>,
  options: GoFishRenderOptions
): Promise<DisplayList.DisplayListDocument> {
  const data = await runLayout(options, child);
  reportLayoutWarnings(data.warnings);
  return {
    irVersion: 0,
    ir: "gofish-display-list",
    viewport: { w: data.width, h: data.height },
    items: lowerToDisplayList(data.child, canvasToPixel),
  };
}

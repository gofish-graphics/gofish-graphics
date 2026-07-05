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
 * Coordinate model. The default frame is SVG-native y-DOWN (top-left origin): a
 * GoFish-space point `(gx, gy)` lands at `(gx + leftReserve, gy + topReserve)` —
 * no flip, so a vertical list reads top→bottom. A `chart()` renders y-UP
 * (`options.yUp`, threaded from the builder): the root mirrors y about the
 * canvas height, `(gx + leftReserve, height + topReserve - gy)` — bars grow up,
 * the y-axis increases upward — reproducing the legacy global flip (issue
 * #143/#16). The emitter bakes the pixel mapping (`toPixel`) into every
 * coordinate, so the display list needs no further transform — the reference SVG
 * backend (`DisplayList.displayListToSVG`) emits it verbatim.
 *
 * Each primitive owns its lowering (`lower` on the factory → `INTERNAL_lower`);
 * this module only drives layout, computes the viewport + `toPixel`, and walks
 * the bake. See /internals/core/rendering.
 */

import type { DisplayList } from "gofish-ir";
import type { ToPixel } from "../_node";
import type { FlipScope } from "../_displayObject";
import { runLayout, type GoFishRenderOptions } from "../gofish";
import { GoFishNode } from "../_node";
import { lowerToDisplayList } from "./lower";

const PADDING = 40;
const EDGE_GAP = 8;

/** Replicates the gutter reserve in `gofish.tsx` `render()`. */
const reserve = (overhang: number, pad: number): number =>
  overhang > 0 ? Math.ceil(Math.max(pad, overhang + EDGE_GAP)) : pad;

/**
 * Run layout + bake at `{w, h}` and emit the display list. Async because the
 * layout pass is (font readiness, derived data).
 */
export async function toDisplayList(
  child: GoFishNode | Promise<GoFishNode>,
  options: GoFishRenderOptions
): Promise<DisplayList.DisplayListDocument> {
  const pad = options.padding ?? PADDING;
  const data = await runLayout(options, child);

  const leftReserve = reserve(data.leftOverhang, pad);
  const topReserve = reserve(data.topOverhang, pad);
  const bottomReserve = reserve(data.bottomOverhang, pad);

  const viewport = {
    w:
      leftReserve +
      data.width +
      data.rightOverhang +
      reserve(data.rightContentOverhang, pad),
    h: topReserve + data.height + bottomReserve,
  };

  // Ambient frame is SVG-native y-DOWN (top-left origin): the base map only
  // offsets by the gutter reserves. Orientation is a PER-SCOPE property resolved
  // at bake time (issue #629): each draw entry carries the placed y-band it draws
  // in (`d.flip`) and `toPixelFor` mirrors its y about that band, so a continuous
  // chart grows up while an ordinal-y neighbor stays y-down. `options.yUp` (via
  // `data.yUp`) forces a GLOBAL y-up ambient (mirror about the whole canvas).
  const baseDown: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
  const toPixelFor = (flip?: FlipScope): ToPixel =>
    flip === undefined
      ? baseDown
      : ([gx, gy]) => baseDown([gx, 2 * flip.baseY + flip.height - gy]);
  const ambientFlip: FlipScope | undefined = data.yUp
    ? { baseY: 0, height: data.height }
    : undefined;

  return {
    irVersion: 0,
    ir: "gofish-display-list",
    viewport,
    items: lowerToDisplayList(data.child, toPixelFor, ambientFlip),
  };
}

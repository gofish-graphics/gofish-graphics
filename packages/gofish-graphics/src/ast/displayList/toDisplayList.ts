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
 * Coordinate model. GoFish lays out in a y-up frame and flips once at the SVG
 * root (`scale(1,-1) translate(leftReserve, -(height+topReserve))`). Composing
 * that root flip with each mark's local flip, a GoFish-space point `(gx, gy)`
 * lands at the SVG pixel `(gx + leftReserve, (height + topReserve) - gy)`. The
 * emitter bakes that mapping (`toPixel`) into every coordinate, so the display
 * list needs no further transform — the reference SVG backend
 * (`DisplayList.displayListToSVG`) emits it verbatim.
 *
 * Each primitive owns its lowering (`lower` on the factory → `INTERNAL_lower`);
 * this module only drives layout, computes the viewport + `toPixel`, and walks
 * the bake. See /internals/core/rendering.
 */

import type { DisplayList } from "gofish-ir";
import type { ToPixel } from "../_node";
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

  // GoFish y-up → SVG y-down absolute pixels. This single map folds in both the
  // per-shape local `scale(1,-1)` and the root flip the legacy render used.
  const toPixel: ToPixel = ([gx, gy]) => [
    gx + leftReserve,
    data.height + topReserve - gy,
  ];

  // Thread `toPixel` to every `lower` body (and the boundary operators that call
  // `flattenLayout` internally) via the shared render session.
  data.child.getRenderSession().toPixel = toPixel;

  return {
    irVersion: 0,
    ir: "gofish-display-list",
    viewport,
    items: lowerToDisplayList(data.child),
  };
}

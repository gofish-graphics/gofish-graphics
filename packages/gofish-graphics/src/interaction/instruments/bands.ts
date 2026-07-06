/**
 * xBands() — a set-anchor provider over a chart's band structure (M4).
 *
 * The Meros `grid` component's role on the GoFish substrate: exposes the
 * x-extents of the chart's data marks (a spread's bands) as a keyed
 * Set⟨Range⟩ anchor, in the same converted space brush extents live in.
 * Binding it to a brush's x range anchor with `{ by: "nearest" }` yields the
 * type-driven Match relation — brush edges snap to band edges, making it
 * impossible to half-select a category.
 *
 * Band extents are re-derived from each published frame's display items
 * (stable re-binding: node uids and geometry are per-resolve), converted
 * px → data through the frame's recorded maps.
 */
import type { SetAnchor } from "../bindings";
import { frameConversions, type FrameConversions } from "../frameScales";
import type { Instrument, InteractionFrame } from "../types";

export interface BandsInstrument extends Instrument {
  /** Keyed Set⟨Range⟩ of band x-extents (converted space). */
  anchor: SetAnchor;
}

export function xBands(): BandsInstrument {
  let bands = new Map<string, [number, number]>();
  let conv: FrameConversions | undefined;

  return {
    anchor: {
      kind: "set",
      member: "range",
      entries: () => bands,
    },
    onFrame(frame: InteractionFrame) {
      conv = frameConversions(frame);
      bands = new Map();
      if (!conv) return;
      for (const item of frame.items) {
        if (
          item.kind === "rect" &&
          item.role === "node" &&
          item.id !== undefined
        ) {
          const lo = conv.pxToData[0](item.x);
          const hi = conv.pxToData[0](item.x + item.w);
          bands.set(item.id, lo <= hi ? [lo, hi] : [hi, lo]);
        }
      }
    },
  };
}

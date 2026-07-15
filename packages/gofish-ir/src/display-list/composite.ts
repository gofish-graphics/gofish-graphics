// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

import type { CompositeItem } from "./schema.js";

/** Per-operator layer/mask wiring for the mask+mix-blend-mode composite
 *  lowering — the single source of truth both SVG backends consume, so the
 *  decision logic cannot drift between them. Keys mirror the Porter-Duff
 *  operator wire names. */
export const compositeLayerConfig: Record<
  CompositeItem["operator"],
  {
    /** draw the grayscaled source layer at all (false only for `out`) */
    hasSourceLayer: boolean;
    /** destination layer carries `mix-blend-mode` */
    hasBlend: boolean;
    /** mask applied to the source layer */
    sourceMask: "alphaDest" | "invAlphaDest" | null;
    /** mask applied to the destination layer */
    destMask: "alphaSrc" | "invAlphaSrc" | null;
  }
> = {
  over: {
    hasSourceLayer: true,
    hasBlend: true,
    sourceMask: null,
    destMask: null,
  },
  atop: {
    hasSourceLayer: true,
    hasBlend: true,
    sourceMask: null,
    destMask: "alphaSrc",
  },
  in: {
    hasSourceLayer: true,
    hasBlend: true,
    sourceMask: "alphaDest",
    destMask: "alphaSrc",
  },
  out: {
    hasSourceLayer: false,
    hasBlend: false,
    sourceMask: null,
    destMask: "invAlphaSrc",
  },
  xor: {
    hasSourceLayer: true,
    hasBlend: false,
    sourceMask: "invAlphaDest",
    destMask: "invAlphaSrc",
  },
};

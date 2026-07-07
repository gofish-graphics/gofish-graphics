// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Frame-recorded coordinate conversions: data ↔ screen px, per axis, built by
 * composing the RECORDED forward maps from a published frame (root posScales +
 * toPixel). Both legs are affine, so inverses are sampled — scales are never
 * re-derived (the recorded-scale invariant).
 */
import type { InteractionFrame } from "./types";

/** Invert an affine function by sampling two points. Used to build px→data
 *  from the recorded data→px legs (both affine). Throws on a degenerate
 *  (constant) map. */
export function invertAffine(f: (t: number) => number): (y: number) => number {
  const a = f(0);
  const slope = f(1) - a;
  if (slope === 0) {
    throw new Error("[gofish interaction] cannot invert a degenerate scale");
  }
  return (y: number) => (y - a) / slope;
}

export interface FrameConversions {
  /** data → screen px, per axis (x, y). */
  dataToPx: [(d: number) => number, (d: number) => number];
  /** screen px → data, per axis (x, y). */
  pxToData: [(px: number) => number, (px: number) => number];
  /** The content box in screen px (x and y pixel extents, min ≤ max). */
  contentPx: { x: [number, number]; y: [number, number] };
  /** Continuous data domains per axis, when the axis has one. */
  domains: { x?: [number, number]; y?: [number, number] };
}

/** Build conversions for the axes whose position scales exist. Returns
 *  undefined when the frame lacks the recorded maps (no continuous axes). */
export function frameConversions(
  frame: InteractionFrame
): FrameConversions | undefined {
  const toPixel = frame.toPixel;
  const psX = frame.posScales?.[0];
  const psY = frame.posScales?.[1];
  if (!toPixel || !frame.size || (!psX && !psY)) return undefined;

  const dataToPxX = (d: number) => toPixel([psX ? psX(d) : d, 0])[0];
  const dataToPxY = (d: number) => toPixel([0, psY ? psY(d) : d])[1];

  const px0 = toPixel([0, 0]);
  const px1 = toPixel([frame.size.width, frame.size.height]);
  const sorted = (a: number, b: number): [number, number] =>
    a <= b ? [a, b] : [b, a];

  return {
    dataToPx: [dataToPxX, dataToPxY],
    pxToData: [invertAffine(dataToPxX), invertAffine(dataToPxY)],
    contentPx: {
      x: sorted(px0[0], px1[0]),
      y: sorted(px0[1], px1[1]),
    },
    domains: frame.domains ?? {},
  };
}

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
  /** data → screen px, per axis (x, y). Per-axis OPTIONAL: a leg is present
   *  only where the axis carries a continuous position scale. */
  dataToPx: [
    ((d: number) => number) | undefined,
    ((d: number) => number) | undefined,
  ];
  /** screen px → data, per axis (x, y). Per-axis OPTIONAL — see `dataToPx`. */
  pxToData: [
    ((px: number) => number) | undefined,
    ((px: number) => number) | undefined,
  ];
  /** The content box in screen px (x and y pixel extents, min ≤ max). */
  contentPx: { x: [number, number]; y: [number, number] };
  /** Continuous data domains per axis, when the axis has one. */
  domains: { x?: [number, number]; y?: [number, number] };
}

/** Build the data↔px leg for one axis. Present only when the axis has BOTH a
 *  recorded position scale AND a continuous data domain — an ordinal/band axis
 *  has no meaningful data coordinate to invert into. A degenerate leg (a
 *  non-finite or zero-slope map, e.g. a zero-size axis) is dropped rather than
 *  throwing, so it never fails the whole render from inside `publishFrame`. */
function axisLeg(
  axis: 0 | 1,
  ps: ((pos: number) => number) | undefined,
  domain: [number, number] | undefined,
  toPixel: NonNullable<InteractionFrame["toPixel"]>
):
  | { dataToPx: (d: number) => number; pxToData: (px: number) => number }
  | undefined {
  if (!ps || !domain) return undefined;
  const dataToPx =
    axis === 0
      ? (d: number) => toPixel([ps(d), 0])[0]
      : (d: number) => toPixel([0, ps(d)])[1];
  // Sample the affine slope; bail (no throw) on a degenerate map.
  const a = dataToPx(0);
  const slope = dataToPx(1) - a;
  if (!Number.isFinite(slope) || slope === 0) return undefined;
  return { dataToPx, pxToData: (px: number) => (px - a) / slope };
}

/** Build conversions for the axes whose position scales exist. Returns
 *  undefined when NO axis converts (no continuous axes at all). */
export function frameConversions(
  frame: InteractionFrame
): FrameConversions | undefined {
  const toPixel = frame.toPixel;
  if (!toPixel || !frame.size) return undefined;

  const legX = axisLeg(0, frame.posScales?.[0], frame.domains?.x, toPixel);
  const legY = axisLeg(1, frame.posScales?.[1], frame.domains?.y, toPixel);
  if (!legX && !legY) return undefined;

  const px0 = toPixel([0, 0]);
  const px1 = toPixel([frame.size.width, frame.size.height]);
  const sorted = (a: number, b: number): [number, number] =>
    a <= b ? [a, b] : [b, a];

  return {
    dataToPx: [legX?.dataToPx, legY?.dataToPx],
    pxToData: [legX?.pxToData, legY?.pxToData],
    contentPx: {
      x: sorted(px0[0], px1[0]),
      y: sorted(px0[1], px1[1]),
    },
    domains: frame.domains ?? {},
  };
}

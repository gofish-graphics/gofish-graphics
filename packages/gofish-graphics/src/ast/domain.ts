import { Measure } from "./data";

export type Domain = ContinuousDomain | AestheticDomain;

export type ContinuousDomain = {
  type: "continuous";
  value: [number, number];
  measure: Measure;
};

export const continuous = ({
  value,
  measure,
}: {
  value: [number, number];
  measure: Measure;
}): ContinuousDomain => ({
  type: "continuous",
  value,
  measure,
});

export type AestheticDomain = {
  type: "aesthetic";
  value: any;
};

export const aesthetic = (value: any): AestheticDomain => ({
  type: "aesthetic",
  value,
});

/** One continuous axis's data→pixel affine map: `px(d) = sigma·d + originPx`.
 *  `sigma` is the map's slope (px per data unit) and `originPx` is the pixel of
 *  data 0, the baseline, kept in pixels so pixel overhead never has to be
 *  expressed in data units. Every `AxisMap` is produced by the scope registry
 *  (`solveScope`) or its equal-measure recentering, so `sigma` is always a
 *  scope's solved slope. Evaluated by {@link pxOf}. */
export type AxisMap = { sigma: number; originPx: number };

/** One axis's data→pixel affine scale — the single carrier that replaced the
 *  parallel `scaleFactors` (slope-only) and `posScales` (whole map) channels.
 *
 *  The two halves are the read-off of up to TWO σ-scopes on this axis, NOT two
 *  independent slopes (Stage 6c — see the σ-affine plan). `sigma` is the σ of the
 *  axis's SIZE scope (px per data unit for unanchored magnitude consumers, the
 *  old `scaleFactor`); `map` is the anchored map of the axis's POSITION scope
 *  (the old `posScale`), and `map.sigma` is that scope's σ. Both are registry-
 *  solved — no site fabricates either — so when both are present and `sigma ≠
 *  map.sigma` the axis genuinely carries two scopes (e.g. a sub-budget layer
 *  scaling size against a local extent and position against an inherited map).
 *  Each half is read by the channel it belongs to: magnitudes read `sigma`,
 *  anchored positions read `map`. (A niced-ticks-vs-raw-bars split is NOT a
 *  sanctioned case: since issue #659, nicing is a per-scope operation applied
 *  at the scope's solve, so a scope's map and σ read one domain by
 *  construction.) */
export type AxisScale = { sigma?: number; map?: AxisMap };

/** Evaluate an anchored map at a data value. */
export const pxOf = (map: AxisMap, d: number): number =>
  map.sigma * d + map.originPx;

/** The data value a baseline magnitude's baseline stands for on an anchored
 *  axis: the zero a signed `h`/`w` grows from. A layer that owns a data→pixel
 *  map seats its free children's baselines at `pxOf(map, measureOrigin(...))`
 *  (#773).
 *
 *  TODO(#773 follow-up): the origin is the additive identity of the measure's
 *  algebraic structure (an ordered additive group's 0). Measures don't carry
 *  their structure yet, so every measure is treated as a group with identity
 *  0. A torsor-valued measure (e.g. dates, temperatures) has no identity and
 *  should reject bars. */
export const measureOrigin = (_measure: Measure | undefined): number => 0;

/** Function view of an anchored map, for consumers that take a `(d)=>px`
 *  callback (`computeAesthetic`). A local derivation at the consumption site —
 *  never threaded between nodes. Undefined when the axis is unanchored. */
export const posFn = (
  map: AxisMap | undefined
): ((d: number) => number) | undefined =>
  map === undefined ? undefined : (d) => pxOf(map, d);

/** Assemble one axis's {@link AxisScale} from its SIZE-scope σ and its
 *  POSITION-scope `map`, collapsing "neither present" to `undefined` so a bare
 *  axis stays undefined (not an empty record). Both arguments are registry-
 *  solved slopes (see {@link AxisScale}); this only bundles the two scope views
 *  the axis carries — it never derives a slope. */
export const axisScale = (
  sigma: number | undefined,
  map: AxisMap | undefined
): AxisScale | undefined =>
  sigma === undefined && map === undefined ? undefined : { sigma, map };

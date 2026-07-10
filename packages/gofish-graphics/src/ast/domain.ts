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

export const canUnifyDomains = (domains: Domain[]) => {
  const first = domains[0];
  if (first === undefined || first.type !== "continuous") return false;
  return domains.every(
    (domain) =>
      domain !== undefined &&
      domain.type === "continuous" &&
      domain.measure === first.measure
  );
};

export const unifyContinuousDomains = (
  domains: ContinuousDomain[]
): ContinuousDomain => {
  const measure = domains[0].measure;
  const mins = domains.map((domain) => domain.value[0]);
  const maxs = domains.map((domain) => domain.value[1]);
  return continuous({
    measure,
    value: [Math.min(...mins), Math.max(...maxs)],
  });
};

/** One continuous axis's data→pixel affine map, with the intercept explicit
 *  instead of closed over a function: `px(d) = pxMin + sigma·(d − domainMin)`.
 *  `sigma` is the map's own slope (px per data unit). By construction it is the
 *  σ of a POSITION σ-scope: every `AxisMap` is produced by {@link computePosScale}
 *  through the scope registry (`solvePosition`) or its equal-measure recentering,
 *  so `sigma` is never a free-floating number — it is a scope's solved slope.
 *  Evaluated by {@link pxOf}; the old `posScale(0)` intercept is `pxOf(map, 0)`. */
export type AxisMap = { sigma: number; domainMin: number; pxMin: number };

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
  map.pxMin + map.sigma * (d - map.domainMin);

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

// creates an affine map transforming the domain to [0, size] or [size, 0] if reverse is true
export const computePosScale = (
  domain: ContinuousDomain,
  size: number,
  reverse: boolean = false
): AxisMap => {
  const [min, max] = domain.value;
  const scale = size / (max - min);
  // px(d) = pxMin + sigma·(d − domainMin) reproduces the former closure exactly:
  // forward  `(d − min)·scale`         → pxMin 0,    sigma  scale;
  // reverse  `size − (d − min)·scale`  → pxMin size, sigma −scale.
  return reverse
    ? { sigma: -scale, domainMin: min, pxMin: size }
    : { sigma: scale, domainMin: min, pxMin: 0 };
};

/**
 * Local position scale from a node's resolved POSITION space on one axis:
 * the space's domain mapped affinely onto `[0, size]`, or undefined when the
 * axis isn't POSITION (or has no domain). The shared fallback recipe for a
 * layout node that wasn't handed a scale by its parent (layer, scatter).
 */
export const posScaleFromSpace = (
  // Structurally typed to avoid a domain.ts → underlyingSpace.ts import cycle;
  // only an ANCHORED CONTINUOUS space — one whose `dataDomain` is a real
  // `[min,max]` interval — produces a scale. A baseline magnitude (`dataDomain`
  // undefined) and a difference (`dataDomain === "delta"`) do not.
  space:
    | {
        kind: string;
        dataDomain?: { min: number; max: number } | "delta";
      }
    | undefined,
  size: number
): AxisMap | undefined =>
  space &&
  space.kind === "continuous" &&
  space.dataDomain !== undefined &&
  space.dataDomain !== "delta"
    ? computePosScale(
        continuous({
          value: [space.dataDomain.min, space.dataDomain.max],
          measure: "unit",
        }),
        size
      )
    : undefined;

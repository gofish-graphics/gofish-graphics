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

// creates an affine scale transforming the domain to [0, size] or [size, 0] if reverse is true
export const computePosScale = (
  domain: ContinuousDomain,
  size: number,
  reverse: boolean = false
) => {
  const [min, max] = domain.value;
  const scale = size / (max - min);
  return (pos: number) =>
    reverse ? size - (pos - min) * scale : (pos - min) * scale;
};

/**
 * Local position scale from a node's resolved POSITION space on one axis:
 * the space's domain mapped affinely onto `[0, size]`, or undefined when the
 * axis isn't POSITION (or has no domain). The shared fallback recipe for a
 * layout node that wasn't handed a scale by its parent (layer, scatter).
 */
export const posScaleFromSpace = (
  // Structurally typed to avoid a domain.ts → underlyingSpace.ts import cycle;
  // only an ANCHORED CONTINUOUS space (numeric origin) produces a scale — a
  // baseline magnitude (origin "free") and a difference (origin null) do not.
  // Its data interval is `[origin, origin + width.run(1)]`.
  space:
    | {
        kind: string;
        origin?: number | "free" | "impossible";
        width?: { run: (x: number) => number };
      }
    | undefined,
  size: number
): ((pos: number) => number) | undefined =>
  space &&
  space.kind === "continuous" &&
  typeof space.origin === "number" &&
  space.width
    ? computePosScale(
        continuous({
          value: [space.origin, space.origin + space.width.run(1)],
          measure: "unit",
        }),
        size
      )
    : undefined;

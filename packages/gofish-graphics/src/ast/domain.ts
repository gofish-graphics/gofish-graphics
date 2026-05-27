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

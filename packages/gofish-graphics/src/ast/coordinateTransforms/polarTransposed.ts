import { CoordinateTransform } from "./coord";

/* TODO: just compose polar and a transposed space... */
export const polarTransposed = (): CoordinateTransform => {
  return {
    type: "polarTransposed",
    transform: ([theta, r]: [number, number]) => [
      r * Math.sin(theta),
      r * Math.cos(theta),
    ],
    // Domain mirrors `polar()` — used by `coord`'s grid-line renderer (see
    // coord.tsx:325). The radius `max: 100` is a hardcoded placeholder, not
    // data-driven; charts with radii outside [0, 100] will draw misleading
    // grid lines. Fixing this requires making `CoordinateTransform.domain`
    // configurable or inferred from data — out of scope for the d.ts
    // emission cleanup that brought this back to typing health.
    domain: [
      { min: 0, max: 2 * Math.PI, size: 2 * Math.PI },
      { min: 0, max: 100, size: 100 },
    ],
  };
};

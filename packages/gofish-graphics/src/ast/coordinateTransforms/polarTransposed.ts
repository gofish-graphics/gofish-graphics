import { CoordinateTransform } from "./coord";

/* TODO: just compose polar and a transposed space... */
export const polarTransposed = (): CoordinateTransform => {
  return {
    type: "polarTransposed",
    transform: ([theta, r]: [number, number]) => [
      r * Math.sin(theta),
      r * Math.cos(theta),
    ],
    domain: [
      { min: 0, max: 2 * Math.PI, size: 2 * Math.PI },
      { min: 0, max: 100, size: 100 },
    ],
  };
};

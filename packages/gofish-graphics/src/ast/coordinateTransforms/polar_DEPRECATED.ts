import { CoordinateTransform } from "./coord";

export const polar_DEPRECATED = (): CoordinateTransform => {
  return {
    type: "polar_DEPRECATED",
    transform: ([r, theta]: [number, number]) => [
      r * Math.cos(theta),
      r * Math.sin(theta),
    ],
    domain: [
      { min: 0, max: 100, size: 100 },
      { min: 0, max: 2 * Math.PI, size: 2 * Math.PI },
    ],
  };
};

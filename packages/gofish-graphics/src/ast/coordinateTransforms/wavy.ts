import { CoordinateTransform } from "./coord";

export const wavy = (): CoordinateTransform => {
  return {
    type: "wavy",
    transform: ([x, y]: [number, number]) => [
      x + 5 * Math.sin(y / 10),
      y + 5 * Math.sin(x / 10),
    ],
    domain: [
      { min: 0, max: 100, size: 100 },
      { min: 0, max: 100, size: 100 },
    ],
  };
};

import { getValue, getValueOffset, isValue, MaybeValue } from "./ast/data";

export const lerp = (a: number, b: number, t: number): number => {
  return a + t * (b - a);
};

// assumes function is monotonically increasing
// lowerBound must be less than the target
export const findTargetMonotonic = (
  targetValue: number,
  fn: (x: number) => number,
  options?: {
    tolerance?: number;
    maxIterations?: number;
    lowerBound?: number;
    upperBoundGuess?: number;
  }
): number => {
  const defaultOptions = {
    tolerance: 0.0001,
    maxIterations: 50,
    lowerBound: 0,
    upperBoundGuess: 10,
  };
  const { tolerance, maxIterations } = { ...defaultOptions, ...options };
  let { lowerBound: low, upperBoundGuess: high } = {
    ...defaultOptions,
    ...options,
  };

  // Check if the upper bound is large enough and increase it if necessary
  let growthIterations = 0;
  const maxGrowthIterations = Math.min(20, maxIterations / 2); // Limit growth iterations

  let upperValue = fn(high);
  while (upperValue < targetValue) {
    if (growthIterations >= maxGrowthIterations) {
      break; // Prevent infinite loop
    }
    low = high;
    high *= 2;
    upperValue = fn(high);
    growthIterations++;
  }

  // Now that we have a large enough upper bound, use binary search to find the target value
  let iterations = 0;

  while (high - low > tolerance && iterations < maxIterations) {
    const mid = (low + high) / 2;
    const currentValue = fn(mid);

    if (Math.abs(currentValue - targetValue) < tolerance) {
      return mid;
    }

    if (currentValue < targetValue) {
      low = mid;
    } else {
      high = mid;
    }
    iterations++;
  }

  return (low + high) / 2;
};

export const pairs = <T>(xs: T[]): [T, T][] => {
  const result: [T, T][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    result.push([xs[i], xs[i + 1]]);
  }
  return result;
};

/**
 * Fold child extents into a bbox edge, ignoring non-finite entries. A child
 * can report an undefined extent on an axis it doesn't constrain (e.g. a
 * `spread` over POSITION children leaves its y-min unset); dropping those
 * keeps one `undefined` from poisoning the whole box via `Math.min(undefined)`.
 * Falls back to 0 when nothing is measurable.
 */
export const foldFinite = (
  vals: (number | undefined)[],
  f: (...n: number[]) => number
): number => {
  const finite = vals.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  return finite.length ? f(...finite) : 0;
};

// input is a value, an aesthetic literal, or undefined. behavior differs based on this
export const computeAesthetic = (
  input: MaybeValue<number> | undefined,
  scale: (x: number) => number,
  provided: number | undefined
): number | undefined => {
  // A datum's pixel offset applies AFTER the scale mapping — "this data
  // position, plus pixels" (`datum(v).offset(px)`).
  return isValue(input)
    ? scale(getValue(input)!) + getValueOffset(input)
    : (input ?? provided);
};

export const computeSize = (
  input: MaybeValue<number> | undefined,
  scaleFactor: number,
  size: number
): number => {
  return computeAesthetic(input, (x) => x * scaleFactor, size) as number;
};

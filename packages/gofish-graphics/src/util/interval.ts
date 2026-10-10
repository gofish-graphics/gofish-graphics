export type Interval = {
  min: number;
  max: number;
};

/**
 * Creates a normalized interval from two values.
 * The values can be provided in any order; the function will always
 * return an interval where min <= max.
 */
export function interval(a: number, b: number): Interval {
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/**
 * Checks if an interval is valid (min <= max)
 */
export const isValid = (interval: Interval): boolean => {
  return interval.min <= interval.max;
};

/**
 * Checks if an interval is empty (min > max)
 */
export const isEmpty = (interval: Interval): boolean => {
  return interval.min > interval.max;
};

/**
 * Checks if an interval is finite and not empty: both ends are numbers and
 * min <= max. An empty column (min > max) or a NaN end fails.
 */
export const isFinite = (interval: Interval): boolean =>
  Number.isFinite(interval.min) &&
  Number.isFinite(interval.max) &&
  interval.min <= interval.max;

/**
 * Gets the width of an interval
 */
export const width = (interval: Interval): number => {
  return interval.max - interval.min;
};

/**
 * Checks if a value is contained within an interval
 */
export const contains = (interval: Interval, value: number): boolean => {
  return value >= interval.min && value <= interval.max;
};

/**
 * Checks if two intervals overlap
 */
export const overlaps = (a: Interval, b: Interval): boolean => {
  return a.min <= b.max && b.min <= a.max;
};

/**
 * Computes the union of two intervals
 */
export const union = (a: Interval, b: Interval): Interval => {
  return interval(Math.min(a.min, b.min), Math.max(a.max, b.max));
};

/**
 * Computes the union of multiple intervals
 */
export const unionAll = (...intervals: Interval[]): Interval => {
  if (intervals.length === 0) {
    return interval(0, 0);
  }

  return intervals.reduce((acc, interval) => union(acc, interval));
};

export const toJSON = (interval: Interval): string => {
  return `[${interval.min}, ${interval.max}]`;
};

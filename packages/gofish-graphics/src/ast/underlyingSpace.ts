// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// import { ContinuousDomain } from "./domain";
import { interval, Interval } from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import * as Monotonic from "../util/monotonic";
import type { Measure } from "./data";

export type UnderlyingSpaceKind =
  | "position"
  | "difference"
  | "size"
  | "ordinal"
  | "undefined";

export type POSITION_TYPE = {
  kind: "position";
  domain: Interval;
  spacing?: number;
  ordinalGroupId?: string;
  /** The measure (unit) of this axis. Spaces unify per measure — see
   *  {@link mergeMeasures}. Undefined = "no claim" (permissive). */
  measure?: Measure;
  coordinateTransform?: CoordinateTransform;
};

export type DIFFERENCE_TYPE = {
  kind: "difference";
  width: number;
  spacing?: number;
  ordinalGroupId?: string;
  measure?: Measure;
};

export type SIZE_TYPE = {
  kind: "size";
  domain: Monotonic.Monotonic;
  spacing?: number;
  ordinalGroupId?: string;
  measure?: Measure;
};

export type ORDINAL_TYPE = {
  kind: "ordinal";
  spacing?: number;
  ordinalGroupId?: string;
  domain?: string[]; // Top-level category keys for axis labels
};

export type UNDEFINED_TYPE = {
  kind: "undefined";
  spacing?: number;
  ordinalGroupId?: string;
};

export type UnderlyingSpace =
  | POSITION_TYPE
  | DIFFERENCE_TYPE
  | SIZE_TYPE
  | ORDINAL_TYPE
  | UNDEFINED_TYPE;

export const POSITION = (
  domain: Interval,
  measure?: Measure,
  coordinateTransform?: CoordinateTransform
): UnderlyingSpace => ({
  kind: "position",
  domain,
  ...(measure !== undefined ? { measure } : {}),
  coordinateTransform,
});

export const isPOSITION = (space: UnderlyingSpace): space is POSITION_TYPE =>
  space.kind === "position";

export const DIFFERENCE = (
  width: number,
  measure?: Measure
): UnderlyingSpace => ({
  kind: "difference",
  width,
  ...(measure !== undefined ? { measure } : {}),
});
export const isDIFFERENCE = (
  space: UnderlyingSpace
): space is DIFFERENCE_TYPE => space.kind === "difference";

export const SIZE = (
  domain: Monotonic.Monotonic,
  measure?: Measure
): UnderlyingSpace => ({
  kind: "size",
  domain,
  ...(measure !== undefined ? { measure } : {}),
});
export const isSIZE = (space: UnderlyingSpace): space is SIZE_TYPE =>
  space.kind === "size";

export const ORDINAL = (domain?: string[]): UnderlyingSpace => ({
  kind: "ordinal",
  domain,
});
export const isORDINAL = (space: UnderlyingSpace): space is ORDINAL_TYPE =>
  space.kind === "ordinal";

export const UNDEFINED: UnderlyingSpace = { kind: "undefined" };
export const isUNDEFINED = (space: UnderlyingSpace): space is UNDEFINED_TYPE =>
  space.kind === "undefined";

/** Read the measure of any space, or undefined for the measureless kinds. */
export const spaceMeasure = (
  space: UnderlyingSpace | undefined
): Measure | undefined =>
  space && (isPOSITION(space) || isDIFFERENCE(space) || isSIZE(space))
    ? space.measure
    : undefined;

/**
 * Unify two measures as TYPES (the Stage-1 guard). Undefined is permissive —
 * it means "no claim", so it unifies with anything and yields the other side.
 * Two equal measures unify to themselves. Two *different* defined measures are
 * a type error: unioning spaces in incompatible units (e.g. a marginal
 * histogram's count axis vs. a scatter's millimeters) is silent corruption, so
 * we throw loudly instead.
 */
export const mergeMeasures = (
  a: Measure | undefined,
  b: Measure | undefined,
  context?: string
): Measure | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (a === b) return a;
  throw new Error(
    `Cannot unify underlying spaces with different measures: ` +
      `"${a}" and "${b}"${context ? ` (${context})` : ""}.\n` +
      `If these are the same units, assert that with field(name, measure) ` +
      `or datum(v, measure). If they are different units, give the inner ` +
      `chart an explicit w/h so it becomes a self-scaling region.`
  );
};

/**
 * Like {@link mergeMeasures}, but a conflict *forgets* (returns undefined)
 * instead of throwing. Used where composing differently-measured spaces is
 * legitimate — e.g. stacking two different fields' SIZEs: the composed extent
 * is real but carries no single unit.
 */
export const forgetOnConflict = (
  a: Measure | undefined,
  b: Measure | undefined
): Measure | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a === b ? a : undefined;
};

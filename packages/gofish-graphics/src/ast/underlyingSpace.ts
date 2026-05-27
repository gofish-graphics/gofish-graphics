// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// import { ContinuousDomain } from "./domain";
import { interval, Interval } from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import * as Monotonic from "../util/monotonic";

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
  source?: string;
  coordinateTransform?: CoordinateTransform;
};

export type DIFFERENCE_TYPE = {
  kind: "difference";
  width: number;
  spacing?: number;
  ordinalGroupId?: string;
  source?: string;
};

export type SIZE_TYPE = {
  kind: "size";
  domain: Monotonic.Monotonic;
  spacing?: number;
  ordinalGroupId?: string;
  source?: string;
};

export type ORDINAL_TYPE = {
  kind: "ordinal";
  spacing?: number;
  ordinalGroupId?: string;
  source?: string;
  domain?: string[]; // Top-level category keys for axis labels
};

export type UNDEFINED_TYPE = {
  kind: "undefined";
  spacing?: number;
  ordinalGroupId?: string;
  source?: string;
};

export type UnderlyingSpace =
  | POSITION_TYPE
  | DIFFERENCE_TYPE
  | SIZE_TYPE
  | ORDINAL_TYPE
  | UNDEFINED_TYPE;

export const POSITION = (
  domain: Interval,
  coordinateTransform?: CoordinateTransform
): UnderlyingSpace => ({
  kind: "position",
  domain,
  coordinateTransform,
});

export const isPOSITION = (space: UnderlyingSpace): space is POSITION_TYPE =>
  space.kind === "position";

export const DIFFERENCE = (width: number): UnderlyingSpace => ({
  kind: "difference",
  width,
});
export const isDIFFERENCE = (
  space: UnderlyingSpace
): space is DIFFERENCE_TYPE => space.kind === "difference";

export const SIZE = (domain: Monotonic.Monotonic): UnderlyingSpace => ({
  kind: "size",
  domain,
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

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// import { ContinuousDomain } from "./domain";
import { interval, Interval } from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import * as Monotonic from "../util/monotonic";
import type { Size } from "./dims";
import type { Frontend } from "gofish-ir";

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

// ---------------------------------------------------------------------------
// Serializable annotation view
// ---------------------------------------------------------------------------

/**
 * Thrown when a required underlying-space field can't be determined — e.g. a
 * `SIZE` whose Monotonic isn't linear (no closed-form data extent). Callers
 * doing a strict typecheck surface this; serialization catches it and omits
 * `meta.space` for that node (the annotation is derived, not authoritative).
 */
export class UnderlyingSpaceInferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnderlyingSpaceInferenceError";
  }
}

/**
 * Project a single runtime {@link UnderlyingSpace} onto the serializable IR
 * {@link Frontend.AxisSpace}, the data-domain view that the frontend IR
 * carries in `meta.space`.
 *
 * The runtime `SIZE` carries a layout-time `Monotonic` rather than a data
 * extent; for the linear case (the only one `computeIntrinsicSize` produces)
 * the data extent is `[intercept, intercept + slope]` — i.e. the image of the
 * unit interval, which equals `[0, value]` for a data-driven size. Non-linear
 * Monotonics have no closed-form extent and raise.
 */
export const axisSpaceToAnnotation = (
  space: UnderlyingSpace
): Frontend.AxisSpace => {
  if (isPOSITION(space)) {
    return { kind: "POSITION", domain: [space.domain.min, space.domain.max] };
  }
  if (isDIFFERENCE(space)) {
    return { kind: "DIFFERENCE", width: space.width };
  }
  if (isSIZE(space)) {
    if (!Monotonic.isLinear(space.domain)) {
      throw new UnderlyingSpaceInferenceError(
        "cannot infer SIZE domain: underlying Monotonic is non-linear; explicit annotation required"
      );
    }
    const { slope, intercept } = space.domain;
    return { kind: "SIZE", domain: [intercept, intercept + slope] };
  }
  if (isORDINAL(space)) {
    return { kind: "ORDINAL", domain: space.domain ?? [] };
  }
  return { kind: "UNDEFINED" };
};

/**
 * Project a node's per-axis runtime underlying space onto the serializable
 * {@link Frontend.UnderlyingSpaceAnnotation}. Single source of truth for the
 * runtime → IR mapping; used both by the chart-builder inference pass (for
 * embedded low-level subtrees) and by the cross-stage parity test.
 */
export const underlyingSpaceToAnnotation = (
  space: Size<UnderlyingSpace>
): Frontend.UnderlyingSpaceAnnotation => ({
  x: axisSpaceToAnnotation(space[0]),
  y: axisSpaceToAnnotation(space[1]),
});

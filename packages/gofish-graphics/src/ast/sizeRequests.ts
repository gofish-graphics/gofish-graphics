// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Core Layout Semantics v0 — /internals/core/layout-kernel
// @wiki Frames, Scale Scopes, and Size Requests — /internals/layout/frames-scale-scopes-and-claims
// </gofish-wiki>

/**
 * The proof-bearing size-request language for the layout kernel.
 *
 * A size request is the upper envelope of finitely many affine pieces on
 * sigma >= 0,
 * with an implicit zero piece:
 *
 *   requestedExtent(sigma) = max(0, a_1 sigma + b_1, ..., a_n sigma + b_n)
 *
 * Slopes are finite and non-negative. Consequently every request denotes a
 * finite, non-negative, continuous, non-decreasing, convex, piecewise-linear
 * function from scale factor to pixel extent.
 * Keeping the representation closed and inspectable avoids the opaque numeric
 * inverses used by the legacy Monotonic.unknown escape hatch.
 *
 * The algebraic laws are laws of this denotation over exact real numbers.
 * JavaScript `number` is a numerical approximation: structural equality is
 * guaranteed only when the relevant arithmetic is exactly representable, and
 * callers comparing general floating-point requests need an explicit tolerance.
 */

export type AffineExtent = Readonly<{
  slope: number;
  intercept: number;
}>;

export type SizeRequest = Readonly<{
  /** Canonically sorted pieces active on the upper envelope for sigma >= 0. */
  pieces: readonly AffineExtent[];
}>;

export type FitResult =
  | {
      kind: "exact";
      sigma: number;
      extent: number;
    }
  | {
      kind: "underdetermined";
      /** The canonical least solution; other sigma values also fit. */
      leastSigma: number;
      extent: number;
    }
  | {
      kind: "slack";
      extent: number;
      unused: number;
    }
  | {
      kind: "overflow";
      minimumExtent: number;
      deficit: number;
    };

const normalizeNumber = (value: number): number =>
  Object.is(value, -0) ? 0 : value;

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Layout size request ${label} must be finite; received ${value}`
    );
  }
};

const normalizedPiece = (piece: AffineExtent): AffineExtent => {
  assertFinite(piece.slope, "slope");
  assertFinite(piece.intercept, "intercept");
  if (piece.slope < 0) {
    throw new Error(
      `Layout size-request slope must be non-negative; received ${piece.slope}`
    );
  }
  return {
    slope: normalizeNumber(piece.slope),
    intercept: normalizeNumber(piece.intercept),
  };
};

const comparePieces = (a: AffineExtent, b: AffineExtent): number =>
  a.slope - b.slope || a.intercept - b.intercept;

const canonicalPieces = (input: readonly AffineExtent[]): AffineExtent[] => {
  const sorted = [...input, { slope: 0, intercept: 0 }]
    .map(normalizedPiece)
    .sort(comparePieces);

  // Parallel pieces never cross, so retain only the greatest intercept for
  // each slope before constructing the hull.
  const distinctSlopes: AffineExtent[] = [];
  for (const piece of sorted) {
    const previous = distinctSlopes[distinctSlopes.length - 1];
    if (previous?.slope === piece.slope) {
      distinctSlopes[distinctSlopes.length - 1] = piece;
    } else {
      distinctSlopes.push(piece);
    }
  }

  // Slopes increase along the upper envelope. `startsAt[i]` is the first sigma
  // where hull[i] is at least the preceding piece. If a new intersection is no
  // later than the preceding piece's start, that preceding piece has no open
  // interval on which it binds and is therefore not part of the minimal hull.
  const hull: AffineExtent[] = [];
  const startsAt: number[] = [];
  for (const piece of distinctSlopes) {
    let start = Number.NEGATIVE_INFINITY;
    while (hull.length > 0) {
      const previous = hull[hull.length - 1];
      start =
        (previous.intercept - piece.intercept) / (piece.slope - previous.slope);
      if (start > startsAt[startsAt.length - 1]) break;
      hull.pop();
      startsAt.pop();
    }
    hull.push(piece);
    startsAt.push(hull.length === 1 ? Number.NEGATIVE_INFINITY : start);
  }

  // Restrict the real-line hull to sigma >= 0. On an exact tie at zero the
  // higher-slope piece is sufficient: it agrees at zero and wins thereafter.
  let firstActive = 0;
  while (firstActive + 1 < hull.length && startsAt[firstActive + 1] <= 0) {
    firstActive++;
  }
  return hull.slice(firstActive);
};

export const sizeRequest = (
  ...pieces: readonly AffineExtent[]
): SizeRequest => ({
  pieces: canonicalPieces(pieces),
});

export const zeroRequest = (): SizeRequest => sizeRequest();

export const constantRequest = (extent: number): SizeRequest =>
  sizeRequest({ slope: 0, intercept: extent });

export const dataRequest = (magnitude: number): SizeRequest =>
  sizeRequest({ slope: magnitude, intercept: 0 });

export const requestedExtentAt = (
  value: SizeRequest,
  sigma: number
): number => {
  assertFinite(sigma, "input sigma");
  if (sigma < 0) {
    throw new Error(
      `Layout size-request sigma must be non-negative; received ${sigma}`
    );
  }
  return Math.max(
    ...value.pieces.map((piece) => piece.slope * sigma + piece.intercept)
  );
};

export const maxRequests = (...values: readonly SizeRequest[]): SizeRequest =>
  sizeRequest(...values.flatMap((value) => value.pieces));

export const addRequests = (...values: readonly SizeRequest[]): SizeRequest => {
  let sum = zeroRequest();
  for (const value of values) {
    // Canonicalize every intermediate envelope. Without this reduction, a
    // many-operand sum retains the full cartesian product until the final step
    // even though almost all of those affine pieces never bind.
    sum = sizeRequest(
      ...sum.pieces.flatMap((left) =>
        value.pieces.map((right) => ({
          slope: left.slope + right.slope,
          intercept: left.intercept + right.intercept,
        }))
      )
    );
  }
  return sum;
};

export const scaleRequest = (
  scalar: number,
  value: SizeRequest
): SizeRequest => {
  assertFinite(scalar, "scalar");
  if (scalar < 0) {
    throw new Error(
      `Layout size-request scalar must be non-negative; received ${scalar}`
    );
  }
  return sizeRequest(
    ...value.pieces.map((piece) => ({
      slope: scalar * piece.slope,
      intercept: scalar * piece.intercept,
    }))
  );
};

/** Add a constant and clamp the physical extent back to zero. */
export const shiftRequest = (
  value: SizeRequest,
  offset: number
): SizeRequest => {
  assertFinite(offset, "offset");
  return sizeRequest(
    ...value.pieces.map((piece) => ({
      slope: piece.slope,
      intercept: piece.intercept + offset,
    }))
  );
};

/**
 * Fit a size request to an allocated pixel budget without inventing an inverse.
 *
 * Positive-growth requests have an exact canonical least solution whenever the
 * budget is at least the minimum extent. A flat request either fits at every
 * sigma, leaves slack, or already overflows. A plateau at the minimum likewise
 * reports underdetermination rather than pretending sigma=0 was uniquely
 * derived.
 */
export const fitSizeRequest = (
  value: SizeRequest,
  budget: number,
  tolerance = 1e-9
): FitResult => {
  assertFinite(budget, "budget");
  assertFinite(tolerance, "fit tolerance");
  if (tolerance < 0) {
    throw new Error(
      `Layout size-request fit tolerance must be non-negative; received ${tolerance}`
    );
  }

  const minimumExtent = requestedExtentAt(value, 0);
  if (budget < minimumExtent - tolerance) {
    return {
      kind: "overflow",
      minimumExtent,
      deficit: minimumExtent - budget,
    };
  }

  const maxSlope = Math.max(...value.pieces.map((piece) => piece.slope));
  if (maxSlope === 0) {
    if (Math.abs(budget - minimumExtent) <= tolerance) {
      return {
        kind: "underdetermined",
        leastSigma: 0,
        extent: minimumExtent,
      };
    }
    return {
      kind: "slack",
      extent: minimumExtent,
      unused: budget - minimumExtent,
    };
  }

  if (Math.abs(budget - minimumExtent) <= tolerance) {
    const growsImmediately = value.pieces.some(
      (piece) =>
        Math.abs(piece.intercept - minimumExtent) <= tolerance &&
        piece.slope > 0
    );
    return growsImmediately
      ? { kind: "exact", sigma: 0, extent: minimumExtent }
      : {
          kind: "underdetermined",
          leastSigma: 0,
          extent: minimumExtent,
        };
  }

  const sigma = Math.min(
    ...value.pieces
      .filter((piece) => piece.slope > 0)
      .map((piece) => Math.max(0, (budget - piece.intercept) / piece.slope))
  );
  return { kind: "exact", sigma, extent: requestedExtentAt(value, sigma) };
};

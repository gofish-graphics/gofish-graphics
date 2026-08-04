// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Core Layout Semantics v0 — /internals/core/layout-kernel
// @wiki Frames, Scale Scopes, and Scale-Dependent Extents — /internals/layout/frames-scale-scopes-and-claims
// </gofish-wiki>

/**
 * The proof-bearing scale-dependent extent language for the layout kernel.
 *
 * A scale-dependent content extent is the upper envelope of finitely many
 * affine pieces on sigma >= 0, with an implicit zero piece:
 *
 *   extent(sigma) = max(0, a_1 sigma + b_1, ..., a_n sigma + b_n)
 *
 * Slopes are finite and non-negative. Consequently every value denotes a
 * finite, non-negative, continuous, non-decreasing, convex, piecewise-linear
 * function from scale factor to the content's required pixel extent.
 * Keeping the representation closed and inspectable avoids the opaque numeric
 * inverses used by the legacy Monotonic.unknown escape hatch.
 *
 * The algebraic laws are laws of this denotation over exact real numbers.
 * JavaScript `number` is a numerical approximation: structural equality is
 * guaranteed only when the relevant arithmetic is exactly representable, and
 * callers comparing general floating-point extents need an explicit tolerance.
 */

export type AffineExtent = Readonly<{
  slope: number;
  intercept: number;
}>;

export type ScaleDependentExtent = Readonly<{
  /** Canonically sorted pieces active on the upper envelope for sigma >= 0. */
  pieces: readonly AffineExtent[];
}>;

/**
 * The result of fitting a hard content extent into the available pixel extent.
 *
 * `slack` means the content's required extent is fully satisfied and pixels
 * remain unused. `overflow` means no non-negative scale can satisfy the hard
 * requirement. There is deliberately no partial-fulfillment result.
 */
export type ScaleFitResult =
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
      `Layout scale-dependent extent ${label} must be finite; received ${value}`
    );
  }
};

const normalizedPiece = (piece: AffineExtent): AffineExtent => {
  assertFinite(piece.slope, "slope");
  assertFinite(piece.intercept, "intercept");
  if (piece.slope < 0) {
    throw new Error(
      `Layout scale-dependent extent slope must be non-negative; received ${piece.slope}`
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

export const scaleDependentExtent = (
  ...pieces: readonly AffineExtent[]
): ScaleDependentExtent => ({
  pieces: canonicalPieces(pieces),
});

export const zeroExtent = (): ScaleDependentExtent => scaleDependentExtent();

export const constantExtent = (extent: number): ScaleDependentExtent =>
  scaleDependentExtent({ slope: 0, intercept: extent });

export const dataExtent = (magnitude: number): ScaleDependentExtent =>
  scaleDependentExtent({ slope: magnitude, intercept: 0 });

export const extentAtScale = (
  value: ScaleDependentExtent,
  sigma: number
): number => {
  assertFinite(sigma, "input sigma");
  if (sigma < 0) {
    throw new Error(
      `Layout scale-dependent extent sigma must be non-negative; received ${sigma}`
    );
  }
  return Math.max(
    ...value.pieces.map((piece) => piece.slope * sigma + piece.intercept)
  );
};

export const maxExtents = (
  ...values: readonly ScaleDependentExtent[]
): ScaleDependentExtent =>
  scaleDependentExtent(...values.flatMap((value) => value.pieces));

export const addExtents = (
  ...values: readonly ScaleDependentExtent[]
): ScaleDependentExtent => {
  let sum = zeroExtent();
  for (const value of values) {
    // Canonicalize every intermediate envelope. Without this reduction, a
    // many-operand sum retains the full cartesian product until the final step
    // even though almost all of those affine pieces never bind.
    sum = scaleDependentExtent(
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

export const scaleExtent = (
  scalar: number,
  value: ScaleDependentExtent
): ScaleDependentExtent => {
  assertFinite(scalar, "scalar");
  if (scalar < 0) {
    throw new Error(
      `Layout scale-dependent extent scalar must be non-negative; received ${scalar}`
    );
  }
  return scaleDependentExtent(
    ...value.pieces.map((piece) => ({
      slope: scalar * piece.slope,
      intercept: scalar * piece.intercept,
    }))
  );
};

/** Add a constant and clamp the physical extent back to zero. */
export const shiftExtent = (
  value: ScaleDependentExtent,
  offset: number
): ScaleDependentExtent => {
  assertFinite(offset, "offset");
  return scaleDependentExtent(
    ...value.pieces.map((piece) => ({
      slope: piece.slope,
      intercept: piece.intercept + offset,
    }))
  );
};

/**
 * Solve only sigma so a hard scale-dependent content extent fits the available
 * pixel extent, without inventing an inverse.
 *
 * Positive-growth extents have an exact canonical least solution whenever the
 * available extent is at least the minimum. A flat extent either fits at every
 * sigma, is fully satisfied with slack, or cannot fit at all. A plateau at the
 * minimum likewise reports underdetermination rather than pretending sigma=0
 * was uniquely derived.
 */
export const fitScale = (
  value: ScaleDependentExtent,
  availableExtent: number,
  tolerance = 1e-9
): ScaleFitResult => {
  assertFinite(availableExtent, "available extent");
  assertFinite(tolerance, "fit tolerance");
  if (tolerance < 0) {
    throw new Error(
      `Layout scale-dependent extent fit tolerance must be non-negative; received ${tolerance}`
    );
  }

  const minimumExtent = extentAtScale(value, 0);
  if (availableExtent < minimumExtent - tolerance) {
    return {
      kind: "overflow",
      minimumExtent,
      deficit: minimumExtent - availableExtent,
    };
  }

  const maxSlope = Math.max(...value.pieces.map((piece) => piece.slope));
  if (maxSlope === 0) {
    if (Math.abs(availableExtent - minimumExtent) <= tolerance) {
      return {
        kind: "underdetermined",
        leastSigma: 0,
        extent: minimumExtent,
      };
    }
    return {
      kind: "slack",
      extent: minimumExtent,
      unused: availableExtent - minimumExtent,
    };
  }

  if (Math.abs(availableExtent - minimumExtent) <= tolerance) {
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
      .map((piece) =>
        Math.max(0, (availableExtent - piece.intercept) / piece.slope)
      )
  );
  return { kind: "exact", sigma, extent: extentAtScale(value, sigma) };
};

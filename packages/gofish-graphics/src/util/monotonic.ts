// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Monotonic Module — /internals/core/monotonic
// </gofish-wiki>

import { findTargetMonotonic } from "../util";

export type Monotonic = {
  kind: "linear" | "piecewise" | "unknown";
  run: (x: number) => number;
  inverse: (
    x: number,
    options?: {
      tolerance?: number;
      maxIterations?: number;
      lowerBound?: number;
      upperBoundGuess?: number;
    }
  ) => number | undefined;
};

/**
 * Linear object representing a linear function y = slope * x + intercept
 */
export interface Linear extends Monotonic {
  kind: "linear";
  slope: number;
  intercept: number;
}

/** A single line `slope·x + intercept`. */
export interface Piece {
  slope: number;
  intercept: number;
}

/**
 * A convex piecewise-linear function: the upper envelope `max_i(slope_i·x +
 * intercept_i)` of its `pieces`. This is the normal form of the (max, +)
 * algebra over linear claims — closed under `add` (pairwise sums of pieces),
 * `max` (union of pieces), `smul`, and `adds` — so a composed claim keeps its
 * structure (printable, exactly invertible) instead of collapsing to an opaque
 * closure. See apps/docs/docs/internals/core/monotonic.md.
 */
export interface Piecewise extends Monotonic {
  kind: "piecewise";
  pieces: Piece[];
}

export interface Unknown extends Monotonic {
  kind: "unknown";
}

export function linear(slope: number, intercept: number): Linear {
  return {
    kind: "linear",
    slope,
    intercept,
    run: (x: number) => slope * x + intercept,
    inverse: (y: number) => (slope === 0 ? undefined : (y - intercept) / slope),
  };
}

/** Drop pieces dominated by another on x ≥ 0: line B is redundant when some
 *  line A has `slope ≥` and `intercept ≥` B's (so A ≥ B everywhere on x ≥ 0).
 *  Keeps the envelope small for printing and bounds `add`'s cartesian growth.
 *  Exact dominance only — not a full convex-hull prune (non-binding interior
 *  pieces may remain, which is harmless: `run`/`inverse` still take the max). */
function pruneDominated(pieces: Piece[]): Piece[] {
  const kept: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const b = pieces[i];
    const dominated = pieces.some((a, j) => {
      if (j === i) return false;
      const better = a.slope >= b.slope && a.intercept >= b.intercept;
      const strict = a.slope > b.slope || a.intercept > b.intercept;
      // On a tie (identical line) keep only the first occurrence.
      return better && (strict || j < i);
    });
    if (!dominated) kept.push(b);
  }
  return kept;
}

/**
 * Build a convex piecewise-linear Monotonic from `pieces` (interpreted as their
 * max). Normalizes: prunes dominated pieces and collapses a single survivor back
 * to `linear`, so the all-linear fast path and `.slope`/`.intercept` readers
 * keep working and only genuinely multi-line envelopes carry `kind: "piecewise"`.
 */
export function piecewise(pieces: Piece[]): Linear | Piecewise {
  const ps = pruneDominated(pieces);
  if (ps.length === 1) return linear(ps[0].slope, ps[0].intercept);
  return {
    kind: "piecewise",
    pieces: ps,
    run: (x: number) => Math.max(...ps.map((p) => p.slope * x + p.intercept)),
    inverse: (y: number, options) => {
      // The envelope is increasing and convex, so it equals `y` at the SMALLEST
      // σ at which any rising piece reaches `y` (past it the max overshoots).
      let sigma = Infinity;
      for (const p of ps) {
        if (p.slope > 0) sigma = Math.min(sigma, (y - p.intercept) / p.slope);
      }
      if (!Number.isFinite(sigma)) return undefined; // all pieces constant
      // Reject when a constant (or higher) piece dominates at σ, so the max
      // never actually equals y (envelope(σ) > y).
      const tol = options?.tolerance ?? 1e-6;
      const at = Math.max(...ps.map((p) => p.slope * sigma + p.intercept));
      return Math.abs(at - y) <= tol * Math.max(1, Math.abs(y))
        ? sigma
        : undefined;
    },
  };
}

export const isLinear = (x: Monotonic): x is Linear => {
  return x.kind === "linear";
};

export const isPiecewise = (x: Monotonic): x is Piecewise => {
  return x.kind === "piecewise";
};

/** The line pieces of a linear/piecewise Monotonic, or undefined for `unknown`
 *  (which has no closed-form envelope, so callers must fall back to a closure). */
const piecesOf = (x: Monotonic): Piece[] | undefined =>
  isLinear(x)
    ? [{ slope: x.slope, intercept: x.intercept }]
    : isPiecewise(x)
      ? x.pieces
      : undefined;

/* TODO: if a function is constant, then the entire subtree isn't data-driven (by monotonicity, the
slope can never decrease so all contributions to it must be zero) */
export const isConstant = (x: Monotonic): boolean => {
  if (isLinear(x)) return x.slope === 0;
  if (isPiecewise(x)) return x.pieces.every((p) => p.slope === 0);
  return false;
};

export const isZero = (x: Monotonic): boolean => {
  return isLinear(x) && x.slope === 0 && x.intercept === 0;
};

export const unknown = (run: (x: number) => number): Unknown => {
  return {
    kind: "unknown",
    run,
    inverse: (
      y: number,
      options?: {
        tolerance?: number;
        maxIterations?: number;
        lowerBound?: number;
        upperBoundGuess?: number;
      }
    ) => findTargetMonotonic(y, run, options),
  };
};

export const isUnknown = (x: Monotonic): x is Unknown => {
  return x.kind === "unknown";
};

export const add = (...args: Monotonic[]): Monotonic => {
  if (args.every(isLinear)) {
    return linear(
      args.reduce((sum, arg) => sum + arg.slope, 0),
      args.reduce((sum, arg) => sum + arg.intercept, 0)
    );
  }
  // All linear/piecewise → the sum is the pairwise sum of envelopes:
  // (max_i aᵢ) + (max_j bⱼ) = max_{i,j}(aᵢ + bⱼ). Still convex PWL.
  const allPieces = args.map(piecesOf);
  if (allPieces.every((p): p is Piece[] => p !== undefined)) {
    let acc: Piece[] = [{ slope: 0, intercept: 0 }];
    for (const ps of allPieces) {
      acc = acc.flatMap((e) =>
        ps.map((p) => ({
          slope: e.slope + p.slope,
          intercept: e.intercept + p.intercept,
        }))
      );
    }
    return piecewise(acc);
  }
  // An `unknown` operand has no envelope — fall back to a summing closure.
  return unknown((x: number) => args.reduce((sum, arg) => sum + arg.run(x), 0));
};

export const smul = (scalar: number, fn: Monotonic): Monotonic => {
  if (isLinear(fn)) return linear(scalar * fn.slope, scalar * fn.intercept);
  if (isPiecewise(fn))
    return piecewise(
      fn.pieces.map((p) => ({
        slope: scalar * p.slope,
        intercept: scalar * p.intercept,
      }))
    );
  return unknown((x: number) => scalar * fn.run(x));
};

export const adds = (fn: Monotonic, scalar: number): Monotonic => {
  if (isLinear(fn)) return linear(fn.slope, fn.intercept + scalar);
  if (isPiecewise(fn))
    return piecewise(
      fn.pieces.map((p) => ({
        slope: p.slope,
        intercept: p.intercept + scalar,
      }))
    );
  return unknown((x: number) => fn.run(x) + scalar);
};

export const max = (...args: Monotonic[]): Monotonic => {
  args = args.filter((arg) => !isZero(arg));
  if (args.length === 0) return linear(0, 0);
  // All linear/piecewise → the max is the union of their pieces (one envelope).
  const allPieces = args.map(piecesOf);
  if (allPieces.every((p): p is Piece[] => p !== undefined)) {
    return piecewise(allPieces.flat());
  }
  // An `unknown` operand has no envelope — fall back to a max-of-runs closure.
  return unknown((x: number) => Math.max(...args.map((arg) => arg.run(x))));
};

/** Pretty-print a Monotonic as the equation it represents — `40σ + 16`,
 *  `max(40σ + 16, 90)`, or `f(σ)` for an opaque closure. Matches the forms in
 *  the layout-synthesis essay; for debugging composed size claims. */
export const print = (x: Monotonic): string => {
  const line = (p: Piece): string => {
    if (p.slope === 0) return `${p.intercept}`;
    const term = `${p.slope}σ`;
    if (p.intercept === 0) return term;
    return p.intercept > 0
      ? `${term} + ${p.intercept}`
      : `${term} - ${-p.intercept}`;
  };
  if (isLinear(x)) return line(x);
  if (isPiecewise(x)) return `max(${x.pieces.map(line).join(", ")})`;
  return "f(σ)";
};

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import * as Monotonic from "../../util/monotonic";

/**
 * A per-axis linear-system bounding box (#39), modeled on Bluefish's
 * `createLinSysBBox`/`solveSystem` (`bbox.ts`). Each axis is a **2-unknown
 * system in `(min, size)`** — `min` is the absolute low edge, `size` the
 * extent. Every key a caller pins is one linear equation in those unknowns:
 * an **anchor equation** (min/center/max), or a **size equation**.
 *
 * | key    | reads as          | coefficients `[min, size]` |
 * | ------ | ----------------- | -------------------------- |
 * | min    | `min`             | `[1, 0]`                   |
 * | max    | `min + size`      | `[1, 1]`                   |
 * | center | `min + size/2`    | `[1, 0.5]`                 |
 * | size   | `size`            | `[0, 1]`                   |
 *
 * - **< 2 independent equations** → only what was written is readable; the rest
 *   are `undefined` (the system is under-determined).
 * - **exactly 2 independent** → solve `(min, size)`; every key becomes readable
 *   and is marked *inferred*. (Two anchors therefore *determine a size* —
 *   exactly what scatter's interval channels need, and what `place()`'s
 *   position-only protocol could not express.)
 * - **a 3rd, dependent equation** → checked for consistency against the solve
 *   within tolerance; a violation is a structured over-determination report
 *   (returned to the caller to warn), NOT a silent last-writer-wins.
 *
 * Each equation records its `owner` so a double-write on the same key is a
 * named conflict (one owner per key). This is the ownership ledger
 * size-setting constraints write into (size-claims.md "Dimension B"); GoFish's
 * `(intrinsic-local box, translate)` split is bridged at the call site by
 * stamping `min` into the translate and `[0, size]` into the local box.
 *
 * **σ-affine key values (unified-propagation.md, stage 1).** A key's value
 * is a {@link Monotonic} — `slope·σ + intercept` — not just a number, so the
 * ledger can hold a claim that still depends on its scope's scale factor σ (a
 * bar's `size = count·σ`) and resolve it once σ is solved. A plain `number` is
 * accepted and coerced to a constant (`slope 0`); the all-numeric case (every
 * caller today) behaves exactly as before, and {@link read} evaluates at σ
 * (default 0), so a constant reads back as its number. The σ-aware value is
 * {@link readMono}. Equations stay printable via `Monotonic.print`.
 */
export type BBoxKey = "min" | "max" | "center" | "size";

/** A box-key value: a σ-affine claim, or a plain number (a constant claim). */
export type BBoxValue = number | Monotonic.Monotonic;

const COEFFS: Record<BBoxKey, [number, number]> = {
  min: [1, 0],
  max: [1, 1],
  center: [1, 0.5],
  size: [0, 1],
};

/** Coerce a number to a constant Monotonic; pass a Monotonic through. */
const asMono = (v: BBoxValue): Monotonic.Monotonic =>
  typeof v === "number" ? Monotonic.linear(0, v) : v;

/** Equality of two σ-affine claims, by probing at two distinct σ (two points
 *  pin a line). v1 limitation: exact only for linear claims; a piecewise claim
 *  agreeing at 0 and 1 but differing on another segment would read as equal —
 *  acceptable until a size-setting constraint produces a piecewise key. */
const monoEqual = (
  a: Monotonic.Monotonic,
  b: Monotonic.Monotonic,
  tolerance: number
): boolean =>
  Math.abs(a.run(0) - b.run(0)) <= tolerance &&
  Math.abs(a.run(1) - b.run(1)) <= tolerance;

export interface BBoxConflict {
  key: BBoxKey;
  /** Value the new equation asserts (evaluated at σ=0 for the message). */
  asserted: number;
  /** Value the already-solved system implies (evaluated at σ=0). */
  implied: number;
  owner: string | undefined;
  priorOwner: string | undefined;
}

interface Equation {
  key: BBoxKey;
  value: Monotonic.Monotonic;
  owner: string | undefined;
}

/** Solved unknowns `[min, size]` (σ-affine), or undefined when rank < 2. */
type Solution = [Monotonic.Monotonic, Monotonic.Monotonic] | undefined;

export class BBox {
  /** Independent equations retained (at most 2 drive the solve). */
  private eqs: Equation[] = [];
  private solution: Solution = undefined;

  /**
   * Add one box-key equation. Returns a conflict descriptor when the write is
   * inconsistent with the already-determined system (rank-2 over-determination
   * or a second write to the same key with a different value), else
   * undefined. A consistent or new equation is absorbed.
   */
  add(
    key: BBoxKey,
    value: BBoxValue,
    owner?: string,
    tolerance = 1e-6
  ): BBoxConflict | undefined {
    const mono = asMono(value);
    // If the system already determines this key, the write is a redundant
    // check rather than new information (rank-2 over-determination, or a repeat
    // of an existing key). Verify consistency; report on violation.
    if (this.solution !== undefined) {
      const implied = this.readMono(key)!;
      if (!monoEqual(implied, mono, tolerance)) {
        return {
          key,
          asserted: mono.run(0),
          implied: implied.run(0),
          owner,
          priorOwner: this.eqs[0]?.owner,
        };
      }
      return undefined;
    }
    const existing = this.eqs.find((e) => e.key === key);
    if (existing) {
      // Same key again: a consistent repeat is ignored; a contradiction is a
      // single-owner conflict.
      if (!monoEqual(existing.value, mono, tolerance)) {
        return {
          key,
          asserted: mono.run(0),
          implied: existing.value.run(0),
          owner,
          priorOwner: existing.owner,
        };
      }
      return undefined;
    }
    // Reject a second equation that is linearly dependent on the first (e.g.
    // `min` then `min`): handled above by the same-key check. Distinct keys
    // are always independent here (the four keys are pairwise independent in
    // 2 unknowns), so two distinct keys solve the system.
    this.eqs.push({ key, value: mono, owner });
    if (this.eqs.length === 2) this.solve();
    return undefined;
  }

  private solve(): void {
    const [a, b] = this.eqs;
    const [a0, a1] = COEFFS[a.key];
    const [b0, b1] = COEFFS[b.key];
    const det = a0 * b1 - a1 * b0;
    if (Math.abs(det) < 1e-12) return; // dependent (shouldn't happen for distinct keys)
    // min  = (a·b1 − b·a1) / det,  size = (a0·b − b0·a) / det — as Monotonics.
    const min = Monotonic.add(
      Monotonic.smul(b1 / det, a.value),
      Monotonic.smul(-a1 / det, b.value)
    );
    const size = Monotonic.add(
      Monotonic.smul(a0 / det, b.value),
      Monotonic.smul(-b0 / det, a.value)
    );
    this.solution = [min, size];
  }

  /** Whether the system is fully determined (rank 2). */
  get solved(): boolean {
    return this.solution !== undefined;
  }

  /** Read a box key as a σ-affine claim: from the solve when determined, else
   *  from a direct pin, else undefined (under-determined). */
  readMono(key: BBoxKey): Monotonic.Monotonic | undefined {
    if (this.solution !== undefined) {
      const [min, size] = this.solution;
      const [c0, c1] = COEFFS[key];
      return Monotonic.add(Monotonic.smul(c0, min), Monotonic.smul(c1, size));
    }
    return this.eqs.find((e) => e.key === key)?.value;
  }

  /** Read a box key evaluated at scale factor `sigma` (default 0). A constant
   *  (all-numeric) key reads back as its number — the path every caller uses
   *  today. */
  read(key: BBoxKey, sigma = 0): number | undefined {
    return this.readMono(key)?.run(sigma);
  }
}

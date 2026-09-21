/**
 * The σ-affine layout solver.
 *
 * The model: a measure's data→screen map on one axis is affine,
 * `screen(d) = origin + σ·d`, with two parameters — **σ = slope** (px per data
 * unit) and **origin/baseline = intercept** (screen position of data-0). Layout is equations in these; key values are σ-affine
 * (`Monotonic` = `slope·σ + intercept`, reused from `util/monotonic`), so the
 * system propagates with σ symbolic and resolves it once per scope at the frame
 * equation.
 *
 * Standalone and test-only: nothing in the render pipeline imports it. It is a
 * generalization of the production `BBox` (`constraints/bbox.ts`) with `minCoeff`
 * — the baseline as a first-class unknown — exercised by the paper cases in
 * `tests/solver.test.ts`.
 */
import * as M from "../../util/monotonic";

/** A named box key. `baseline` is the origin (intercept); the anchors
 *  (min/center/max) are free-space guidelines at offsets from it; `size` is the
 *  extent. */
export type BoxKey = "baseline" | "min" | "center" | "max" | "size";

/**
 * Coefficients of a box key on the unknowns `(baseline, size)`, parameterized by
 * the shape's `minCoeff` — the offset of its local min-edge from the baseline in
 * size-units (upward bar `0`, downward bar `-1`, centered shape `-0.5`):
 *
 *   min    = baseline + minCoeff·size
 *   max    = baseline + (minCoeff+1)·size
 *   center = baseline + (minCoeff+0.5)·size
 *   baseline, size are the unknowns themselves.
 *
 * The production `BBox` (unknowns `(min, size)`, `min=[1,0]`/`max=[1,1]`/…) is
 * exactly the `minCoeff=0` case — baseline ≡ min, the upward-bar assumption that
 * forced the real origin off-ledger into `transform.translate`. Letting
 * `minCoeff` vary makes the origin a first-class unknown and baseline a normal
 * box key.
 */
const coeffs = (key: BoxKey, minCoeff: number): [number, number] => {
  switch (key) {
    case "baseline":
      return [1, 0];
    case "size":
      return [0, 1];
    case "min":
      return [1, minCoeff];
    case "center":
      return [1, minCoeff + 0.5];
    case "max":
      return [1, minCoeff + 1];
  }
};

const asMono = (v: M.Monotonic | number): M.Monotonic =>
  typeof v === "number" ? M.linear(0, v) : v;

/** A box-key equation that contradicts the already-solved system. */
export interface BoxConflict {
  key: BoxKey;
  asserted: number;
  implied: number;
}

/**
 * A node's per-axis box: a 2-unknown linear system in `(baseline, size)` whose
 * key values are σ-affine `Monotonic`s. Two independent keys determine the
 * box; a consistent third is checked, a contradictory third reported (mirrors
 * `BBox`'s named-conflict contract). Reads evaluate at a given σ.
 */
export class SolverBox {
  private eqs: { key: BoxKey; value: M.Monotonic }[] = [];
  private sol?: [M.Monotonic, M.Monotonic]; // (baseline, size)

  constructor(public readonly minCoeff = 0) {}

  /** Add a box-key equation (σ-affine, or a constant number). Returns a conflict
   *  descriptor when inconsistent with the determined system, else undefined. */
  add(
    key: BoxKey,
    value: M.Monotonic | number,
    tolerance = 1e-6
  ): BoxConflict | undefined {
    const mono = asMono(value);
    if (this.sol) {
      const implied = this.keyMono(key)!;
      if (!this.monoEqual(implied, mono, tolerance))
        return { key, asserted: mono.run(0), implied: implied.run(0) };
      return undefined;
    }
    const existing = this.eqs.find((e) => e.key === key);
    if (existing) {
      if (!this.monoEqual(existing.value, mono, tolerance))
        return { key, asserted: mono.run(0), implied: existing.value.run(0) };
      return undefined;
    }
    this.eqs.push({ key, value: mono });
    if (this.eqs.length === 2) this.solve();
    return undefined;
  }

  private monoEqual(a: M.Monotonic, b: M.Monotonic, tol: number): boolean {
    // Two points pin a line: probe at σ=0 (intercept) and σ=1.
    return (
      Math.abs(a.run(0) - b.run(0)) <= tol &&
      Math.abs(a.run(1) - b.run(1)) <= tol
    );
  }

  private solve(): void {
    const [e1, e2] = this.eqs;
    const [a0, a1] = coeffs(e1.key, this.minCoeff);
    const [b0, b1] = coeffs(e2.key, this.minCoeff);
    const det = a0 * b1 - a1 * b0;
    if (Math.abs(det) < 1e-12)
      throw new Error("dependent keys — system underdetermined");
    // (baseline, size) = M⁻¹ · (e1, e2), as σ-affine Monotonics.
    const baseline = M.add(
      M.smul(b1 / det, e1.value),
      M.smul(-a1 / det, e2.value)
    );
    const size = M.add(M.smul(a0 / det, e2.value), M.smul(-b0 / det, e1.value));
    this.sol = [baseline, size];
  }

  /** A box key as a σ-affine claim: from the solve when determined, else a direct
   *  pin, else undefined. */
  keyMono(key: BoxKey): M.Monotonic | undefined {
    if (this.sol) {
      const [c0, c1] = coeffs(key, this.minCoeff);
      return M.add(M.smul(c0, this.sol[0]), M.smul(c1, this.sol[1]));
    }
    return this.eqs.find((e) => e.key === key)?.value;
  }

  /** A box key evaluated at scale factor `sigma` (default 0 → the intercept). */
  read(key: BoxKey, sigma = 0): number | undefined {
    return this.keyMono(key)?.run(sigma);
  }

  get solved(): boolean {
    return this.sol !== undefined;
  }
}

/**
 * One axis of one σ-scope: a set of node boxes sharing a single σ, resolved once
 * from the scope's frame equation (`content(σ) = allocated` → `Monotonic.inverse`,
 * which is already how the engine finds σ — just deferred to the boundary). A
 * nested scope (`coord`, or an escape-hatch operator) inherits or re-resolves σ.
 */
export class AxisScope {
  readonly boxes = new Map<string, SolverBox>();
  private _sigma?: number;

  /** Get/create a node's box; `minCoeff` is the shape's anchor convention. */
  box(id: string, minCoeff = 0): SolverBox {
    let b = this.boxes.get(id);
    if (!b) this.boxes.set(id, (b = new SolverBox(minCoeff)));
    return b;
  }

  /** Resolve σ so the scope's σ-affine content extent equals `allocated` px. */
  resolveSigma(content: M.Monotonic, allocated: number): number {
    const s = content.inverse(allocated);
    if (s === undefined)
      throw new Error("frame equation does not determine σ (slope 0)");
    return (this._sigma = s);
  }

  /** Inherit a parent scope's σ directly (nested same-measure scope, or σ=1). */
  setSigma(sigma: number): number {
    return (this._sigma = sigma);
  }

  get sigma(): number {
    if (this._sigma === undefined)
      throw new Error("σ not resolved for this scope");
    return this._sigma;
  }

  /** A node's box key as a concrete screen value at the resolved σ. */
  read(id: string, key: BoxKey): number | undefined {
    return this.boxes.get(id)?.read(key, this._sigma ?? 0);
  }
}

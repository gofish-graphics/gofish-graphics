// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Piecewise-Linear Values — /internals/core/pwl
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

/**
 * A layer's plan as formulas (#1176 step 3e). The claim walk runs the
 * placement solve once per layer and axis in an {@link Arith} whose values
 * are nodes of a {@link Tape}: each node is a sum, scaling, max or absolute
 * value of earlier nodes, a value in σ, or an input. An input is something
 * only layout measures: a child's laid box, the pixel its frame puts data 0
 * at, where a child it does not place landed (a self-placed shape, a `ref`'s
 * target). Every node also carries its value in σ with each input at its
 * claim (`claim`), which is what the claim walk reads, and which decides the
 * solve's choices (which pin wins, which fallback a component takes). Layout
 * evaluates the same formulas at the solved σ with the inputs it measured
 * ({@link evaluate}); it does not solve again.
 *
 * A node that depends on no input is folded into a value in σ, so a plan
 * holds nodes only where layout's inputs reach.
 */
import * as Pwl from "./pwl";
import type { Arith, CheckOwners } from "./arith";

/** A node of a {@link Tape}. */
export type F = number & { readonly __formula: unique symbol };

const enum Op {
  /** A value in σ (`claim`). */
  Pwl,
  /** An input, read at layout (`inputs[arg]`). */
  Input,
  Add,
  Scale,
  Max,
  Abs,
}

/** An input of a plan: what layout reads for it (`key`), and its value in
 *  the claim walk. */
export type PlanInput = { key: string; claim: Pwl.Value };

export class Tape {
  readonly claim: Pwl.Value[] = [];
  readonly op: Op[] = [];
  readonly args: (number | number[])[] = [];
  readonly k: number[] = [];
  /** Whether a node depends on an input. */
  private readonly impure: boolean[] = [];
  readonly inputs: PlanInput[] = [];
  /** The checks the solve left for layout (`Arith.agree`): two nodes that
   *  must agree where layout evaluates them, or the constraints conflict. */
  readonly checks: (CheckOwners & { a: F; b: F; tolerance: number })[] = [];
  private readonly byKey = new Map<string, F>();

  private push(
    op: Op,
    claim: Pwl.Value,
    args: number | number[],
    k: number,
    impure: boolean
  ): F {
    const id = this.op.length;
    this.op.push(op);
    this.claim.push(claim);
    this.args.push(args);
    this.k.push(k);
    this.impure.push(impure);
    return id as F;
  }

  /** A value in σ. */
  value(v: Pwl.Value): F {
    return this.push(Op.Pwl, v, 0, 0, false);
  }

  /** The input layout reads by `key` (one node per key), `claim` in the
   *  claim walk. */
  input(key: string, claim: Pwl.Value): F {
    const prior = this.byKey.get(key);
    if (prior !== undefined) return prior;
    this.inputs.push({ key, claim });
    const id = this.push(Op.Input, claim, this.inputs.length - 1, 0, true);
    this.byKey.set(key, id);
    return id;
  }

  /** Whether `x` depends on an input. */
  dependsOnInputs(x: F): boolean {
    return this.impure[x];
  }

  readonly arith: Arith<F> = (() => {
    const claimOf = (x: F) => this.claim[x];
    const anyImpure = (xs: readonly F[]) => xs.some((x) => this.impure[x]);
    const zero = this.value(Pwl.ZERO);
    const add = (...xs: F[]): F => {
      const c = Pwl.add(...xs.map(claimOf));
      return anyImpure(xs)
        ? this.push(Op.Add, c, xs.slice(), 0, true)
        : this.value(c);
    };
    const scale = (k: number, x: F): F => {
      const c = Pwl.scale(k, claimOf(x));
      return this.impure[x]
        ? this.push(Op.Scale, c, x, k, true)
        : this.value(c);
    };
    const negate = (x: F): F => scale(-1, x);
    return {
      zero,
      constant: (c) => this.value(Pwl.affine(0, c)),
      add,
      sub: (a, b) => add(a, negate(b)),
      scale,
      max: (xs) => {
        const c = Pwl.envelope(xs.map(claimOf));
        return anyImpure(xs)
          ? this.push(Op.Max, c, xs.slice(), 0, true)
          : this.value(c);
      },
      negate,
      abs: (x) => {
        const c = Pwl.envelope([claimOf(x), Pwl.negate(claimOf(x))]);
        return this.impure[x]
          ? this.push(Op.Abs, c, x, 0, true)
          : this.value(c);
      },
      near: (a, b, tolerance) =>
        Pwl.approxEqual(claimOf(a), claimOf(b), tolerance),
      agree: (a, b, tolerance, owners) => {
        this.checks.push({ a, b, tolerance, ...owners });
        return true;
      },
      toValue: claimOf,
      fromValue: (v) => this.value(v),
      report: (x) => Pwl.at(claimOf(x), 0),
    };
  })();
}

/**
 * Every node of `tape` at σ = `sigma`, with each input as layout measured
 * it (`read`). An input layout has no number for reads as its claim at σ.
 */
export function evaluate(
  tape: Tape,
  sigma: number,
  read: (key: string) => number | undefined
): Float64Array {
  const t = tape;
  const n = t.op.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = t.args[i];
    switch (t.op[i]) {
      case Op.Pwl:
        out[i] = Pwl.at(t.claim[i], sigma);
        break;
      case Op.Input: {
        const v = read(t.inputs[a as number].key);
        out[i] = v ?? Pwl.at(t.claim[i], sigma);
        break;
      }
      case Op.Add: {
        let s = 0;
        for (const j of a as number[]) s += out[j];
        out[i] = s;
        break;
      }
      case Op.Scale:
        out[i] = t.k[i] * out[a as number];
        break;
      case Op.Max: {
        let m = -Infinity;
        for (const j of a as number[]) m = Math.max(m, out[j]);
        out[i] = m;
        break;
      }
      case Op.Abs:
        out[i] = Math.abs(out[a as number]);
        break;
    }
  }
  return out;
}

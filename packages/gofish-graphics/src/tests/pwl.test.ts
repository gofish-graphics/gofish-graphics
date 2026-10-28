/**
 * The piecewise-linear value algebra (ast/solver/pwl.ts) that size claims are
 * written in. The arithmetic and envelope cases are ported from the symbolic
 * layout kernel's tests (layout-engine-prototype `test/kernel.test.ts`, #1176).
 * Run: `tsx src/tests/pwl.test.ts` (wired into `pnpm test` as `test:pwl`).
 */
import * as Pwl from "../ast/solver/pwl";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const { affine, at } = Pwl;
/** A piecewise value from its segments' lines and breakpoints. */
const pwl = (
  lines: [slope: number, intercept: number][],
  breaks: number[]
): Pwl.Value =>
  ({
    kind: "piecewise",
    segments: lines.map(([slope, intercept], k) => ({
      from: k === 0 ? 0 : breaks[k - 1],
      to: k < breaks.length ? breaks[k] : Infinity,
      slope,
      intercept,
    })),
  }) as Pwl.Piecewise;

console.log("# pwl: affine arithmetic");
{
  const first = affine(2, 3);
  const second = affine(-1, 7);
  const sum = Pwl.add(first, second);
  ok(
    "the sum of two lines is a line",
    Pwl.isAffine(sum) && sum.slope === 1 && sum.intercept === 10
  );
  const difference = Pwl.add(first, Pwl.negate(second));
  ok(
    "the difference of two lines is a line",
    Pwl.isAffine(difference) &&
      difference.slope === 3 &&
      difference.intercept === -4
  );
  // A value that rises to 10 at σ = 5, then falls.
  const changing = pwl(
    [
      [2, 0],
      [-1, 15],
    ],
    [5]
  );
  const added = Pwl.add(changing, first);
  ok(
    "a sum keeps the breakpoints of its terms",
    [0, 4.9, 5, 5.1, 100].every(
      (x) => at(added, x) === at(changing, x) + at(first, x)
    )
  );
  const scaled = Pwl.scale(-2, changing);
  ok(
    "a negative scale of a piecewise value is exact (not the max of the scaled lines)",
    [0, 2, 5, 9, 100].every((x) => at(scaled, x) === -2 * at(changing, x))
  );
}

console.log("# pwl: envelopes agree with direct evaluation");
{
  let seed = 4271;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let worst = 0;
  for (let trial = 0; trial < 80; trial++) {
    const values = Array.from({ length: 2 + (trial % 17) }, () =>
      pwl(
        [
          [Math.floor(random() * 17) - 8, Math.floor(random() * 100) - 50],
          [Math.floor(random() * 17) - 8, Math.floor(random() * 100) - 50],
        ],
        [7]
      )
    );
    // Continuous inputs only arise from claims, but the envelope does not
    // need them: each input is read on its own segments.
    const envelope = Pwl.envelope(values);
    const samples = [0, 0.1, 6.9, 7, 7.1, 30, 1e5];
    if (envelope.kind === "piecewise")
      for (const s of envelope.segments) {
        samples.push(s.from + 1e-5);
        if (s.from > 1e-5) samples.push(s.from - 1e-5);
      }
    for (const x of samples) {
      const expected = Math.max(...values.map((v) => at(v, x)));
      worst = Math.max(worst, Math.abs(at(envelope, x) - expected));
    }
  }
  ok("80 random envelopes of piecewise values", worst < 1e-6, `${worst}`);
}
{
  const lines = [affine(0, 2), affine(0, 1), affine(0, 2), affine(1e-10, 0)];
  const upper = Pwl.envelope(lines);
  ok(
    "parallel, dominated and nearly parallel lines keep the right winner",
    [0, 1, 1e10, 2e10, 4e10].every(
      (x) =>
        at(upper, x) === Math.max(...lines.map((l) => l.slope * x + l.intercept))
    )
  );
  const many = Array.from({ length: 200 }, (_, i) =>
    affine((i * 37) % 23, (i * 53) % 101)
  );
  const hull = Pwl.envelope(many);
  ok(
    "an envelope of many lines keeps only the ones that bound it",
    hull.kind === "piecewise" &&
      hull.segments.length <= 23 &&
      [0, 0.5, 3, 40, 1e4].every(
        (x) =>
          at(hull, x) ===
          Math.max(...many.map((l) => l.slope * x + l.intercept))
      )
  );
  ok(
    "the envelope of one line is that line, and the max ignores zero claims",
    Pwl.envelope([affine(3, 1)]).kind === "affine" &&
      at(Pwl.max(affine(-1, 5), Pwl.ZERO), 10) === -5
  );
}

console.log("# pwl: solving v(σ) = target");
{
  ok("a line solves its one root", Pwl.solve(affine(6, 20), 500) === 80);
  ok(
    "a line flat at the target leaves σ undetermined",
    Pwl.solve(affine(0, 500), 500) === undefined &&
      Pwl.solve(affine(0, 400), 500) === undefined
  );
  // #1179: fixed parts larger than the slot have no σ ≥ 0.
  ok(
    "no σ ≥ 0 reaches a target below the fixed parts (no negative σ)",
    Pwl.solve(affine(6, 1000), 400) === undefined
  );
  // max(2σ, σ + 30): bends at σ = 30.
  const bent = Pwl.envelope([affine(2, 0), affine(1, 30)]);
  ok(
    "a bent envelope solves on the piece that reaches the target",
    Pwl.solve(bent, 40) === 10 &&
      Pwl.solve(bent, 100) === 50 &&
      Pwl.solve(bent, 20) === undefined,
    `${Pwl.solve(bent, 40)}, ${Pwl.solve(bent, 100)}`
  );
  // A hull that dips and rises (the prototype's non-monotone fit): 27.5 at
  // σ = 5 and σ = 15. The rising root is the one a scope takes.
  const dip = Pwl.envelope([affine(-1.5, 35), affine(0.5, 20)]);
  ok(
    "a value that dips then rises solves where it rises through the target",
    Pwl.solve(dip, 27.5) === 15,
    `${Pwl.solve(dip, 27.5)}`
  );
  const flatThenRising = Pwl.envelope([affine(0, 10), affine(1, 0)]);
  ok(
    "a value flat at the target before it rises solves where it starts to rise",
    Pwl.solve(flatThenRising, 10) === 10
  );
  ok(
    "the part that grows is the slope it tends to",
    Pwl.rising(bent)?.slope === 2 &&
      Pwl.rising(Pwl.negate(bent)) === undefined &&
      Pwl.rising(dip)?.slope === 0.5
  );
}

console.log("# pwl: the cancellation rule decides whether a sum depends on σ");
{
  // A one-value domain's ascent and descent, each off by a rounding: their σ
  // parts cancel, so the width does not depend on σ.
  const v = 0.1 + 0.2; // 0.30000000000000004
  const width = Pwl.add(affine(v, 3), affine(-0.3, 3));
  ok(
    "σ parts that cancel to a rounding sum to a constant",
    Pwl.isConstant(width) && Pwl.solve(width, 200) === undefined,
    Pwl.print(width)
  );
  // Epoch milliseconds: a one-millisecond domain far from 0 is a real width.
  const t = 1.7e12;
  const ms = Pwl.add(affine(t + 1, 0), affine(-t, 0));
  ok(
    "a small width summed from large terms is kept when it is above rounding",
    Pwl.isAffine(ms) && ms.slope === 1
  );
  ok(
    "a small slope summed from small terms is kept",
    (Pwl.add(affine(1e-14, 0), affine(1e-14, 0)) as Pwl.Affine).slope === 2e-14
  );
  // The same rule holds segment by segment in a piecewise sum.
  const bent = Pwl.envelope([affine(v, 0), affine(0, 1)]);
  ok(
    "piecewise σ parts that cancel sum to a constant",
    Pwl.isConstant(Pwl.add(bent, Pwl.scale(-1, Pwl.envelope([affine(0.3, 0), affine(0, 1)])))),
  );
}

console.log("# pwl: equality and printing");
{
  const a = Pwl.envelope([affine(2, 0), affine(1, 30)]);
  const b = Pwl.envelope([affine(1, 30), affine(2, 0), affine(0, 5)]);
  const c = Pwl.envelope([affine(2, 0), affine(1, 31)]);
  ok(
    "the same envelope built two ways is equal; a shifted one is not",
    Pwl.approxEqual(a, b) && !Pwl.approxEqual(a, c)
  );
  ok(
    "a line and a bent envelope print as equations",
    Pwl.print(affine(40, 16)) === "40σ + 16" &&
      Pwl.print(a) === "max(1σ + 30, 2σ)",
    Pwl.print(a)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

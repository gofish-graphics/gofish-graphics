/** Algebraic laws for the proof-bearing layout Claim language. */
import {
  addClaims,
  claim,
  constantClaim,
  datumClaim,
  fitClaim,
  maxClaims,
  runClaim,
  scaleClaim,
  shiftClaim,
  type Claim,
} from "../ast/layoutClaims";

let passed = 0;
let failed = 0;

function ok(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sameClaim = (left: Claim, right: Claim): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const approximatelyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));

const permutations = <T>(values: readonly T[]): T[][] => {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      (rest) => [value, ...rest]
    )
  );
};

console.log("# layout claims: canonical max-plus laws");
{
  const a = claim({ slope: 2, intercept: 1 });
  const b = claim({ slope: 1, intercept: 5 });
  const c = constantClaim(3);
  const values = [a, b, c];

  const sums = permutations(values).map((order) => addClaims(...order));
  ok(
    "addition is permutation invariant",
    sums.every((value) => sameClaim(value, sums[0]))
  );
  ok(
    "addition is associative",
    sameClaim(addClaims(a, addClaims(b, c)), addClaims(addClaims(a, b), c))
  );

  const maxima = permutations(values).map((order) => maxClaims(...order));
  ok(
    "maximum is permutation invariant",
    maxima.every((value) => sameClaim(value, maxima[0]))
  );
  ok(
    "maximum is associative",
    sameClaim(maxClaims(a, maxClaims(b, c)), maxClaims(maxClaims(a, b), c))
  );
  ok("maximum is idempotent", sameClaim(maxClaims(a, a), a));
}

console.log("# layout claims: minimal upper-envelope canonicalization");
{
  // The middle line crosses both neighbors at sigma=5, but is never strictly
  // above their maximum. Pairwise dominance cannot remove it because each
  // neighbor has either the smaller slope or the smaller intercept.
  const envelope = claim(
    { slope: 0, intercept: 10 },
    { slope: 1, intercept: 5 },
    { slope: 2, intercept: 0 }
  );
  ok(
    "a crossing line that never binds is removed",
    sameClaim(
      envelope,
      claim({ slope: 0, intercept: 10 }, { slope: 2, intercept: 0 })
    ),
    JSON.stringify(envelope)
  );

  const operands = [
    claim({ slope: 0, intercept: 8 }, { slope: 2, intercept: 0 }),
    claim({ slope: 1, intercept: 4 }, { slope: 3, intercept: -2 }),
    claim({ slope: 0, intercept: 3 }, { slope: 4, intercept: -9 }),
  ];
  const sum = addClaims(...operands);
  const samples = [0, 0.5, 1, 2, 3, 5, 8, 13];
  const pointwise = samples.map((sigma) => ({
    actual: runClaim(sum, sigma),
    expected: operands.reduce(
      (total, operand) => total + runClaim(operand, sigma),
      0
    ),
  }));
  ok(
    "addition equals the pointwise sum across envelope crossings",
    pointwise.every(({ actual, expected }) =>
      approximatelyEqual(actual, expected)
    ),
    JSON.stringify(pointwise)
  );

  const twoPiece = claim(
    { slope: 0, intercept: 10 },
    { slope: 1, intercept: 0 }
  );
  const repeated = addClaims(...new Array<Claim>(16).fill(twoPiece));
  ok(
    "repeated two-piece additions retain only the active pieces",
    repeated.pieces.length === 2 &&
      sameClaim(
        repeated,
        claim({ slope: 0, intercept: 160 }, { slope: 16, intercept: 0 })
      ),
    JSON.stringify(repeated)
  );
}

console.log("# layout claims: closure and monotonicity");
{
  const composed = shiftClaim(
    addClaims(scaleClaim(0.5, datumClaim(8)), constantClaim(6)),
    -10
  );
  const samples = [0, 0.5, 1, 2, 4].map((sigma) => runClaim(composed, sigma));
  ok(
    "composition remains non-negative",
    samples.every((sample) => sample >= 0),
    JSON.stringify(samples)
  );
  ok(
    "composition remains non-decreasing",
    samples.every(
      (sample, index) => index === 0 || sample >= samples[index - 1]
    ),
    JSON.stringify(samples)
  );

  let negativeScaleRejected = false;
  try {
    scaleClaim(-1, composed);
  } catch {
    negativeScaleRejected = true;
  }
  ok("negative scalar is rejected", negativeScaleRejected);
}

console.log("# layout claims: explicit fit outcomes");
{
  const fixed = constantClaim(10);
  ok(
    "a fixed claim at its extent is underdetermined",
    fitClaim(fixed, 10).kind === "underdetermined"
  );
  ok(
    "a fixed claim below budget reports slack",
    fitClaim(fixed, 20).kind === "slack"
  );
  ok(
    "a fixed claim above budget reports overflow",
    fitClaim(fixed, 5).kind === "overflow"
  );

  const linear = claim({ slope: 2, intercept: 3 });
  const fit = fitClaim(linear, 13);
  ok(
    "a growing affine claim has an exact fit",
    fit.kind === "exact" && fit.sigma === 5 && fit.extent === 13,
    JSON.stringify(fit)
  );

  const plateau = claim(
    { slope: 0, intercept: 10 },
    { slope: 2, intercept: 0 }
  );
  ok(
    "a minimum plateau reports underdetermination",
    fitClaim(plateau, 10).kind === "underdetermined"
  );
  const afterPlateau = fitClaim(plateau, 12);
  ok(
    "growth after a plateau has an exact least fit",
    afterPlateau.kind === "exact" && afterPlateau.sigma === 6,
    JSON.stringify(afterPlateau)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

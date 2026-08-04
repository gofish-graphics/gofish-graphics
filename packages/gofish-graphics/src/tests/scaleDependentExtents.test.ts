/** Algebraic laws for the proof-bearing ScaleDependentExtent language. */
import {
  addExtents,
  constantExtent,
  dataExtent,
  extentAtScale,
  fitScale,
  maxExtents,
  scaleDependentExtent,
  scaleExtent,
  shiftExtent,
  type ScaleDependentExtent,
} from "../ast/scaleDependentExtents";

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

const sameExtent = (
  left: ScaleDependentExtent,
  right: ScaleDependentExtent
): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const approximatelyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <=
  8 * Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));

const approximatelyEquivalentAt = (
  left: ScaleDependentExtent,
  right: ScaleDependentExtent,
  samples: readonly number[]
): boolean =>
  samples.every((sigma) =>
    approximatelyEqual(
      extentAtScale(left, sigma),
      extentAtScale(right, sigma)
    )
  );

const permutations = <T>(values: readonly T[]): T[][] => {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      (rest) => [value, ...rest]
    )
  );
};

console.log("# scale-dependent extents: canonical max-plus laws");
{
  const a = scaleDependentExtent({ slope: 2, intercept: 1 });
  const b = scaleDependentExtent({ slope: 1, intercept: 5 });
  const c = constantExtent(3);
  const values = [a, b, c];

  const sums = permutations(values).map((order) => addExtents(...order));
  ok(
    "addition is permutation invariant for exactly represented coefficients",
    sums.every((value) => sameExtent(value, sums[0]))
  );
  ok(
    "addition is associative for exactly represented coefficients",
    sameExtent(
      addExtents(a, addExtents(b, c)),
      addExtents(addExtents(a, b), c)
    )
  );

  const maxima = permutations(values).map((order) => maxExtents(...order));
  ok(
    "maximum is permutation invariant",
    maxima.every((value) => sameExtent(value, maxima[0]))
  );
  ok(
    "maximum is associative",
    sameExtent(
      maxExtents(a, maxExtents(b, c)),
      maxExtents(maxExtents(a, b), c)
    )
  );
  ok("maximum is idempotent", sameExtent(maxExtents(a, a), a));
}

console.log("# scale-dependent extents: floating-point policy");
{
  const decimalOperands = [
    dataExtent(0.1),
    dataExtent(0.2),
    dataExtent(0.3),
  ];
  const decimalSums = permutations(decimalOperands).map((order) =>
    addExtents(...order)
  );
  ok(
    "decimal reordering is not promised to preserve structural equality",
    decimalSums.some((value) => !sameExtent(value, decimalSums[0]))
  );
  ok(
    "decimal reordering preserves sampled denotation within numeric tolerance",
    decimalSums.every((value) =>
      approximatelyEquivalentAt(value, decimalSums[0], [0, 0.5, 1, 10, 100])
    )
  );

  const huge = constantExtent(1e16);
  const one = constantExtent(1);
  const leftAssociated = addExtents(addExtents(huge, one), one);
  const rightAssociated = addExtents(huge, addExtents(one, one));
  ok(
    "large-magnitude addition exposes non-associative number rounding",
    !sameExtent(leftAssociated, rightAssociated)
  );
  ok(
    "large-magnitude regrouping remains within the numeric tolerance",
    approximatelyEquivalentAt(leftAssociated, rightAssociated, [0, 1, 100])
  );
}

console.log("# scale-dependent extents: minimal upper-envelope canonicalization");
{
  // The middle line crosses both neighbors at sigma=5, but is never strictly
  // above their maximum. Pairwise dominance cannot remove it because each
  // neighbor has either the smaller slope or the smaller intercept.
  const envelope = scaleDependentExtent(
    { slope: 0, intercept: 10 },
    { slope: 1, intercept: 5 },
    { slope: 2, intercept: 0 }
  );
  ok(
    "a crossing line that never binds is removed",
    sameExtent(
      envelope,
      scaleDependentExtent(
        { slope: 0, intercept: 10 },
        { slope: 2, intercept: 0 }
      )
    ),
    JSON.stringify(envelope)
  );

  const operands = [
    scaleDependentExtent(
      { slope: 0, intercept: 8 },
      { slope: 2, intercept: 0 }
    ),
    scaleDependentExtent(
      { slope: 1, intercept: 4 },
      { slope: 3, intercept: -2 }
    ),
    scaleDependentExtent(
      { slope: 0, intercept: 3 },
      { slope: 4, intercept: -9 }
    ),
  ];
  const sum = addExtents(...operands);
  const samples = [0, 0.5, 1, 2, 3, 5, 8, 13];
  const pointwise = samples.map((sigma) => ({
    actual: extentAtScale(sum, sigma),
    expected: operands.reduce(
      (total, operand) => total + extentAtScale(operand, sigma),
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

  const twoPiece = scaleDependentExtent(
    { slope: 0, intercept: 10 },
    { slope: 1, intercept: 0 }
  );
  const repeated = addExtents(
    ...new Array<ScaleDependentExtent>(16).fill(twoPiece)
  );
  ok(
    "repeated two-piece additions retain only the active pieces",
    repeated.pieces.length === 2 &&
      sameExtent(
        repeated,
        scaleDependentExtent(
          { slope: 0, intercept: 160 },
          { slope: 16, intercept: 0 }
        )
      ),
    JSON.stringify(repeated)
  );
}

console.log("# scale-dependent extents: closure and monotonicity");
{
  const composed = shiftExtent(
    addExtents(scaleExtent(0.5, dataExtent(8)), constantExtent(6)),
    -10
  );
  const samples = [0, 0.5, 1, 2, 4].map((sigma) =>
    extentAtScale(composed, sigma)
  );
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
    scaleExtent(-1, composed);
  } catch {
    negativeScaleRejected = true;
  }
  ok("negative scalar is rejected", negativeScaleRejected);
}

console.log("# scale-dependent extents: explicit fit outcomes");
{
  const fixed = constantExtent(10);
  ok(
    "a fixed extent at the available extent is underdetermined",
    fitScale(fixed, 10).kind === "underdetermined"
  );
  const slack = fitScale(fixed, 20);
  ok(
    "slack preserves the full required extent and reports only unused pixels",
    slack.kind === "slack" && slack.extent === 10 && slack.unused === 10,
    JSON.stringify(slack)
  );
  const overflow = fitScale(fixed, 5);
  ok(
    "overflow reports that no feasible scale can satisfy the hard extent",
    overflow.kind === "overflow" &&
      overflow.minimumExtent === 10 &&
      overflow.deficit === 5,
    JSON.stringify(overflow)
  );

  const linear = scaleDependentExtent({ slope: 2, intercept: 3 });
  const fit = fitScale(linear, 13);
  ok(
    "a growing affine extent has an exact fit",
    fit.kind === "exact" && fit.sigma === 5 && fit.extent === 13,
    JSON.stringify(fit)
  );

  const plateau = scaleDependentExtent(
    { slope: 0, intercept: 10 },
    { slope: 2, intercept: 0 }
  );
  ok(
    "a minimum plateau reports underdetermination",
    fitScale(plateau, 10).kind === "underdetermined"
  );
  const afterPlateau = fitScale(plateau, 12);
  ok(
    "growth after a plateau has an exact least fit",
    afterPlateau.kind === "exact" && afterPlateau.sigma === 6,
    JSON.stringify(afterPlateau)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

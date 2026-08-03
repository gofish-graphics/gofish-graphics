/** Algebraic laws for the proof-bearing SizeRequest language. */
import {
  addRequests,
  constantRequest,
  dataRequest,
  fitSizeRequest,
  maxRequests,
  requestedExtentAt,
  scaleRequest,
  shiftRequest,
  sizeRequest,
  type SizeRequest,
} from "../ast/sizeRequests";

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

const sameRequest = (left: SizeRequest, right: SizeRequest): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const approximatelyEqual = (left: number, right: number): boolean =>
  Math.abs(left - right) <=
  8 * Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));

const approximatelyEquivalentAt = (
  left: SizeRequest,
  right: SizeRequest,
  samples: readonly number[]
): boolean =>
  samples.every((sigma) =>
    approximatelyEqual(
      requestedExtentAt(left, sigma),
      requestedExtentAt(right, sigma)
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

console.log("# size requests: canonical max-plus laws");
{
  const a = sizeRequest({ slope: 2, intercept: 1 });
  const b = sizeRequest({ slope: 1, intercept: 5 });
  const c = constantRequest(3);
  const values = [a, b, c];

  const sums = permutations(values).map((order) => addRequests(...order));
  ok(
    "addition is permutation invariant for exactly represented coefficients",
    sums.every((value) => sameRequest(value, sums[0]))
  );
  ok(
    "addition is associative for exactly represented coefficients",
    sameRequest(
      addRequests(a, addRequests(b, c)),
      addRequests(addRequests(a, b), c)
    )
  );

  const maxima = permutations(values).map((order) => maxRequests(...order));
  ok(
    "maximum is permutation invariant",
    maxima.every((value) => sameRequest(value, maxima[0]))
  );
  ok(
    "maximum is associative",
    sameRequest(
      maxRequests(a, maxRequests(b, c)),
      maxRequests(maxRequests(a, b), c)
    )
  );
  ok("maximum is idempotent", sameRequest(maxRequests(a, a), a));
}

console.log("# size requests: floating-point policy");
{
  const decimalOperands = [
    dataRequest(0.1),
    dataRequest(0.2),
    dataRequest(0.3),
  ];
  const decimalSums = permutations(decimalOperands).map((order) =>
    addRequests(...order)
  );
  ok(
    "decimal reordering is not promised to preserve structural equality",
    decimalSums.some((value) => !sameRequest(value, decimalSums[0]))
  );
  ok(
    "decimal reordering preserves sampled denotation within numeric tolerance",
    decimalSums.every((value) =>
      approximatelyEquivalentAt(value, decimalSums[0], [0, 0.5, 1, 10, 100])
    )
  );

  const huge = constantRequest(1e16);
  const one = constantRequest(1);
  const leftAssociated = addRequests(addRequests(huge, one), one);
  const rightAssociated = addRequests(huge, addRequests(one, one));
  ok(
    "large-magnitude addition exposes non-associative number rounding",
    !sameRequest(leftAssociated, rightAssociated)
  );
  ok(
    "large-magnitude regrouping remains within the numeric tolerance",
    approximatelyEquivalentAt(leftAssociated, rightAssociated, [0, 1, 100])
  );
}

console.log("# size requests: minimal upper-envelope canonicalization");
{
  // The middle line crosses both neighbors at sigma=5, but is never strictly
  // above their maximum. Pairwise dominance cannot remove it because each
  // neighbor has either the smaller slope or the smaller intercept.
  const envelope = sizeRequest(
    { slope: 0, intercept: 10 },
    { slope: 1, intercept: 5 },
    { slope: 2, intercept: 0 }
  );
  ok(
    "a crossing line that never binds is removed",
    sameRequest(
      envelope,
      sizeRequest({ slope: 0, intercept: 10 }, { slope: 2, intercept: 0 })
    ),
    JSON.stringify(envelope)
  );

  const operands = [
    sizeRequest({ slope: 0, intercept: 8 }, { slope: 2, intercept: 0 }),
    sizeRequest({ slope: 1, intercept: 4 }, { slope: 3, intercept: -2 }),
    sizeRequest({ slope: 0, intercept: 3 }, { slope: 4, intercept: -9 }),
  ];
  const sum = addRequests(...operands);
  const samples = [0, 0.5, 1, 2, 3, 5, 8, 13];
  const pointwise = samples.map((sigma) => ({
    actual: requestedExtentAt(sum, sigma),
    expected: operands.reduce(
      (total, operand) => total + requestedExtentAt(operand, sigma),
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

  const twoPiece = sizeRequest(
    { slope: 0, intercept: 10 },
    { slope: 1, intercept: 0 }
  );
  const repeated = addRequests(
    ...new Array<SizeRequest>(16).fill(twoPiece)
  );
  ok(
    "repeated two-piece additions retain only the active pieces",
    repeated.pieces.length === 2 &&
      sameRequest(
        repeated,
        sizeRequest({ slope: 0, intercept: 160 }, { slope: 16, intercept: 0 })
      ),
    JSON.stringify(repeated)
  );
}

console.log("# size requests: closure and monotonicity");
{
  const composed = shiftRequest(
    addRequests(scaleRequest(0.5, dataRequest(8)), constantRequest(6)),
    -10
  );
  const samples = [0, 0.5, 1, 2, 4].map((sigma) =>
    requestedExtentAt(composed, sigma)
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
    scaleRequest(-1, composed);
  } catch {
    negativeScaleRejected = true;
  }
  ok("negative scalar is rejected", negativeScaleRejected);
}

console.log("# size requests: explicit fit outcomes");
{
  const fixed = constantRequest(10);
  ok(
    "a fixed request at its extent is underdetermined",
    fitSizeRequest(fixed, 10).kind === "underdetermined"
  );
  ok(
    "a fixed request below budget reports slack",
    fitSizeRequest(fixed, 20).kind === "slack"
  );
  ok(
    "a fixed request above budget reports overflow",
    fitSizeRequest(fixed, 5).kind === "overflow"
  );

  const linear = sizeRequest({ slope: 2, intercept: 3 });
  const fit = fitSizeRequest(linear, 13);
  ok(
    "a growing affine request has an exact fit",
    fit.kind === "exact" && fit.sigma === 5 && fit.extent === 13,
    JSON.stringify(fit)
  );

  const plateau = sizeRequest(
    { slope: 0, intercept: 10 },
    { slope: 2, intercept: 0 }
  );
  ok(
    "a minimum plateau reports underdetermination",
    fitSizeRequest(plateau, 10).kind === "underdetermined"
  );
  const afterPlateau = fitSizeRequest(plateau, 12);
  ok(
    "growth after a plateau has an exact least fit",
    afterPlateau.kind === "exact" && afterPlateau.sigma === 6,
    JSON.stringify(afterPlateau)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

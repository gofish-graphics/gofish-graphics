/**
 * Underlying-space fold semantics that the 5-kind → 3-kind collapse (#586) must
 * preserve. These pin the distinction the two-state `origin: number | null`
 * first cut lost — a baseline magnitude ("free") is NOT a data axis anchored at
 * 0 (`origin: 0`) — so a future re-collapse that overloads `origin === 0` fails
 * here instead of silently corrupting units / over-nicing. Run via `tsx`.
 */
import {
  POSITION,
  SIZE,
  DIFFERENCE,
  UNDEFINED,
  ORDINAL,
  isPOSITION,
  isDIFFERENCE,
  isBaselineMagnitude,
  anchorAt,
  forgetAllMeasures,
  forgetOnConflict,
  mergeMeasures,
  MIXED_MEASURE,
  spaceMeasure,
  spaceMeasureState,
  spacePlacement,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
} from "../ast/underlyingSpace";
import {
  resolveAlignmentSpace,
  unionChildSpaces,
} from "../ast/graphicalOperators/alignment";
import { distributeSpaceFold } from "../ast/constraints/distribute";
import { resolveLayerAxisSpace } from "../ast/constraints/compose";
import * as M from "../util/monotonic";
import { interval } from "../util/interval";

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
const onY = (s: UnderlyingSpace): [UnderlyingSpace, UnderlyingSpace] => [
  UNDEFINED,
  s,
];
const throws = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

const permutations = <T>(xs: readonly T[]): T[][] => {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [
      x,
      ...rest,
    ])
  );
};

console.log("# space: baseline magnitude vs data axis anchored at 0");
{
  // Two anchored data axes, both with data-min 0 (POSITION([0, X])), in DIFFERENT
  // units. Overlaying foreign units onto one axis must be REFUSED — this is the
  // marginal-histogram unit guard. (Two-state's `every(origin === 0)` wrongly
  // took these for magnitudes and silently forgot the clash.)
  const dollars0 = POSITION(interval(0, 100), "dollars");
  const units0 = POSITION(interval(0, 50), "units");
  const msg = throws(() =>
    unionChildSpaces([onY(dollars0), onY(units0)], 1)
  );
  ok(
    "overlay of two origin-0 data axes with clashing measures THROWS",
    msg !== null && /different measures/.test(msg),
    msg ?? "did not throw"
  );

  // Two baseline magnitudes (the old SIZE) in different fields compose into a
  // real extent that carries no single unit — this must NOT throw; it records a
  // raw mixed state and projects that to no public measure.
  const dollarsMag = SIZE(M.linear(100, 0), "dollars");
  const unitsMag = SIZE(M.linear(50, 0), "units");
  let composed: UnderlyingSpace | undefined;
  const magMsg = throws(() => {
    composed = unionChildSpaces([onY(dollarsMag), onY(unitsMag)], 1);
  });
  ok(
    "overlay of two baseline magnitudes with clashing measures stays valid",
    magMsg === null,
    magMsg ?? ""
  );
  ok(
    "...and the forgotten composition is itself a baseline magnitude",
    composed !== undefined && isBaselineMagnitude(composed),
    composed && `dataDomain=${JSON.stringify((composed as any).dataDomain)}`
  );
  ok(
    "...and its public measure projection is undefined",
    composed !== undefined && spaceMeasure(composed) === undefined
  );
}

console.log("# space: permissive measure composition is a semilattice");
{
  const A = "A";
  const B = "B";

  ok(
    "different singleton measures compose to the absorbing mixed state",
    forgetOnConflict(A, B) === MIXED_MEASURE
  );
  ok(
    "permissive composition is commutative",
    forgetOnConflict(A, B) === forgetOnConflict(B, A)
  );
  ok(
    "permissive composition is idempotent",
    forgetOnConflict(A, A) === A &&
      forgetOnConflict(MIXED_MEASURE, MIXED_MEASURE) === MIXED_MEASURE
  );
  ok(
    "mixed is absorbing even across a no-claim input",
    forgetOnConflict(MIXED_MEASURE, undefined) === MIXED_MEASURE &&
      forgetOnConflict(undefined, MIXED_MEASURE) === MIXED_MEASURE
  );

  // Regression: with `undefined` serving as both identity and conflict, the old
  // left fold returned undefined for [A,A,B] but A for [A,B,A]. All six
  // permutations must now retain the same raw mixed state.
  const flatResults = permutations([A, A, B]).map((p) =>
    forgetAllMeasures(p)
  );
  ok(
    "[A,A,B] and every permutation fold to mixed",
    flatResults.length === 6 && flatResults.every((m) => m === MIXED_MEASURE)
  );

  const a = SIZE(M.linear(10, 0), A);
  const b = SIZE(M.linear(20, 0), A);
  const c = SIZE(M.linear(30, 0), B);
  const groupedResults = permutations([a, b, c]).flatMap((p) => {
    const flat = unionChildSpaces(p.map(onY), 1);
    const left = unionChildSpaces(
      [onY(unionChildSpaces([onY(p[0]), onY(p[1])], 1)), onY(p[2])],
      1
    );
    const right = unionChildSpaces(
      [onY(p[0]), onY(unionChildSpaces([onY(p[1]), onY(p[2])], 1))],
      1
    );
    return [flat, left, right];
  });
  ok(
    "all permutations and binary groupings preserve the raw mixed state",
    groupedResults.length === 18 &&
      groupedResults.every(
        (s) => isBaselineMagnitude(s) && s.measure === MIXED_MEASURE
      )
  );
  ok(
    "all mixed groupings preserve the public undefined projection",
    groupedResults.every((s) => spaceMeasure(s) === undefined)
  );

  const mixed = unionChildSpaces([onY(a), onY(c)], 1);
  const aligned = resolveAlignmentSpace([mixed, b], "start");
  const distributed = distributeSpaceFold(
    [mixed, b],
    [undefined, undefined],
    { spacing: 0, anchor: "edge" }
  );
  const positioned = resolveLayerAxisSpace(
    [onY(mixed)],
    1,
    1,
    interval(0, 1),
    undefined
  );
  ok(
    "nested layout folds cannot resurrect a measure after conflict",
    [aligned, distributed, positioned].every(
      (s) => spaceMeasureState(s) === MIXED_MEASURE
    )
  );

  const strictMixed = throws(() => mergeMeasures(MIXED_MEASURE, A));
  ok(
    "strict measure composition rejects a prior mixed state",
    strictMixed !== null && /mixed measure/.test(strictMixed),
    strictMixed ?? "did not throw"
  );
}

console.log("# space: the three origin states are distinct");
{
  const mag = SIZE(M.linear(10, 0)); // "free"
  const atZero = POSITION(interval(0, 10)); // numeric origin 0
  ok("a baseline magnitude is NOT a POSITION", !isPOSITION(mag));
  ok("a data axis anchored at 0 IS a POSITION", isPOSITION(atZero));
  ok(
    "a data axis anchored at 0 is NOT a baseline magnitude",
    !isBaselineMagnitude(atZero)
  );
}

console.log(
  "# space: the abstract placement lattice is total over origin (Phase A)"
);
{
  // The three placement cases ARE the three named constructors; anchorAt
  // re-anchors while preserving the σ-affine width (the position operator's
  // construction — a free width with slope must not collapse to a constant).
  const freeSlope = SIZE(M.linear(10, 0)) as CONTINUOUS_TYPE; // width 10·σ
  const anchored = anchorAt(freeSlope, 1955);
  ok(
    "anchorAt(free, 1955) → placement determined",
    spacePlacement(anchored) === "determined"
  );
  ok(
    "anchorAt domain min is the anchor coordinate",
    JSON.stringify(anchored.dataDomain) ===
      JSON.stringify(interval(1955, 1955 + freeSlope.width.run(1)))
  );
  ok(
    "anchorAt preserves the σ-affine width (slope not baked at σ=1)",
    anchored.width.run(2) === 20
  );

  // Constructors carry dataDomain; placement is derived from its shape.
  const cases: [string, CONTINUOUS_TYPE, string, unknown][] = [
    ["SIZE", SIZE(M.linear(10, 0)) as CONTINUOUS_TYPE, "free", undefined],
    [
      "POSITION([5,9])",
      POSITION(interval(5, 9)) as CONTINUOUS_TYPE,
      "determined",
      interval(5, 9),
    ],
    ["DIFFERENCE(7)", DIFFERENCE(7) as CONTINUOUS_TYPE, "conflict", "delta"],
  ];
  for (const [label, sp, expectedTag, expectedDomain] of cases) {
    ok(
      `${label} derives placement === "${expectedTag}"`,
      spacePlacement(sp) === expectedTag
    );
    ok(
      `${label} carries the expected dataDomain`,
      JSON.stringify(sp.dataDomain) === JSON.stringify(expectedDomain)
    );
  }
}

console.log("# space: an empty-ORDINAL sibling vetoes SIZE self-scaling");
{
  // A SIZE (sized bar) overlaid with an empty ORDINAL([]) — the latter is what
  // an unresolved `ref()` contributes. The empty ORDINAL is NOT a magnitude, so
  // the overlay is NOT a pure-magnitude self-scaling region: it must stay
  // unanchored (DIFFERENCE, no baseline → not self-scaled), exactly as before
  // the 3-kind collapse. Filtering to CONTINUOUS-only would silently drop the
  // ORDINAL and wrongly self-scale.
  const sized = SIZE(M.linear(40, 0));
  const composed = unionChildSpaces([onY(sized), onY(ORDINAL([]))], 1);
  ok(
    "SIZE + empty-ORDINAL overlay is a DIFFERENCE (unanchored), not a free magnitude",
    isDIFFERENCE(composed) && !isBaselineMagnitude(composed)
  );
  // Sanity: SIZE alone (or with an UNDEFINED sibling) DOES stay a free magnitude.
  const magOnly = unionChildSpaces([onY(sized), onY(UNDEFINED)], 1);
  ok(
    "SIZE + UNDEFINED overlay stays a free baseline magnitude",
    isBaselineMagnitude(magOnly)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

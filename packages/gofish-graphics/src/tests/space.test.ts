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
  spacePlacement,
  continuousExtentInterval,
  continuousInterval,
  baselineSpan,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
} from "../ast/underlyingSpace";
import { Extent, impliedExtent } from "../ast/extent";
import { GoFishNode } from "../ast/_node";
import {
  unionChildExtents,
  unionChildSpaces,
} from "../ast/graphicalOperators/alignment";
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

console.log("# space: baseline magnitude vs data axis anchored at 0");
{
  // Two anchored data axes, both with data-min 0 (POSITION([0, X])), in DIFFERENT
  // units. Overlaying foreign units onto one axis must be REFUSED — this is the
  // marginal-histogram unit guard. (Two-state's `every(origin === 0)` wrongly
  // took these for magnitudes and silently forgot the clash.)
  const dollars0 = POSITION(interval(0, 100), "dollars");
  const units0 = POSITION(interval(0, 50), "units");
  const msg = throws(() => unionChildSpaces([onY(dollars0), onY(units0)], 1));
  ok(
    "overlay of two origin-0 data axes with clashing measures THROWS",
    msg !== null && /different measures/.test(msg),
    msg ?? "did not throw"
  );

  // Two baseline magnitudes (the old SIZE) in different fields compose into a
  // real extent that carries no single unit — this must NOT throw, just forget.
  const dollarsMag = SIZE(100, "dollars");
  const unitsMag = SIZE(50, "units");
  let composed: UnderlyingSpace | undefined;
  const magMsg = throws(() => {
    composed = unionChildSpaces([onY(dollarsMag), onY(unitsMag)], 1);
  });
  ok(
    "overlay of two baseline magnitudes with clashing measures FORGETS (no throw)",
    magMsg === null,
    magMsg ?? ""
  );
  ok(
    "...and the forgotten composition is itself a baseline magnitude",
    composed !== undefined && isBaselineMagnitude(composed),
    composed && JSON.stringify(composed)
  );
}

console.log("# space: the three origin states are distinct");
{
  const mag = SIZE(10); // "free"
  const atZero = POSITION(interval(0, 10)); // pinned, data-min 0
  ok("a baseline magnitude is NOT a POSITION", !isPOSITION(mag));
  ok("a data axis anchored at 0 IS a POSITION", isPOSITION(atZero));
  ok(
    "a data axis anchored at 0 is NOT a baseline magnitude",
    !isBaselineMagnitude(atZero)
  );
}

console.log(
  "# space: the abstract placement lattice is a read of the origin (Phase A)"
);
{
  // Pinning a free extent shifts its data interval and pins its origin.
  const free = SIZE(10) as CONTINUOUS_TYPE;
  const anchored = anchorAt(free, 1955);
  ok(
    "anchorAt(free, 1955) → placement determined",
    spacePlacement(anchored) === "determined"
  );
  ok(
    "anchorAt domain is the free interval shifted to the anchor",
    JSON.stringify(continuousInterval(anchored)) ===
      JSON.stringify(interval(1955, 1965))
  );

  // One interval shape for all three; placement is read off the origin.
  const cases: [string, CONTINUOUS_TYPE, string, unknown][] = [
    ["SIZE(10)", SIZE(10) as CONTINUOUS_TYPE, "free", interval(0, 10)],
    [
      "POSITION([5,9])",
      POSITION(interval(5, 9)) as CONTINUOUS_TYPE,
      "determined",
      interval(5, 9),
    ],
    [
      "DIFFERENCE(7)",
      DIFFERENCE(7) as CONTINUOUS_TYPE,
      "conflict",
      interval(0, 7),
    ],
  ];
  for (const [label, sp, expectedTag, expectedInterval] of cases) {
    ok(
      `${label} derives placement === "${expectedTag}"`,
      spacePlacement(sp) === expectedTag
    );
    ok(
      `${label} carries the expected data interval`,
      JSON.stringify(sp.dataInterval) === JSON.stringify(expectedInterval)
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
  const sized = SIZE(40);
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

console.log("# space: a free extent keeps its ascent and descent (#773)");
{
  // A group of signed bars (values 30 and −20): the overlay keeps each side of
  // the baseline. The type carries the data extent; the claim carries the
  // σ-affine sides, pixel intercepts intact.
  const up = SIZE(30);
  const down = SIZE(0, undefined, 20);
  const upClaim = Extent(M.linear(30, 4));
  const downClaim = Extent(M.ZERO, M.linear(20, 6));
  const u = unionChildSpaces([onY(up), onY(down)], 1) as CONTINUOUS_TYPE;
  ok("signed overlay stays a free baseline magnitude", isBaselineMagnitude(u));
  ok(
    "the data interval spans both sides of the baseline",
    JSON.stringify(continuousExtentInterval(u)) ===
      JSON.stringify(interval(-20, 30))
  );
  const claim = unionChildExtents(
    [
      [undefined, upClaim],
      [undefined, downClaim],
    ],
    [
      [UNDEFINED, up],
      [UNDEFINED, down],
    ],
    1,
    u
  )!;
  ok(
    "the claim's ascent is the max of the ascents, descent the max of the descents",
    claim.ascent.run(2) === 64 && claim.descent.run(2) === 46
  );
  ok("the claim's width is ascent + descent", claim.width.run(2) === 110);
  const span = baselineSpan(-20) as CONTINUOUS_TYPE;
  ok(
    "baselineSpan of a negative length is all descent",
    JSON.stringify(span.dataInterval) === JSON.stringify(interval(-20, 0))
  );
  ok(
    "anchorAt puts the baseline at the coordinate",
    JSON.stringify(continuousInterval(anchorAt(u, 100))) ===
      JSON.stringify(interval(80, 130))
  );
}

console.log("# space: a type implies a claim with no pixel overhead");
{
  const implied = impliedExtent(baselineSpan(-20))!;
  ok(
    "a free type's implied claim is its data sides times σ",
    implied.ascent.run(3) === 0 && implied.descent.run(3) === 60
  );
  ok(
    "a pinned type's implied claim is its data width times σ",
    impliedExtent(POSITION(interval(5, 9)))!.width.run(2) === 8
  );
  ok(
    "an ordinal type implies no claim",
    impliedExtent(ORDINAL(["a"])) === undefined
  );
}

console.log("# space: a type hook cannot read a claim");
{
  const layout = () => ({
    intrinsicDims: [{}, {}],
    transform: { translate: [undefined, undefined] },
  });
  const leaf = new GoFishNode(
    {
      type: "leaf",
      resolveUnderlyingSpace: () => [SIZE(5), UNDEFINED],
      layout,
    },
    []
  );
  const cheat = new GoFishNode(
    {
      type: "cheat",
      resolveUnderlyingSpace: (_spaces, childNodes) => {
        (childNodes[0] as GoFishNode).resolveExtent();
        return [UNDEFINED, UNDEFINED];
      },
      layout,
    },
    [leaf]
  );
  const msg = throws(() => cheat.resolveUnderlyingSpace());
  ok(
    "reading a claim during type inference throws",
    msg !== null && /during type inference/.test(msg),
    msg ?? "did not throw"
  );
  ok(
    "the claim walk runs after the types",
    leaf.resolveExtent()[0]!.width.run(2) === 10
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

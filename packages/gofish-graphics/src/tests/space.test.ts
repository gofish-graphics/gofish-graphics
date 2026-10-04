/**
 * Underlying-space fold semantics that the 5-kind → 3-kind collapse (#586) must
 * preserve. These pin the distinction the two-state `origin: number | null`
 * first cut lost — a baseline magnitude ("free") is NOT a data axis anchored at
 * 0 (`origin: 0`) — so a future re-collapse that overloads `origin === 0` fails
 * here instead of silently corrupting units / over-nicing. Run via `tsx`.
 */
import {
  UNDEFINED,
  ORDINAL,
  anchorAt,
  continuousInterval,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
  CONTINUOUS,
  originIs,
} from "../ast/underlyingSpace";
import { Extent, impliedExtent, niceScope } from "../ast/extent";
import { ScopeRegistry } from "../ast/solver/scopes";
import { pxOf } from "../ast/domain";
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
  const dollars0 = CONTINUOUS(interval(0, 100), "pinned", "dollars");
  const units0 = CONTINUOUS(interval(0, 50), "pinned", "units");
  const msg = throws(() => unionChildSpaces([onY(dollars0), onY(units0)], 1));
  ok(
    "overlay of two origin-0 data axes with clashing measures THROWS",
    msg !== null && /different measures/.test(msg),
    msg ?? "did not throw"
  );

  // Two baseline magnitudes (the old SIZE) in different fields compose into a
  // real extent that carries no single unit — this must NOT throw, just forget.
  const dollarsMag = CONTINUOUS(interval(0, 100), "free", "dollars");
  const unitsMag = CONTINUOUS(interval(0, 50), "free", "units");
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
    composed !== undefined && originIs(composed, "free"),
    composed && JSON.stringify(composed)
  );
}

console.log("# space: the three origin states are distinct");
{
  const mag = CONTINUOUS(interval(0, 10), "free"); // "free"
  const atZero = CONTINUOUS(interval(0, 10), "pinned"); // pinned, data-min 0
  ok("a baseline magnitude is NOT a POSITION", !originIs(mag, "pinned"));
  ok("a data axis anchored at 0 IS a POSITION", originIs(atZero, "pinned"));
  ok(
    "a data axis anchored at 0 is NOT a baseline magnitude",
    !originIs(atZero, "free")
  );
}

console.log("# space: pinning is a shift of the interval");
{
  // Pinning a free extent shifts its data interval and pins its origin.
  const free = CONTINUOUS(interval(0, 10), "free") as CONTINUOUS_TYPE;
  const anchored = anchorAt(free, 1955);
  ok("anchorAt(free, 1955) pins the origin", anchored.origin === "pinned");
  ok(
    "anchorAt domain is the free interval shifted to the anchor",
    JSON.stringify(continuousInterval(anchored)) ===
      JSON.stringify(interval(1955, 1965))
  );

  // One interval shape for all three origin states.
  const cases: [string, CONTINUOUS_TYPE, unknown][] = [
    ["free [0, 10]", CONTINUOUS(interval(0, 10), "free"), interval(0, 10)],
    ["pinned [5, 9]", CONTINUOUS(interval(5, 9), "pinned"), interval(5, 9)],
    ["none [0, 7]", CONTINUOUS(interval(0, 7), "none"), interval(0, 7)],
  ];
  for (const [label, sp, expectedInterval] of cases) {
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
  const sized = CONTINUOUS(interval(0, 40), "free");
  const composed = unionChildSpaces([onY(sized), onY(ORDINAL([]))], 1);
  ok(
    "SIZE + empty-ORDINAL overlay is a DIFFERENCE (unanchored), not a free magnitude",
    originIs(composed, "none") && !originIs(composed, "free")
  );
  // Sanity: SIZE alone (or with an UNDEFINED sibling) DOES stay a free magnitude.
  const magOnly = unionChildSpaces([onY(sized), onY(UNDEFINED)], 1);
  ok(
    "SIZE + UNDEFINED overlay stays a free baseline magnitude",
    originIs(magOnly, "free")
  );
}

console.log("# space: a free extent keeps its ascent and descent (#773)");
{
  // A group of signed bars (values 30 and −20): the overlay keeps each side of
  // the baseline. The type carries the data extent; the claim carries the
  // σ-affine sides, pixel intercepts intact.
  const up = CONTINUOUS(interval(0, 30), "free");
  const down = CONTINUOUS(interval(-20, 0), "free");
  const upClaim = Extent(M.linear(30, 4));
  const downClaim = Extent(M.ZERO, M.linear(20, 6));
  const u = unionChildSpaces([onY(up), onY(down)], 1) as CONTINUOUS_TYPE;
  ok("signed overlay stays a free baseline magnitude", originIs(u, "free"));
  ok(
    "the data interval spans both sides of the baseline",
    JSON.stringify(u.dataInterval) === JSON.stringify(interval(-20, 30))
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
  const span = CONTINUOUS(interval(0, -20), "free") as CONTINUOUS_TYPE;
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
  const implied = impliedExtent(CONTINUOUS(interval(0, -20), "free"))!;
  ok(
    "a free type's implied claim is its data sides times σ",
    implied.ascent.run(3) === 0 && implied.descent.run(3) === 60
  );
  ok(
    "a pinned type's implied claim is its data width times σ",
    impliedExtent(CONTINUOUS(interval(5, 9), "pinned"))!.width.run(2) === 8
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
      resolveUnderlyingSpace: () => [
        CONTINUOUS(interval(0, 5), "free"),
        UNDEFINED,
      ],
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

console.log("# space: a pinned scope solves σ from its claim");
{
  const scopes = new ScopeRegistry();
  const meta = { kind: "root" as const, rootKey: "t", axis: 0 as const };
  const pinned = CONTINUOUS(interval(0, 137), "pinned");
  // No overhead: the domain fills the box, as before.
  const plain = scopes.solvePosition(meta, pinned, impliedExtent(pinned), 400)!;
  ok(
    "with no overhead the domain fills the box",
    Math.abs(plain.sigma - 400 / 137) < 1e-12 && plain.pxMin === 0
  );
  // 100 px of spacing in the claim keeps its pixels.
  const spaced = scopes.solvePosition(
    meta,
    pinned,
    Extent(M.linear(137, 100)),
    400
  )!;
  ok(
    "pixel overhead takes its pixels; the data gets the rest",
    Math.abs(spaced.sigma - 300 / 137) < 1e-12 &&
      Math.abs(pxOf(spaced, 137) - 300) < 1e-9
  );
  // Nicing widens only the data part.
  const [niced, nicedClaim] = niceScope(
    CONTINUOUS(interval(-3, 44), "pinned"),
    Extent(M.linear(47, 100))
  );
  ok(
    "nicing widens the claim by σ·(nicedWidth − dataWidth)",
    JSON.stringify(continuousInterval(niced!)) ===
      JSON.stringify(interval(-5, 45)) &&
      nicedClaim!.width.run(2) === 2 * 50 + 100
  );
  // A pinned child's claim reaches the union whole.
  const u = unionChildExtents(
    [[Extent(M.linear(10, 25)), undefined]],
    [[CONTINUOUS(interval(2, 12), "pinned"), UNDEFINED]],
    0,
    CONTINUOUS(interval(2, 12), "pinned")
  )!;
  ok(
    "a pinned child spans its data min then its whole claim",
    u.width.run(1) === 10 + 25
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

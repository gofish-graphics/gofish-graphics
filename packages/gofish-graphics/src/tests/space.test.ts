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
import { distributeSpaceFold } from "../ast/constraints/distribute";
import { nestedExtent, nestedSpace } from "../ast/constraints/nest";
import {
  resolveLayerAxisExtent,
  resolveLayerBaseSpaces,
} from "../ast/constraints/compose";

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

console.log("# space: a scope solves σ from its claim, and the pixel of 0");
{
  const scopes = new ScopeRegistry();
  const meta = { kind: "root" as const, rootKey: "t", axis: 0 as const };
  const pinned = CONTINUOUS(interval(10, 147), "pinned");
  // No overhead: the domain fills the box, as before.
  const plain = scopes.solveScope(meta, pinned, impliedExtent(pinned), 400)!;
  ok(
    "with no overhead the domain fills the box",
    Math.abs(plain.sigma - 400 / 137) < 1e-12 &&
      Math.abs(plain.originPx! + 10 * plain.sigma) < 1e-9
  );
  // 100 px of spacing in the claim keeps its pixels.
  const spaced = scopes.solveScope(
    meta,
    pinned,
    Extent(M.linear(137, 100)),
    400
  )!;
  const map = { sigma: spaced.sigma, originPx: spaced.originPx! };
  ok(
    "pixel overhead takes its pixels; the data gets the rest",
    Math.abs(spaced.sigma - 300 / 137) < 1e-12 &&
      Math.abs(pxOf(map, 147) - 300) < 1e-9
  );
  // A free scope's data 0 sits its descent claim (overhead included) above
  // the box's low edge.
  const free = scopes.solveScope(
    meta,
    CONTINUOUS(interval(-20, 30), "free"),
    Extent(M.linear(30, 0), M.linear(20, 5)),
    105
  )!;
  ok(
    "a free scope seats data 0 at its descent claim",
    free.sigma === 2 && free.originPx === 45
  );
  // An origin-less scope has a slope and no pixel of 0.
  const none = scopes.solveScope(
    meta,
    CONTINUOUS(interval(0, 50), "none"),
    impliedExtent(CONTINUOUS(interval(0, 50), "none")),
    100
  )!;
  ok(
    "an origin-less scope has σ and no originPx",
    none.sigma === 2 && none.originPx === undefined
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

console.log("# space: one fold for every origin");
{
  const chainOpts = {
    spacing: 10,
    anchor: "edge" as const,
    origin: { part: 0, fraction: 0, mirrored: false },
  };
  // A spread moves each target to its place, so pinned targets chain as
  // boxes of their data width, like free ones.
  const pinnedChain = distributeSpaceFold(
    [
      CONTINUOUS(interval(5, 9), "pinned"),
      CONTINUOUS(interval(100, 103), "pinned"),
    ],
    [undefined, undefined],
    chainOpts
  );
  ok(
    "an unkeyed chain of pinned targets is a free chain of their widths",
    originIs(pinnedChain, "free") &&
      JSON.stringify(pinnedChain.dataInterval) ===
        JSON.stringify(interval(0, 7))
  );
  // A keyed chain of pinned targets is a category axis (their widths are
  // spans of positions, not quantities).
  ok(
    "a keyed chain of pinned targets is ordinal",
    distributeSpaceFold(
      [
        CONTINUOUS(interval(5, 9), "pinned"),
        CONTINUOUS(interval(1, 2), "pinned"),
      ],
      ["a", "b"],
      chainOpts
    ).kind === "ordinal"
  );
  // A stack lays out pinned and free parts alike.
  const mixed = distributeSpaceFold(
    [
      CONTINUOUS(interval(0, 4), "free"),
      CONTINUOUS(interval(10, 13), "pinned"),
    ],
    [undefined, undefined],
    { ...chainOpts, glue: true }
  );
  ok(
    "a stack of free and pinned parts is pinned over their running sums",
    originIs(mixed, "pinned") &&
      JSON.stringify(mixed.dataInterval) === JSON.stringify(interval(0, 7))
  );
  // A nest pads a pinned inner the same way as a free one.
  const inner = CONTINUOUS(interval(5, 9), "pinned");
  ok(
    "a nest's outer takes a pinned inner's type",
    nestedSpace(UNDEFINED, inner) === inner
  );
  const padded = nestedExtent(undefined, inner, impliedExtent(inner), 3)!;
  ok(
    "and pads its claim on both sides of the baseline",
    padded.width.run(1) === 10 && padded.descent.run(1) === 3
  );
  // An origin-less child has no data coordinates to add to a pinned overlay.
  const overlaid = unionChildSpaces(
    [
      onY(CONTINUOUS(interval(30, 50), "pinned")),
      onY(CONTINUOUS(interval(0, 500), "none")),
    ],
    1
  );
  ok(
    "a pinned overlay's data interval ignores an origin-less child",
    JSON.stringify(continuousInterval(overlaid)) ===
      JSON.stringify(interval(30, 50))
  );
  // A layer's datum domain overlays a free child union too (the layer seats
  // free children at data 0).
  const [, withDatum] = resolveLayerBaseSpaces(
    [[UNDEFINED, CONTINUOUS(interval(-20, 40), "free")]],
    { y: interval(10, 15) }
  );
  ok(
    "a datum domain is unioned with a free child union",
    JSON.stringify(continuousInterval(withDatum)) ===
      JSON.stringify(interval(-20, 40))
  );
  // transform.scale is a pixel operation on every claim.
  const pinnedLayer = CONTINUOUS(interval(0, 10), "pinned");
  ok(
    "transform.scale scales a pinned claim",
    resolveLayerAxisExtent(
      [[undefined, impliedExtent(pinnedLayer)]],
      [[UNDEFINED, pinnedLayer]],
      1,
      2,
      undefined,
      pinnedLayer
    )!.width.run(1) === 20
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

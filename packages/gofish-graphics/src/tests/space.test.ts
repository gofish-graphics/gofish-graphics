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
  DEFAULT_AXIS_TICKS,
} from "../ast/underlyingSpace";
import { Extent, impliedExtent, niceScope } from "../ast/extent";
import { ScopeRegistry, seatInScope } from "../ast/solver/scopes";
import { pxOf } from "../ast/domain";
import { debugUnderlyingSpaceTree, GoFishNode } from "../ast/_node";
import { sameUnitVar, type UnitVar } from "../ast/measure";
import { valueUnits } from "../ast/underlyingSpace";
import { DatumValueImpl } from "../ast/data";
import {
  unionChildExtents,
  unionChildSpaces,
} from "../ast/graphicalOperators/alignment";
import * as M from "../util/monotonic";
import { interval } from "../util/interval";
import {
  distributeExtentFold,
  distributeSpaceFold,
} from "../ast/constraints/distribute";
import { nestedExtent, nestedSpace } from "../ast/constraints/nest";
import { positionNode } from "../ast/graphicalOperators/positionNode";
import { value } from "../ast/data";
import { declared } from "./testHelpers";
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
  const dollars0 = CONTINUOUS(interval(0, 100), "pinned", declared("dollars"));
  const units0 = CONTINUOUS(interval(0, 50), "pinned", declared("units"));
  const msg = throws(() => unionChildSpaces([onY(dollars0), onY(units0)], 1));
  ok(
    "overlay of two origin-0 data axes with clashing units THROWS",
    msg !== null && /different units/.test(msg),
    msg ?? "did not throw"
  );

  // Two baseline magnitudes in different fields on one axis are the same type
  // error: the measure policy does not depend on the origin.
  const dollarsMag = CONTINUOUS(interval(0, 100), "free", declared("dollars"));
  const unitsMag = CONTINUOUS(interval(0, 50), "free", declared("units"));
  let composed: UnderlyingSpace | undefined;
  const magMsg = throws(() => {
    composed = unionChildSpaces([onY(dollarsMag), onY(unitsMag)], 1);
  });
  ok(
    "overlay of two baseline magnitudes with clashing units THROWS too",
    magMsg !== null && /different units/.test(magMsg),
    magMsg ?? "did not throw"
  );
  ok("...and nothing was composed", composed === undefined);
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

console.log("# space: position moves a claim with its data");
{
  // position({ y: 10 }, rect({ h: −20 })) is pinned over [−10, 10]. Every
  // claim is measured from data 0, so its claim moves with it: 10σ on each
  // side, 20σ in all. Overlaid with a pinned point at 5 it still claims 20σ
  // (it once passed the free claim through unchanged, read as 35σ).
  const bar = new GoFishNode(
    {
      type: "bar",
      resolveUnderlyingSpace: () => [
        UNDEFINED,
        CONTINUOUS(interval(-20, 0), "free"),
      ],
      layout: () => ({
        intrinsicDims: [{}, {}],
        transform: { translate: [undefined, undefined] },
      }),
    },
    []
  );
  const placed = positionNode({ y: value(10) }, [bar]);
  // Standalone, with no render session: the walk's root owns its units.
  const [, space] = placed.resolveUnderlyingSpace();
  const [, claim] = placed.resolveExtent();
  ok(
    "the claim reaches 10σ above and below data 0",
    JSON.stringify((space as CONTINUOUS_TYPE).dataInterval) ===
      JSON.stringify(interval(-10, 10)) &&
      claim!.ascent.run(1) === 10 &&
      claim!.descent.run(1) === 10
  );
  const point = CONTINUOUS(interval(5, 5), "pinned");
  const overlay = unionChildSpaces([onY(space), onY(point)], 1);
  const overlayClaim = unionChildExtents(
    [
      [undefined, claim],
      [undefined, impliedExtent(point)],
    ],
    [onY(space), onY(point)],
    1,
    overlay
  )!;
  ok(
    "overlaid with a pinned point at 5 it claims 20σ",
    overlayClaim.width.run(1) === 20,
    `${overlayClaim.width.run(1)}`
  );
}

console.log("# space: an axis is named by the innermost coordinate space");
{
  const layout = () => ({
    intrinsicDims: [{}, {}],
    transform: { translate: [undefined, undefined] },
  });
  const leaf = new GoFishNode({ type: "leaf", layout }, []);
  const linear = new GoFishNode({ type: "coord", layout }, [leaf]);
  linear._space = { type: "linear" };
  const polar = new GoFishNode({ type: "coord", layout }, [linear]);
  polar._space = { type: "polar", aliases: { x: "theta", y: "r" } };
  ok(
    "inside polar, the axes are theta and r",
    linear.parent === polar &&
      polar.axisName(0) === "theta" &&
      polar.axisName(1) === "r"
  );
  ok(
    "a space that declares no names inside polar leaves x and y",
    leaf.axisName(0) === "x" && leaf.axisName(1) === "y",
    `${leaf.axisName(0)}, ${leaf.axisName(1)}`
  );
}

console.log("# space: one seating rule");
{
  const frame = { sigma: 2, originPx: 30 };
  const pinned = seatInScope(frame, CONTINUOUS(interval(5, 9), "pinned"));
  const free = seatInScope(frame, CONTINUOUS(interval(0, 9), "free"));
  const none = seatInScope(frame, CONTINUOUS(interval(0, 9), "none"));
  ok(
    "a pinned child sits at 0 and shares the frame",
    pinned.seatPx === 0 && pinned.childMap === frame
  );
  ok(
    "a free child sits at the pixel of data 0, in a frame of its own",
    free.seatPx === 30 &&
      free.childMap?.sigma === 2 &&
      free.childMap?.originPx === 0
  );
  ok(
    "a child with no data 0 sits at 0 with no frame",
    none.seatPx === 0 && none.childMap === undefined
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
  // 100 px of spacing in the claim keeps its pixels. The claim is measured
  // from data 0: the domain's low edge lies 10σ above it.
  const spaced = scopes.solveScope(
    meta,
    pinned,
    Extent(M.linear(147, 100), M.linear(-10, 0)),
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
    Extent(M.linear(47, 100)),
    DEFAULT_AXIS_TICKS
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

console.log("# space: the type walk's root owns its units, and layout reads them");
{
  // An unknown unit "lo" read in the type hook and again in the layout
  // hook, of a node with no render session: both reads are one variable.
  const lo = () => valueUnits(new DatumValueImpl(1, { name: "lo" }))!.unit!;
  let inType: UnitVar | undefined;
  let inLayout: UnitVar | undefined;
  const leaf = new GoFishNode(
    {
      type: "leaf",
      resolveUnderlyingSpace: () => {
        inType = lo();
        return [UNDEFINED, UNDEFINED];
      },
      layout: () => {
        inLayout = lo();
        return {
          intrinsicDims: [{}, {}],
          transform: { translate: [undefined, undefined] },
        };
      },
    },
    []
  );
  const root = new GoFishNode(
    {
      type: "root",
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: (_shared, size, scales, children) => {
        children[0].layout(size, scales);
        return {
          intrinsicDims: [{}, {}],
          transform: { translate: [undefined, undefined] },
        };
      },
    },
    [leaf]
  );
  const standalone = throws(() => {
    root.resolveUnderlyingSpace();
    root.layout([100, 100], [undefined, undefined]);
  });
  ok("a standalone walk and layout need no session", standalone === null, standalone ?? "");
  ok(
    "layout reads the type walk's unit variables",
    inType !== undefined && inLayout !== undefined && sameUnitVar(inType, inLayout)
  );
  const log = console.log;
  const group = console.group;
  console.log = console.group = () => {};
  const dump = throws(() => debugUnderlyingSpaceTree(root));
  console.log = log;
  console.group = group;
  ok("the debug dump of a standalone node works", dump === null, dump ?? "");
}

console.log("# space: a measure clash says what to do");
{
  const gross = throws(() =>
    unionChildSpaces(
      [
        onY(CONTINUOUS(interval(0, 10), "free", declared("Worldwide Gross", "USD"))),
        onY(CONTINUOUS(interval(0, 5), "free", declared("Revenue", "EUR"))),
      ],
      1
    )
  );
  ok(
    "the message names the axis, both units and their columns, and the composition",
    gross !== null &&
      gross.startsWith(
        'The y axis combines two different units, "USD" ("Worldwide Gross") ' +
          'and "EUR" ("Revenue") (where marks are drawn on top of each ' +
          "other). One axis can show only one unit."
      ),
    gross ?? "did not throw"
  );
  ok(
    "and suggests one declared unit or a chart of its own",
    gross !== null &&
      gross.includes('schema: { "Worldwide Gross": Schema.unit("EUR") }') &&
      gross.includes("give the inner chart its own w and h")
  );
  // A node names the axis from where it sits: inside a polar coord, the y
  // axis is `r`.
  const layout = () => ({
    intrinsicDims: [{}, {}],
    transform: { translate: [undefined, undefined] },
  });
  const leaf = (m: string) =>
    new GoFishNode(
      {
        type: "leaf",
        resolveUnderlyingSpace: () => [
          UNDEFINED,
          CONTINUOUS(interval(0, 1), "free", declared(m)),
        ],
        layout,
      },
      []
    );
  const overlayNode = new GoFishNode(
    {
      type: "overlay",
      resolveUnderlyingSpace: (spaces) => [
        UNDEFINED,
        unionChildSpaces(spaces, 1),
      ],
      layout,
    },
    [leaf("a"), leaf("b")]
  );
  const polar = new GoFishNode(
    {
      type: "coord",
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout,
    },
    [overlayNode]
  );
  polar._space = { aliases: { x: "theta", y: "r" }, type: "polar" };
  const inPolar = throws(() => overlayNode.resolveUnderlyingSpace());
  ok(
    "inside a coordinate space the axis takes the space's name",
    inPolar !== null && inPolar.startsWith("The r axis combines"),
    inPolar ?? "did not throw"
  );
}

console.log("# space: one fold for every origin");
{
  const chainOpts = {
    axis: 0 as const,
    spacing: 10,
    anchor: "edge" as const,
    origin: { part: 0, fraction: 0, mirrored: false },
  };
  // A spread separates: along its direction its result is a sequence of
  // separate spaces, never one continuous space, whatever its targets.
  const pinnedTargets = [
    CONTINUOUS(interval(5, 9), "pinned"),
    CONTINUOUS(interval(100, 103), "pinned"),
  ];
  const freeTargets = [
    CONTINUOUS(interval(0, 4), "free"),
    CONTINUOUS(interval(0, 3), "free"),
  ];
  ok(
    "an unkeyed spread is no continuous space, of pinned or free targets",
    distributeSpaceFold(pinnedTargets, [undefined, undefined], chainOpts)
      .kind === "undefined" &&
      distributeSpaceFold(freeTargets, [undefined, undefined], chainOpts)
        .kind === "undefined"
  );
  ok(
    "a keyed spread is ordinal, of pinned or free targets",
    distributeSpaceFold(pinnedTargets, ["a", "b"], chainOpts).kind ===
      "ordinal" &&
      distributeSpaceFold(freeTargets, ["a", "b"], chainOpts).kind === "ordinal"
  );
  // Its room: a spread of magnitudes shares the enclosing scope's σ, so it
  // claims its targets' claims chained with the spacing; a spread of frames
  // (pinned panels) claims nothing (each panel roots its own scope).
  const freeChain = distributeSpaceFold(freeTargets, ["a", "b"], chainOpts);
  const freeClaim = distributeExtentFold(
    freeTargets.map(impliedExtent),
    freeTargets,
    freeChain,
    chainOpts
  );
  ok(
    "a spread of magnitudes claims their chained claims plus spacing",
    freeClaim !== undefined && freeClaim.width.run(2) === 4 * 2 + 3 * 2 + 10
  );
  // A fixed-pitch chain folds the parts' sides, not only their widths: a
  // baseline row keeps its descent below its anchor, and a tall middle row
  // binds even when it is neither first nor last.
  const pitched = (
    targets: CONTINUOUS_TYPE[],
    anchor: "baseline" | "middle"
  ) => {
    const opts = { ...chainOpts, anchor, spacing: 30 };
    return distributeExtentFold(
      targets.map(impliedExtent),
      targets,
      distributeSpaceFold(targets, ["a", "b", "c"], opts),
      opts
    )!.width.run(1);
  };
  ok(
    "a baseline chain counts a row's descent below its anchor",
    pitched(
      [
        CONTINUOUS(interval(-10, 20), "free"),
        CONTINUOUS(interval(0, 5), "free"),
      ],
      "baseline"
    ) === 50
  );
  ok(
    "a middle chain's tallest row binds wherever it sits",
    pitched(
      [
        CONTINUOUS(interval(0, 2), "free"),
        CONTINUOUS(interval(0, 100), "free"),
        CONTINUOUS(interval(0, 2), "free"),
      ],
      "middle"
    ) === 100
  );
  ok(
    "a spread of pinned frames claims nothing",
    distributeExtentFold(
      pinnedTargets.map(impliedExtent),
      pinnedTargets,
      distributeSpaceFold(pinnedTargets, ["a", "b"], chainOpts),
      chainOpts
    ) === undefined
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
    "and pads its claim on both sides, measured from data 0",
    padded.width.run(1) === 10 &&
      padded.ascent.run(1) === 12 &&
      padded.descent.run(1) === -2
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
  ).spaces;
  ok(
    "a datum domain is unioned with a free child union",
    JSON.stringify(continuousInterval(withDatum)) ===
      JSON.stringify(interval(-20, 40))
  );
  // An ordinal's measure is its grouping field, not a unit: a datum position
  // in dollars beside a category spread by "genre" is no measure clash.
  const genreThenDollars = throws(() =>
    resolveLayerBaseSpaces(
      [[UNDEFINED, ORDINAL(["a", "b"], "genre")]],
      { y: interval(0, 5), yMeasure: declared("dollars") }
    )
  );
  ok(
    "a datum measure does not clash with an ordinal's grouping field",
    genreThenDollars === null,
    genreThenDollars ?? ""
  );
  const stackOfGenre = throws(() =>
    distributeSpaceFold(
      [
        ORDINAL(["a"], "genre"),
        CONTINUOUS(interval(0, 3), "free", declared("dollars")),
      ],
      ["p", "q"],
      {
        axis: 1,
        spacing: 0,
        anchor: "edge",
        origin: { part: 0, fraction: 0, mirrored: false },
      }
    )
  );
  ok(
    "a spread's unit check skips an ordinal target's grouping field",
    stackOfGenre === null,
    stackOfGenre ?? ""
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
      pinnedLayer,
      pinnedLayer
    )!.width.run(1) === 20
  );
}

console.log("# space: nicing is gated on an axis over the interval");
{
  const [delta, deltaClaim] = niceScope(
    CONTINUOUS(interval(0, 137), "none"),
    Extent(M.linear(137, 0)),
    DEFAULT_AXIS_TICKS
  );
  ok(
    "a delta axis nices its width, its claim widening by half on each side",
    JSON.stringify(delta!.dataInterval) === JSON.stringify(interval(0, 140)) &&
      deltaClaim!.width.run(1) === 140 &&
      deltaClaim!.descent.run(1) === 1.5
  );
  // A free magnitude renders the absolute axis of the scope that places its
  // baseline, so it nices as that axis does, about its own 0, and each side
  // of its claim widens by its own niced end.
  const [free, freeClaim] = niceScope(
    CONTINUOUS(interval(-28, 137), "free"),
    Extent(M.linear(137, 0), M.linear(28, 0)),
    DEFAULT_AXIS_TICKS
  );
  ok(
    "a free magnitude nices about its 0, each side by its own end",
    JSON.stringify(free!.dataInterval) === JSON.stringify(interval(-40, 140)) &&
      free!.origin === "free" &&
      freeClaim!.ascent.run(1) === 140 &&
      freeClaim!.descent.run(1) === 40
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

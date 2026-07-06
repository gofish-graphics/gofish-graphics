/**
 * Permutation tests for the production relational placement solver.
 *
 * Run: `pnpm --filter gofish-graphics test:confluence`
 */

import type { Placeable } from "../ast/_node";
import * as Monotonic from "../util/monotonic";
import type { AlignConstraint } from "../ast/constraints/align";
import type { DistributeConstraint } from "../ast/constraints/distribute";
import type { GridConstraint, TrackLayout } from "../ast/constraints/grid";
import { gridCellSizeByName, gridTracksFromSizes } from "../ast/constraints/grid";
import type { NestConstraint } from "../ast/constraints/nest";
import {
  compilePlacementCoordinate,
  lowerPlacementConstraints,
  solvePlacementConstraints,
} from "../ast/constraints/placementSolver";
import {
  anchorExpr,
  participantFact,
  relationFact,
} from "../ast/constraints/placementFacts";
import type { PositionConstraint } from "../ast/constraints/position";
import type { ZAboveConstraint } from "../ast/constraints/zorder";
import type { Anchor, Dimensions, FancyDirection } from "../ast/dims";
import { elaborateDirection, localAnchorPoint } from "../ast/dims";
import {
  applyNestLayoutProposal,
  applyNestSpacePlan,
  buildNestPlan,
} from "../ast/constraints/nestPlan";
import {
  composeConstraintSpaces,
  resolveLayerBaseSpaces,
} from "../ast/constraints/compose";
import {
  buildChildScalePlan,
  buildDistributeSliceMap,
  buildLayerConstraintLayoutPlan,
  buildPositionTargetDims,
  buildPositionScalePlan,
  childLayoutSizeProposal,
  childPosScalesFor,
  selectGridConstraint,
} from "../ast/constraints/proposalPlan";
import { discretePosition, value } from "../ast/data";
import { pxOf, type AxisMap } from "../ast/domain";
import { POSITION, SIZE, UNDEFINED } from "../ast/underlyingSpace";
import { ScopeRegistry } from "../ast/solver/scopes";
import { interval } from "../util/interval";

type Constraint =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | NestConstraint
  | GridConstraint;
type Geometry = Record<string, { min?: number; center?: number; max?: number }>;

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

function makePlaceable(
  width = 10,
  height = 10,
  localMins: [number, number] = [0, 0]
): Placeable {
  const dims: Dimensions = [{ size: width }, { size: height }];

  const pin = (
    axis: FancyDirection,
    value: number,
    anchor: Anchor = "min"
  ): void => {
    const idx = elaborateDirection(axis);
    const dim = dims[idx];
    const size = dim.size ?? 0;
    dim.min =
      value - localAnchorPoint(anchor, localMins[idx], size) + localMins[idx];
    dim.center = dim.min + Math.abs(size) / 2;
    dim.max = dim.min + Math.abs(size);
  };

  return {
    dims,
    localAnchor(axis, anchor): number {
      const idx = elaborateDirection(axis);
      return localAnchorPoint(anchor, localMins[idx], dims[idx].size ?? 0);
    },
    place(axis, value, anchor = "min"): void {
      const idx = elaborateDirection(axis);
      if (dims[idx].min !== undefined) return;
      pin(axis, value, anchor);
    },
    pinAnchor: pin,
    setExtent(axis, owned): void {
      const idx = elaborateDirection(axis);
      const dim = dims[idx];
      if (owned.min !== undefined && owned.max !== undefined) {
        dim.min = owned.min;
        dim.size = owned.max - owned.min;
        dim.center = localAnchorPoint("center", dim.min, dim.size);
        dim.max = localAnchorPoint("max", dim.min, dim.size);
        return;
      }
      if (owned.min !== undefined) pin(axis, owned.min, "min");
      if (owned.center !== undefined) pin(axis, owned.center, "center");
      if (owned.max !== undefined) pin(axis, owned.max, "max");
    },
  };
}

function solve(
  constraints: Constraint[],
  names: string[],
  setup?: (targets: Map<string, Placeable>) => void,
  create: (name: string) => Placeable = () => makePlaceable()
): Geometry {
  const targets = new Map(names.map((name) => [name, create(name)] as const));
  setup?.(targets);
  solvePlacementConstraints(constraints, targets, [300, 200]);
  return Object.fromEntries(
    [...targets].map(([name, target]) => {
      const { min, center, max } = target.dims[0];
      return [name, { min, center, max }];
    })
  );
}

function sameGeometry(a: Geometry, b: Geometry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function expectConfluent(
  name: string,
  first: Geometry,
  second: Geometry,
  expected: Geometry
): void {
  ok(
    `${name}: permutations agree`,
    sameGeometry(first, second),
    `${JSON.stringify(first)} !== ${JSON.stringify(second)}`
  );
  ok(
    `${name}: geometry is correct`,
    sameGeometry(first, expected),
    `got ${JSON.stringify(first)}`
  );
}

const child = (name: string) => ({ name });
const A = child("A");
const B = child("B");
const C = child("C");

const position = (
  name: string,
  x: number,
  override = false
): PositionConstraint => ({
  type: "position",
  x,
  anchor: "middle",
  override,
  children: [child(name)],
});

const positionedAnchor = (
  name: string,
  x: number,
  anchor: PositionConstraint["anchor"]
): PositionConstraint => ({
  type: "position",
  x,
  anchor,
  override: false,
  children: [child(name)],
});

const distribute = (names: string[]): DistributeConstraint => ({
  type: "distribute",
  dir: "x",
  spacing: 5,
  mode: "edge",
  order: "forward",
  glue: false,
  children: names.map(child),
});

const distributeWithSpacing = (
  names: string[],
  spacing: number
): DistributeConstraint => ({
  ...distribute(names),
  spacing,
});

// The interval form of `position`, replacing the retired `Constraint.span`.
const span = (
  name: string,
  min: number,
  max: number
): PositionConstraint => ({
  type: "position",
  x: [min, max],
  anchor: "middle",
  override: false,
  children: [child(name)],
});

const namedNode = (name: string, width?: number) =>
  ({
    _name: name,
    key: name,
    args: { dims: [{ size: width }, { size: 10 }] },
    children: [],
  });

function nestPlanSignature(constraints: NestConstraint[]): string {
  const children = [
    namedNode("A"),
    namedNode("B", 20),
    namedNode("C"),
    namedNode("D"),
  ];
  const plan = buildNestPlan(children, constraints);
  if (plan === undefined) return "none";
  return JSON.stringify({
    order: plan.order,
    derived: [...plan.byDerived.entries()]
      .map(([derivedIdx, edges]) => [
        derivedIdx,
        edges.map((edge) => ({
          sourceIdx: edge.sourceIdx,
          dir: edge.dir,
          padX: edge.padX,
          padY: edge.padY,
        })),
      ])
      .sort(([a], [b]) => Number(a) - Number(b)),
  });
}

console.log("# constraint confluence: explicit pin + distribute");
{
  const pinA = position("A", 100);
  const distributeAB = distribute(["A", "B"]);

  expectConfluent(
    "position/distribute",
    solve([pinA, distributeAB], ["A", "B"]),
    solve([distributeAB, pinA], ["A", "B"]),
    {
      A: { min: 95, center: 100, max: 105 },
      B: { min: 110, center: 115, max: 120 },
    }
  );
}

console.log("# constraint confluence: explicit pin + align");
{
  const pinA = position("A", 100);
  const align: AlignConstraint = {
    type: "align",
    x: "middle",
    children: [A, B],
  };

  expectConfluent(
    "position/align",
    solve([pinA, align], ["A", "B"]),
    solve([align, pinA], ["A", "B"]),
    {
      A: { min: 95, center: 100, max: 105 },
      B: { min: 95, center: 100, max: 105 },
    }
  );
}

console.log("# constraint confluence: connected distribute chains");
{
  const distributeAB = distribute(["A", "B"]);
  const distributeBC = distribute(["B", "C"]);

  expectConfluent(
    "distribute/distribute",
    solve([distributeAB, distributeBC], ["A", "B", "C"]),
    solve([distributeBC, distributeAB], ["A", "B", "C"]),
    {
      A: { min: 0, center: 5, max: 10 },
      B: { min: 15, center: 20, max: 25 },
      C: { min: 30, center: 35, max: 40 },
    }
  );
}

console.log("# constraint confluence: normalized floating components");
{
  const centerValueOnBox: AlignConstraint = {
    type: "align",
    x: "middle",
    children: [C, A],
  };
  const startLabelOnBox: AlignConstraint = {
    type: "align",
    x: "start",
    children: [B, A],
  };

  expectConfluent(
    "unanchored align component",
    solve([centerValueOnBox, startLabelOnBox], ["A", "B", "C"]),
    solve([startLabelOnBox, centerValueOnBox], ["A", "B", "C"]),
    {
      A: { min: 0, center: 5, max: 10 },
      B: { min: 0, center: 5, max: 10 },
      C: { min: 0, center: 5, max: 10 },
    }
  );

  const negativeSpread = distributeWithSpacing(["A", "B", "C"], -15);
  expectConfluent(
    "negative distribute preserves sequence origin",
    solve([negativeSpread], ["A", "B", "C"]),
    solve([distributeWithSpacing(["A", "B", "C"], -15)], ["A", "B", "C"]),
    {
      A: { min: 0, center: 5, max: 10 },
      B: { min: -5, center: 0, max: 5 },
      C: { min: -10, center: -5, max: 0 },
    }
  );
}

console.log("# constraint confluence: baseline offsets");
{
  const pinA: PositionConstraint = {
    type: "position",
    x: 100,
    anchor: "baseline",
    override: false,
    children: [A],
  };
  const alignBaselines: AlignConstraint = {
    type: "align",
    x: "baseline",
    children: [A, B],
  };
  const asymmetric = (name: string) =>
    makePlaceable(10, 10, [name === "A" ? -5 : 2, 0]);

  expectConfluent(
    "position/baseline-align",
    solve([pinA, alignBaselines], ["A", "B"], undefined, asymmetric),
    solve([alignBaselines, pinA], ["A", "B"], undefined, asymmetric),
    {
      A: { min: 95, center: 100, max: 105 },
      B: { min: 102, center: 107, max: 112 },
    }
  );
}

console.log("# constraint confluence: nest and grid placement");
{
  const pinOuter = position("A", 100);
  const nest: NestConstraint = {
    type: "nest",
    x: 5,
    children: [A, B],
  };
  expectConfluent(
    "position/nest",
    solve([pinOuter, nest], ["A", "B"]),
    solve([nest, pinOuter], ["A", "B"]),
    {
      A: { min: 95, center: 100, max: 105 },
      B: { min: 95, center: 100, max: 105 },
    }
  );

  const grid: GridConstraint = {
    type: "grid",
    numCols: 2,
    xSpacing: 10,
    ySpacing: 0,
    children: [A, B],
  };
  const alignRow: AlignConstraint = {
    type: "align",
    y: "middle",
    children: [A, B],
  };
  const first = solve([grid, alignRow], ["A", "B"]);
  const second = solve([alignRow, grid], ["A", "B"]);
  ok("grid/align permutations agree", sameGeometry(first, second));
  ok(
    "grid centers cells in their tracks",
    first.A.center === 72.5 && first.B.center === 227.5
  );
}

console.log("# constraint confluence: grid content-sized tracks (Stage 6e)");
{
  // Two columns of DIFFERENT extent (content-sized): col0=40, col1=100,
  // xSpacing=10 → starts [0, 50]; centers col0=20, col1=50+50=100.
  const grid: GridConstraint = {
    type: "grid",
    numCols: 2,
    xSpacing: 10,
    ySpacing: 0,
    children: [A, B],
  };
  const tracks: [TrackLayout, TrackLayout] = [
    { starts: [0, 50], extents: [40, 100] },
    { starts: [0], extents: [30] },
  ];

  // The per-cell budget map hands each cell its own track's extent.
  const cellSizes = gridCellSizeByName(grid, tracks);
  ok(
    "grid cell budget = per-cell track extents",
    JSON.stringify(cellSizes.get("A")) === "[40,30]" &&
      JSON.stringify(cellSizes.get("B")) === "[100,30]"
  );

  const contentTargets = () =>
    new Map<string, Placeable>([
      ["A", makePlaceable(40, 30)],
      ["B", makePlaceable(100, 30)],
    ]);
  {
    const t = contentTargets();
    solvePlacementConstraints([grid], t, [300, 200], undefined, tracks);
    ok(
      "content-sized grid centers each cell in its own track",
      t.get("A")!.dims[0].center === 20 && t.get("B")!.dims[0].center === 100
    );
  }

  // grid + align on a NON-cell child C: C's center is aligned (middle x) to the
  // grid cell A. The two constraints compose and are order-independent.
  const alignAC: AlignConstraint = { type: "align", x: "middle", children: [A, C] };
  const withAlign = (order: Constraint[]) => {
    const t = contentTargets();
    t.set("C", makePlaceable(10, 10));
    solvePlacementConstraints(order, t, [300, 200], undefined, tracks);
    return {
      A: t.get("A")!.dims[0].center,
      C: t.get("C")!.dims[0].center,
    };
  };
  const af = withAlign([grid, alignAC]);
  const as = withAlign([alignAC, grid]);
  ok(
    "grid + align on a non-cell composes, order-independent",
    JSON.stringify(af) === JSON.stringify(as) && af.A === 20 && af.C === 20
  );

  // grid + position pin of a CELL: the pin overrides that cell's track
  // centering on the pinned axis; the other cell keeps its track center.
  const pinB = position("B", 250);
  const withPin = (order: Constraint[]) => {
    const t = contentTargets();
    solvePlacementConstraints(order, t, [300, 200], undefined, tracks);
    return { A: t.get("A")!.dims[0].center, B: t.get("B")!.dims[0].center };
  };
  const pf = withPin([grid, pinB]);
  const ps = withPin([pinB, grid]);
  ok(
    "position pin on a cell overrides its track centering, order-independent",
    JSON.stringify(pf) === JSON.stringify(ps) && pf.A === 20 && pf.B === 250
  );

  // Authoritative placement tracks are recomputed from ACTUAL laid-out cell
  // sizes: a track sizes to the MAX of its cells (a claim cell wider than a
  // sibling pins the track; a mixed fill/claim track = the claim). 2 cols × 2
  // rows, xSpacing=10: col0 max(40,20)=40, col1 max(100,60)=100.
  const grid2x2: GridConstraint = {
    type: "grid",
    numCols: 2,
    xSpacing: 10,
    ySpacing: 5,
    children: [A, B, C, child("D")],
  };
  const fromSizes = gridTracksFromSizes(grid2x2, [
    [40, 30],
    [100, 30],
    [20, 12],
    [60, 8],
  ]);
  ok(
    "placement tracks take the max laid-out size per track",
    JSON.stringify(fromSizes[0].extents) === "[40,100]" &&
      JSON.stringify(fromSizes[0].starts) === "[0,50]"
  );
  ok(
    "placement track rows take the max height and cumulate with spacing",
    JSON.stringify(fromSizes[1].extents) === "[30,12]" &&
      JSON.stringify(fromSizes[1].starts) === "[0,35]"
  );
}

console.log("# constraint confluence: nest size dependency planning");
{
  const nestAB: NestConstraint = {
    type: "nest",
    x: 5,
    children: [A, B],
  };
  const nestAC: NestConstraint = {
    type: "nest",
    x: 8,
    children: [A, C],
  };
  const nestDA: NestConstraint = {
    type: "nest",
    x: 2,
    children: [child("D"), A],
  };

  const expected = nestPlanSignature([nestAB, nestAC, nestDA]);
  ok(
    "shared-outer nest dependency plan is declaration-order independent",
    nestPlanSignature([nestAC, nestAB, nestDA]) === expected &&
      nestPlanSignature([nestDA, nestAB, nestAC]) === expected &&
      nestPlanSignature([nestDA, nestAC, nestAB]) === expected
  );

  const concreteSources = [
    makePlaceable(100, 80),
    makePlaceable(40, 30),
  ] as const;
  const insideOut = applyNestLayoutProposal(
    [200, 200],
    [{ derivedIdx: 0, sourceIdx: 1, dir: "in", padX: 5, padY: 7 }],
    concreteSources
  );
  ok(
    "inside-out nest proposal derives concrete outer size from source",
    insideOut[0] === 50 && insideOut[1] === 44
  );

  const outsideIn = applyNestLayoutProposal(
    [200, 200],
    [{ derivedIdx: 1, sourceIdx: 0, dir: "out", padX: 12, padY: 50 }],
    concreteSources
  );
  ok(
    "outside-in nest proposal derives concrete inner size from source",
    outsideIn[0] === 76 && outsideIn[1] === 0
  );

  const childSpaces = [
    [UNDEFINED, UNDEFINED],
    [SIZE(Monotonic.linear(10, 0)), SIZE(Monotonic.linear(4, 0))],
  ] as const;
  const folded = applyNestSpacePlan(childSpaces, {
    order: [1, 0],
    byDerived: new Map([
      [
        0,
        [{ derivedIdx: 0, sourceIdx: 1, dir: "in", padX: 3, padY: 2 }],
      ],
    ]),
  });
  ok(
    "inside-out nest space fold derives padded SIZE space",
    folded[0][0].kind === "continuous" &&
      folded[0][0].width.run(1) === 16 &&
      folded[0][1].kind === "continuous" &&
      folded[0][1].width.run(1) === 8
  );
  ok(
    "nest space fold copies child spaces instead of mutating input",
    folded !== childSpaces &&
      folded[0] !== childSpaces[0] &&
      childSpaces[0][0] === UNDEFINED
  );

  const resolved = resolveLayerBaseSpaces(
    [[SIZE(Monotonic.linear(10, 0)), POSITION(interval(5, 15), "child")]],
    [3, 1],
    { y: interval(0, 20), yMeasure: "pin" }
  );
  ok(
    "base space resolution scales free magnitudes with transform.scale",
    resolved[0].kind === "continuous" &&
      resolved[0].dataDomain === undefined &&
      resolved[0].width.run(1) === 30
  );
  ok(
    "base space resolution merges datum domains and prefers constraint measure",
    resolved[1].kind === "continuous" &&
      resolved[1].dataDomain !== undefined &&
      resolved[1].dataDomain !== "delta" &&
      resolved[1].dataDomain.min === 0 &&
      resolved[1].dataDomain.max === 20 &&
      resolved[1].measure === "pin"
  );
}

console.log("# constraint confluence: layer constraint layout planning");
{
  const childNodes = [namedNode("A", 20), namedNode("B"), namedNode("C")];
  const nestBA: NestConstraint = {
    type: "nest",
    x: 5,
    children: [B, A],
  };
  const datumC: PositionConstraint = {
    type: "position",
    y: value(30),
    anchor: "baseline",
    override: false,
    children: [C],
  };
  const zOnly: ZAboveConstraint = {
    type: "zAbove",
    children: [B, C],
  };

  const plan = buildLayerConstraintLayoutPlan(childNodes, [
    zOnly,
    datumC,
    nestBA,
  ]);
  ok(
    "layout plan excludes z-order refs and skips only nest inner",
    plan.constrainedNames.has("A") &&
      plan.constrainedNames.has("C") &&
      !plan.constrainedNames.has("B")
  );
  ok(
    "layout plan orders nest source before derived child",
    plan.layoutOrder.indexOf(0) < plan.layoutOrder.indexOf(1)
  );
  ok(
    "layout plan tracks datum-position target axes",
    plan.positionTargetDims.get("C")?.has(1) === true &&
      plan.positionTargetDims.get("C")?.has(0) !== true
  );
}

console.log("# constraint confluence: distribute size proposals");
{
  const slices = buildDistributeSliceMap(
    [
      { dAxis: 0, spacing: 10, order: ["A", "B"] },
      { dAxis: 1, spacing: 5, order: ["A", "C"] },
    ],
    [210, 105]
  );
  ok(
    "distribute proposal slices compose across independent axes",
    slices?.get("A")?.[0] === 100 &&
      slices.get("B")?.[0] === 100 &&
      slices.get("A")?.[1] === 50 &&
      slices.get("C")?.[1] === 50
  );

  const overlapAB = { dAxis: 0 as const, spacing: 10, order: ["A", "B"] };
  const overlapBC = { dAxis: 0 as const, spacing: 20, order: ["B", "C"] };
  const overlappingForward = buildDistributeSliceMap(
    [overlapAB, overlapBC],
    [210, 105]
  );
  const overlappingReverse = buildDistributeSliceMap(
    [overlapBC, overlapAB],
    [210, 105]
  );
  ok(
    "overlapping distribute proposals are skipped in either order",
    overlappingForward === undefined && overlappingReverse === undefined
  );

  const layerSize: [number, number] = [300, 200];
  const gridCell: [number, number] = [90, 40];
  const gridCellByName = new Map<string, [number, number]>([["A", gridCell]]);
  const sliceByName = new Map<string, [number, number]>([
    ["A", [100, 200]],
  ]);
  ok(
    "grid cell proposal (its track extent) overrides distribute slice",
    childLayoutSizeProposal("A", layerSize, gridCellByName, sliceByName) ===
      gridCell
  );
  ok(
    "a non-cell named child still receives its distribute slice",
    childLayoutSizeProposal("A", layerSize, undefined, sliceByName) ===
      sliceByName.get("A")
  );
  ok(
    "unnamed or unsliced child receives full layer proposal",
    childLayoutSizeProposal(undefined, layerSize, undefined, sliceByName) ===
      layerSize &&
      childLayoutSizeProposal("B", layerSize, undefined, sliceByName) ===
        layerSize
  );
}

console.log("# constraint confluence: grid proposal ownership");
{
  const grid2: GridConstraint = {
    type: "grid",
    numCols: 2,
    xSpacing: 10,
    ySpacing: 0,
    children: [A, B],
  };
  const grid1: GridConstraint = {
    type: "grid",
    numCols: 1,
    xSpacing: 0,
    ySpacing: 5,
    children: [A, B],
  };

  ok(
    "single grid proposal owner is selected",
    selectGridConstraint([grid2]) === grid2
  );

  const throwsWith = (
    constraints: Constraint[],
    fragment: string
  ): boolean => {
    try {
      selectGridConstraint(constraints);
      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes(fragment);
    }
  };
  ok(
    "duplicate grid proposal ownership throws in either order",
    throwsWith([grid2, grid1], "Constraint.grid proposal conflict") &&
      throwsWith([grid1, grid2], "Constraint.grid proposal conflict")
  );

  // Stage 6e: grid now GENUINELY composes with sibling constraints, so
  // selectGridConstraint no longer throws on a non-z-order sibling — it just
  // selects the one grid (the mixing is exercised for real at placement below).
  const alignMix: AlignConstraint = {
    type: "align",
    y: "middle",
    children: [A, B],
  };
  ok(
    "grid alongside an align is allowed (composes) in either order",
    selectGridConstraint([grid2, alignMix]) === grid2 &&
      selectGridConstraint([alignMix, grid2]) === grid2
  );

  // z-order (zAbove/zBelow) is render-time paint order and composes with grid.
  const zAboveMix: ZAboveConstraint = {
    type: "zAbove",
    children: [A, B],
  };
  ok(
    "grid alongside a z-order constraint is allowed",
    selectGridConstraint([grid2, zAboveMix]) === grid2 &&
      selectGridConstraint([zAboveMix, grid2]) === grid2
  );
}

console.log("# constraint confluence: position scale ownership planning");
{
  const datumX: PositionConstraint = {
    type: "position",
    x: value(10),
    anchor: "baseline",
    override: false,
    children: [A],
  };
  const literalY: PositionConstraint = {
    type: "position",
    y: 20,
    anchor: "baseline",
    override: false,
    children: [A],
  };
  const datumY: PositionConstraint = {
    type: "position",
    y: value(30),
    anchor: "baseline",
    override: false,
    children: [B],
  };

  const first = buildPositionTargetDims([datumX, literalY, datumY]);
  const second = buildPositionTargetDims([datumY, literalY, datumX]);
  ok(
    "datum position targets consume only their datum axes",
    first.get("A")?.has(0) === true &&
      first.get("A")?.has(1) !== true &&
      first.get("B")?.has(1) === true
  );
  ok(
    "position scale ownership plan is declaration-order independent",
    JSON.stringify([...first.entries()].map(([k, v]) => [k, [...v].sort()])) ===
      JSON.stringify([...second.entries()].map(([k, v]) => [k, [...v].sort()]))
  );
}

console.log("# constraint confluence: child posScale forwarding");
{
  // AxisMaps standing in for the former closures: pxOf(map, v) reproduces them.
  const baseX: AxisMap = { sigma: 1, domainMin: 0, pxMin: 1 }; // v + 1
  const baseY: AxisMap = { sigma: 1, domainMin: 0, pxMin: 2 }; // v + 2
  const effectiveX: AxisMap = { sigma: 10, domainMin: 0, pxMin: 0 }; // v * 10
  const effectiveY: AxisMap = { sigma: 20, domainMin: 0, pxMin: 0 }; // v * 20
  const positionSpace = POSITION(interval(0, 10));

  const noOwnedAxisPlan = buildPositionScalePlan(
    [false, false],
    [positionSpace, positionSpace],
    [100, 200],
    [undefined, undefined]
  );
  ok(
    "position scale plan does not synthesize local scales without owned axes",
    noOwnedAxisPlan.effectivePosScales[0] === undefined &&
      noOwnedAxisPlan.effectivePosScales[1] === undefined
  );

  const ownedAxisPlan = buildPositionScalePlan(
    [true, false],
    [positionSpace, positionSpace],
    [100, 200],
    [baseX, undefined]
  );
  ok(
    "position scale plan preserves base scales and falls back locally when owned",
    ownedAxisPlan.ownsAxis[0] === true &&
      ownedAxisPlan.ownsAxis[1] === false &&
      ownedAxisPlan.effectivePosScales[0] === baseX &&
      pxOf(ownedAxisPlan.effectivePosScales[1]!, 5) === 100
  );

  const unowned = childPosScalesFor(
    [UNDEFINED, UNDEFINED],
    undefined,
    [false, false],
    [baseX, baseY],
    [effectiveX, effectiveY]
  );
  ok(
    "unowned axes forward base posScales",
    unowned[0] === baseX && unowned[1] === baseY
  );

  const ownedPosition = childPosScalesFor(
    [positionSpace, positionSpace],
    undefined,
    [true, true],
    [baseX, baseY],
    [effectiveX, effectiveY]
  );
  ok(
    "owned POSITION child receives effective posScales",
    ownedPosition[0] === effectiveX && ownedPosition[1] === effectiveY
  );

  const ownedTarget = childPosScalesFor(
    [positionSpace, positionSpace],
    new Set<0 | 1>([0]),
    [true, true],
    [baseX, baseY],
    [effectiveX, effectiveY]
  );
  ok(
    "datum-position target suppresses only the owned target axis",
    ownedTarget[0] === undefined && ownedTarget[1] === effectiveY
  );

  const ownedUndefined = childPosScalesFor(
    [UNDEFINED, UNDEFINED],
    undefined,
    [true, true],
    [baseX, baseY],
    [effectiveX, effectiveY]
  );
  ok(
    "owned non-POSITION child receives no posScales",
    ownedUndefined[0] === undefined && ownedUndefined[1] === undefined
  );
}

console.log("# constraint confluence: raw placement coordinates");
{
  ok(
    "literal placement coordinate compiles directly to pixels",
    compilePlacementCoordinate(5, undefined) === 5
  );
  ok(
    "datum placement coordinate elaborates through posScale before raw facts",
    compilePlacementCoordinate(value(5).offset(3), undefined) === undefined &&
      compilePlacementCoordinate(value(5).offset(3), {
        sigma: 10,
        domainMin: 0,
        pxMin: 0,
      }) === 53
  );
  ok(
    "discrete placement coordinate resolves from containing axis size",
    compilePlacementCoordinate(discretePosition(2, 6), undefined, 300) === 100
  );
}

console.log("# constraint confluence: reduced placement fact datatype");
{
  // The difference graph consumes `min`-reduced relation/participant facts (the
  // solver builds these from the anchor program post-closure).
  const a = anchorExpr("A", "x", "middle");
  const b = anchorExpr("B", "x", "start");
  const participant = participantFact("B", "x", "test-participant");
  const relation = relationFact(a, b, 7, "test-relation");

  ok(
    "reduced placement facts are numeric raw algebra terms",
    participant.type === "participant" &&
      participant.name === "B" &&
      relation.type === "relation" &&
      typeof relation.offset === "number"
  );
  ok(
    "reduced placement facts retain anchor identity separately from values",
    relation.from.anchor === "middle" &&
      relation.to.anchor === "start" &&
      relation.from.node === "A" &&
      participant.axis === "x"
  );
}

console.log("# constraint confluence: placement constraint lowering");
{
  const targets = (...names: string[]) =>
    new Map(names.map((name) => [name, makePlaceable()] as const));

  const loweredPosition = lowerPlacementConstraints(
    [position("A", 20)],
    targets("A"),
    [300, 200]
  );
  const positionFact = loweredPosition.anchorProgram.axes[0][0];
  ok(
    "position lowers to an anchor pin fact (no pre-evaluated offset)",
    positionFact?.type === "anchor-pin" &&
      positionFact.owner === "position[0]" &&
      positionFact.node === "A" &&
      positionFact.anchor === "middle" &&
      positionFact.value === 20
  );

  const loweredDiscretePosition = lowerPlacementConstraints(
    [
      {
        type: "position",
        x: discretePosition(2, 6),
        anchor: "middle",
        override: true,
        children: [A],
      },
    ],
    targets("A"),
    [300, 200]
  );
  const discretePositionFact = loweredDiscretePosition.anchorProgram.axes[0][0];
  ok(
    "discrete position lowers to a numeric anchor pin fact",
    discretePositionFact?.type === "anchor-pin" &&
      discretePositionFact.owner === "position[0]" &&
      discretePositionFact.node === "A" &&
      discretePositionFact.anchor === "middle" &&
      discretePositionFact.value === 100
  );

  const loweredAlign = lowerPlacementConstraints(
    [{ type: "align", x: "middle", children: [A, B] }],
    targets("A", "B"),
    [300, 200]
  );
  ok(
    "align lowers to anchor-relation plus anchor-participant facts",
    loweredAlign.anchorProgram.axes[0].some(
      (fact) =>
        fact.type === "anchor-relation" &&
        fact.owner === "align[0]" &&
        fact.from.node === "A" &&
        fact.to.node === "B" &&
        fact.gap === 0
    ) &&
      loweredAlign.anchorProgram.axes[0].some(
        (fact) =>
          fact.type === "anchor-participant" && fact.owner === "align[0]"
      )
  );

  const loweredDistribute = lowerPlacementConstraints(
    [distribute(["A", "B", "C"])],
    targets("A", "B", "C"),
    [300, 200]
  );
  ok(
    "distribute lowers to chain anchor-relations plus a participant",
    loweredDistribute.anchorProgram.axes[0].filter(
      (fact) =>
        fact.type === "anchor-relation" && fact.owner === "distribute[0]"
    ).length === 2 &&
      loweredDistribute.anchorProgram.axes[0].some(
        (fact) =>
          fact.type === "anchor-relation" &&
          fact.from.node === "A" &&
          fact.to.node === "B" &&
          fact.gap === 5
      ) &&
      loweredDistribute.anchorProgram.axes[0].some(
        (fact) =>
          fact.type === "anchor-participant" && fact.owner === "distribute[0]"
      )
  );

  const loweredNest = lowerPlacementConstraints(
    [{ type: "nest", x: 5, children: [A, B] }],
    targets("A", "B"),
    [300, 200]
  );
  ok(
    "nest lowers to an anchor-relation between centers",
    loweredNest.anchorProgram.axes[0].some(
      (fact) =>
        fact.type === "anchor-relation" &&
        fact.owner === "nest[0]" &&
        fact.from.node === "A" &&
        fact.to.node === "B" &&
        fact.from.anchor === "middle" &&
        fact.to.anchor === "middle" &&
        fact.gap === 0
    )
  );

  const loweredSpan = lowerPlacementConstraints(
    [span("C", 10, 30)],
    targets("C"),
    [300, 200]
  );
  const spanFacts = loweredSpan.anchorProgram.axes[0];
  ok(
    "interval position lowers to strong start/end edge anchor pins",
    spanFacts.some(
      (fact) =>
        fact.type === "anchor-pin" &&
        fact.node === "C" &&
        fact.anchor === "start" &&
        fact.value === 10 &&
        fact.owner === "position[0]"
    ) &&
      spanFacts.some(
        (fact) =>
          fact.type === "anchor-pin" &&
          fact.node === "C" &&
          fact.anchor === "end" &&
          fact.value === 30 &&
          fact.owner === "position[0]"
      )
  );

  // A single position constraint carrying a POINT on one axis and an INTERVAL on
  // the other: the interval axis emits two edge pins, the point axis one pin.
  // Both forms coexist on one constraint.
  const mixed: PositionConstraint = {
    type: "position",
    x: 12,
    y: [10, 30],
    anchor: "middle",
    override: false,
    children: [child("C")],
  };
  const loweredMixed = lowerPlacementConstraints(
    [mixed],
    targets("C"),
    [300, 200]
  );
  ok(
    "interval+point on one constraint: interval axis yields two edge pins",
    loweredMixed.anchorProgram.axes[1].filter(
      (fact) =>
        fact.type === "anchor-pin" &&
        fact.node === "C" &&
        (fact.anchor === "start" || fact.anchor === "end")
    ).length === 2
  );
  ok(
    "interval+point on one constraint: point axis yields a single pin",
    loweredMixed.anchorProgram.axes[0].some(
      (fact) =>
        fact.type === "anchor-pin" &&
        fact.node === "C" &&
        fact.anchor === "middle"
    )
  );
}

console.log("# constraint confluence: interval position + align");
{
  // An interval position on x (sizes A) plus an align on x (overlays B onto A's
  // center) must be declaration-order-independent — the interval and align feed
  // the same relational solve.
  const spanA = span("A", 10, 30);
  const alignAB: AlignConstraint = {
    type: "align",
    x: "middle",
    children: [A, B],
  };
  expectConfluent(
    "interval-position/align",
    solve([spanA, alignAB], ["A", "B"]),
    solve([alignAB, spanA], ["A", "B"]),
    {
      A: { min: 10, center: 20, max: 30 },
      B: { min: 15, center: 20, max: 25 },
    }
  );
}

console.log("# constraint confluence: interval inside a distribute chain");
{
  // An interval sizes A (size-strong cell); a distribute chains B off A. The
  // interval's extent must survive the chain and B follows it (spacing 5).
  const spanA = span("A", 10, 30);
  const distAB = distribute(["A", "B"]);
  expectConfluent(
    "interval/distribute chain",
    solve([spanA, distAB], ["A", "B"]),
    solve([distAB, spanA], ["A", "B"]),
    {
      A: { min: 10, center: 20, max: 30 },
      B: { min: 35, center: 40, max: 45 },
    }
  );
}

console.log(
  "# constraint confluence: authoritative override on a size-strong cell"
);
{
  // A size-strong cell (interval determines A's extent) also carries an
  // authoritative override point pin on its center. The two are compatible —
  // the override anchors where the interval already places the center — and
  // declaration order cannot change the result.
  const spanA = span("A", 10, 30);
  const overrideCenter = position("A", 20, true);
  expectConfluent(
    "interval + authoritative override (compatible)",
    solve([spanA, overrideCenter], ["A"]),
    solve([overrideCenter, spanA], ["A"]),
    { A: { min: 10, center: 20, max: 30 } }
  );
}

console.log("# constraint confluence: interval vs point compose bail");
{
  // compose treats an interval position as span-like (it composes alongside a
  // distribute), but a constraint carrying ANY point coordinate bails to the
  // layer's default union — conservatively, even when it also carries an
  // interval on the other axis.
  const childNodes = [
    { _name: "A", key: "A" },
    { _name: "B", key: "B" },
  ] as unknown as Parameters<typeof composeConstraintSpaces>[1];
  const childSpaces: Parameters<typeof composeConstraintSpaces>[2] = [
    [SIZE(Monotonic.linear(10, 0)), UNDEFINED],
    [SIZE(Monotonic.linear(10, 0)), UNDEFINED],
  ];
  const distAB = distribute(["A", "B"]);
  const pureInterval: PositionConstraint = {
    type: "position",
    y: [value(0), value(10)],
    anchor: "middle",
    override: false,
    children: [A],
  };
  const pointPlusInterval: PositionConstraint = {
    type: "position",
    x: value(5),
    y: [value(0), value(10)],
    anchor: "middle",
    override: false,
    children: [A],
  };
  ok(
    "pure-interval position composes with a distribute (span-like)",
    composeConstraintSpaces(
      [distAB, pureInterval],
      childNodes,
      childSpaces
    ) !== undefined
  );
  ok(
    "point+interval position bails composition (conservatively point-form)",
    composeConstraintSpaces(
      [distAB, pointPlusInterval],
      childNodes,
      childSpaces
    ) === undefined
  );
}

console.log("# constraint confluence: child scale factor planning");
{
  const inheritedX: AxisMap = { sigma: 1, domainMin: 0, pxMin: 1 }; // v + 1
  const inheritedY: AxisMap = { sigma: 1, domainMin: 0, pxMin: 2 }; // v + 2
  const positionSpace = POSITION(interval(0, 10));
  const sizeSpace = SIZE(Monotonic.linear(20, 0));

  const selfScaled = buildChildScalePlan(
    [positionSpace, sizeSpace],
    [UNDEFINED, UNDEFINED],
    [100, 80],
    [2, 3],
    [inheritedX, inheritedY],
    undefined,
    [false, false],
    new ScopeRegistry(),
    "test"
  );
  ok(
    "self-scaled POSITION axis builds local posScale",
    pxOf(selfScaled.basePosScales[0]!, 5) === 50 &&
      selfScaled.basePosScales[1] === inheritedY
  );
  ok(
    "self-scaled SIZE axis builds local child scale factor",
    selfScaled.childScaleFactors[0] === 2 && selfScaled.childScaleFactors[1] === 4
  );

  // Scale-root scoping (#618): an INTERMEDIATE distribute — inherited scale
  // present AND not self-scaled — is inside an ancestor scale root's σ-scope, so
  // it must DEFER to the inherited σ rather than re-derive its own from the
  // locally allocated size. (In a consistently sized layout the re-derived factor
  // equals the inherited one, so this is a no-op; it diverges only when the
  // allocated size disagrees with the inherited σ — e.g. an equal-slice budget
  // under a coord, where the distribute axis IS the σ-scaled axis. This is what
  // makes flat ≡ nested distribute for data-driven children — see
  // coordConfluence.test.ts.)
  const intermediate = buildChildScalePlan(
    [undefined, undefined],
    [UNDEFINED, UNDEFINED],
    [100, 80],
    [2, 3],
    [inheritedX, inheritedY],
    { sizeDomain: [Monotonic.linear(10, 0), Monotonic.linear(0, 10)] },
    [false, false],
    new ScopeRegistry(),
    "test"
  );
  ok(
    "intermediate distribute defers to inherited child scale factor (scale-root scoping)",
    intermediate.childScaleFactors[0] === 2 &&
      intermediate.childScaleFactors[1] === 3
  );
  ok(
    "intermediate distribute makes no budget-inversion attempt (no failures)",
    intermediate.budgetFailures.length === 0
  );

  // When this layer IS the σ-root for the axis (no inherited scale), the budget
  // applies: re-derive from the fold, and a non-invertible fold is reported.
  const rootBudget = buildChildScalePlan(
    [undefined, undefined],
    [UNDEFINED, UNDEFINED],
    [100, 80],
    [undefined, undefined],
    [inheritedX, inheritedY],
    { sizeDomain: [Monotonic.linear(10, 0), Monotonic.linear(0, 10)] },
    [false, false],
    new ScopeRegistry(),
    "test"
  );
  ok(
    "σ-root distribute re-derives child scale factor from its budget when invertible",
    rootBudget.childScaleFactors[0] === 10
  );
  ok(
    "non-invertible constraint SIZE budget on a σ-root axis is reported",
    rootBudget.budgetFailures.length === 1 &&
      rootBudget.budgetFailures[0].axis === 1 &&
      rootBudget.budgetFailures[0].budget === 80
  );

  const shared = buildChildScalePlan(
    [undefined, undefined],
    [SIZE(Monotonic.linear(25, 0)), UNDEFINED],
    [100, 80],
    [2, 3],
    [inheritedX, inheritedY],
    { sizeDomain: [Monotonic.linear(10, 0), undefined] },
    [true, false],
    new ScopeRegistry(),
    "test"
  );
  ok(
    "shared scale scope overrides budget scale factor and emits shadow check",
    shared.childScaleFactors[0] === 4 &&
      shared.sharedScaleChecks.length === 1 &&
      shared.sharedScaleChecks[0].axis === 0 &&
      shared.sharedScaleChecks[0].sigma === 4
  );
}

console.log("# constraint confluence: span size-setting");
{
  const spanA = span("A", 10, 30);
  const duplicateSpanA = span("A", 10, 30);
  const alignCenters: AlignConstraint = {
    type: "align",
    x: "middle",
    children: [A, B],
  };
  const apply = (constraints: Constraint[]): Geometry => {
    const targets = new Map<string, Placeable>([
      ["A", makePlaceable()],
      ["B", makePlaceable()],
    ]);
    solvePlacementConstraints(constraints, targets, [300, 200]);
    return Object.fromEntries(
      [...targets].map(([name, target]) => {
        const { min, center, max } = target.dims[0];
        return [name, { min, center, max }];
      })
    );
  };

  expectConfluent(
    "duplicate span/align",
    apply([spanA, duplicateSpanA, alignCenters]),
    apply([alignCenters, duplicateSpanA, spanA]),
    {
      A: { min: 10, center: 20, max: 30 },
      B: { min: 15, center: 20, max: 25 },
    }
  );

  const distributeAB = distribute(["A", "B"]);
  expectConfluent(
    "span/distribute",
    apply([spanA, distributeAB]),
    apply([distributeAB, spanA]),
    {
      A: { min: 10, center: 20, max: 30 },
      B: { min: 35, center: 40, max: 45 },
    }
  );

  const spanB = span("B", 20, 50);
  expectConfluent(
    "span/distribute solves predecessor",
    apply([spanB, distributeAB]),
    apply([distributeAB, spanB]),
    {
      A: { min: 5, center: 10, max: 15 },
      B: { min: 20, center: 35, max: 50 },
    }
  );

  const alignCentersOnB: AlignConstraint = {
    type: "align",
    x: "middle",
    children: [B, A],
  };
  expectConfluent(
    "span/align solves sibling from spanned source",
    apply([spanB, alignCentersOnB]),
    apply([alignCentersOnB, spanB]),
    {
      A: { min: 30, center: 35, max: 40 },
      B: { min: 20, center: 35, max: 50 },
    }
  );

  const centerA = position("A", 20);
  expectConfluent(
    "compatible span/position",
    apply([spanA, centerA]),
    apply([centerA, spanA]),
    {
      A: { min: 10, center: 20, max: 30 },
      B: { min: undefined, center: undefined, max: undefined },
    }
  );

  const endA = positionedAnchor("A", 30, "max");
  expectConfluent(
    "compatible span/end-position",
    apply([spanA, endA]),
    apply([endA, spanA]),
    {
      A: { min: 10, center: 20, max: 30 },
      B: { min: undefined, center: undefined, max: undefined },
    }
  );
}

console.log("# constraint confluence: self-placement and override");
{
  const selfPlace = (targets: Map<string, Placeable>) =>
    targets.get("A")!.pinAnchor!("x", 40, "min");

  ok(
    "ordinary position yields to pre-existing self-placement",
    solve([position("A", 100)], ["A"], selfPlace).A.min === 40
  );
  ok(
    "authoritative position replaces pre-existing self-placement",
    solve([position("A", 100, true)], ["A"], selfPlace).A.center === 100
  );

  const targets = new Map<string, Placeable>([
    ["A", makePlaceable()],
    ["B", makePlaceable()],
  ]);
  // A is anchored to the x data scale (Stage 6f: the data-positioned fact now
  // arrives as an explicit ownership input, not a `placementOn` method on the
  // target). align must leave A where its own scale puts it.
  solvePlacementConstraints(
    [{ type: "align", x: "baseline", children: [A, B] }],
    targets,
    [300, 200],
    [(value) => value * 10 - 200, undefined],
    undefined,
    [new Set(["A"]), new Set()]
  );
  ok(
    "posScale align leaves determined continuous placement alone and normalizes free sibling",
    targets.get("A")!.dims[0].min === undefined &&
      targets.get("B")!.dims[0].min === 0
  );

  const sourceTargets = new Map<string, Placeable>([
    ["A", makePlaceable()],
    ["B", makePlaceable()],
  ]);
  sourceTargets.get("A")!.pinAnchor!("x", 40, "min");
  solvePlacementConstraints(
    [{ type: "align", x: "baseline", children: [A, B] }],
    sourceTargets,
    [300, 200],
    [(value) => value * 10 - 200, undefined]
  );
  ok(
    "placed align source anchors free sibling instead of fallback",
    sourceTargets.get("A")!.dims[0].min === 40 &&
      sourceTargets.get("B")!.dims[0].min === 40
  );

  const pinAStart: PositionConstraint = {
    type: "position",
    x: 40,
    anchor: "baseline",
    override: false,
    children: [A],
  };
  const baselineAlign: AlignConstraint = {
    type: "align",
    x: "baseline",
    children: [A, B],
  };
  const sameSolve = solvePlacementConstraints;
  const sameSolveTargets = new Map<string, Placeable>([
    ["A", makePlaceable()],
    ["B", makePlaceable()],
  ]);
  sameSolve(
    [baselineAlign, pinAStart],
    sameSolveTargets,
    [300, 200],
    [(value) => value * 10 - 200, undefined]
  );
  ok(
    "same-solve position pin is align source",
    sameSolveTargets.get("A")!.dims[0].min === 40 &&
      sameSolveTargets.get("B")!.dims[0].min === 40
  );
}

console.log("# constraint confluence: contradictions are diagnosed");
{
  const p100 = position("A", 100);
  const p200 = position("A", 200);
  const throws = (constraints: Constraint[]): boolean => {
    try {
      solve(constraints, ["A"]);
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        error.message.includes("Constraint placement conflict")
      );
    }
  };
  ok(
    "conflicting pins throw in either declaration order",
    throws([p100, p200]) && throws([p200, p100])
  );

  const spanA10_30 = span("A", 10, 30);
  const spanA10_40 = span("A", 10, 40);
  // Two conflicting intervals over-determine one cell (rank-2 closure). The
  // named-owner conflict must name BOTH owners so the error is actionable.
  const spanThrows = (constraints: PositionConstraint[]): boolean => {
    try {
      solvePlacementConstraints(
        constraints,
        new Map<string, Placeable>([["A", makePlaceable()]]),
        [300, 200]
      );
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        error.message.includes("Constraint placement conflict") &&
        error.message.includes("position[0]") &&
        error.message.includes("position[1]")
      );
    }
  };
  ok(
    "conflicting intervals throw naming both owners in either declaration order",
    spanThrows([spanA10_30, spanA10_40]) &&
      spanThrows([spanA10_40, spanA10_30])
  );

  const spanPositionThrows = (
    constraints: PositionConstraint[]
  ): boolean => {
    try {
      solvePlacementConstraints(
        constraints,
        new Map<string, Placeable>([["A", makePlaceable()]]),
        [300, 200]
      );
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        error.message.includes("Constraint placement conflict")
      );
    }
  };
  ok(
    "conflicting span/position throws in either declaration order",
    spanPositionThrows([spanA10_30, position("A", 25)]) &&
      spanPositionThrows([position("A", 25), spanA10_30])
  );

  const endA35 = positionedAnchor("A", 35, "max");
  ok(
    "conflicting span/end-position throws in either declaration order",
    spanPositionThrows([spanA10_30, endA35]) &&
      spanPositionThrows([endA35, spanA10_30])
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

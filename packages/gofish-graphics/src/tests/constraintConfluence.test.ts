/**
 * Permutation tests for the production relational placement solver.
 *
 * Run: `pnpm --filter gofish-graphics test:confluence`
 */

import type { Placeable } from "../ast/_node";
import * as Pwl from "../ast/solver/pwl";
import type { AlignConstraint } from "../ast/constraints/align";
import type { DistributeConstraint } from "../ast/constraints/distribute";
import type { GapOf } from "../ast/constraints/gap";
import type { GridConstraint, TrackLayout } from "../ast/constraints/grid";
import { gridTracks } from "../ast/constraints/grid";
import type { NestConstraint } from "../ast/constraints/nest";
import {
  compilePlacementCoordinate,
  lowerPlacementConstraints as lowerPlacement,
  solvePlacementCells as solveCells,
  type PlacementConstraint,
} from "../ast/constraints/placementSolver";
import type { KeyOf, ResolvedOperands } from "../ast/constraints/shared";
import { numbers } from "../ast/solver/arith";

/** The gaps of constraints with pixel spacings, as a layer reads them
 *  (`GoFishNode.gapOf`). */
const pixelGaps: GapOf = (c, axis) =>
  Pwl.constant((c.type === "grid" ? c.spacing[axis] : c.spacing) as number);
import {
  anchorExpr,
  participantFact,
  relationFact,
} from "../ast/constraints/placementFacts";
import type { PositionConstraint } from "../ast/constraints/position";
import {
  createPositionConstraint,
  PositionRegion,
} from "../ast/constraints/position";
import { Cell } from "../ast/cells";
import type { ZAboveConstraint } from "../ast/constraints/zorder";
import type { Anchor, Dimensions, FancyDirection } from "../ast/dims";
import { elaborateDirection, localAnchorPoint } from "../ast/dims";
import {
  applyNestExtentPlan,
  applyNestLayoutProposal,
  applyNestSpacePlan,
  buildNestPlan,
} from "../ast/constraints/nestPlan";
import {
  planConstraintComposition,
  resolveLayerBaseSpaces,
} from "../ast/constraints/compose";
import {
  buildLayerConstraintLayoutPlan,
  buildPositionTargetDims,
  childLayoutSizeProposal,
  childPosScalesFor,
  selectGridConstraint,
  solveLayerScales,
} from "../ast/constraints/proposalPlan";
import { discretePosition, value } from "../ast/data";
import { declared } from "./testHelpers";
import { pxOf, type AxisMap } from "../ast/domain";
import {
  UNDEFINED,
  continuousInterval,
  dataWidth,
  spaceUnit,
  CONTINUOUS,
  originIs,
  DEFAULT_AXIS_TICKS,
} from "../ast/underlyingSpace";
import { Extent, impliedExtent, niceScope, widenScope } from "../ast/extent";
import { ScopeRegistry } from "../ast/solver/scopes";
import { interval } from "../util/interval";

type Constraint =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | NestConstraint
  | GridConstraint;
type Geometry = Record<string, { min?: number; center?: number; max?: number }>;

/** Solve `constraints` over `targets` in numbers and seat each target where
 *  the solve puts it (a size-strong cell by its extent, any other by its
 *  start), throwing on a conflict, as a layer seats its plan. */
function solveAndSeat(
  constraints: PlacementConstraint[],
  targets: Map<string, Placeable>,
  sizes: [number, number],
  posScales?: Parameters<typeof solvePlacementCells<number>>[5],
  gridTracks?: [TrackLayout, TrackLayout],
  dataPositioned?: [Set<string>, Set<string>]
): void {
  const solved = solvePlacementCells(
    numbers,
    constraints,
    targets,
    sizes,
    pixelGaps,
    posScales,
    gridTracks,
    dataPositioned
  );
  const conflict = solved.flatMap((r) => r.conflicts)[0];
  if (conflict !== undefined)
    throw new Error(
      `Constraint placement conflict on ${conflict.axis}: ${conflict.owner} ` +
        `asserts ${conflict.asserted}, but ${conflict.priorOwner} implies ` +
        `${conflict.implied}`
    );
  solved.forEach((result, axis) => {
    const label = axis === 0 ? "x" : "y";
    for (const [name, cell] of result.cells) {
      const target = targets.get(name)!;
      if (cell.sizeStrong && cell.size !== undefined && target.setExtent)
        target.setExtent(
          label,
          { min: cell.min, max: cell.min + cell.size },
          cell.sizeOwner
        );
      else if (target.pinAnchor)
        target.pinAnchor(axis as 0 | 1, cell.min, "min");
      else target.place(axis as 0 | 1, cell.min, "min");
    }
    for (const [name, { size, owner }] of result.sizeOnly)
      targets.get(name)?.setSizeOnly?.(label, size, owner);
  });
}

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
  solveAndSeat(constraints, targets, [300, 200]);
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

// A resolved operand: its key is the uid of the node it names (here, the
// name itself).
const child = (name: string) => ({ name });
const byName: KeyOf = (ref) => ref.name;
/** The operands of `children`, each resolved to the child of its name. */
const byNameIn = (children: readonly { uid: string }[]): ResolvedOperands => ({
  keyOf: byName,
  operands: new Map(children.map((c, i) => [c.uid, { child: i, direct: true }])),
});
// The solve, with each operand keyed by its name.
function lowerPlacementConstraints<T>(
  A: Parameters<typeof lowerPlacement<T>>[0],
  constraints: Parameters<typeof lowerPlacement<T>>[1],
  ...rest: Parameters<typeof lowerPlacement<T>> extends [
    any,
    any,
    any,
    ...infer R,
  ]
    ? R
    : never
) {
  return lowerPlacement(A, constraints, byName, ...rest);
}
function solvePlacementCells<T>(
  A: Parameters<typeof solveCells<T>>[0],
  constraints: Parameters<typeof solveCells<T>>[1],
  ...rest: Parameters<typeof solveCells<T>> extends [any, any, any, ...infer R]
    ? R
    : never
) {
  return solveCells(A, constraints, byName, ...rest);
}
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
  anchor: "edge",
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
const span = (name: string, min: number, max: number): PositionConstraint => ({
  type: "position",
  x: [min, max],
  anchor: "middle",
  override: false,
  children: [child(name)],
});

const namedNode = (name: string, width?: number) => ({
  _name: name,
  uid: name,
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
  const plan = buildNestPlan(children, constraints, byNameIn(children));
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
    spacing: [10, 0],
    children: [A, B],
  };
  const alignRow: AlignConstraint = {
    type: "align",
    y: "middle",
    children: [A, B],
  };
  // Two fill columns of one share each: (300 − 10) / 2 = 145 px.
  const tracks = ([0, 1] as const).map((axis) =>
    gridTracks(
      numbers,
      grid,
      axis,
      () => undefined,
      grid.spacing[axis] as number,
      axis === 0 ? 145 : 200
    )
  ) as [TrackLayout, TrackLayout];
  const solveGrid = (order: Constraint[]) => {
    const targets = new Map(
      ["A", "B"].map((name) => [name, makePlaceable()] as const)
    );
    solveAndSeat(order, targets, [300, 200], undefined, tracks);
    return Object.fromEntries(
      [...targets].map(([name, target]) => {
        const { min, center, max } = target.dims[0];
        return [name, { min, center, max }];
      })
    );
  };
  const first = solveGrid([grid, alignRow]);
  const second = solveGrid([alignRow, grid]);
  ok("grid/align permutations agree", sameGeometry(first, second));
  ok(
    "grid centers cells in their tracks",
    first.A.center === 72.5 && first.B.center === 227.5
  );
}

console.log("# constraint confluence: grid content-sized tracks (Stage 6e)");
{
  // Two columns of DIFFERENT extent (content-sized): col0=40, col1=100,
  // spacing [10, 0] → starts [0, 50]; centers col0=20, col1=50+50=100.
  const grid: GridConstraint = {
    type: "grid",
    numCols: 2,
    spacing: [10, 0],
    children: [A, B],
  };
  const tracks: [TrackLayout, TrackLayout] = [
    { starts: [0, 50], extents: [40, 100] },
    { starts: [0], extents: [30] },
  ];

  // The track rule reads each cell by the grid's ref: each column is as
  // wide as its cell, laid end to end with the spacing between.
  const sizeOf = new Map([
    ["A", 40],
    ["B", 100],
  ]);
  const cols = gridTracks(
    numbers,
    grid,
    0,
    (ref) => sizeOf.get(ref.name),
    10,
    0
  );
  ok(
    "grid tracks size to their cells, by the grid's refs",
    JSON.stringify(cols) === JSON.stringify(tracks[0]),
    JSON.stringify(cols)
  );

  const contentTargets = () =>
    new Map<string, Placeable>([
      ["A", makePlaceable(40, 30)],
      ["B", makePlaceable(100, 30)],
    ]);
  {
    const t = contentTargets();
    solveAndSeat([grid], t, [300, 200], undefined, tracks);
    ok(
      "content-sized grid centers each cell in its own track",
      t.get("A")!.dims[0].center === 20 && t.get("B")!.dims[0].center === 100
    );
  }

  // grid + align on a NON-cell child C: C's center is aligned (middle x) to the
  // grid cell A. The two constraints compose and are order-independent.
  const alignAC: AlignConstraint = {
    type: "align",
    x: "middle",
    children: [A, C],
  };
  const withAlign = (order: Constraint[]) => {
    const t = contentTargets();
    t.set("C", makePlaceable(10, 10));
    solveAndSeat(order, t, [300, 200], undefined, tracks);
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
    solveAndSeat(order, t, [300, 200], undefined, tracks);
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
  // rows, spacing [10, 5]: col0 max(40,20)=40, col1 max(100,60)=100.
  const grid2x2: GridConstraint = {
    type: "grid",
    numCols: 2,
    spacing: [10, 5],
    children: [A, B, C, child("D")],
  };
  const fromSizes = ([0, 1] as const).map((axis) =>
    gridTracks(
      numbers,
      grid2x2,
      axis,
      (ref) =>
        (
          ({
            A: [40, 30],
            B: [100, 30],
            C: [20, 12],
            D: [60, 8],
          }) as Record<string, number[]>
        )[ref.name]?.[axis],
      grid2x2.spacing[axis] as number,
      0
    )
  );
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
    [CONTINUOUS(interval(0, 10), "free"), CONTINUOUS(interval(0, 4), "free")],
  ] as const;
  const insideOutPlan = {
    order: [1, 0],
    byDerived: new Map([
      [
        0,
        [{ derivedIdx: 0, sourceIdx: 1, dir: "in" as const, padX: 3, padY: 2 }],
      ],
    ]),
  };
  const folded = applyNestSpacePlan(childSpaces, insideOutPlan);
  ok(
    "inside-out nest space fold derives a free outer with the inner's data extent",
    originIs(folded[0][0], "free") &&
      dataWidth(folded[0][0]) === 10 &&
      originIs(folded[0][1], "free") &&
      dataWidth(folded[0][1]) === 4
  );
  const foldedClaims = applyNestExtentPlan(
    [
      [undefined, undefined],
      [Extent(Pwl.affine(10, 0)), Extent(Pwl.affine(4, 0))],
    ],
    folded,
    insideOutPlan
  );
  ok(
    "inside-out nest claim fold pads the inner claim (padding is pixels)",
    Pwl.at(foldedClaims[0][0]!.width, 1) === 16 &&
      Pwl.at(foldedClaims[0][1]!.width, 1) === 8
  );
  ok(
    "nest space fold copies child spaces instead of mutating input",
    folded !== childSpaces &&
      folded[0] !== childSpaces[0] &&
      childSpaces[0][0] === UNDEFINED
  );

  // The child is placed by the datum position on y, so its own extent (in
  // its own unit, "child") stays out of the layer's y domain.
  const resolved = resolveLayerBaseSpaces(
    [
      [
        CONTINUOUS(interval(0, 10), "free"),
        CONTINUOUS(interval(5, 15), "pinned", declared("child")),
      ],
    ],
    { y: interval(0, 20), yMeasure: declared("pin") },
    [new Set(), new Set([0])]
  );
  ok(
    "transform.scale leaves the free magnitude's data extent alone",
    originIs(resolved[0], "free") && dataWidth(resolved[0]) === 10
  );
  const pinned = continuousInterval(resolved[1]);
  ok(
    "a datum-placed child's own extent and measure stay out of the domain",
    pinned !== undefined &&
      pinned.min === 0 &&
      pinned.max === 20 &&
      spaceUnit(resolved[1])?.titles.join() === "pin"
  );
  let clash: string | undefined;
  try {
    resolveLayerBaseSpaces(
      [[UNDEFINED, CONTINUOUS(interval(5, 15), "pinned", declared("child"))]],
      { y: interval(0, 20), yMeasure: declared("pin") }
    );
  } catch (e) {
    clash = (e as Error).message;
  }
  ok(
    "an unplaced child in another unit than the datum domain is a type error",
    clash !== undefined && /different units/.test(clash)
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

  const plan = buildLayerConstraintLayoutPlan(
    childNodes,
    [zOnly, datumC, nestBA],
    byNameIn(childNodes)
  );
  ok(
    "layout plan excludes z-order refs and skips only nest inner",
    plan.constrainedKeys.has("A") &&
      plan.constrainedKeys.has("C") &&
      !plan.constrainedKeys.has("B")
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

console.log("# constraint confluence: child size proposals");
{
  const layerSize: [number, number] = [300, 200];
  const gridCell: [number, number] = [90, 40];
  const gridCellByName = new Map<
    string,
    [number | undefined, number | undefined]
  >([
    ["A", gridCell],
    ["U", [90, undefined]],
  ]);
  const cell = childLayoutSizeProposal(
    "A",
    layerSize,
    gridCellByName,
    undefined,
    [100, undefined]
  );
  ok(
    "a grid cell is proposed its track extent, whatever its own room",
    cell[0] === 90 && cell[1] === 40
  );
  // A track with no extent (an unsized axis no claim sizes) proposes
  // nothing there: the cell is laid out in the layer's size, its default.
  const unsized = childLayoutSizeProposal("U", [300, NaN], gridCellByName);
  ok(
    "a grid cell whose track has no extent is proposed the layer's size there",
    unsized[0] === 90 && Number.isNaN(unsized[1])
  );
  const shared = childLayoutSizeProposal(
    "B",
    layerSize,
    gridCellByName,
    undefined,
    [100, undefined]
  );
  ok(
    "a child is proposed its own room in a share scope, and the layer's size elsewhere",
    shared[0] === 100 && shared[1] === 200
  );
  ok(
    "an unnamed child with no room of its own is proposed the layer's size",
    childLayoutSizeProposal(undefined, layerSize, undefined) === layerSize
  );
}

console.log("# constraint confluence: grid proposal ownership");
{
  const grid2: GridConstraint = {
    type: "grid",
    numCols: 2,
    spacing: [10, 0],
    children: [A, B],
  };
  const grid1: GridConstraint = {
    type: "grid",
    numCols: 1,
    spacing: [0, 5],
    children: [A, B],
  };

  ok(
    "single grid proposal owner is selected",
    selectGridConstraint([grid2]) === grid2
  );

  const throwsWith = (constraints: Constraint[], fragment: string): boolean => {
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

  const first = buildPositionTargetDims([datumX, literalY, datumY], byName);
  const second = buildPositionTargetDims([datumY, literalY, datumX], byName);
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
  const frameX: AxisMap = { sigma: 1, originPx: 1 }; // v + 1
  const frameY: AxisMap = { sigma: 1, originPx: 2 }; // v + 2
  const positionSpace = CONTINUOUS(interval(0, 10), "pinned");

  // The one seating rule: a pinned child shares the layer's frame, a free
  // child gets a frame of its own with its baseline at 0, and a child with no
  // data 0 gets none.
  const seated = childPosScalesFor(
    [positionSpace, CONTINUOUS(interval(0, 3), "free")],
    undefined,
    [frameX, frameY]
  );
  ok(
    "each child is seated in the layer's frame",
    seated[0] === frameX &&
      seated[1]?.sigma === frameY.sigma &&
      seated[1]?.originPx === 0
  );
  const seatedUndefined = childPosScalesFor([UNDEFINED, UNDEFINED], undefined, [
    frameX,
    frameY,
  ]);
  ok(
    "a child with no data 0 gets no frame",
    seatedUndefined[0] === undefined && seatedUndefined[1] === undefined
  );

  const ownedTarget = childPosScalesFor(
    [positionSpace, positionSpace],
    new Set<0 | 1>([0]),
    [frameX, frameY]
  );
  ok(
    "datum-position target suppresses only the owned target axis",
    ownedTarget[0] === undefined && ownedTarget[1] === frameY
  );
}

console.log("# constraint confluence: raw placement coordinates");
{
  ok(
    "literal placement coordinate compiles directly to pixels",
    compilePlacementCoordinate(numbers, 5, undefined) === 5
  );
  ok(
    "datum placement coordinate elaborates through posScale before raw facts",
    compilePlacementCoordinate(numbers, value(5).offset(3), undefined) ===
      undefined &&
      compilePlacementCoordinate(numbers, value(5).offset(3), {
        sigma: 10,
        originPx: 0,
      }) === 53
  );
  ok(
    "discrete placement coordinate resolves from containing axis size",
    compilePlacementCoordinate(
      numbers,
      discretePosition(2, 6),
      undefined,
      300
    ) === 100
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
    numbers,
    [position("A", 20)],
    targets("A"),
    [300, 200],
    pixelGaps
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
    numbers,
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
    [300, 200],
    pixelGaps
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
    numbers,
    [{ type: "align", x: "middle", children: [A, B] }],
    targets("A", "B"),
    [300, 200],
    pixelGaps
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
    numbers,
    [distribute(["A", "B", "C"])],
    targets("A", "B", "C"),
    [300, 200],
    pixelGaps
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
    numbers,
    [{ type: "nest", x: 5, children: [A, B] }],
    targets("A", "B"),
    [300, 200],
    pixelGaps
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
    numbers,
    [span("C", 10, 30)],
    targets("C"),
    [300, 200],
    pixelGaps
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
    numbers,
    [mixed],
    targets("C"),
    [300, 200],
    pixelGaps
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

console.log("# constraint confluence: region cell + align on the cell's axis");
{
  // A region's cell pins its target's middle at the cell's middle, as an
  // interval pins its edges, so the ownership plan records it pinned there:
  // an align on that axis defers to it. A and B sit in the cells [10, 30]
  // and [50, 90] on x (pixel literals: a column that reads a value as
  // itself); an align of their starts cannot move either, so both stay in
  // their cells, and C, which has no cell, aligns to the first.
  const regionOf = (lo: number, hi: number) =>
    new PositionRegion(new Cell(lo, hi, `${lo}`), [(v) => v, undefined]);
  const inCell = (name: string, lo: number, hi: number): PositionConstraint =>
    createPositionConstraint({ region: regionOf(lo, hi) }, [child(name)]);
  const alignStarts: AlignConstraint = {
    type: "align",
    x: "start",
    children: [A, B, C],
  };
  expectConfluent(
    "region/align",
    solve(
      [inCell("A", 10, 30), inCell("B", 50, 90), alignStarts],
      ["A", "B", "C"]
    ),
    solve(
      [alignStarts, inCell("B", 50, 90), inCell("A", 10, 30)],
      ["A", "B", "C"]
    ),
    {
      A: { min: 15, center: 20, max: 25 },
      B: { min: 65, center: 70, max: 75 },
      C: { min: 15, center: 20, max: 25 },
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
    { _name: "A", uid: "A" },
    { _name: "B", uid: "B" },
  ] as unknown as Parameters<typeof planConstraintComposition>[1];
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
    planConstraintComposition([distAB, pureInterval], childNodes, byNameIn(childNodes)) !== undefined
  );
  ok(
    "point+interval position bails composition (conservatively point-form)",
    planConstraintComposition(
      [distAB, pointPlusInterval],
      childNodes,
      byNameIn(childNodes)
    ) ===
      undefined
  );
}

console.log("# constraint confluence: sized nodes solve, the rest inherit");
{
  const handedX: AxisMap = { sigma: 1, originPx: 1 }; // v + 1
  const handedY: AxisMap = { sigma: 1, originPx: 2 }; // v + 2
  const positionSpace = CONTINUOUS(interval(0, 10), "pinned");
  const sizeSpace = CONTINUOUS(interval(0, 20), "free");
  const none = () => undefined;
  const solve = (
    ownSize: [boolean, boolean],
    spaces: [any, any],
    claims: [Extent | undefined, Extent | undefined],
    sigmas: [number | undefined, number | undefined],
    maps: [AxisMap | undefined, AxisMap | undefined],
    domain: (axis: 0 | 1) => ReturnType<typeof interval> | undefined = none,
    ticks: (axis: 0 | 1) => typeof DEFAULT_AXIS_TICKS | undefined = none,
    isScope: [boolean, boolean] = [false, false]
  ) => {
    // The axes the layer solves: it scopes its claim only to solve it.
    const solved: (0 | 1)[] = [];
    const scales = solveLayerScales(
      ownSize,
      spaces,
      claims,
      spaces,
      (axis) => isScope[axis],
      [100, 80],
      sigmas,
      maps,
      // `KeyedDomains.scope`, over a stand-in table.
      (axis, space, claim) => {
        solved.push(axis);
        const [wide, wideClaim] = widenScope(space, claim, domain(axis));
        return niceScope(wide, wideClaim, ticks(axis));
      },
      new ScopeRegistry(),
      // The layer: only read to name a scope, or to warn at.
      { key: "test", type: "layer" } as any
    );
    return { ...scales, solved };
  };

  const sized = solve(
    [true, true],
    [positionSpace, sizeSpace],
    [impliedExtent(positionSpace), impliedExtent(sizeSpace)],
    [2, 3],
    [handedX, handedY]
  );
  ok(
    "a node with a size of its own solves σ on each axis, pinned or free",
    sized.sigmas[0] === 10 && sized.sigmas[1] === 4
  );
  ok(
    "a sized node's frame is its own scope",
    pxOf(sized.frames[0]!, 5) === 50 &&
      sized.frames[1]?.sigma === 4 &&
      sized.frames[1]?.originPx === 0
  );

  // A node handed a frame is not sized: it inherits σ and the frame.
  const inherits = solve(
    [false, false],
    [positionSpace, sizeSpace],
    [impliedExtent(positionSpace), impliedExtent(sizeSpace)],
    [2, 3],
    [handedX, handedY]
  );
  ok(
    "a node handed a frame inherits σ",
    inherits.sigmas[0] === 2 &&
      inherits.sigmas[1] === 3 &&
      inherits.frames[0] === handedX &&
      inherits.solved.length === 0
  );

  // A node handed no σ at all is sized by the box it is given (a chain of
  // magnitudes that nothing above it could solve).
  const unscaled = solve(
    [false, false],
    [UNDEFINED, UNDEFINED],
    [Extent(Pwl.affine(10, 0)), Extent(Pwl.affine(0, 10))],
    [undefined, undefined],
    [undefined, undefined]
  );
  ok(
    "a node handed no σ solves from its claim when it can",
    unscaled.sigmas[0] === 10
  );
  ok(
    // Only pixels (fixed boxes): nothing to solve, and not a failure.
    "a claim with no σ in it is not solved, and inherits",
    unscaled.solved.length === 1 && unscaled.sigmas[1] === undefined
  );

  // A node whose room is given to it (`GoFishNode.isScope`: a pinned
  // node in a slot, a facet panel) is sized by its room; any other (a free
  // part of a chain) inherits σ.
  const slot = solve(
    [false, false],
    [positionSpace, sizeSpace],
    [impliedExtent(positionSpace), impliedExtent(sizeSpace)],
    [2, 3],
    [undefined, undefined],
    none,
    none,
    [true, false]
  );
  ok(
    "a node whose room is given is sized by it; any other inherits",
    slot.sigmas[0] === 10 && slot.sigmas[1] === 3
  );

  // A pinned node its parent places at a datum is handed σ but no frame,
  // and is in its parent's set, not a slot: it inherits σ, and its frame
  // is its own, with its 0 at the origin its parent places.
  const atDatum = solve(
    [false, false],
    [positionSpace, sizeSpace],
    [impliedExtent(positionSpace), impliedExtent(sizeSpace)],
    [2, 3],
    [undefined, undefined]
  );
  ok(
    "a pinned node nested at a datum inherits σ in a frame of its own",
    atDatum.sigmas[0] === 2 &&
      atDatum.solved.length === 0 &&
      atDatum.frames[0]?.sigma === 2 &&
      atDatum.frames[0]?.originPx === 0
  );

  // #1114: a sized node maps its keyed domain, not just its own data.
  const keyed = solve(
    [true, false],
    [positionSpace, UNDEFINED],
    [impliedExtent(positionSpace), undefined],
    [2, 3],
    [handedX, handedY],
    (axis) => (axis === 0 ? interval(0, 20) : undefined)
  );
  ok(
    "a sized node widens its claim to its keyed domain",
    keyed.sigmas[0] === 5 && pxOf(keyed.frames[0]!, 20) === 100,
    JSON.stringify(keyed.frames)
  );

  // One σ per scope (#659): the keyed domain is niced at the solve when an
  // axis is drawn over it, so positions and sizes read one domain.
  const content = CONTINUOUS(interval(0, 9.5), "pinned");
  const niced = solve(
    [false, true],
    [UNDEFINED, content],
    [undefined, impliedExtent(content)],
    [2, 3],
    [handedX, handedY],
    none,
    () => DEFAULT_AXIS_TICKS
  );
  ok(
    "a sized node keeps the niced σ",
    niced.sigmas[1] === 8 && niced.frames[1]?.sigma === 8,
    JSON.stringify(niced)
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
    solveAndSeat(constraints, targets, [300, 200]);
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
  solveAndSeat(
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
  solveAndSeat(
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
  const sameSolve = solveAndSeat;
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
      solveAndSeat(
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
    spanThrows([spanA10_30, spanA10_40]) && spanThrows([spanA10_40, spanA10_30])
  );

  const spanPositionThrows = (constraints: PositionConstraint[]): boolean => {
    try {
      solveAndSeat(
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

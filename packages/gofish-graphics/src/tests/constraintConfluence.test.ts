/**
 * Permutation tests for the production relational placement solver.
 *
 * Run: `pnpm --filter gofish-graphics test:confluence`
 */

import type { Placeable } from "../ast/_node";
import type { AlignConstraint } from "../ast/constraints/align";
import type { DistributeConstraint } from "../ast/constraints/distribute";
import type { GridConstraint } from "../ast/constraints/grid";
import type { NestConstraint } from "../ast/constraints/nest";
import { solvePlacementConstraints } from "../ast/constraints/placementSolver";
import type { PositionConstraint } from "../ast/constraints/position";
import type { SpanConstraint } from "../ast/constraints/span";
import type { Anchor, Dimensions, FancyDirection } from "../ast/dims";
import { elaborateDirection, localAnchorPoint } from "../ast/dims";
import {
  applyNestLayoutProposal,
  buildNestPlan,
} from "../ast/constraints/nestPlan";
import {
  buildDistributeSliceMap,
  buildPositionTargetDims,
  childPosScalesFor,
  selectGridConstraint,
} from "../ast/constraints/proposalPlan";
import { value } from "../ast/data";
import { POSITION, UNDEFINED } from "../ast/underlyingSpace";
import { interval } from "../util/interval";

type Constraint =
  | AlignConstraint
  | DistributeConstraint
  | PositionConstraint
  | SpanConstraint
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

const span = (name: string, min: number, max: number): SpanConstraint => ({
  type: "span",
  x: [min, max],
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

console.log("# constraint confluence: deterministic weak anchors");
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
      A: { min: 145, center: 150, max: 155 },
      B: { min: 145, center: 150, max: 155 },
      C: { min: 145, center: 150, max: 155 },
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
  const throws = (segments: [typeof overlapAB, typeof overlapBC]): boolean => {
    try {
      buildDistributeSliceMap(segments, [210, 105]);
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        error.message.includes("Constraint.distribute proposal conflict")
      );
    }
  };
  ok(
    "overlapping distribute proposal ownership throws in either order",
    throws([overlapAB, overlapBC]) && throws([overlapBC, overlapAB])
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

  const throws = (constraints: GridConstraint[]): boolean => {
    try {
      selectGridConstraint(constraints);
      return false;
    } catch (error) {
      return (
        error instanceof Error &&
        error.message.includes("Constraint.grid proposal conflict")
      );
    }
  };
  ok(
    "duplicate grid proposal ownership throws in either order",
    throws([grid2, grid1]) && throws([grid1, grid2])
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
  const baseX = (v: number) => v + 1;
  const baseY = (v: number) => v + 2;
  const effectiveX = (v: number) => v * 10;
  const effectiveY = (v: number) => v * 20;
  const positionSpace = POSITION(interval(0, 10));

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
  targets.get("A")!.placementOn = () => ({ tag: "determined", at: 0 });
  solvePlacementConstraints(
    [{ type: "align", x: "baseline", children: [A, B] }],
    targets,
    [300, 200],
    [(value) => value * 10 - 200, undefined]
  );
  ok(
    "posScale align leaves determined continuous placement alone",
    targets.get("A")!.dims[0].min === undefined &&
      targets.get("B")!.dims[0].min === -200
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
  const spanThrows = (constraints: SpanConstraint[]): boolean => {
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
        error.message.includes("Constraint span conflict")
      );
    }
  };
  ok(
    "conflicting spans throw in either declaration order",
    spanThrows([spanA10_30, spanA10_40]) &&
      spanThrows([spanA10_40, spanA10_30])
  );

  const spanPositionThrows = (
    constraints: (SpanConstraint | PositionConstraint)[]
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

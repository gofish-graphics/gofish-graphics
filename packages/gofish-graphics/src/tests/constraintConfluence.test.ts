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
import type { Anchor, Dimensions, FancyDirection } from "../ast/dims";
import { elaborateDirection, localAnchorPoint } from "../ast/dims";

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

const distribute = (names: string[]): DistributeConstraint => ({
  type: "distribute",
  dir: "x",
  spacing: 5,
  mode: "edge",
  order: "forward",
  glue: false,
  children: names.map(child),
});

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
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

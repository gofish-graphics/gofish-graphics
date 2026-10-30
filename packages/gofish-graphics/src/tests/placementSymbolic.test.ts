/**
 * The placement solve runs in numbers or in values in σ (#1176 step 3): solved
 * once with σ unknown, every box is a function of σ that agrees with the
 * solve in numbers at each σ. Each problem is the shape of a layer the claim
 * walk solves: the planets of Bluefish Planets (fixed boxes in a middle-aligned
 * row), a baseline stack (signed bars glued from their origin, in a row of
 * stacks on a shared baseline), the nested rings of GoTree's TornadoTree (a
 * child nested in its parent by its middle, siblings at a middle pitch, every
 * size in data units), and marks at data positions. Run:
 * `tsx src/tests/placementSymbolic.test.ts` (wired into `pnpm test` as
 * `test:placement-symbolic`).
 */
import { Constraint, type ConstraintSpec } from "../ast/constraints";
import { solvePlacementCells } from "../ast/constraints/placementSolver";
import type { PlacementConstraint } from "../ast/constraints/placementLowering";
import type { SolvePlaceable } from "../ast/constraints/placementProgramLowerer";
import { numbers, values, type Arith } from "../ast/solver/arith";
import * as Pwl from "../ast/solver/pwl";
import { datum } from "../ast/data";
import {
  CONTINUOUS,
  UNDEFINED,
  type UnderlyingSpace,
} from "../ast/underlyingSpace";
import * as Interval from "../util/interval";
import { check, report } from "./testHelpers";

/** A child of a problem on one axis: its reach above and below its origin,
 *  each a value in σ, and its type. */
type Child = {
  name: string;
  ascent: Pwl.Value;
  descent: Pwl.Value;
  space: UnderlyingSpace;
};

const ref = (name: string) => ({ name });
const fixed = (name: string, size: number): Child => ({
  name,
  ascent: Pwl.constant(size),
  descent: Pwl.ZERO,
  space: UNDEFINED,
});
/** A free bar `v` data units long: up from its origin, or down for v < 0. */
const bar = (name: string, v: number): Child => ({
  name,
  ascent: Pwl.affine(Math.max(v, 0), 0),
  descent: Pwl.affine(Math.max(-v, 0), 0),
  space: CONTINUOUS(Interval.interval(Math.min(v, 0), Math.max(v, 0)), "free"),
});
/** A box `size` data units long, plus `px` pixels (a stroke, a padding). */
const scaled = (name: string, size: number, px = 0): Child => ({
  name,
  ascent: Pwl.affine(size, px),
  descent: Pwl.ZERO,
  space: UNDEFINED,
});

/** A child as the solve reads it, in `A`: its box `[−descent, ascent]` about
 *  its origin on `axis`, unplaced. */
const placeable = <T>(
  A: Arith<T>,
  axis: 0 | 1,
  child: Child,
  read: (v: Pwl.Value) => T
): SolvePlaceable<T> => {
  const lo = A.negate(read(child.descent));
  const hi = read(child.ascent);
  const box = { min: undefined, size: A.sub(hi, lo) };
  const none = { min: undefined, size: undefined };
  return {
    dims: axis === 0 ? [box, none] : [none, box],
    localAnchor: (a, anchor) => {
      const on = a === "x" || a === 0 ? 0 : 1;
      if (on !== axis) return undefined;
      return anchor === "min"
        ? lo
        : anchor === "max"
          ? hi
          : anchor === "center"
            ? A.scale(0.5, A.add(lo, hi))
            : A.zero;
    },
    spaceOn: (dir) => (dir === axis ? child.space : undefined),
  };
};

/** Solve `children` under `constraints` on `axis` in `A`, with σ read by
 *  `read` and the layer's data 0 at pixel 0. */
const solveIn = <T>(
  A: Arith<T>,
  axis: 0 | 1,
  children: Child[],
  constraints: ConstraintSpec[],
  sigma: T,
  read: (v: Pwl.Value) => T
) => {
  const targets = new Map(
    children.map((c) => [c.name, placeable(A, axis, c, read)])
  );
  const map = { sigma, originPx: A.zero };
  return solvePlacementCells(
    A,
    constraints as PlacementConstraint[],
    // Each operand is keyed by its name.
    (r) => r.name,
    targets,
    [NaN, NaN],
    // Pixel spacings, as a layer reads them (`GoFishNode.gapOf`).
    (c, axis) =>
      Pwl.constant((c.type === "grid" ? c.spacing[axis] : c.spacing) as number),
    axis === 0 ? [map, undefined] : [undefined, map],
    undefined,
    [new Set(), new Set()],
    undefined,
    axis === 0 ? [A.zero, undefined] : [undefined, A.zero]
  )[axis];
};

/** Solve symbolically once, and in numbers at σ = 0, 1 and 10, and check
 *  every cell's `min` and size agree. */
function agree(
  title: string,
  axis: 0 | 1,
  children: Child[],
  constraints: ConstraintSpec[]
): void {
  const symbolic = solveIn(
    values,
    axis,
    children,
    constraints,
    Pwl.affine(1, 0),
    (v) => v
  );
  for (const sigma of [0, 1, 10]) {
    const numeric = solveIn(numbers, axis, children, constraints, sigma, (v) =>
      Pwl.at(v, sigma)
    );
    const misses: string[] = [];
    for (const [name, cell] of numeric.cells) {
      const s = symbolic.cells.get(name);
      const sMin = s && Pwl.at(s.min, sigma);
      const sSize = s?.size && Pwl.at(s.size, sigma);
      if (
        sMin === undefined ||
        Math.abs(sMin - cell.min) > 1e-9 ||
        (cell.size ?? 0) - (sSize ?? 0) > 1e-9 ||
        (sSize ?? 0) - (cell.size ?? 0) > 1e-9
      )
        misses.push(`${name}: ${cell.min}/${cell.size} vs ${sMin}/${sSize}`);
    }
    check(
      `${title} at σ = ${sigma}`,
      misses.length === 0 &&
        numeric.cells.size === symbolic.cells.size &&
        numeric.cells.size > 0,
      misses
    );
  }
}

async function main() {
  console.log("\n# Planets: fixed boxes in a middle-aligned row");
  {
    const planets = [
      ["Mercury", 15],
      ["Venus", 36],
      ["Earth", 38],
      ["Mars", 21],
    ].map(([name, r]) => fixed(name as string, 2 * (r as number) + 3));
    const refs = planets.map((p) => ref(p.name));
    agree("x: a row 50 px apart", 0, planets, [
      Constraint.distribute({ dir: "x", spacing: 50 }, refs),
    ]);
    agree("y: middles aligned", 1, planets, [
      Constraint.align({ y: "middle" }, refs),
    ]);
  }

  console.log("\n# a baseline stack: signed bars glued from their origin");
  {
    const parts = [bar("a", 3), bar("b", -2), bar("c", 5)];
    agree("y: a stack of signed parts", 1, parts, [
      Constraint.distribute(
        { dir: "y", glue: true, spacing: 0 },
        parts.map((p) => ref(p.name))
      ),
    ]);
    const stacks = [bar("p", 4), bar("q", -1), bar("r", 7)];
    agree("y: stacks on one baseline", 1, stacks, [
      Constraint.align(
        { y: "baseline" },
        stacks.map((p) => ref(p.name))
      ),
    ]);
    agree("x: stacks in a row 10 px apart", 0, stacks, [
      Constraint.distribute(
        { dir: "x", spacing: 10 },
        stacks.map((p) => ref(p.name))
      ),
    ]);
  }

  console.log("\n# TornadoTree: rings nested by their middles, in data units");
  {
    const rings = [
      scaled("parent", 4, 1),
      scaled("child", 2.5, 1),
      scaled("left", 1, 1),
      scaled("right", 1.5, 1),
    ];
    agree("r: a child nested in its parent, siblings at a pitch", 1, rings, [
      Constraint.nest({ y: 44 }, [ref("parent"), ref("child")]),
      Constraint.distribute({ dir: "y", spacing: 44, anchor: "middle" }, [
        ref("left"),
        ref("child"),
        ref("right"),
      ]),
    ]);
    agree("θ: siblings at a middle pitch", 0, rings.slice(1), [
      Constraint.distribute({ dir: "x", spacing: 0.42, anchor: "middle" }, [
        ref("child"),
        ref("left"),
        ref("right"),
      ]),
    ]);
  }

  console.log("\n# marks at data positions, and a label beside one");
  {
    const marks = [fixed("m1", 6), fixed("m2", 6), fixed("label", 30)];
    agree("x: two marks at data, a label after one", 0, marks, [
      Constraint.position({ x: datum(20), anchor: "middle" }, [ref("m1")]),
      Constraint.position({ x: datum(-5), anchor: "middle" }, [ref("m2")]),
      Constraint.distribute({ dir: "x", spacing: 4 }, [
        ref("m1"),
        ref("label"),
      ]),
    ]);
    agree("x: a box across a data span", 0, [fixed("band", 0)], [
      Constraint.position({ x: [datum(2), datum(9)] }, [ref("band")]),
    ]);
  }

  report();
}

main();

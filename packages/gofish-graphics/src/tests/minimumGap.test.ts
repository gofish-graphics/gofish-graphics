/**
 * Minimum gaps and means of positions in the placement solve. A minimum gap
 * (`Spacing.atLeast`) is solved after the exact facts: they make rigid
 * groups, and the gaps separate the groups by the longest path over them,
 * with the slack placed by `justify`. A mean (`Constraint.align({ x: "mean"
 * })`) is an exact relation when its operands are in one group, and is
 * placed after its operands otherwise. The least, greatest and centered
 * solutions are checked against `solveSeparations`, the reference of the
 * "Proposals/User Space Separation" stories, copied here as the oracle.
 * Run: `tsx src/tests/minimumGap.test.ts` (wired into `pnpm test` as
 * `test:minimum-gap`).
 */
import { Constraint, type ConstraintSpec } from "../ast/constraints";
import {
  solveAxisProblem,
  type AxisProblem,
} from "../ast/constraints/differenceGraph";
import { solvePlacementCells } from "../ast/constraints/placementSolver";
import type { PlacementConstraint } from "../ast/constraints/placementLowering";
import type { SolvePlaceable } from "../ast/constraints/placementProgramLowerer";
import { spacingAmount } from "../ast/constraints/distribute";
import { numbers, values, type Arith } from "../ast/solver/arith";
import * as Pwl from "../ast/solver/pwl";
import { UNDEFINED } from "../ast/underlyingSpace";
import { atLeast, pitch } from "../families/spacing";
import { check, report, seeded } from "./testHelpers";

// ─── The oracle: `solveSeparations`, as in UserSpaceSeparation.stories.tsx ──

type Sep = { after: string; before: string; gap: number };
type Policy = "start" | "end" | "center";

const topoOrder = (items: string[], seps: Sep[]): string[] => {
  const ins = new Map(items.map((id) => [id, 0]));
  for (const s of seps) ins.set(s.before, ins.get(s.before)! + 1);
  const ready = items.filter((id) => ins.get(id) === 0);
  for (let k = 0; k < ready.length; k++)
    for (const s of seps)
      if (s.after === ready[k]) {
        ins.set(s.before, ins.get(s.before)! - 1);
        if (ins.get(s.before) === 0) ready.push(s.before);
      }
  if (ready.length < items.length)
    throw new Error("solveSeparations: the separations have a cycle");
  return ready;
};

const nearest = (
  order: string[],
  into: (id: string) => [string, number][],
  base: number
): Map<string, number> => {
  const pos = new Map<string, number>();
  for (const id of order) {
    const from = into(id).map(([u, gap]) => pos.get(u)! + gap);
    pos.set(id, from.length ? Math.max(...from) : base);
  }
  return pos;
};

function solveSeparations(
  items: string[],
  seps: Sep[],
  { policy = "start", upper }: { policy?: Policy; upper?: number } = {}
): Map<string, number> {
  const order = topoOrder(items, seps);
  const least = nearest(
    order,
    (id) => seps.filter((s) => s.before === id).map((s) => [s.after, s.gap]),
    0
  );
  if (policy === "start") return least;
  const top = upper ?? Math.max(...least.values());
  const mirrored = nearest(
    [...order].reverse(),
    (id) => seps.filter((s) => s.after === id).map((s) => [s.before, s.gap]),
    -top
  );
  return new Map(
    items.map((id) => {
      const greatest = -mirrored.get(id)!;
      return [
        id,
        policy === "end" ? greatest : (least.get(id)! + greatest) / 2,
      ];
    })
  );
}

// ─── Problems on the difference graph ───────────────────────────────────

/** A problem of point nodes: exact relations `[from, to, offset]` and
 *  minimum gaps `[from, to, gap]`. */
function problem(
  nodes: string[],
  exact: [string, string, number][],
  gaps: [string, string, number][],
  slack: Policy = "start",
  extra: Partial<AxisProblem<number>> = {}
): AxisProblem<number> {
  return {
    relations: exact.map(([from, to, offset]) => ({
      type: "relation",
      from: { node: from, axis: "x", anchor: "start" },
      to: { node: to, axis: "x", anchor: "start" },
      offset,
      owner: `exact ${from}→${to}`,
    })),
    pins: [],
    participantFacts: [],
    participants: new Set(nodes),
    minGaps: gaps.map(([from, to, offset]) => ({
      from,
      to,
      offset,
      owner: `gap ${from}→${to}`,
      slack,
    })),
    ...extra,
  };
}

const solve = (p: AxisProblem<number>) =>
  solveAxisProblem(numbers, "x", p).positions;

/** Whether two placements agree up to one shift. */
const sameUpToShift = (
  a: Map<string, number>,
  b: Map<string, number>,
  keys: string[]
): boolean => {
  const d = a.get(keys[0])! - b.get(keys[0])!;
  return keys.every((k) => Math.abs(a.get(k)! - b.get(k)! - d) < 1e-9);
};

const throws = (f: () => unknown, pattern: RegExp): string | undefined => {
  try {
    f();
  } catch (e) {
    const message = (e as Error).message;
    return pattern.test(message) ? message : `wrong message: ${message}`;
  }
  return undefined;
};

// ─── Problems as a layer's constraints ──────────────────────────────────

const ref = (name: string) => ({ name });
type Box = { name: string; size: Pwl.Value };
const box = (name: string, size: number, px = 0): Box => ({
  name,
  size: Pwl.affine(size, px),
});

const placeable = <T>(
  A: Arith<T>,
  axis: 0 | 1,
  child: Box,
  read: (v: Pwl.Value) => T
): SolvePlaceable<T> => {
  const size = read(child.size);
  const own = { min: undefined, size };
  const none = { min: undefined, size: undefined };
  return {
    dims: axis === 0 ? [own, none] : [none, own],
    localAnchor: (a, anchor) => {
      const on = a === "x" || a === 0 ? 0 : 1;
      if (on !== axis) return undefined;
      return anchor === "min"
        ? A.zero
        : anchor === "max"
          ? size
          : anchor === "center"
            ? A.scale(0.5, size)
            : undefined;
    },
    spaceOn: () => UNDEFINED,
  };
};

const solveIn = <T>(
  A: Arith<T>,
  children: Box[],
  constraints: ConstraintSpec[],
  read: (v: Pwl.Value) => T
) =>
  solvePlacementCells(
    A,
    constraints as PlacementConstraint[],
    (r) => r.name,
    new Map(children.map((c) => [c.name, placeable(A, 0, c, read)])),
    [NaN, NaN],
    (c, axis) =>
      Pwl.constant(
        (c.type === "grid"
          ? c.spacing[axis]
          : spacingAmount(c.spacing)) as number
      )
  )[0];

/** Each child's `min` solved in numbers, at σ. */
const layout = (
  children: Box[],
  constraints: ConstraintSpec[],
  sigma = 1
): Map<string, number> => {
  const at = (v: Pwl.Value) => Pwl.at(v, sigma);
  const solved = solveIn(
    { ...numbers, fromValue: at },
    children,
    constraints,
    at
  );
  return new Map([...solved.cells].map(([k, c]) => [k, c.min]));
};

const near = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1e-9;

async function main() {
  console.log("\n# the least, greatest and centered solutions = solveSeparations");
  {
    const random = seeded(7);
    let misses = 0;
    let runs = 0;
    for (let trial = 0; trial < 60; trial++) {
      const n = 2 + Math.floor(random() * 7);
      const items = Array.from({ length: n }, (_, i) => `n${i}`);
      const seps: Sep[] = [];
      // A connected DAG: each item after the first has a gap from an
      // earlier one, and some have more.
      for (let i = 1; i < n; i++) {
        const k = 1 + Math.floor(random() * Math.min(i, 3));
        const from = new Set<number>();
        while (from.size < k) from.add(Math.floor(random() * i));
        for (const j of from)
          seps.push({
            after: items[j],
            before: items[i],
            gap: Math.round(random() * 40),
          });
      }
      // Two gaps on one pair compose by max: repeat some with a smaller gap.
      if (seps.length > 1) seps.push({ ...seps[0], gap: seps[0].gap - 3 });
      for (const policy of ["start", "end", "center"] as const) {
        runs++;
        const want = solveSeparations(items, seps, { policy });
        const got = solve(
          problem(
            items,
            [],
            seps.map((s) => [s.after, s.before, s.gap]),
            policy
          )
        );
        if (!sameUpToShift(want, got, items)) {
          misses++;
          if (misses < 3)
            console.error({ policy, seps, want: [...want], got: [...got] });
        }
      }
    }
    check(`${runs} random DAGs agree with the oracle`, misses === 0, misses);
  }

  console.log("\n# rigid groups and minimum gaps together");
  {
    // a and b one group (b 10 after a); c at least 5 after b and at least
    // 30 after a: c = max(10 + 5, 30) = 30.
    const p = solve(
      problem(
        ["a", "b", "c"],
        [["a", "b", 10]],
        [
          ["b", "c", 5],
          ["a", "c", 30],
        ]
      )
    );
    check(
      "the exact gap holds, and the larger minimum wins",
      p.get("b")! - p.get("a")! === 10 && p.get("c")! - p.get("a")! === 30,
      [...p]
    );
    // A gap into the middle of a group moves the whole group: d at least 4
    // after x, and x is 10 after c in one group with c.
    const q = solve(
      problem(
        ["x", "c", "d", "e"],
        [
          ["c", "d", 10],
          ["d", "e", 3],
        ],
        [["x", "d", 40]]
      )
    );
    check(
      "a gap into a group's middle moves the group as one",
      q.get("d")! - q.get("x")! === 40 &&
        q.get("d")! - q.get("c")! === 10 &&
        q.get("e")! - q.get("d")! === 3,
      [...q]
    );
  }

  console.log("\n# two gaps on one pair compose by max");
  {
    const p = solve(
      problem(
        ["a", "b"],
        [],
        [
          ["a", "b", 5],
          ["a", "b", 12],
          ["a", "b", -4],
        ]
      )
    );
    check("12 wins", p.get("b")! - p.get("a")! === 12, [...p]);
  }

  console.log("\n# a cycle of gaps is an error naming its nodes");
  {
    const message = throws(
      () =>
        solve(
          problem(
            ["a", "b", "c", "z"],
            [],
            [
              ["z", "a", 1],
              ["a", "b", 1],
              ["b", "c", 1],
              ["c", "a", 1],
            ]
          )
        ),
      /cycle: \{[abc]\} → \{[abc]\} → \{[abc]\} → \{[abc]\}/
    );
    check("throws", message !== undefined && !message.startsWith("wrong"), message);
    check(
      "names the cycle's gaps, not the one into it",
      message !== undefined && !message.includes("gap z→a"),
      message
    );
    // Through an exact relation: b is 1 after a exactly, and a must be at
    // least 1 after b.
    const viaGroup = solveAxisProblem(
      numbers,
      "x",
      problem(["a", "b"], [["a", "b", 1]], [["b", "a", 1]])
    );
    check(
      "a gap inside a rigid group that the group breaks is a conflict",
      viaGroup.conflicts.length === 1,
      viaGroup.conflicts
    );
    const holds = solveAxisProblem(
      numbers,
      "x",
      problem(["a", "b"], [["a", "b", 10]], [["a", "b", 4]])
    );
    check(
      "one that the group keeps is no conflict",
      holds.conflicts.length === 0,
      holds.conflicts
    );
  }

  console.log("\n# each slack rule");
  {
    // a → b → c → d, 10 apart; x at least 5 after a and 5 before d.
    const nodes = ["a", "b", "c", "d", "x"];
    const exact: [string, string, number][] = [];
    const gaps: [string, string, number][] = [
      ["a", "b", 10],
      ["b", "c", 10],
      ["c", "d", 10],
      ["a", "x", 5],
      ["x", "d", 5],
    ];
    const x = (slack: Policy) => {
      const p = solve(problem(nodes, exact, gaps, slack));
      return p.get("x")! - p.get("a")!;
    };
    check("start: x as early as it can be", x("start") === 5, x("start"));
    check("end: x as late as it can be", x("end") === 25, x("end"));
    check("center: halfway between", x("center") === 15, x("center"));
    // The end keeps each group inside the least solution's span, by its
    // size: a wide last item ends where the least solution ends.
    const sized = solve(
      problem(["a", "b", "w"], [], [["a", "b", 10], ["a", "w", 2]], "end", {
        sizes: new Map([
          ["a", 0],
          ["b", 30],
          ["w", 5],
        ]),
      })
    );
    check(
      "end: a group ends where the least solution ends",
      sized.get("w")! + 5 === sized.get("b")! + 30,
      [...sized]
    );
    const mixed = throws(
      () =>
        solveAxisProblem(numbers, "x", {
          ...problem(["a", "b", "c"], [], [["a", "b", 1]], "start"),
          minGaps: [
            { from: "a", to: "b", offset: 1, owner: "one", slack: "start" },
            { from: "b", to: "c", offset: 1, owner: "two", slack: "end" },
          ],
        }),
      /one.*"start".*two.*"end"/
    );
    check(
      "two slack rules on one cluster are an error",
      mixed !== undefined && !mixed.startsWith("wrong"),
      mixed
    );
  }

  console.log("\n# pins place a cluster");
  {
    const p = solveAxisProblem(numbers, "x", {
      ...problem(
        ["a", "b", "c"],
        [],
        [
          ["a", "b", 10],
          ["b", "c", 10],
        ]
      ),
      pins: [{ node: "b", value: 100, owner: "pin" }],
    });
    check(
      "the pinned node stays, and the gaps hold around it",
      p.positions.get("b") === 100 &&
        p.positions.get("a") === 90 &&
        p.positions.get("c") === 110 &&
        p.conflicts.length === 0,
      [...p.positions]
    );
  }

  console.log("\n# through distribute: rects with exact gaps pulled apart");
  {
    // Three pairs glued by exact gaps, laid at least 6 apart.
    const kids = ["a", "b", "c", "d", "e", "f"].map((n) => box(n, 0, 20));
    const refs = kids.map((k) => ref(k.name));
    const constraints = [
      Constraint.distribute({ dir: "x", spacing: 2 }, [refs[0], refs[1]]),
      Constraint.distribute({ dir: "x", spacing: 2 }, [refs[2], refs[3]]),
      Constraint.distribute({ dir: "x", spacing: 2 }, [refs[4], refs[5]]),
      Constraint.distribute({ dir: "x", spacing: atLeast(6) }, [
        refs[1],
        refs[2],
      ]),
      Constraint.distribute({ dir: "x", spacing: atLeast(6) }, [
        refs[3],
        refs[4],
      ]),
    ];
    const at = layout(kids, constraints);
    const want = [0, 22, 48, 70, 96, 118];
    check(
      "the pairs keep their gaps, and the gaps between them are at least 6",
      kids.every((k, i) => near(at.get(k.name), want[i])),
      [...at]
    );
  }

  console.log("\n# symbolic: one solve in σ agrees with numbers at each σ");
  {
    const kids = [box("a", 2), box("b", 3, 4), box("c", 1), box("x", 0, 2)];
    const [a, b, c, x] = kids.map((k) => ref(k.name));
    for (const justify of ["start", "end", "center"] as const) {
      const constraints = [
        Constraint.distribute({ dir: "x", spacing: atLeast(4, { justify }) }, [
          a,
          b,
          c,
        ]),
        Constraint.distribute({ dir: "x", spacing: atLeast(1, { justify }) }, [
          a,
          x,
          c,
        ]),
      ];
      const symbolic = solveIn(values, kids, constraints, (v) => v);
      const misses: string[] = [];
      for (const sigma of [0, 1, 10]) {
        const numeric = layout(kids, constraints, sigma);
        for (const [name, min] of numeric) {
          const s = symbolic.cells.get(name);
          if (s === undefined || Math.abs(Pwl.at(s.min, sigma) - min) > 1e-9)
            misses.push(`${justify} σ=${sigma} ${name}: ${min}`);
        }
      }
      check(`${justify}: values in σ agree with numbers`, misses.length === 0, misses);
    }
    // At σ = 10, x has slack: a ends at 20, c starts at 20 + 4 + 34 + 4.
    const center = layout(
      kids,
      [
        Constraint.distribute(
          { dir: "x", spacing: atLeast(4, { justify: "center" }) },
          [a, b, c]
        ),
        Constraint.distribute(
          { dir: "x", spacing: atLeast(1, { justify: "center" }) },
          [a, x, c]
        ),
      ],
      10
    );
    // x's least start is 21, its greatest 62 − 1 − 2 = 59: halfway is 40.
    check("x is centered in its slack", near(center.get("x"), 40), [...center]);
  }

  console.log("\n# the mean of positions");
  {
    // A dendrogram (d3.cluster): leaves one pitch apart, each parent at the
    // mean of its children. The means chain, and each joins one group.
    const DX = 20;
    const leaves = ["l0", "l1", "l2", "l3", "l4"].map((n) => box(n, 0, 10));
    const parents = ["p01", "p012", "p34", "root"].map((n) => box(n, 0, 10));
    const r = (n: string) => ref(n);
    const constraints = [
      Constraint.distribute(
        { dir: "x", spacing: pitch(DX, { at: "middle" }) },
        leaves.map((l) => r(l.name))
      ),
      Constraint.align({ x: "mean" }, [r("p01"), r("l0"), r("l1")]),
      Constraint.align({ x: "mean" }, [r("p012"), r("p01"), r("l2")]),
      Constraint.align({ x: "mean" }, [r("p34"), r("l3"), r("l4")]),
      Constraint.align({ x: "mean" }, [r("root"), r("p012"), r("p34")]),
    ];
    const at = layout([...parents, ...leaves], constraints);
    // clusterX of the stories: a leaf its index, a parent the mean of its
    // children's.
    const want = new Map<string, number>([
      ["l0", 0],
      ["l1", 1],
      ["l2", 2],
      ["l3", 3],
      ["l4", 4],
    ]);
    want.set("p01", 0.5);
    want.set("p012", (0.5 + 2) / 2);
    want.set("p34", 3.5);
    want.set("root", (1.25 + 3.5) / 2);
    const shift = at.get("l0")!;
    check(
      "every node is at clusterX × pitch",
      [...want].every(([n, v]) => near(at.get(n)! - shift, v * DX)),
      [...at]
    );

    // A mean across groups: leaves pushed apart by minimum gaps (each its
    // own group), the parent placed after them at the mean of its middles.
    const kids = [box("p", 0, 10), box("a", 0, 10), box("b", 0, 30), box("c", 0, 10)];
    const across = layout(kids, [
      Constraint.distribute({ dir: "x", spacing: atLeast(5) }, [
        r("a"),
        r("b"),
        r("c"),
      ]),
      Constraint.align({ x: "mean" }, [r("p"), r("a"), r("b"), r("c")]),
    ]);
    // a [0, 10], b [15, 45], c [50, 60]: middles 5, 30, 55, mean 30.
    check(
      "a mean across separated groups is placed after them",
      near(across.get("a"), 0) &&
        near(across.get("b"), 15) &&
        near(across.get("c"), 50) &&
        near(across.get("p"), 25),
      [...across]
    );

    const separated = throws(
      () =>
        layout(
          [...kids, box("q", 0, 10)],
          [
            Constraint.distribute({ dir: "x", spacing: atLeast(5) }, [
              r("a"),
              r("c"),
            ]),
            Constraint.distribute({ dir: "x", spacing: atLeast(5) }, [
              r("p"),
              r("q"),
            ]),
            Constraint.align({ x: "mean" }, [r("p"), r("a"), r("c")]),
          ]
        ),
      /separated from other nodes by minimum gaps/
    );
    check(
      "a mean whose target the gaps also place is a loud error",
      separated !== undefined && !separated.startsWith("wrong"),
      separated
    );
    const own = throws(
      () =>
        layout(kids, [
          Constraint.distribute({ dir: "x", spacing: atLeast(5) }, [
            r("a"),
            r("b"),
            r("p"),
          ]),
          Constraint.distribute({ dir: "x", spacing: atLeast(5) }, [
            r("b"),
            r("c"),
          ]),
          Constraint.align({ x: "mean" }, [r("p"), r("a"), r("c")]),
        ]),
      /placed together with some of the nodes it is the mean of/
    );
    check(
      "a mean whose target is placed with some of its operands is a loud error",
      own !== undefined && !own.startsWith("wrong"),
      own
    );

    // A pinned target is checked against the mean, not moved.
    const pinned = solveAxisProblem(numbers, "x", {
      ...problem(["p", "a", "b"], [["a", "b", 10]], []),
      pins: [{ node: "p", value: 3, owner: "pin p" }],
      means: [{ target: "p", operands: ["a", "b"], offset: 0, owner: "mean" }],
    });
    check(
      "a mean over one group joins the target to it (the pin moves both)",
      pinned.positions.get("p") === 3 &&
        pinned.positions.get("a") === -2 &&
        pinned.positions.get("b") === 8,
      [...pinned.positions]
    );
  }

  report();
}

main();

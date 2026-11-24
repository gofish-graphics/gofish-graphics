/**
 * Minimum gaps and means of positions in the placement solve. A minimum gap
 * (`Spacing.atLeast`) is solved after the exact facts: they make rigid
 * groups, and the gaps separate the groups by the longest path over them,
 * with the slack placed by the slack of each system of linked gaps
 * (`Slack.at(t)`, which a distribute or a spread states, and which the
 * distributes of one system share). A mean (`mean([...])`, an operand of
 * `Constraint.align`) is an exact relation when its operands are in one
 * group, and is placed after its operands otherwise. The least, greatest and centered
 * solutions, and points between them, are checked against
 * `solveSeparations`, the reference of the "Proposals/User Space
 * Separation" stories, copied here as the oracle (with a `t` for the
 * points between).
 * Run: `tsx src/tests/minimumGap.test.ts` (wired into `pnpm test` as
 * `test:minimum-gap`).
 */
import { Constraint, mean, type ConstraintSpec } from "../ast/constraints";
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
import * as Slack from "../families/slack";
import * as GoFish from "../lib";
import { check, items, report, seeded } from "./testHelpers";

// ─── The oracle: `solveSeparations`, as in UserSpaceSeparation.stories.tsx ──

type Sep = { after: string; before: string; gap: number };
type Policy = "start" | "end" | "center" | { at: number };

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
      const l = least.get(id)!;
      return [
        id,
        policy === "end"
          ? greatest
          : policy === "center"
            ? (l + greatest) / 2
            : l + policy.at * (greatest - l),
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
  slack: Slack.Slack = Slack.start(),
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
    // Every gap states the one slack, so they agree.
    minGaps: gaps.map(([from, to, offset]) => ({
      from,
      to,
      offset,
      owner: `gap ${from}→${to}`,
      slack: slack.t,
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
type Box = { name: string; size: Pwl.Value; baseline?: number };
const box = (name: string, size: number, px = 0, baseline?: number): Box => ({
  name,
  size: Pwl.affine(size, px),
  baseline,
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
            : child.baseline === undefined
              ? undefined
              : A.fromValue(Pwl.constant(child.baseline));
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
      ),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined
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

/** `constraints` with each distribute of minimum gaps stating `slack`. */
const slacked = (
  constraints: ConstraintSpec[],
  slack: Slack.Slack
): ConstraintSpec[] =>
  constraints.map((c) =>
    c.type === "distribute" && c.spacing.kind === "atLeast"
      ? { ...c, slack }
      : c
  );

const near = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1e-9;

/** The oracle's policy and the engine's rule, side by side. */
const RULES: [Policy, Slack.Slack][] = [
  ["start", Slack.start()],
  ["end", Slack.end()],
  ["center", Slack.center()],
  ...[0.25, 0.6, 0.9].map((t): [Policy, Slack.Slack] => [
    { at: t },
    Slack.at(t),
  ]),
];
const nameOf = (policy: Policy) =>
  typeof policy === "string" ? policy : `at(${policy.at})`;

/** The message `f` throws (or its promise rejects with), if any. */
async function errorOf(f: () => unknown): Promise<string | undefined> {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}

/** Each rect a rendered builder draws, by its fill: its box. */
async function rectsOf(
  builder: any,
  size = { w: 400, h: 400 }
): Promise<Map<string, { x: number; y: number; w: number; h: number }>> {
  const dl = await builder.toDisplayList(size);
  return new Map(
    items(dl)
      .filter((it: any) => it.kind === "rect")
      .map((it: any) => [
        it.style?.fill ?? it.fill,
        { x: it.x, y: it.y, w: it.w, h: it.h },
      ])
  );
}

async function main() {
  console.log(
    "\n# the least, greatest and centered solutions = solveSeparations"
  );
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
      for (const [policy, rule] of RULES) {
        runs++;
        const want = solveSeparations(items, seps, { policy });
        const got = solve(
          problem(
            items,
            [],
            seps.map((s) => [s.after, s.before, s.gap]),
            rule
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
    check(
      "throws",
      message !== undefined && !message.startsWith("wrong"),
      message
    );
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
    // A cycle back to the same node of a group is still a cycle of gaps.
    const sameNode = throws(
      () =>
        solve(
          problem(
            ["p", "q", "r"],
            [["p", "r", 40]],
            [
              ["p", "q", 1],
              ["q", "p", 1],
            ]
          )
        ),
      /form a cycle: \{p, r\} → \{q\} → \{p, r\}|form a cycle: \{q\} → \{p, r\} → \{q\}/
    );
    check(
      "a cycle out of and back into one node of a group is a cycle",
      sameNode !== undefined && !sameNode.startsWith("wrong"),
      sameNode
    );
  }

  console.log("\n# an item held between two members of one rigid group");
  {
    // p and r exactly 40 apart (p 4 wide, q 10 wide, r 4 wide); q at least
    // 8 after p's end and 8 before r's start: q starts 12 to 22 past p.
    const sizes = new Map([
      ["p", 4],
      ["q", 10],
      ["r", 4],
    ]);
    const between = (exact: number, slack: Slack.Slack) =>
      solve(
        problem(
          ["p", "q", "r"],
          [["p", "r", exact]],
          [
            ["p", "q", 4 + 8],
            ["q", "r", 10 + 8],
          ],
          slack,
          { sizes }
        )
      );
    const want: [Slack.Slack, string, number][] = [
      [Slack.start(), "start", 12],
      [Slack.center(), "center", 17],
      [Slack.end(), "end", 22],
      [Slack.at(0.25), "at(0.25)", 14.5],
    ];
    for (const [rule, name, q] of want) {
      const p = between(40, rule);
      check(
        `${name}: q ${q} past p, and r still 40 past p`,
        near(p.get("q")! - p.get("p")!, q) &&
          near(p.get("r")! - p.get("p")!, 40),
        [...p]
      );
    }
    const short = throws(
      () => between(25, Slack.start()),
      /need more room than exact constraints leave: the gaps \(gap p→q, gap q→r\) lead out of \{p, r\} and back into it.* 5 px short/
    );
    check(
      "too little room is an error that says how much is missing",
      short !== undefined && !short.startsWith("wrong"),
      short
    );
    check(
      "and it is not reported as a cycle",
      short !== undefined && !short.includes("cycle"),
      short
    );
    const exactFit = between(30, Slack.center());
    check(
      "room that fits exactly leaves q one place",
      near(exactFit.get("q")! - exactFit.get("p")!, 12),
      [...exactFit]
    );
    // Pinned on both sides: p at 100 and r at 140 by pins, the same room.
    for (const [rule, name, q] of want) {
      const p = solveAxisProblem(numbers, "x", {
        ...problem(
          ["p", "q", "r"],
          [],
          [
            ["p", "q", 4 + 8],
            ["q", "r", 10 + 8],
          ],
          rule,
          { sizes }
        ),
        pins: [
          { node: "p", value: 100, owner: "pin p" },
          { node: "r", value: 140, owner: "pin r" },
        ],
      });
      check(
        `pinned on both sides, ${name}: the pins hold, q at ${100 + q}`,
        p.positions.get("p") === 100 &&
          p.positions.get("r") === 140 &&
          near(p.positions.get("q"), 100 + q) &&
          p.conflicts.length === 0,
        [...p.positions]
      );
    }
    // The same in σ through a layer's constraints: p is σ + 4 wide, r
    // exactly 40 past p's end, q 10 wide, at least 8 from each: q starts 8
    // to 22 past p's end.
    const fromEnd = new Map([
      ["start", 8],
      ["center", 15],
      ["end", 22],
      ["at(0.25)", 11.5],
    ]);
    const kids = [box("p", 1, 4), box("q", 0, 10), box("r", 0, 4)];
    const [rp, rq, rr] = kids.map((k) => ref(k.name));
    const cs = [
      Constraint.distribute({ dir: "x", spacing: 40 }, [rp, rr]),
      Constraint.distribute({ dir: "x", spacing: atLeast(8) }, [rp, rq, rr]),
    ];
    for (const [rule, name] of want) {
      const ruled = slacked(cs, rule);
      const symbolic = solveIn(values, kids, ruled, (v) => v);
      const misses: string[] = [];
      for (const sigma of [0, 1, 10]) {
        const numeric = layout(kids, ruled, sigma);
        const pEnd = numeric.get("p")! + sigma + 4;
        if (!near(numeric.get("q")! - pEnd, fromEnd.get(name)!))
          misses.push(`σ=${sigma} q: ${numeric.get("q")}`);
        for (const [n, min] of numeric) {
          const s = symbolic.cells.get(n);
          if (s === undefined || Math.abs(Pwl.at(s.min, sigma) - min) > 1e-9)
            misses.push(`σ=${sigma} ${n}: ${min}`);
        }
      }
      check(
        `${name}: through distribute, in σ and in numbers`,
        misses.length === 0,
        misses
      );
    }
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
    const x = (slack: Slack.Slack) => {
      const p = solve(problem(nodes, exact, gaps, slack));
      return p.get("x")! - p.get("a")!;
    };
    check(
      "start: x as early as it can be",
      x(Slack.start()) === 5,
      x(Slack.start())
    );
    check("end: x as late as it can be", x(Slack.end()) === 25, x(Slack.end()));
    check(
      "center: halfway between",
      x(Slack.center()) === 15,
      x(Slack.center())
    );
    check(
      "at(0.25): a quarter of the way",
      x(Slack.at(0.25)) === 10,
      x(Slack.at(0.25))
    );
    check(
      "start, center and end are at(0), at(0.5) and at(1)",
      JSON.stringify([Slack.start(), Slack.center(), Slack.end()]) ===
        JSON.stringify([Slack.at(0), Slack.at(0.5), Slack.at(1)])
    );
    // The end keeps each group inside the least solution's span, by its
    // size: a wide last item ends where the least solution ends.
    const sized = solve(
      problem(
        ["a", "b", "w"],
        [],
        [
          ["a", "b", 10],
          ["a", "w", 2],
        ],
        Slack.end(),
        {
          sizes: new Map([
            ["a", 0],
            ["b", 30],
            ["w", 5],
          ]),
        }
      )
    );
    check(
      "end: a group ends where the least solution ends",
      sized.get("w")! + 5 === sized.get("b")! + 30,
      [...sized]
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
    const constraints = [
      Constraint.distribute({ dir: "x", spacing: atLeast(4) }, [a, b, c]),
      Constraint.distribute({ dir: "x", spacing: atLeast(1) }, [a, x, c]),
    ];
    for (const [policy, rule] of RULES) {
      const ruled = slacked(constraints, rule);
      const symbolic = solveIn(values, kids, ruled, (v) => v);
      const misses: string[] = [];
      for (const sigma of [0, 1, 10]) {
        const numeric = layout(kids, ruled, sigma);
        for (const [name, min] of numeric) {
          const s = symbolic.cells.get(name);
          if (s === undefined || Math.abs(Pwl.at(s.min, sigma) - min) > 1e-9)
            misses.push(`${nameOf(policy)} σ=${sigma} ${name}: ${min}`);
        }
      }
      check(
        `${nameOf(policy)}: values in σ agree with numbers`,
        misses.length === 0,
        misses
      );
    }
    // At σ = 10, x has slack: a ends at 20, c starts at 20 + 4 + 34 + 4.
    const center = layout(kids, slacked(constraints, Slack.center()), 10);
    // x's least start is 21, its greatest 62 − 1 − 2 = 59: halfway is 40.
    check("x is centered in its slack", near(center.get("x"), 40), [...center]);
  }

  console.log("\n# slack on distribute and spread, one per linked system");
  {
    const { layer, spread, rect, Constraint: C, Spacing: S } = GoFish as any;
    // b at least 10 after a and 10 before c, and c at least 60 after a, all
    // 20 wide: b starts 30 to 50 past a, so it has 20 of slack. The two
    // distributes share a and c, so their gaps are one linked system. (The
    // long edge is a minimum gap, so the slack is bounded by gaps alone; an
    // exact long edge is the RowPinned case, "an item held between two
    // members of one rigid group" above.) d, e, f are the same along x,
    // with no node in common with a, b, c: a second system, unlinked.
    const rects = (names: string[], fills: string[]) =>
      names.map((n, i) => rect({ w: 20, h: 20, fill: fills[i] }).name(n));
    const row = (
      [chain, long]: [unknown, unknown],
      [chain2, long2]: [unknown, unknown] = [undefined, undefined]
    ) =>
      layer(
        {},
        rects(
          ["a", "b", "c", "d", "e", "f"],
          ["red", "green", "blue", "orange", "purple", "black"]
        )
      ).relate((c: any) => {
        const minGaps = (
          refs: unknown[],
          gap: number,
          slack: unknown
        ) =>
          C.distribute(
            {
              dir: "x",
              spacing: S.atLeast(gap),
              ...(slack === undefined ? {} : { slack }),
            },
            refs
          );
        return [
          minGaps([c.a, c.b, c.c], 10, chain),
          minGaps([c.a, c.c], 60, long),
          minGaps([c.d, c.e, c.f], 10, chain2),
          minGaps([c.d, c.f], 60, long2),
          C.align({ y: "start" }, [c.a, c.b, c.c]),
          C.align({ y: "start" }, [c.d, c.e, c.f]),
          C.distribute({ dir: "y", spacing: 10 }, [c.a, c.d]),
        ];
      });
    // The fraction of its slack a middle item takes: its offset from the
    // first past the least (30), over the room (20).
    const fraction = (
      boxes: Map<string, { x: number; y: number }>,
      [lo, mid]: string[]
    ) => (boxes.get(mid)!.x - boxes.get(lo)!.x - 30) / 20;
    const abc = ["red", "green"];
    const def = ["orange", "purple"];

    const agree = await rectsOf(row([Slack.end(), Slack.end()]));
    check(
      "two linked distributes that state the same slack: it holds",
      near(fraction(agree, abc), 1),
      [...agree]
    );
    for (const [which, slacks] of [
      ["the chain", [Slack.end(), undefined]],
      ["the long edge", [undefined, Slack.end()]],
    ] as const) {
      const inherit = await rectsOf(row(slacks as [unknown, unknown]));
      check(
        `one distribute states the slack (${which}) and the linked one takes it`,
        near(fraction(inherit, abc), 1),
        [...inherit]
      );
    }
    const clash = await errorOf(() =>
      rectsOf(row([Slack.end(), Slack.center()]))
    );
    check(
      "two linked distributes that state different slacks: an error naming both",
      clash !== undefined &&
        /distribute\[0\] states slack Slack\.at\(1\) but distribute\[1\] states Slack\.at\(0\.5\)/.test(
          clash
        ) &&
        clash.includes("linked"),
      clash
    );
    const apart = await rectsOf(
      row([Slack.end(), undefined], [undefined, Slack.at(0.25)])
    );
    check(
      "two unlinked systems in one layer each keep their own slack",
      near(fraction(apart, abc), 1) && near(fraction(apart, def), 0.25),
      [...apart]
    );
    const plain = await rectsOf(row([undefined, undefined]));
    const started = await rectsOf(row([Slack.start(), Slack.start()]));
    check(
      "a system where no distribute states slack takes Slack.start()",
      near(fraction(plain, abc), 0) &&
        near(fraction(plain, def), 0) &&
        JSON.stringify([...plain]) === JSON.stringify([...started]),
      [...plain]
    );

    // Slack only places what minimum gaps leave room for, so on any other
    // spacing it is an error, made where the distribute is made.
    for (const spacing of [5, S.box(5), S.pitch(30)]) {
      const exactSlack = await errorOf(() =>
        C.distribute({ dir: "x", spacing, slack: Slack.end() }, [
          ref("a"),
          ref("b"),
        ])
      );
      check(
        `slack on Spacing.${typeof spacing === "number" ? "box (a bare amount)" : spacing.kind} is an error`,
        exactSlack !== undefined &&
          exactSlack.includes(
            "slack applies to minimum gaps: use Spacing.atLeast"
          ),
        exactSlack
      );
    }
    const spreadExact = await errorOf(() =>
      rectsOf(
        spread({ dir: "x", slack: Slack.end() }, rects(["a", "b"], ["red", "green"]))
      )
    );
    check(
      "a spread's slack with its default spacing is the same error",
      spreadExact !== undefined &&
        spreadExact.includes("slack applies to minimum gaps"),
      spreadExact
    );

    // A spread's slack is the slack of the distribute it lays its children
    // out with: the same row as that distribute in a layer. A chain alone
    // has no room (every gap is at its least), so every slack draws the
    // same row; the slack is read, and checked, all the same.
    const spreadRow = (slack: unknown, dir = "x") =>
      spread(
        {
          dir,
          spacing: S.atLeast(10),
          ...(slack === undefined ? {} : { slack }),
        },
        rects(["a", "b", "c"], ["red", "green", "blue"])
      );
    const distributeRow = (slack: unknown) =>
      layer({}, rects(["a", "b", "c"], ["red", "green", "blue"])).relate(
        (c: any) => [
          C.align({ y: "baseline" }, [c.a, c.b, c.c]),
          C.distribute(
            { dir: "x", spacing: S.atLeast(10), slack },
            [c.a, c.b, c.c]
          ),
        ]
      );
    const offsets = (m: Map<string, { x: number }>) =>
      [...m].map(([k, b]) => [k, b.x - m.get("red")!.x]);
    const spreadEnd = await rectsOf(spreadRow(Slack.end()));
    const distributeEnd = await rectsOf(distributeRow(Slack.end()));
    const spreadStart = await rectsOf(spreadRow(undefined));
    check(
      "spread({ slack }) places as Constraint.distribute({ slack }) does",
      JSON.stringify(offsets(spreadEnd)) ===
        JSON.stringify(offsets(distributeEnd)),
      { spread: [...spreadEnd], distribute: [...distributeEnd] }
    );
    check(
      "a spread's chain alone has no room: Slack.end() draws Slack.start()'s row",
      JSON.stringify([...spreadEnd]) === JSON.stringify([...spreadStart]) &&
        near(spreadEnd.get("green")!.x - spreadEnd.get("red")!.x, 30),
      { end: [...spreadEnd], start: [...spreadStart] }
    );
    const polar = await errorOf(() =>
      rectsOf(
        layer({ coord: GoFish.Coord.polar() }, [
          spreadRow(Slack.center(), "theta"),
        ])
      )
    );
    check(
      "a spread along a coordinate space's own axis name takes slack",
      polar === undefined,
      polar
    );

    // `t` is a fraction in [0, 1]: `Slack.at` checks it where it is made,
    // and a distribute checks a slack it is handed (from the wire, say).
    for (const t of [-0.1, 1.5, NaN]) {
      const made = await errorOf(() => Slack.at(t));
      check(
        `Slack.at(${t}) is an error`,
        made !== undefined && made.includes(`Slack.at(${t})`),
        made
      );
      const handed = await errorOf(() =>
        C.distribute(
          { dir: "x", spacing: S.atLeast(5), slack: { kind: "at", t } },
          [ref("a"), ref("b")]
        )
      );
      check(
        `a distribute handed t = ${t} is an error naming slack`,
        handed !== undefined && handed.includes("slack"),
        handed
      );
    }
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
      Constraint.align({ x: "middle" }, [r("p01"), mean([r("l0"), r("l1")])]),
      Constraint.align({ x: "middle" }, [r("p012"), mean([r("p01"), r("l2")])]),
      Constraint.align({ x: "middle" }, [r("p34"), mean([r("l3"), r("l4")])]),
      Constraint.align({ x: "middle" }, [
        r("root"),
        mean([r("p012"), r("p34")]),
      ]),
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
    const kids = [
      box("p", 0, 10),
      box("a", 0, 10),
      box("b", 0, 30),
      box("c", 0, 10),
    ];
    const across = layout(kids, [
      Constraint.distribute({ dir: "x", spacing: atLeast(5) }, [
        r("a"),
        r("b"),
        r("c"),
      ]),
      Constraint.align({ x: "middle" }, [
        r("p"),
        mean([r("a"), r("b"), r("c")]),
      ]),
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
            Constraint.align({ x: "middle" }, [r("p"), mean([r("a"), r("c")])]),
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
          Constraint.align({ x: "middle" }, [r("p"), mean([r("a"), r("c")])]),
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
      means: [
        {
          target: "p",
          operands: [
            { node: "a", weight: 0.5 },
            { node: "b", weight: 0.5 },
          ],
          offset: 0,
          owner: "mean",
        },
      ],
    });
    check(
      "a mean over one group joins the target to it (the pin moves both)",
      pinned.positions.get("p") === 3 &&
        pinned.positions.get("a") === -2 &&
        pinned.positions.get("b") === 8,
      [...pinned.positions]
    );
  }

  console.log("\n# a mean reads the anchor the align puts its operands at");
  {
    // a [0, 10] and b [20, 50] in one group (a box gap of 10), c [60, 70];
    // p is 4 wide and q 8. a's origin is 2 past its start, b's 6, p's 1.
    const r = (n: string) => ref(n);
    const kids = [
      box("a", 0, 10, 2),
      box("b", 0, 30, 6),
      box("c", 0, 10, 4),
      box("p", 0, 4, 1),
      box("q", 0, 8),
    ];
    const row = Constraint.distribute({ dir: "x", spacing: 10 }, [
      r("a"),
      r("b"),
      r("c"),
    ]);
    const at = (c: ConstraintSpec) => layout(kids, [row, c]);
    const pAt = (anchor: "start" | "middle" | "end" | "baseline") =>
      at(Constraint.align({ x: anchor }, [r("p"), mean([r("a"), r("b")])])).get(
        "p"
      );
    check(
      "start: p's start at the mean of starts (10)",
      near(pAt("start"), 10),
      pAt("start")
    );
    check(
      "middle: p's middle at the mean of middles (20)",
      near(pAt("middle"), 18),
      pAt("middle")
    );
    check(
      "end: p's end at the mean of ends (30)",
      near(pAt("end"), 26),
      pAt("end")
    );
    check(
      "baseline: p's origin at the mean of origins (2 and 26: 14)",
      near(pAt("baseline"), 13),
      pAt("baseline")
    );

    // One anchor per operand: the mean's slot names the anchor it averages.
    const perOperand = at(
      Constraint.align({ x: ["start", "end"] }, [
        r("p"),
        mean([r("a"), r("b")]),
      ])
    );
    check(
      'x: ["start", "end"]: p\'s start at the mean of ends (30)',
      near(perOperand.get("p"), 30),
      [...perOperand]
    );

    // Several nodes at one mean.
    const several = at(
      Constraint.align({ x: "middle" }, [
        r("p"),
        r("q"),
        mean([r("a"), r("b")]),
      ])
    );
    check(
      "p's and q's middles both at the mean of middles (20)",
      near(several.get("p"), 18) && near(several.get("q"), 16),
      [...several]
    );

    // A mean of means weighs each inner mean as one operand: middles 5, 35,
    // 65 give 5 / 2 + (35 + 65) / 4 = 27.5.
    const nested = at(
      Constraint.align({ x: "middle" }, [
        r("p"),
        mean([r("a"), mean([r("b"), r("c")])]),
      ])
    );
    check(
      "a nested mean weighs its operands' share",
      near(nested.get("p"), 25.5),
      [...nested]
    );

    // The same in σ, against numbers at each σ.
    const sized = [
      box("a", 1, 10),
      box("b", 2),
      box("c", 0, 6),
      box("p", 0, 4),
    ];
    const cs = [
      Constraint.distribute({ dir: "x", spacing: 3 }, [r("a"), r("b"), r("c")]),
      Constraint.align({ x: "middle" }, [
        r("p"),
        mean([r("a"), mean([r("b"), r("c")])]),
      ]),
    ];
    const symbolic = solveIn(values, sized, cs, (v) => v);
    const misses: string[] = [];
    for (const sigma of [0, 1, 10]) {
      const numeric = layout(sized, cs, sigma);
      for (const [name, min] of numeric) {
        const s = symbolic.cells.get(name);
        if (s === undefined || Math.abs(Pwl.at(s.min, sigma) - min) > 1e-9)
          misses.push(`σ=${sigma} ${name}: ${min}`);
      }
    }
    check(
      "a nested mean in σ agrees with numbers",
      misses.length === 0,
      misses
    );
  }

  console.log("\n# what a mean is not");
  {
    const r = (n: string) => ref(n);
    const errors: [string, () => unknown, RegExp][] = [
      [
        "distribute takes no mean",
        () =>
          Constraint.distribute({ dir: "x", spacing: 10 }, [
            mean([r("a"), r("b")]) as never,
            r("c"),
          ]),
        /Constraint\.distribute: operand 1 is mean\(a, b\).*only Constraint\.align takes.*takes no room/,
      ],
      [
        "position takes no mean",
        () => Constraint.position({ x: 3 }, [mean([r("a")]) as never]),
        /Constraint\.position: operand 1 is mean\(a\)/,
      ],
      [
        "span with a mean",
        () => Constraint.align({ x: "span" }, [r("p"), mean([r("a"), r("b")])]),
        /"span" on x .* mean\(a, b\) is a position, not a node/,
      ],
      [
        "size with a mean",
        () => Constraint.align({ y: "size" }, [r("p"), mean([r("a")])]),
        /"size" on y/,
      ],
      [
        "only means",
        () =>
          Constraint.align({ x: "middle" }, [
            mean([r("a"), r("b")]),
            mean([r("c")]),
          ]),
        /every operand .* is a mean/,
      ],
      ["an empty mean", () => mean([]), /at least one operand/],
      [
        "an anchor array counts the operands, a mean as one",
        () =>
          layout(
            [box("p", 0, 4), box("a", 0, 10), box("b", 0, 10)],
            [
              Constraint.align({ x: ["start"] }, [
                r("p"),
                mean([r("a"), r("b")]),
              ]),
            ]
          ),
        /anchor array length 1 must match number of operands 2/,
      ],
    ];
    for (const [what, f, pattern] of errors) {
      const message = throws(f, pattern);
      check(
        what,
        message !== undefined && !message.startsWith("wrong"),
        message
      );
    }
  }

  report();
}

main();

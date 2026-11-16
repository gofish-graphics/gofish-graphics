/**
 * A stack's baseline (`Baseline`, #773, #984): where the free origin seats a
 * stack, and where a stack puts its 0. Covers the side of the midpoint a
 * level lands on when the split reorders the levels (a centered stack, a
 * `HasMidpoint` column), a set midpoint under a reversed order, a spread
 * chain staying on its sequence origin when a free node joins its
 * component, a centered baseline on a size-strong part, and each
 * `Baseline` strategy: `at` on a value of the `by` column (present or
 * missing), `end`, `middle`, and the errors.
 *
 * Run: `pnpm build && tsx src/tests/baseline.test.ts` (wired as
 * `pnpm test:baseline`). The rendering checks import from `dist` for the
 * same lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { stackBaseline, type ColumnType } from "../ast/schema";
import { solveAxisProblem } from "../ast/constraints/differenceGraph";
import { numbers } from "../ast/solver/arith";
import { anchorExpr, relationFact } from "../ast/constraints/placementFacts";

const {
  chart,
  spread,
  stack,
  rect,
  layer,
  Constraint,
  Unit,
  Domain,
  Trait,
  Baseline,
  field,
  v,
} = GoFish as any;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function errorOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

type Box = { x: number; y: number; w: number; h: number };
const rectsOf = (dl: any): Box[] => {
  const out: Box[] = [];
  const walk = (it: any) => {
    if (it.kind === "rect") out.push(it);
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** The boxes of a render's data parts (or every rect), without their ids. */
const partsOf = (dl: any, data = true): Box[] =>
  rectsOf(dl)
    .filter((r: any) => !data || r.datum !== undefined)
    .map(({ x, y, w, h }) => ({ x, y, w, h }));

const LEVELS5 = ["SD", "D", "N", "A", "SA"];
const centered: ColumnType = {
  HasLevels: { levels: LEVELS5 },
  HasOrder: {},
  HasMidpoint: { at: 2.5 },
};

async function main() {
  console.log(
    "\n# a level's side of the midpoint comes from the split's order"
  );
  {
    // The split reverses the order, so the stack lays SA first. A row with
    // only "D" puts it past the center, as a row with every level does.
    const reversed = [...LEVELS5].reverse();
    const at = (part: number, point: number) =>
      JSON.stringify({ kind: "at", part, point });
    check(
      "one part, reversed order: the part's tail is the center",
      JSON.stringify(stackBaseline("r", centered, reversed, ["D"])) ===
        at(0, 0)
    );
    check(
      "one part, the order: the part's head is the center",
      JSON.stringify(stackBaseline("r", centered, LEVELS5, ["D"])) ===
        at(0, 1)
    );
    check(
      "a reversed stack over a reversed order lays the order out again",
      JSON.stringify(stackBaseline("r", centered, reversed, ["D"], true)) ===
        at(0, 1)
    );

    // q1 has D and A; q2 has only D. Widths are counts, so D is 11 (q1)
    // and 17 (q2) in data units; the center is where q1's A meets its D.
    const rows = [
      { q: "q1", r: "D", n: 11 },
      { q: "q1", r: "A", n: 13 },
      { q: "q2", r: "D", n: 17 },
    ];
    for (const [label, by] of [
      ["the order", "r"],
      ["field(...).reverse()", field("r").reverse()],
    ] as const) {
      const dl = await chart(rows, {
        schema: {
          r: Unit({
            domain: Domain.discrete(LEVELS5),
            traits: [Trait.diverging()],
          }),
        },
      })
        .flow(spread({ by: "q", dir: "y" }), stack({ by, dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 300, h: 200 });
      // In layout order: q1's two parts, then q2's one part (its D).
      const [first, second, lone] = rectsOf(dl);
      const center = first.x + first.w;
      const q1D = label === "the order" ? first : second;
      const side = (b: Box) =>
        near(b.x, center) ? "after" : near(b.x + b.w, center) ? "before" : "?";
      check(
        `${label}: a row with only D puts it on the side the full row does`,
        side(q1D) !== "?" && side(lone) === side(q1D),
        JSON.stringify({ first, second, lone })
      );
    }

    // A key sort puts the Likert levels in the order A, D, N, SA, SD: not
    // the order or its reverse, so no row can be centered, even one whose
    // parts (D, N) happen to follow the order.
    const sorted = await errorOf(() =>
      chart(
        [
          { q: "q1", r: "D", n: 1 },
          { q: "q1", r: "N", n: 2 },
        ],
        {
          schema: {
            r: Unit({
              domain: Domain.discrete(LEVELS5),
              traits: [Trait.diverging()],
            }),
          },
        }
      )
        .flow(stack({ by: field("r").sort(), dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 300, h: 200 })
    );
    check(
      "a split order that is not the order is an error in every row",
      sorted !== undefined &&
        sorted.includes("HasMidpoint") &&
        sorted.includes(`"A", "D", "N", "SA", "SD"`),
      sorted
    );
  }

  console.log("\n# a set midpoint under a reversed order");
  {
    // Midpoint 2.25: SD, D and a quarter of N lie before it. Reversed, the
    // stack lays SA first, so the 0 is three quarters through N from the
    // left. q2 has only SA, which lies past the midpoint in the order, so in
    // the reversed layout it ends at the 0.
    const counts = [1, 2, 3, 4, 5];
    const rows = [
      ...LEVELS5.map((r, i) => ({ q: "q1", r, n: counts[i] })),
      { q: "q2", r: "SA", n: 5 },
    ];
    const dl = await chart(rows, {
      schema: {
        r: Unit({
          domain: Domain.discrete(LEVELS5),
          traits: [Trait.diverging(2.25)],
        }),
      },
    })
      .flow(
        spread({ by: "q", dir: "y" }),
        stack({ by: field("r").reverse(), dir: "x" })
      )
      .mark(rect({ w: "n" }))
      .toDisplayList({ w: 300, h: 200 });
    const boxes = rectsOf(dl);
    const q1 = boxes.slice(0, 5).sort((a, b) => a.x - b.x);
    const [q2] = boxes.slice(5);
    const unit = q1[0].w / 5;
    check(
      "the reversed row lays SA first",
      q1.every((b, i) => near(b.w, unit * (5 - i))),
      JSON.stringify(q1)
    );
    const neutral = q1[2];
    check(
      "the 0 is three quarters through N, where the lone SA ends",
      near(neutral.x + 0.75 * neutral.w, q2.x + q2.w),
      JSON.stringify({ neutral, q2 })
    );
  }

  console.log("\n# a spread chain keeps its sequence origin");
  {
    // A spread chain a → b; a free node r aligned to b has a data baseline.
    // The component holds a spread, which packs boxes from a's start and has
    // no baseline, so the free origin (50) does not seat r.
    const problem = {
      relations: [
        relationFact(
          anchorExpr("a", "x", "start"),
          anchorExpr("b", "x", "start"),
          10,
          "distribute[0]",
          "spread"
        ),
        relationFact(
          anchorExpr("b", "x", "start"),
          anchorExpr("r", "x", "start"),
          0,
          "align[0]"
        ),
      ],
      pins: [],
      participantFacts: [],
      participants: new Set(["a", "b", "r"]),
    };
    const solved = solveAxisProblem(numbers, "x", problem, {
      value: 50,
      baselines: new Map([["r", 0]]),
    });
    check(
      "a free node aligned to a spread member does not seat the spread",
      solved.positions.get("a") === 0 && solved.positions.get("r") === 10,
      JSON.stringify([...solved.positions])
    );

    const bars = (withR: boolean) =>
      layer([
        rect({ w: v(10), h: 20 }).name("a"),
        rect({ w: v(20), h: 20 }).name("b"),
        ...(withR ? [rect({ w: v(5), h: 10 }).name("r")] : []),
      ]).relate((g: any) => [
        Constraint.distribute({ dir: "x", spacing: 8 }, [g.a, g.b]),
        ...(withR ? [Constraint.align({ x: "start" }, [g.b, g.r])] : []),
      ]);
    const [alone] = rectsOf(
      await bars(false).toDisplayList({ w: 300, h: 100 })
    );
    const [a] = rectsOf(await bars(true).toDisplayList({ w: 300, h: 100 }));
    check(
      "a rendered spread starts where it does without the aligned node",
      near(a.x, alone.x),
      JSON.stringify({ alone: alone.x, withR: a.x })
    );
  }

  console.log("\n# a centered baseline on a size-strong part");
  {
    // `a` has no width of its own: align "size" gives it src's. The stack's
    // baseline is a's middle, which seats at data 0 (src's x) whether or not
    // the part is size-strong.
    const stacked = (strong: boolean) =>
      layer([
        rect({ x: v(0), w: v(10), y: 0, h: 5 }).name("src"),
        (strong
          ? rect({ h: 20, y: 30 })
          : rect({ w: v(10), h: 20, y: 30 })
        ).name("a"),
        rect({ w: v(20), h: 20, y: 30 }).name("b"),
      ]).relate((g: any) => [
        ...(strong ? [Constraint.align({ x: "size" }, [g.src, g.a])] : []),
        Constraint.distribute(
          {
            dir: "x",
            glue: true,
            baseline: { kind: "at", part: g.a, point: 0.5 },
          },
          [g.a, g.b]
        ),
      ]);
    for (const strong of [false, true]) {
      const [src, a] = rectsOf(
        await stacked(strong).toDisplayList({ w: 300, h: 100 })
      );
      check(
        `${strong ? "size-strong" : "weak"} part: its middle sits at data 0`,
        near(a.x + a.w / 2, src.x),
        JSON.stringify({ src, a })
      );
    }
  }

  console.log("# a middle align centers stacks of data (a streamgraph)");
  {
    // A spread of stacks aligned by their middles (a streamgraph's
    // layout): each stack's data is pinned, but the align composes them to
    // a type with no origin, so their data does not place them in the
    // spread (`placedByOwnData`) and the align centers every stack on one
    // line. Stacks of different heights then start at different y.
    const rows = [
      { g: "a", s: "x", v: 1 },
      { g: "a", s: "y", v: 1 },
      { g: "b", s: "x", v: 3 },
      { g: "b", s: "y", v: 3 },
      { g: "c", s: "x", v: 2 },
      { g: "c", s: "y", v: 1 },
    ];
    const dl = await chart(rows, { axes: false, legend: false })
      .flow(
        spread({ by: "g", dir: "x", spacing: 10, alignment: "middle" }),
        stack({ by: "s", dir: "y" })
      )
      .mark(rect({ h: "v", w: 20 }))
      .toDisplayList({ w: 300, h: 200 });
    const byX = new Map<number, Box[]>();
    for (const r of rectsOf(dl)) {
      const k = Math.round(r.x);
      byX.set(k, [...(byX.get(k) ?? []), r]);
    }
    const mids = [...byX.values()].map((rs) => {
      const lo = Math.min(...rs.map((r) => r.y));
      const hi = Math.max(...rs.map((r) => r.y + r.h));
      return (lo + hi) / 2;
    });
    const starts = [...byX.values()].map((rs) =>
      Math.min(...rs.map((r) => r.y))
    );
    check(
      "every stack's middle is on one line",
      mids.length === 3 && mids.every((m) => Math.abs(m - mids[0]) < 1e-6),
      JSON.stringify({ mids })
    );
    check(
      "the stacks do not share a flat baseline",
      new Set(starts.map((s) => s.toFixed(3))).size === 3,
      JSON.stringify({ starts })
    );
  }

  console.log("\n# Baseline strategies");
  {
    const likert = [
      { q: "q1", r: "SD", n: 4 },
      { q: "q1", r: "D", n: 6 },
      { q: "q1", r: "N", n: 10 },
      { q: "q1", r: "A", n: 12 },
      { q: "q1", r: "SA", n: 8 },
      { q: "q2", r: "SD", n: 2 },
      { q: "q2", r: "D", n: 3 },
      { q: "q2", r: "A", n: 20 },
      { q: "q2", r: "SA", n: 25 },
    ];
    const levels = (traits: unknown[] = []) => ({
      schema: { r: Unit({ domain: Domain.discrete(LEVELS5), traits }) },
    });
    // The parts' boxes, without the axis, and without the ids a render
    // numbers its nodes by.
    const bars = async (options: object, stackOpts: object, rows = likert) =>
      partsOf(
        await chart(rows, options)
          .flow(
            spread({ by: "q", dir: "y" }),
            stack({ by: "r", dir: "x", ...stackOpts })
          )
          .mark(rect({ w: "n" }))
          .toDisplayList({ w: 300, h: 200 })
      );
    const diverging = await bars(levels([Trait.diverging()]), {});
    const explicit = await bars(levels(), {
      baseline: Baseline.at("N", 0.5),
    });
    check(
      "Baseline.at(\"N\", 0.5) lays a Likert out as Trait.diverging() does",
      JSON.stringify(explicit) === JSON.stringify(diverging),
      JSON.stringify({ explicit, diverging })
    );
    // q2 has no N: the 0 falls on the boundary where N would be, the tail
    // of its A, which is where q1's N is half through.
    const q1N = explicit[2];
    const q2A = explicit[7];
    check(
      "a missing part is placed by the order and moves nothing",
      near(q2A.x, q1N.x + q1N.w / 2),
      JSON.stringify({ q1N, q2A })
    );
    const both = await errorOf(() =>
      bars(levels([Trait.diverging()]), { baseline: Baseline.at("N", 0.5) })
    );
    check(
      "a baseline over a Trait.diverging column is an error that says why",
      both !== undefined &&
        both.includes("Trait.diverging()") &&
        both.includes("baseline"),
      both
    );
    const unordered = await errorOf(() =>
      bars({}, { baseline: Baseline.at("N", 0.5) })
    );
    check(
      "a missing part with no declared order is an error naming the fix",
      unordered !== undefined && unordered.includes("Domain.discrete"),
      unordered
    );
    const anchor = await bars(levels(), { baseline: Baseline.at("N", "end") });
    const fraction = await bars(levels(), { baseline: Baseline.at("N", 1) });
    check(
      "Baseline.at(part, \"end\") is the part's head, like the fraction 1",
      JSON.stringify(anchor.slice(0, 5)) === JSON.stringify(fraction.slice(0, 5)),
      JSON.stringify({ anchor, fraction })
    );
    const ended = await bars(levels(), { baseline: Baseline.end() });
    const rows = [ended.slice(0, 5), ended.slice(5)];
    check(
      "Baseline.end(): every row ends at one x",
      near(
        Math.max(...rows[0].map((b) => b.x + b.w)),
        Math.max(...rows[1].map((b) => b.x + b.w))
      ),
      JSON.stringify(ended)
    );
    const middled = await bars(levels(), { baseline: Baseline.middle() });
    const centerOf = (bs: Box[]) =>
      (Math.min(...bs.map((b) => b.x)) +
        Math.max(...bs.map((b) => b.x + b.w))) /
      2;
    check(
      "Baseline.middle(): every row is centered on one x",
      near(centerOf(middled.slice(0, 5)), centerOf(middled.slice(5))),
      JSON.stringify(middled)
    );
    const spreadBaseline = await errorOf(async () =>
      rectsOf(
        await chart(likert)
          .flow(spread({ by: "r", dir: "x", baseline: Baseline.end() }))
          .mark(rect({ w: "n" }))
          .toDisplayList({ w: 300, h: 200 })
      )
    );
    check(
      "a spread does not take a baseline yet",
      spreadBaseline !== undefined && spreadBaseline.includes("stack"),
      spreadBaseline
    );
    // The combinator form names the part by its index. A bar at data 0
    // beside the stack shows where its 0 sits.
    const combinator = async (baseline: unknown) =>
      layer([
        rect({ x: v(0), w: v(10), y: 0, h: 5 }),
        stack({ dir: "x", baseline }, [
          rect({ w: v(10), h: 10, y: 20 }),
          rect({ w: v(20), h: 10, y: 20 }),
          rect({ w: v(30), h: 10, y: 20 }),
        ]),
      ]).toDisplayList({ w: 300, h: 100 });
    const atOne = partsOf(await combinator(Baseline.at(1, 0)), false);
    const endOne = partsOf(await combinator(Baseline.at(0, 1)), false);
    const startOf = partsOf(await combinator(Baseline.start()), false);
    check(
      "in the combinator form the part is a child index",
      JSON.stringify(atOne) === JSON.stringify(endOne) &&
        JSON.stringify(atOne) !== JSON.stringify(startOf),
      JSON.stringify({ atOne, endOne, startOf })
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

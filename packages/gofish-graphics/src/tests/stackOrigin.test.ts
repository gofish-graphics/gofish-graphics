/**
 * A stack's origin (#773, #984): where the free origin seats a stack, and
 * where a centered stack (a `HasCenter` column) puts its 0. Covers the side
 * of the center a level lands on when the split reorders the levels, a
 * spread chain staying on its sequence origin when a free node joins its
 * component, and a centered origin on a size-strong part.
 *
 * Run: `pnpm build && tsx src/tests/stackOrigin.test.ts` (wired as
 * `pnpm test:stack-origin`). The rendering checks import from `dist` for the
 * same lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { stackOrigin, type ColumnType } from "../ast/schema";
import { solveAxisProblem } from "../ast/constraints/differenceGraph";
import { anchorExpr, relationFact } from "../ast/constraints/placementFacts";

const { chart, spread, stack, rect, layer, Constraint, Schema, field, v } =
  GoFish as any;

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

const LEVELS5 = ["SD", "D", "N", "A", "SA"];
const centered: ColumnType = { HasOrder: { levels: LEVELS5 }, HasCenter: true };

async function main() {
  console.log("\n# a level's side of the center comes from the split's order");
  {
    // The split reverses the order, so the stack lays SA first. A row with
    // only "D" puts it past the center, as a row with every level does.
    const reversed = [...LEVELS5].reverse();
    check(
      "one part, reversed order: the part's tail is the center",
      JSON.stringify(stackOrigin("r", centered, reversed, ["D"])) ===
        JSON.stringify({ part: 0, fraction: 0, mirrored: true })
    );
    check(
      "one part, the order: the part's head is the center",
      JSON.stringify(stackOrigin("r", centered, LEVELS5, ["D"])) ===
        JSON.stringify({ part: 0, fraction: 1, mirrored: true })
    );
    check(
      "a reversed stack over a reversed order lays the order out again",
      JSON.stringify(stackOrigin("r", centered, reversed, ["D"], true)) ===
        JSON.stringify({ part: 0, fraction: 1, mirrored: true })
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
        schema: { r: Schema.ordered(LEVELS5).diverging() },
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
        { schema: { r: Schema.ordered(LEVELS5).diverging() } }
      )
        .flow(stack({ by: field("r").sort(), dir: "x" }))
        .mark(rect({ w: "n" }))
        .toDisplayList({ w: 300, h: 200 })
    );
    check(
      "a split order that is not the order is an error in every row",
      sorted !== undefined &&
        sorted.includes("HasCenter") &&
        sorted.includes(`"A", "D", "N", "SA", "SD"`),
      sorted
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
    const solved = solveAxisProblem("x", problem, {
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
    const [alone] = rectsOf(await bars(false).toDisplayList({ w: 300, h: 100 }));
    const [a] = rectsOf(await bars(true).toDisplayList({ w: 300, h: 100 }));
    check(
      "a rendered spread starts where it does without the aligned node",
      near(a.x, alone.x),
      JSON.stringify({ alone: alone.x, withR: a.x })
    );
  }

  console.log("\n# a centered origin on a size-strong part");
  {
    // `a` has no width of its own: align "size" gives it src's. The stack's
    // origin is a's middle, which seats at data 0 (src's x) whether or not
    // the part is size-strong.
    const stacked = (strong: boolean) =>
      layer([
        rect({ x: v(0), w: v(10), y: 0, h: 5 }).name("src"),
        (strong ? rect({ h: 20, y: 30 }) : rect({ w: v(10), h: 20, y: 30 })).name(
          "a"
        ),
        rect({ w: v(20), h: 20, y: 30 }).name("b"),
      ]).relate((g: any) => [
        ...(strong ? [Constraint.align({ x: "size" }, [g.src, g.a])] : []),
        Constraint.distribute(
          {
            dir: "x",
            glue: true,
            origin: { part: "a", fraction: 0.5, mirrored: false },
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * A stack's baseline (`Baseline`, #773, #984): where the free origin seats a
 * stack, and where a stack puts its 0. Covers the side of the midpoint a
 * level lands on when the split reorders the levels (a centered stack, a
 * `HasMidpoint` column), a set midpoint under a reversed order, a spread
 * chain staying on its sequence origin when a free node joins its
 * component, a centered baseline on a size-strong part, each `Baseline`
 * strategy: `at` on a value of the `by` column (present or missing),
 * `end`, `middle`, and the errors, and a spread's baseline: rows of
 * spreads with gaps lined up on their 0s, `alignment` as a shorthand for a
 * shared baseline, and a spread nested in a spread.
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
    // `a` has no width of its own: align "size" gives it src's. A part with
    // no data width is no amount, so the chain is a spread with no spacing,
    // not a stack. Its baseline is a's middle, which seats at data 0 (src's
    // x) whether or not the part is size-strong.
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
            spacing: 0,
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

  console.log("\n# a spread's baseline");
  {
    // Rows of spreads with 3 px gaps, each with its own 0, lined up by the
    // parent's default alignment, "baseline".
    const likert = [
      { q: "q1", r: "SD", n: 4 },
      { q: "q1", r: "D", n: 6 },
      { q: "q1", r: "N", n: 10 },
      { q: "q1", r: "A", n: 12 },
      { q: "q1", r: "SA", n: 8 },
      { q: "q2", r: "SD", n: 2 },
      { q: "q2", r: "D", n: 3 },
      { q: "q2", r: "N", n: 6 },
      { q: "q2", r: "A", n: 20 },
      { q: "q2", r: "SA", n: 25 },
    ];
    const levels = {
      schema: { r: Unit({ domain: Domain.discrete(LEVELS5) }) },
    };
    const rows = async (spreadOpts: object, data = likert, options = {}) =>
      partsOf(
        await chart(data, { axes: false, legend: false, ...options })
          .flow(
            spread({ by: "q", dir: "y" }),
            spread({ by: "r", dir: "x", spacing: 3, ...spreadOpts })
          )
          .mark(rect({ w: "n", h: 10 }))
          .toDisplayList({ w: 300, h: 200 })
      );
    // The parts of each row, from left to right.
    const byRow = (bs: Box[]) => {
      const ys = [...new Set(bs.map((b) => b.y))].sort((a, b) => a - b);
      return ys.map((y) =>
        bs.filter((b) => b.y === y).sort((a, b) => a.x - b.x)
      );
    };
    const gapsOf = (row: Box[]) =>
      row.slice(1).map((b, i) => b.x - (row[i].x + row[i].w));
    const middleOf = (b: Box) => b.x + b.w / 2;
    const at = byRow(await rows({ baseline: Baseline.at("N", 0.5) }));
    check(
      'Baseline.at("N", 0.5): every row\'s N is centered on one x',
      near(middleOf(at[0][2]), middleOf(at[1][2])),
      JSON.stringify(at)
    );
    check(
      "the gaps stay 3 px",
      at.every((row) => gapsOf(row).every((g) => near(g, 3))),
      JSON.stringify(at.map(gapsOf))
    );
    const span = (row: Box[]) => [row[0].x, row.at(-1)!.x + row.at(-1)!.w];
    const middled = byRow(await rows({ baseline: Baseline.middle() }));
    check(
      "Baseline.middle(): the rows, gaps included, share a middle",
      near(
        (span(middled[0])[0] + span(middled[0])[1]) / 2,
        (span(middled[1])[0] + span(middled[1])[1]) / 2
      ),
      JSON.stringify(middled.map(span))
    );
    const ended = byRow(await rows({ baseline: Baseline.end() }));
    check(
      "Baseline.end(): the rows end at one x",
      near(span(ended[0])[1], span(ended[1])[1]),
      JSON.stringify(ended.map(span))
    );
    const started = await rows({ baseline: Baseline.start() });
    const plain = await rows({});
    check(
      "Baseline.start() puts the 0 where a spread with no baseline has it",
      JSON.stringify(started) === JSON.stringify(plain),
      JSON.stringify({ started, plain })
    );

    // q2 has no N: the 0 falls where N would be, at the start of its A.
    const withoutN = likert.filter((d) => !(d.q === "q2" && d.r === "N"));
    const lacking = byRow(
      await rows({ baseline: Baseline.at("N", 0.5) }, withoutN, levels)
    );
    check(
      "a missing part is placed by the declared order and moves nothing",
      near(lacking[1][2].x, middleOf(lacking[0][2])),
      JSON.stringify(lacking)
    );
    const unordered = await errorOf(() =>
      rows({ baseline: Baseline.at("N", 0.5) }, withoutN)
    );
    check(
      "a missing part with no declared order is an error naming the fix",
      unordered !== undefined &&
        unordered.startsWith("spread") &&
        unordered.includes("Domain.discrete"),
      unordered
    );
    const wiggle = await errorOf(() => rows({ baseline: Baseline.wiggle() }));
    check(
      "Baseline.wiggle() on a spread is an error that names stack",
      wiggle !== undefined &&
        wiggle.includes("glued") &&
        wiggle.includes("stack({ baseline: Baseline.wiggle() })"),
      wiggle
    );

    // Reversed, the rows lay SA first, and N's middle still lines up.
    const reversed = byRow(
      await rows({ reverse: true, baseline: Baseline.at("N", 0.5) })
    );
    check(
      "a reversed spread lines its rows up on the same part",
      near(middleOf(reversed[0][2]), middleOf(reversed[1][2])) &&
        near(reversed[0][0].w * 4, reversed[0][4].w * 8),
      JSON.stringify(reversed)
    );
    // A fixed pitch between the parts' middles: the baseline is still a
    // point on N.
    const pitched = byRow(
      await rows({
        spacing: 60,
        anchor: "middle",
        baseline: Baseline.at("N", "middle"),
      })
    );
    check(
      'with a pitch (anchor: "middle"), the rows line up on N\'s middle',
      near(middleOf(pitched[0][2]), middleOf(pitched[1][2])),
      JSON.stringify(pitched)
    );
  }

  console.log("\n# alignment is a shorthand for a shared baseline");
  {
    // Each row sets its own 0 and the parent keeps its default, "baseline":
    // the same picture as the parent's `alignment`.
    const bars = [
      ["a", [30, 10, 20]],
      ["b", [10, 50]],
      ["c", [25, 25, 25, 5]],
    ].flatMap(([row, ws]) =>
      (ws as number[]).map((w, i) => ({ row, part: `p${i}`, w }))
    );
    const draw = (parent: object, child: object) =>
      chart(bars, { legend: false, w: 300, h: 110 })
        .flow(
          spread({ by: "row", dir: "y", spacing: 6, ...parent }),
          spread({ by: "part", dir: "x", spacing: 4, ...child })
        )
        .mark(rect({ w: "w", fill: "part" }))
        .toDisplayList();
    for (const word of ["start", "middle", "end"] as const) {
      const aligned = partsOf(await draw({ alignment: word }, {}), false);
      const based = partsOf(
        await draw({}, { baseline: Baseline[word]() }),
        false
      );
      check(
        `alignment: "${word}" draws what Baseline.${word}() on each row does`,
        JSON.stringify(aligned) === JSON.stringify(based),
        JSON.stringify({ aligned, based })
      );
    }
  }

  console.log("\n# a spread nested in a spread");
  {
    // A row is a label and a spread of bars. The row's 0 is the bars' own
    // 0 (`"baseline"`), which is the middle of their second bar, so the
    // parent lines the rows up there whatever the labels' widths.
    const row = (label: number, widths: number[]) =>
      spread({ dir: "x", spacing: 6, baseline: Baseline.at(1, "baseline") }, [
        rect({ w: label, h: 10 }),
        spread(
          { dir: "x", spacing: 3, baseline: Baseline.at(1, 0.5) },
          widths.map((w) => rect({ w: v(w), h: 10 }))
        ),
      ]);
    const rs = partsOf(
      await spread({ dir: "y" }, [
        row(30, [10, 20, 30]),
        row(60, [40, 10, 5]),
      ]).toDisplayList({ w: 300, h: 100 }),
      false
    );
    const [label1, first1, mid1, , label2, first2, mid2] = rs;
    check(
      "the rows line up on the inner spreads' own 0",
      near(mid1.x + mid1.w / 2, mid2.x + mid2.w / 2),
      JSON.stringify(rs)
    );
    check(
      "each label sits 6 px before its bars",
      near(first1.x - (label1.x + label1.w), 6) &&
        near(first2.x - (label2.x + label2.w), 6),
      JSON.stringify(rs)
    );
    const outOfRange = await errorOf(() =>
      spread({ dir: "x", baseline: Baseline.at(3, 0.5) }, [
        rect({ w: 10, h: 10 }),
      ]).toDisplayList({ w: 100, h: 100 })
    );
    check(
      "in the combinator form a part past the last child is an error",
      outOfRange !== undefined && outOfRange.includes("child index"),
      outOfRange
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * `planSharing` (constraints/compose.ts, #1114 step 3): a layer's per-axis
 * sharing sets, read from its constraints and children. One check per row of
 * the table "What each construct contributes" in
 * apps/docs/docs/internals/design/measure-keyed-domains.md, section 3, plus
 * the marginal histogram, a spread of charts and a stack.
 *
 * A real node's plan comes from its own sharing rule (`GoFishNode.sharing()`).
 * A data-valued `w`/`h`, `treemap` and the `position` operator are node-level
 * rules, not constraints.
 *
 * Run: `tsx src/tests/sharing.test.ts` (wired as `pnpm test:sharing`).
 */
import { planSharing, type SharingPlan } from "../ast/constraints/compose";
import { Constraint, type ConstraintSpec } from "../ast/constraints";
import { createGridConstraint } from "../ast/constraints/grid";
import { value as v } from "../ast/data";
import { BASE_AXIS_SCOPE } from "../ast/dims";
import type { GoFishAST } from "../ast/_ast";
import { Spread } from "../ast/graphicalOperators/spread";
import { layer } from "../ast/graphicalOperators/layer";
import { offset } from "../ast/graphicalOperators/offset";
import { enclose } from "../ast/graphicalOperators/enclose";
import { Frame } from "../ast/graphicalOperators/frame";
import { positionNode } from "../ast/graphicalOperators/positionNode";
import { Rect as rect } from "../ast/shapes/rect";
import { ref } from "../ast/shapes/ref";
import { polar } from "../ast/coordinateTransforms/polar";
import { scatter, group, treemap, rect as rectMark } from "../lib";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Children that carry only a constraint name, as in constraintConfluence. */
const kids = (...names: string[]) =>
  names.map((name) => ({ _name: name, key: name })) as unknown as GoFishAST[];
const r = (name: string) => ({ name });

/** The plan in a form that is easy to compare: per axis, each child's set
 *  index, and the sorted nested indices. */
const show = (p: SharingPlan) =>
  JSON.stringify({
    x: p.sets[0],
    y: p.sets[1],
    nx: [...p.nested[0]].sort(),
    ny: [...p.nested[1]].sort(),
  });
const expect = (
  name: string,
  plan: SharingPlan,
  want: { x: number[]; y: number[]; nx?: number[]; ny?: number[] }
) => {
  const w = JSON.stringify({
    x: want.x,
    y: want.y,
    nx: want.nx ?? [],
    ny: want.ny ?? [],
  });
  const got = show(plan);
  check(name, got === w, `want ${w}, got ${got}`);
};

/** The plan of a real node, after its axis-scope elaboration (where spread
 *  and scatter install their constraints). */
async function planOf(node: any): Promise<SharingPlan> {
  node = await node;
  await node._elaborateInAxisScope?.(BASE_AXIS_SCOPE, BASE_AXIS_SCOPE);
  return node.sharing();
}

async function main() {
  console.log("# planSharing: one check per row of the table");

  expect(
    "layer with no constraints: all share both axes",
    planSharing([], kids("a", "b", "c")),
    {
      x: [0, 0, 0],
      y: [0, 0, 0],
    }
  );

  expect(
    "position, literal pixel point: detaches the child on that axis",
    planSharing([Constraint.position({ y: 120 }, [r("b")])], kids("a", "b")),
    { x: [0, 0], y: [0, 1], ny: [] }
  );
  // A pixel interval is a literal position too. `datumPlacedChildren` already
  // sets its child aside from the layer's union, so it is also nested.
  expect(
    "position, literal pixel interval: detaches the child",
    planSharing(
      [Constraint.position({ x: [0, 50] }, [r("b")])],
      kids("a", "b")
    ),
    { x: [0, 1], y: [0, 0], nx: [1] }
  );

  expect(
    "position, datum point: stays in the own set, nested at the datum",
    planSharing([Constraint.position({ x: v(3) }, [r("b")])], kids("a", "b")),
    { x: [0, 0], y: [0, 0], nx: [1] }
  );
  expect(
    "position, datum interval: stays in the own set, nested",
    planSharing(
      [Constraint.position({ y: [v(0), v(10)] }, [r("a")])],
      kids("a", "b")
    ),
    { x: [0, 0], y: [0, 0], ny: [0] }
  );

  expect(
    "align, point anchor: joins the listed children (beats a position)",
    planSharing(
      [
        Constraint.position({ x: 0, y: 0 }, [r("a")]),
        Constraint.position({ x: 300 }, [r("b")]),
        Constraint.align({ x: "baseline" }, [r("a"), r("b")]),
      ],
      kids("a", "b", "c")
    ),
    // x: a and b are detached, then joined to each other, not to c.
    { x: [1, 1, 0], y: [1, 0, 0] }
  );
  expect(
    'align, "span" and "size": contribute nothing',
    planSharing(
      [
        Constraint.position({ x: 300, y: 300 }, [r("b")]),
        Constraint.align({ x: "span", y: "size" }, [r("a"), r("b")]),
      ],
      kids("a", "b")
    ),
    { x: [0, 1], y: [0, 1] }
  );

  expect(
    "distribute, glue (stack): joins the parts",
    planSharing(
      [
        Constraint.position({ y: 10 }, [r("a")]),
        Constraint.position({ y: 20 }, [r("b")]),
        Constraint.distribute({ dir: "y", glue: true }, [r("a"), r("b")]),
      ],
      kids("a", "b", "c")
    ),
    { x: [0, 0, 0], y: [1, 1, 0] }
  );

  expect(
    "distribute, no glue (spread): detaches and nests each part",
    planSharing(
      [Constraint.distribute({ dir: "x" }, [r("a"), r("b"), r("c")])],
      kids("a", "b", "c")
    ),
    { x: [1, 2, 3], y: [0, 0, 0], nx: [0, 1, 2] }
  );

  expect(
    "nest: outer and inner share the axes it names",
    planSharing(
      [
        Constraint.position({ x: 5, y: 5 }, [r("inner")]),
        Constraint.nest({ x: 4 }, [r("outer"), r("inner")]),
      ],
      kids("outer", "inner")
    ),
    { x: [0, 0], y: [0, 1] }
  );

  expect(
    "grid (table): both axes act as spread directions",
    planSharing(
      [createGridConstraint({ numCols: 2 }, [r("a"), r("b"), r("c"), r("d")])],
      kids("a", "b", "c", "d")
    ),
    {
      x: [1, 2, 3, 4],
      y: [1, 2, 3, 4],
      nx: [0, 1, 2, 3],
      ny: [0, 1, 2, 3],
    }
  );

  expect(
    "z-order and overlap: nothing",
    planSharing(
      [
        Constraint.zAbove(r("a"), r("b")),
        Constraint.zBelow(r("b"), r("a")),
        {
          type: "overlap",
          axis: "y",
          alignment: "middle",
          strategy: {},
          children: [r("a"), r("b")],
        } as unknown as ConstraintSpec,
      ],
      kids("a", "b")
    ),
    { x: [0, 0], y: [0, 0] }
  );

  const bar = (h: number) => (rect as any)({ w: 10, h: v(h) });
  expect(
    "spread: elaborates to align on the cross axis and distribute along it",
    await planOf((Spread as any)({ dir: "x" }, [bar(3), bar(5), bar(4)])),
    { x: [1, 2, 3], y: [0, 0, 0], nx: [0, 1, 2] }
  );
  expect(
    "stack: elaborates to align and a glued distribute, so all share",
    await planOf(
      (Spread as any)({ dir: "y", glue: true }, [bar(3), bar(5), bar(4)])
    ),
    { x: [0, 0, 0], y: [0, 0, 0] }
  );

  const rows = [
    { a: 1, b: 2, c: "p" },
    { a: 3, b: 5, c: "q" },
    { a: 4, b: 1, c: "r" },
  ];
  const scatterMark = await (scatter as any)({ by: "c", x: "a", y: "b" })(
    rectMark({ w: 4, h: 4 })
  );
  expect(
    "scatter: elaborates to datum positions, so all share and are nested",
    await planOf(scatterMark(rows)),
    { x: [0, 0, 0], y: [0, 0, 0], nx: [0, 1, 2], ny: [0, 1, 2] }
  );
  const groupMark = await (group as any)({ by: "c" })(rectMark({ w: 4, h: 4 }));
  expect(
    "group: elaborates to a plain layer, so all share",
    await planOf(groupMark(rows)),
    { x: [0, 0, 0], y: [0, 0, 0] }
  );

  expect(
    "a literal w/h on a node: nothing",
    await planOf(
      (layer as any)([
        (rect as any)({ w: 40, h: 30 }),
        (layer as any)({ w: 100, h: 80 }, [(rect as any)({ w: 10, h: 10 })]),
      ])
    ),
    { x: [0, 0], y: [0, 0] }
  );

  // stack({ size }) wraps each part in a layer with a data-valued size
  // (spread.tsx), as the nested mosaic does.
  const share = (k: number) =>
    (layer as any)({ h: v(k) }, [(rect as any)({ w: 10, h: v(1) })]);
  expect(
    "a data-valued w/h on a node: nests its content on that axis",
    await planOf(share(0.4)),
    { x: [0], y: [0], ny: [0] }
  );
  {
    const wrapped: any = await (Spread as any)(
      { dir: "y", glue: true, size: [v(0.4), v(0.6)] },
      [(rect as any)({ w: 10 }), (rect as any)({ w: 10 })]
    );
    // The wrapper's size is an axis-named `dims` entry, which the
    // resolveAliases pass installs.
    expect(
      "stack({ size }): each wrapper nests its part on the stack axis",
      await planOf(wrapped.children[0]),
      { x: [0], y: [0], ny: [0] }
    );
  }

  expect(
    "treemap: nests each child on both axes",
    await planOf(
      (await (treemap as any)({ by: "c", w: 200, h: 100 })(rectMark({})))([
        { c: "p" },
        { c: "q" },
        { c: "r" },
      ])
    ),
    { x: [1, 2, 3], y: [1, 2, 3], nx: [0, 1, 2], ny: [0, 1, 2] }
  );

  const box = () => (rect as any)({ w: 10, h: v(2) });
  expect(
    "position operator, datum offset: the child stays shared",
    await planOf(positionNode({ x: v(5), y: v(1) }, [box()])),
    { x: [0], y: [0] }
  );
  expect(
    "position operator, pixel offset: detaches the child on that axis",
    await planOf(positionNode({ x: 20, y: v(1) }, [box()])),
    { x: [1], y: [0] }
  );

  expect(
    "offset: nothing, its child shares",
    await planOf((offset as any)({ x: 12 }, [(rect as any)({ w: 10, h: 10 })])),
    { x: [0], y: [0] }
  );

  expect(
    "ref: the target takes part where the ref sits",
    await planOf(
      (layer as any)([
        (rect as any)({ w: 10, h: v(4) }).name("target"),
        ref("target"),
      ])
    ),
    { x: [0, 0], y: [0, 0] }
  );

  {
    const node: any = await (layer as any)([
      (rect as any)({ w: 10, h: 10 }).name("a"),
      (rect as any)({ w: 10, h: 10 }).name("b"),
    ]).relate(({ a, b }: any) => [enclose({}, [a, b])]);
    expect(
      "relate drawing clauses: nothing",
      planSharing(node.constraints, node.children),
      { x: [0, 0, 0], y: [0, 0, 0] }
    );
  }

  expect(
    "enclose (and the Porter-Duff operators): like a layer",
    await planOf(
      (enclose as any)({}, [
        (rect as any)({ w: 10, h: v(3) }),
        (rect as any)({ w: 10, h: v(5) }),
      ])
    ),
    { x: [0, 0], y: [0, 0] }
  );

  // A space root reports nothing upward (its type hook), so its place in its
  // parent's sets carries no data. Keyed domains are per space root (step 5);
  // the plan adds nothing for it.
  const flower = () =>
    (Frame as any)({ coord: polar(), w: 40, h: 40 }, [
      (rect as any)({ w: v(1), h: 10 }),
    ]);
  expect(
    "coord, frame({ coord }): the plan adds nothing",
    await planOf((layer as any)([flower(), flower()])),
    { x: [0, 0], y: [0, 0] }
  );

  expect(
    "chart(): a frame with one child, nothing",
    await planOf(
      (Frame as any)({ w: 200, h: 100 }, [(rect as any)({ w: 10, h: v(3) })])
    ),
    { x: [0], y: [0] }
  );
  // The render root solves σ for its canvas (step 5). Its plan is the plan of
  // the layer it is.
  expect(
    "render root: a layer like any other",
    await planOf((layer as any)([bar(1), bar(2)])),
    { x: [0, 0], y: [0, 0] }
  );

  console.log("# planSharing: whole figures");

  // stories/seaborn/MarginalHistogram.stories.tsx:74-80.
  expect(
    "marginal histogram: x shared through align, y detached by position",
    planSharing(
      [
        Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [r("scatter")]),
        Constraint.align({ x: "baseline" }, [r("scatter"), r("topHist")]),
        Constraint.align({ y: "baseline" }, [r("scatter"), r("rightHist")]),
        Constraint.position({ y: 400 + 10, anchor: "start" }, [r("topHist")]),
        Constraint.position({ x: 400 + 10, anchor: "start" }, [r("rightHist")]),
      ],
      kids("scatter", "topHist", "rightHist")
    ),
    // x: own{scatter, topHist}, rightHist detached.
    // y: own{scatter, rightHist}, topHist detached.
    { x: [0, 0, 1], y: [0, 1, 0] }
  );

  const panel = () =>
    (layer as any)({ w: 100, h: 100 }, [(rect as any)({ w: 4, h: v(2) })]);
  expect(
    "a spread of charts: panels share the cross axis, nested along it",
    await planOf((Spread as any)({ dir: "x" }, [panel(), panel(), panel()])),
    { x: [1, 2, 3], y: [0, 0, 0], nx: [0, 1, 2] }
  );

  expect(
    "a stack of charts: the parts share both axes",
    await planOf((Spread as any)({ dir: "y", glue: true }, [panel(), panel()])),
    { x: [0, 0], y: [0, 0] }
  );

  expect(
    "a child that is not a direct child takes no part",
    planSharing([Constraint.position({ x: 5 }, [r("elsewhere")])], kids("a")),
    { x: [0], y: [0] }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

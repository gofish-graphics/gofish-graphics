/**
 * `scheduleRelate` (constraints/relate.ts): the order in which a layer lays
 * out its `.relate()` drawing clauses around its constraint solve. These
 * tests pin the tie-breaking: of the steps that are ready, the one declared
 * first goes first (the solve counts as declared before every clause), even
 * when it became ready after a later-declared one.
 *
 * Run: `tsx src/tests/relateSchedule.test.ts` (wired as
 * `pnpm test:relate-schedule`).
 */
import { layer } from "../ast/graphicalOperators/layer";
import { Rect as rect } from "../ast/shapes/rect";
import { ref } from "../ast/shapes/ref";
import { chart, enclose, layer as layerMark, rect as rectMark } from "../lib";
import { LayerContext, resolveMarkResult } from "../ast/marks/markResult";
import {
  Constraint,
  SlotOperand,
  relateEnv,
  scheduleRelate,
} from "../ast/constraints";
import { resolveReferences, resolution } from "../ast/_ref";
import { wrapRing } from "../ast/elaborationUtils";
import { createName } from "../ast/createName";

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

const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

async function schedule(node: any) {
  node = await node;
  resolveReferences(node);
  return {
    node,
    order: scheduleRelate(node, resolution(node).operands),
  };
}

console.log("# scheduleRelate: ties go to the step declared first");
{
  // Children: a (0), b (1), then clauses 1-4 at indices 2-5.
  //   clause 1 (2) reads clause 3      -> after 4
  //   clause 2 (3) reads a             -> after the solve
  //   clause 3 (4) reads nothing       -> no dependency
  //   clause 4 (5) reads b             -> after the solve
  // Ready at the start: the solve and 4; the solve goes first. Then 3, 4, 5
  // are ready: 3, then 4, which makes 2 ready. 2 was declared before 5, so it
  // goes next even though 5 has been ready longer.
  const { order } = await schedule(
    (layer as any)([
      (rect as any)({ w: 10, h: 10 }).name("a"),
      (rect as any)({ w: 10, h: 10 }).name("b"),
    ]).relate(({ a, b }: any) => [
      enclose({}, [ref("c3")]),
      enclose({}, [a]),
      enclose({}, [(rect as any)({ w: 4, h: 4 })]).name("c3"),
      enclose({}, [b]),
    ])
  );
  check(
    "a clause that becomes ready later still runs in declaration order",
    same(order.beforeSolve, []) && same(order.afterSolve, [3, 4, 2, 5]),
    JSON.stringify({ ...order, clauses: [...order.clauses] })
  );
  check(
    "the clause indices are reported",
    same([...order.clauses], [2, 3, 4, 5])
  );
}

{
  // A clause holding a constraint operand runs before the solve; a clause
  // that reads it runs after it, and one that reads a plain child after the
  // solve.
  //   clause 1 (1) reads a      -> after the solve
  //   clause 2 (2) holds "box"  -> before the solve
  //   clause 3 (3) reads box    -> after 2
  // Ready at the start: 2 only (the solve waits on it). Then the solve and 3
  // are ready: the solve goes first, then 1 (declared before 3), then 3.
  const { order } = await schedule(
    (layer as any)([(rect as any)({ w: 10, h: 10 }).name("a")]).relate(
      // A macro's handle on the second clause's slot (a user's operand
      // names only nodes the layer held when the call ran).
      ({ a }: any, layer: any) => {
        const slot = layer.children.length + 1;
        const box = new SlotOperand(layer, slot);
        return [
          enclose({}, [a]),
          enclose({}, [(rect as any)({ w: 4, h: 4 })]).name("box"),
          enclose({}, [ref("box")]),
          Constraint.align({ x: "middle" }, [box as any, a]),
        ];
      }
    )
  );
  check(
    "the solve waits on a clause that holds a constraint operand",
    same(order.beforeSolve, [2]) && same(order.afterSolve, [1, 3]),
    JSON.stringify({ ...order, clauses: [...order.clauses] })
  );
}

console.log("# resolution: one stamp over the children and the constraints");
{
  const { node } = await schedule(
    (layer as any)([(rect as any)({ w: 10, h: 10 }).name("a")]).relate(
      ({ a }: any) => [enclose({}, [a])]
    )
  );
  const stored = resolution(node).schedule;
  check(
    "resolveReferences keeps the schedule with the operands",
    stored !== undefined && same([...stored.clauses], [1])
  );
  check(
    "a node that has not changed reads the same resolution",
    resolution(node).schedule === stored
  );
  // A pass that wraps a child (elaboration) replaces it in its slot: the
  // resolution is stale until the next round, and reading it throws.
  const wrapped = await (layer as any)([node.children[1]]);
  node.children = [node.children[0], wrapped];
  wrapped.parent = node;
  let threw = false;
  try {
    resolution(node);
  } catch {
    threw = true;
  }
  check("a child replaced in its slot makes the resolution stale", threw);
  resolveReferences(node);
  const fresh = resolution(node).schedule;
  check(
    "the next round gives a fresh schedule, still a clause",
    fresh !== stored && same([...fresh.clauses], [1]),
    JSON.stringify([...fresh.clauses])
  );
}

{
  // A ring is its content: a `.relate()` call binds the content's name to
  // the content, and the ring's own shapes (here a named one) are invisible.
  const bar: any = (rect as any)({ w: 10, h: 10 }).name("bar");
  const tick: any = (rect as any)({ w: 1, h: 4 }).name("tick");
  const ring: any = await wrapRing(await bar, {
    nodes: [await tick],
    constraints: () => [],
  });
  const outer: any = await (layer as any)([
    ring,
    (rect as any)({ w: 10, h: 10 }).name("dot"),
  ]);
  const env = relateEnv(outer);
  const names = Object.keys(env).sort();
  check(
    "a ring's shapes are invisible to a .relate() binding",
    JSON.stringify(names) === JSON.stringify(["bar", "dot"]),
    JSON.stringify(names)
  );
  check(
    "a name in a ring's content binds the content, not the ring",
    env.bar.means()[0] === (await bar),
    String(env.bar.means()[0]?.type)
  );
}

{
  // A ring is its content in a positional path too: ref([row, 0]) is the
  // node in slot 0, not the ring an elaboration pass put in its place.
  const row = createName("row");
  const bar: any = await (rect as any)({ w: 10, h: 10 });
  const ring: any = await wrapRing(bar, {
    nodes: [await (rect as any)({ w: 1, h: 4 })],
    constraints: () => [],
  });
  const at: any = ref([row, 0]);
  const outer: any = await (layer as any)([
    (layer as any)([ring]).name(row),
    at,
  ]);
  outer.setRenderSession({ tokenContext: new Map() });
  resolveReferences(outer);
  check(
    "a positional path into a labeled node gives the content",
    at.targetNode === bar,
    String(at.targetNode?.type)
  );
}

{
  // A user's operand names only nodes the layer held when the call ran; a
  // pass's handle may hold a clause slot (here the first drawing clause's),
  // so this is how a constraint comes to move a clause.
  let message = "";
  try {
    await schedule(
      (layer as any)([
        (rect as any)({ w: 10, h: 10 }).name("a"),
        (rect as any)({ w: 10, h: 10 }).name("b"),
      ]).relate(({ a, b }: any, at: any) => [
        Constraint.align({ x: "middle" }, [
          a,
          new SlotOperand(at, at.children.length),
        ]),
        enclose({ padding: 4 }, [b]).name("box"),
      ])
    );
  } catch (e: any) {
    message = String(e?.message);
  }
  check(
    "a constraint that moves a clause which reads its operands is a cycle",
    /form a cycle.*the layer's constraints \(Constraint\.align\), clause 2 \(enclose named "box"\)/.test(
      message
    ),
    message
  );
}

console.log("# .relate(): a replaced or failed call leaves nothing behind");
{
  // A layer built by the combinator resolves its clauses in a registry
  // nested in its own, so a name a clause registers (a named chart) is
  // visible from outside.
  const root = new LayerContext();
  const node: any = await resolveMarkResult(
    layerMark([rectMark({ w: 10, h: 10 }).name("base")]) as any,
    root
  );
  const hiChart = () =>
    chart([{ a: 1 }])
      .mark(rectMark({ w: 5, h: 5 }))
      .name("hi");
  const clause = () => [hiChart()];
  await node.relate(clause);
  await node.relate(clause);
  const hi = root.lookup("hi")?.nodes ?? [];
  check(
    "a clause a later call replaced is gone from the names",
    hi.length === 1 && hi[0] === node.children[1],
    String(hi.length)
  );

  const children = node.children;
  const clauses = [...node._relateClauses];
  const constraints = node.constraints;
  let message = "";
  try {
    await node.relate(({ base }: any) => [
      Constraint.align({ x: "middle" }, [base]),
      hiChart(),
      async () => {
        throw new Error("boom");
      },
    ]);
  } catch (e: any) {
    message = String(e?.message);
  }
  const after = root.lookup("hi")?.nodes ?? [];
  check(
    "a call whose clause throws leaves the layer as it was",
    message === "boom" &&
      node.children === children &&
      JSON.stringify([...node._relateClauses]) === JSON.stringify(clauses) &&
      node.constraints === constraints &&
      after.length === 1 &&
      after[0] === hi[0],
    JSON.stringify({ message, n: node.children.length, hi: after.length })
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

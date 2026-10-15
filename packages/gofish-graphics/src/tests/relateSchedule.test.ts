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
import { enclose } from "../ast/graphicalOperators/enclose";
import {
  Constraint,
  resolveConstraintOperands,
  scheduleRelate,
  relateScheduleForLayout,
} from "../ast/constraints";

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
  node.resolveNames();
  return { node, order: scheduleRelate(node, resolveConstraintOperands(node)) };
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
      ({ a }: any) => [
        enclose({}, [a]),
        enclose({}, [(rect as any)({ w: 4, h: 4 })]).name("box"),
        enclose({}, [ref("box")]),
        Constraint.align({ x: "middle" }, [{ name: "box" } as any, a]),
      ]
    )
  );
  check(
    "the solve waits on a clause that holds a constraint operand",
    same(order.beforeSolve, [2]) && same(order.afterSolve, [1, 3]),
    JSON.stringify({ ...order, clauses: [...order.clauses] })
  );
}

console.log("# relateScheduleForLayout: reuse the resolve-pass schedule");
{
  const { node } = await schedule(
    (layer as any)([(rect as any)({ w: 10, h: 10 }).name("a")]).relate(
      ({ a }: any) => [enclose({}, [a])]
    )
  );
  const operands = resolveConstraintOperands(node);
  node.resolveNames();
  const stored = node._relateSchedule?.schedule;
  check(
    "resolveNames stores the schedule and layout reuses it",
    stored !== undefined && relateScheduleForLayout(node, operands) === stored
  );
  node.children = [...node.children];
  check(
    "an unchanged list of children still reuses it",
    relateScheduleForLayout(node, operands) === stored
  );
  node.children = [node.children[1], node.children[0]];
  const fresh = relateScheduleForLayout(node, operands);
  check(
    "changed children get a fresh schedule",
    fresh !== stored && same([...fresh.clauses], [0]),
    JSON.stringify([...fresh.clauses])
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

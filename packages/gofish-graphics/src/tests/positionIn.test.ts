/**
 * A `position` that reads its datums in another node's frame (`in`, #1257):
 * a tick beside a plot sits on the plot's scale, whether the plot is in the
 * tick's scope, sized on its own, or reads y the other way, and the claim
 * walk leaves it room where layout puts it. Run:
 * `tsx src/tests/positionIn.test.ts` (wired into `pnpm test` as
 * `test:position-in`).
 */
// The library first, so its modules initialize in their usual order.
import { datum } from "../lib";
import { runLayout } from "../ast/gofish";
import { lowerToDisplayList } from "../ast/displayList/lower";
import { GoFishNode } from "../ast/_node";
import { Rect } from "../ast/shapes/rect";
import { layer } from "../ast/graphicalOperators/layer";
import { Constraint } from "../ast/constraints";
import { NodeOperand, SlotOperand } from "../ast/constraints/shared";
import { check, items, report } from "./testHelpers";

const close = (a: number | undefined, b: number | undefined, eps = 1e-6) =>
  a !== undefined && b !== undefined && Math.abs(a - b) <= eps;

/** Two marks at data 10 and 50 on `axis`, in a layer (sized `size`). */
const plotOf = async (
  axis: "x" | "y",
  size?: { w?: number; h?: number }
): Promise<GoFishNode> => {
  const mark = (v: number) =>
    (Rect as any)(
      axis === "x" ? { x: datum(v), w: 4, h: 4 } : { y: datum(v), w: 4, h: 4 }
    );
  return (await (layer as any)(size ?? {}, [mark(10), mark(50)])) as GoFishNode;
};

/** A layer of `plot` and a tick at data `v` in `plot`'s frame. */
const withTick = async (
  plot: GoFishNode,
  axis: "x" | "y",
  v: number
): Promise<GoFishNode> => {
  const tick = (Rect as any)(axis === "x" ? { w: 2, h: 6 } : { w: 6, h: 2 });
  const node = (await (layer as any)([plot, tick])) as GoFishNode;
  await node.INTERNAL_relate([
    Constraint.position(
      { [axis]: datum(v), in: new NodeOperand(plot) } as any,
      [new SlotOperand(node, 1)]
    ),
  ]);
  return node;
};

async function main() {
  for (const [label, axis, size] of [
    ["a plot in the tick's scope", "x", undefined],
    ["a plot with a size of its own", "x", { w: 200, h: 50 }],
    ["a plot sized on y, read upward", "y", { w: 50, h: 200 }],
  ] as const) {
    console.log(`\n# ${label}`);
    const plot = await plotOf(axis, size);
    const node = await withTick(plot, axis, 30);
    const data = await runLayout({}, node);
    const [a, b, tick] = items({
      items: lowerToDisplayList(data.child),
    }).filter((i) => i.kind === "rect");
    // A mark's start edge is its datum: its left, or its bottom read upward.
    const at = (r: any) => (axis === "x" ? r.x : r.y + r.h);
    const mid = (r: any) => (axis === "x" ? r.x + r.w / 2 : r.y + r.h / 2);
    check(
      "the tick sits at data 30, midway between the marks at 10 and 50",
      close(mid(tick), (at(a) + at(b)) / 2),
      [at(a), at(b), mid(tick)]
    );
  }

  console.log("\n# the claim holds a tick past a sized plot's end");
  {
    // The plot maps [10, 50] into 200 px, so data 90 is far past its end.
    const plot = await plotOf("x", { w: 200, h: 50 });
    const node = await withTick(plot, "x", 90);
    const data = await runLayout({}, node);
    const [, , tick] = items({ items: lowerToDisplayList(data.child) }).filter(
      (i) => i.kind === "rect"
    );
    check(
      "the graphic is wide enough to hold the tick",
      data.width >= tick.x! + tick.w! - 1e-6 && tick.x! > 200,
      [data.width, tick.x, tick.w]
    );
  }
  report();
}

main();

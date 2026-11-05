/**
 * A `position` that reads its datums in another node's frame (`in`, #1257):
 * a tick beside a plot sits on the plot's scale, whether the plot is in the
 * tick's scope, sized on its own, or reads y the other way, and the claim
 * walk leaves it room where layout puts it. Run:
 * `tsx src/tests/positionIn.test.ts` (wired into `pnpm test` as
 * `test:position-in`).
 */
// The library first, so its modules initialize in their usual order.
import { datum, chart, scatter, circle } from "../lib";
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
  console.log("\n# a frame read through a child the solve places is ink");
  {
    // A chain places the plot, so its origin is known only after the
    // solve, and a datum read through its frame cannot be pinned before
    // it. The tick is ink on x then, as a tick in a frame the claim walk
    // cannot read is: it takes no room, in the claim or in the box.
    const plot = await plotOf("x", { w: 200, h: 50 });
    const spacer = (Rect as any)({ w: 50, h: 4 });
    const tick = (Rect as any)({ w: 2, h: 6 });
    const node = (await (layer as any)([spacer, plot, tick])) as GoFishNode;
    await node.INTERNAL_relate([
      Constraint.distribute({ dir: "x", spacing: 30 } as any, [
        new SlotOperand(node, 0),
        new SlotOperand(node, 1),
      ]),
      Constraint.position({ x: datum(90), in: new NodeOperand(plot) } as any, [
        new SlotOperand(node, 2),
      ]),
    ]);
    const data = await runLayout({}, node);
    check(
      "the tick is ink on x",
      data.child.claimWalk?.ink[0].has(2) === true,
      [...(data.child.claimWalk?.ink[0] ?? [])]
    );
  }
  console.log("\n# a time axis's ticks read epoch ms, so Date rows place");
  {
    // A column of Dates is a time column, whose values are epoch ms by the
    // time anything places them (`applySchema`): a tick's datum is a
    // number, never a Date.
    const day = (d: number) => new Date(Date.UTC(2024, 0, d));
    let threw: unknown;
    let ticks = 0;
    try {
      const dl = await chart(
        [
          { t: day(1), v: 1 },
          { t: day(20), v: 3 },
        ],
        { w: 200, h: 100 }
      )
        .flow(scatter({ x: "t", y: "v" }))
        .mark(circle({ r: 3 }))
        .toDisplayList();
      ticks = items(dl as any).filter((i) => i.kind === "text").length;
    } catch (e) {
      threw = String(e);
    }
    check(
      "the chart renders, its axes labeled",
      threw === undefined && ticks > 2,
      threw ?? ticks
    );
  }

  console.log("\n# a datum the frame cannot place is an error");
  {
    // A string has no place on a continuous axis: the frame maps numbers.
    const plot = await plotOf("x");
    const node = await withTick(plot, "x", "late" as any);
    let threw = "";
    try {
      await runLayout({}, node);
    } catch (e) {
      threw = String(e);
    }
    check(
      "the tick's datum is reported",
      threw.includes("the value late") && threw.includes("no position scale"),
      threw
    );
  }

  report();
}

main();

/**
 * The claim walk and the layout agree (#493, #1032): what a node claims is
 * where the layout puts it, and a slot its fixed parts overfill is drawn as
 * the `fixed-overflow` warning says. Run: `tsx src/tests/claimLayout.test.ts`
 * (wired into `pnpm test` as `test:claim-layout`).
 */
// The library first, so its modules initialize in their usual order.
import { chart, spread, rect } from "../lib";
import { runLayout } from "../ast/gofish";
import { GoFishNode } from "../ast/_node";
import { check, items, report } from "./testHelpers";

/** Every node of the tree under `node`, `node` included. */
const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

async function main() {
  console.log("\n# an over-full root draws what scales as if the fixed parts took no room");
  {
    // 6 bands, spacing 110 × 5 = 550 px in a 533 px slot: the bands fill
    // the slot on their own, 533 / 6 px each.
    const data = ["a", "b", "c", "d", "e", "f"].map((k) => ({ k, v: 1 }));
    const dl = await chart(data, { axes: false })
      .flow(spread({ by: "k", dir: "x", spacing: 110 }))
      .mark(rect({ w: "v", h: 10 }))
      .toDisplayList({ w: 533, h: 100 });
    const rects = items(dl).filter((i) => i.kind === "rect");
    check(
      "every band is 533 / 6 px wide",
      rects.length === 6 && rects.every((r) => close(r.w, 533 / 6)),
      rects.map((r) => r.w)
    );
    check(
      "bands sit 110 px apart",
      close(rects[1].x! - rects[0].x! - rects[0].w!, 110),
      rects.map((r) => r.x)
    );
  }

  console.log("\n# a chart's content gets no less than no room");
  {
    // Three nested charts in 60 px of height: each has 13.3 px, less than
    // its chrome's gutters, so its content gets 0 px, never a negative size.
    const rows = ["a", "b", "c"].flatMap((g) =>
      ["p", "q"].map((i, j) => ({ g, i, v: j + 1 }))
    );
    const node = await chart(rows)
      .flow(spread({ by: "g", dir: "y", spacing: 10 }))
      .mark((d: any) =>
        chart(d)
          .flow(spread({ by: "i", dir: "x", spacing: 2 }))
          .mark(rect({ h: "v" }))
      )
      .resolve();
    // Record the size each chart hands its content (its first child).
    const handed: number[][] = [];
    const proto = GoFishNode.prototype as any;
    const layout = proto.layout;
    proto.layout = function (this: GoFishNode, size: number[], ...rest: any[]) {
      const p = this.parent;
      if (p?.chrome !== undefined && p.children[0] === this)
        handed.push([...size]);
      return layout.call(this, size, ...rest);
    };
    const data = await runLayout({ w: 200, h: 60 }, node).finally(
      () => (proto.layout = layout)
    );
    check(
      "every chart hands its content a size of at least 0",
      handed.length > 0 && handed.every((s) => s.every((v) => !(v < 0))),
      handed
    );
    check(
      "the layout warns that the fixed parts overflow on y",
      data.warnings.some((w) => w.kind === "fixed-overflow" && w.axis === "y"),
      data.warnings.map((w) => w.message)
    );
  }

  report();
}

main();

/**
 * The claim walk and the layout agree (#493, #1032): what a node claims is
 * where the layout puts it, and a slot its fixed parts overfill is drawn as
 * the `fixed-overflow` warning says. Run: `tsx src/tests/claimLayout.test.ts`
 * (wired into `pnpm test` as `test:claim-layout`).
 */
// The library first, so its modules initialize in their usual order.
import { chart, spread, rect } from "../lib";
import { check, items, report } from "./testHelpers";

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

  report();
}

main();

/**
 * The claim walk and the layout agree (#493, #1032): what a node claims is
 * where the layout puts it, and a slot its fixed parts overfill is drawn as
 * the `fixed-overflow` warning says. Run: `tsx src/tests/claimLayout.test.ts`
 * (wired into `pnpm test` as `test:claim-layout`).
 */
// The library first, so its modules initialize in their usual order.
import {
  chart,
  spread,
  stack,
  rect,
  enclose,
  selectAll,
  text,
  field,
  layer as layerOf,
} from "../lib";
import { runLayout } from "../ast/gofish";
import * as Pwl from "../ast/solver/pwl";
import { GoFishNode } from "../ast/_node";
import { Rect } from "../ast/shapes/rect";
import { layer } from "../ast/graphicalOperators/layer";
import { Constraint } from "../ast/constraints";
import { planPlacement } from "../ast/solver/plan";
import { check, items, report } from "./testHelpers";

/** Every node of the tree under `node`, `node` included. */
const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

/** The node under `n` that holds a chain (a `distribute`). */
const chainOf = (n: GoFishNode): GoFishNode => {
  const walk = (m: GoFishNode): GoFishNode[] => [
    m,
    ...m.children.flatMap((c) => (c instanceof GoFishNode ? walk(c) : [])),
  ];
  return walk(n).find((m) =>
    m.constraints.some((c) => c.type === "distribute")
  )!;
};

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

  console.log(
    "\n# an unsized root whose fixed parts exceed the default canvas (#1179)"
  );
  {
    // Data-valued widths, spacing 200 × 5 = 1000 px: more than the default
    // 400 px canvas, so no σ ≥ 0 fits. The bars alone fill the 400 px
    // (σ = 400 / 6, never negative), and the canvas grows to hold the
    // spacing. The render gave no size, so nothing overflows or warns.
    const data = ["a", "b", "c", "d", "e", "f"].map((k) => ({ k, v: 1 }));
    const bars = () =>
      chart(data, { axes: false })
        .flow(spread({ by: "k", dir: "x", spacing: 200 }))
        .mark(rect({ w: "v", h: 10 }));
    const rects = items(await bars().toDisplayList({})).filter(
      (i) => i.kind === "rect"
    );
    check(
      "every bar is 400 / 6 px wide",
      rects.length === 6 && rects.every((r) => close(r.w, 400 / 6)),
      rects.map((r) => r.w)
    );
    check(
      "bars sit 200 px apart",
      close(rects[1].x! - rects[0].x! - rects[0].w!, 200),
      rects.map((r) => r.x)
    );
    const data1179 = await runLayout({}, bars().resolve());
    check(
      "the canvas holds the bars and the spacing, and nothing warns",
      close(data1179.width, 400 + 1000, 1e-6) &&
        data1179.warnings.length === 0,
      [data1179.width, data1179.warnings.map((w) => w.message)]
    );
  }

  console.log("\n# a chart's content gets no less than no room");
  {
    // Three nested charts in 24 px of height: the spacing and the label row
    // past the last chart need more, so each content gets 0 px, never a
    // negative size. (The label rows between the charts sit in the gaps.)
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
    const data = await runLayout({ w: 200, h: 24 }, node).finally(
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

  console.log("\n# a literal pin seats a child whatever else acts on it");
  {
    // g is pinned at x = 100 and centered with b: the pin places g first,
    // so the align moves b. The claim walk knows where m, inside g, lands.
    const m = (Rect as any)({ w: 20, h: 20 }).name("m");
    const g = (layer as any)([m]).name("g");
    const b = (Rect as any)({ w: 40, h: 40 }).name("b");
    const node = (layer as any)([g, b]).relate(({ g, b }: any) => [
      Constraint.position({ x: 100, anchor: "baseline" }, [g]),
      Constraint.align({ x: "middle" }, [g, b]),
    ]);
    const data = await runLayout({}, node);
    const [gNode, bNode] = data.child.children as GoFishNode[];
    const mNode = gNode.children[0] as GoFishNode;
    check(
      "the layout centers b on g, pinned at 100",
      close(bNode.dims[0].center, 110),
      bNode.dims[0]
    );
    const p = planPlacement(mNode, data.child, 0);
    check(
      "the claim walk places m where the layout does",
      p !== undefined && close(Pwl.at(p.lo, 1), 100) && close(Pwl.at(p.hi, 1), 120),
      p && [Pwl.at(p.lo, 1), Pwl.at(p.hi, 1)]
    );
  }

  console.log("\n# a stack claims its parts end to end, whatever its anchor");
  {
    // A stack lays each part's tail on the previous part's head whatever
    // its anchor, so three 20 px boxes claim 60 px, as they are laid out.
    for (const anchor of ["edge", "middle", "start"] as const) {
      const node = await chart(
        ["a", "b", "c"].map((k) => ({ k })),
        { axes: false }
      )
        .flow(stack({ by: "k", dir: "x", anchor }))
        .mark(rect({ w: 20, h: 10 }))
        .resolve();
      const data = await runLayout({}, node);
      const walk = (n: GoFishNode): GoFishNode[] => [
        n,
        ...n.children.flatMap((c) => (c instanceof GoFishNode ? walk(c) : [])),
      ];
      const chain = walk(data.child).find((n) =>
        n.constraints.some((c) => c.type === "distribute")
      )!;
      const claim = chain.resolveExtent()[0]!;
      check(
        `anchor "${anchor}": the claim is the laid-out 0..60`,
        close(-Pwl.at(claim.descent, 1), 0) &&
          close(Pwl.at(claim.ascent, 1), 60) &&
          close(chain.dims[0].size, 60),
        [-Pwl.at(claim.descent, 1), Pwl.at(claim.ascent, 1), chain.dims[0].size]
      );
    }
  }

  console.log("\n# a spread claims its parts chained with the spacing");
  {
    // A spread of magnitudes shares the enclosing scope's σ: two bars of 4
    // and 3 data units, 10 px apart, claim 7σ + 10.
    const node = await chart(
      [
        { k: "a", v: 4 },
        { k: "b", v: 3 },
      ],
      { axes: false }
    )
      .flow(spread({ by: "k", dir: "x", spacing: 10 }))
      .mark(rect({ w: "v", h: 10 }))
      .resolve();
    const data = await runLayout({}, node);
    const claim = chainOf(data.child).resolveExtent()[0]!;
    check(
      "the claim is 7σ + 10",
      close(Pwl.at(claim.width, 2), 24) && close(Pwl.at(claim.width, 5), 45),
      [Pwl.at(claim.width, 2), Pwl.at(claim.width, 5)]
    );
  }

  console.log("\n# a pitched chain's tallest part binds wherever it sits");
  {
    // Parts 30 px apart by their middles: at σ = 1, a 100 px part in the
    // middle reaches past both of its neighbors, so the claim is its 100 px.
    const node = await chart(
      [2, 100, 2].map((h, i) => ({ k: `${i}`, h })),
      { axes: false }
    )
      .flow(spread({ by: "k", dir: "y", spacing: 30, anchor: "middle" }))
      .mark(rect({ w: 10, h: "h" }))
      .resolve();
    const data = await runLayout({}, node);
    const claim = chainOf(data.child).resolveExtent()[1]!;
    check(
      "the claim is the middle part's 100 px",
      close(Pwl.at(claim.width, 1), 100),
      Pwl.at(claim.width, 1)
    );
  }

  console.log("\n# transform.scale scales a layer's claim");
  {
    const node = (layer as any)({ transform: { scale: { x: 2 } } }, [
      (Rect as any)({ w: 10, h: 10 }),
    ]);
    const data = await runLayout({}, node);
    const claim = data.child.resolveExtent()[0]!;
    check(
      "a 10 px rect scaled by 2 claims 20 px",
      close(Pwl.at(claim.width, 1), 20),
      Pwl.at(claim.width, 1)
    );
  }

  console.log("\n# a sized chart's plot leaves out the nested label rows");
  {
    // A grouped bar chart: each group's category labels are a ring of the
    // inner group, and they sit below the 200 px plot, not inside it. The
    // y domain nices to [0, 10], so the bar of 10 is the whole plot.
    const rows = ["a", "b"].flatMap((g) =>
      ["p", "q"].map((i, j) => ({ g, i, v: 5 * (j + 1) }))
    );
    const dl = await chart(rows, { w: 200, h: 200 })
      .flow(spread({ by: "g", dir: "x" }), stack({ by: "i", dir: "x" }))
      .mark(rect({ h: "v" }))
      .toDisplayList();
    const bars = items(dl).filter(
      (i) => i.kind === "rect" && i.w !== undefined && i.w > 1
    );
    const tallest = Math.max(...bars.map((r) => r.h ?? 0));
    check("the tallest bar fills the 200 px plot", close(tallest, 200, 1e-3), tallest);
  }

  console.log("\n# labels between the rows of a spread never move the rows");
  {
    // Three rows 30 px apart in 150 px, each labeled below: the rows are
    // laid by their bars, (150 - 2 * 30) / 3 = 30 px each, and the labels
    // sit in the gaps and past the last row.
    const rows = ["a", "b", "c"].map((g) => ({ g, v: 1 }));
    const dl = await chart(rows, { axes: false, legend: false, w: 100, h: 150 })
      .flow(spread({ by: "g", dir: "y", spacing: 30 }))
      .mark(rect({ w: "v" }).label("v", { position: "outset-bottom" }))
      .toDisplayList();
    const bars = items(dl).filter((i) => i.kind === "rect");
    check(
      "every row is 30 px tall",
      bars.length === 3 && bars.every((r) => close(r.h, 30, 1e-3)),
      bars.map((r) => r.h)
    );
  }

  console.log("\n# an enclose around placed marks takes room, as dressing");
  {
    // Three bars in a 200 × 100 plot, with one outline around them, 10 px
    // out. The outline is placed from its refs, as a label is: it adds
    // around the plot, and in a canvas of the plot's size plus the padding
    // and the outline's 1 px stroke (half of it past each side) it leaves
    // the bars their 200 × 100.
    const data = ["a", "b", "c"].map((k, i) => ({ k, v: i + 1 }));
    const bars = (size: { w?: number; h?: number }) =>
      chart(data, { axes: false, ...size })
        .flow(spread({ by: "k", dir: "x", spacing: 10 }))
        .mark(rect({ h: "v" }).name("bars"))
        .layer(chart(selectAll("bars")).mark(enclose({ padding: 10 })));
    const rects = (dl: Awaited<ReturnType<typeof items>>) =>
      dl.filter((i) => i.kind === "rect");
    const sized = rects(
      items(await bars({ w: 200, h: 100 }).toDisplayList())
    );
    check(
      "the outline is the bars' box, 10 px out, its stroke inside the canvas",
      close(sized[0].x, 0.5) &&
        close(sized[0].y, 0.5) &&
        close(sized[0].w, 220) &&
        close(sized[0].h, 120),
      sized[0]
    );
    check(
      "the bars keep the 200 × 100 plot",
      close(sized[1].x, 10.5) &&
        close(sized[3].x! + sized[3].w!, 210.5) &&
        close(sized[3].h, 100),
      sized.slice(1)
    );
    const fitted = rects(
      items(await bars({}).toDisplayList({ w: 221, h: 121 }))
    );
    check(
      "in a 221 × 121 canvas the bars get 200 × 100",
      close(fitted[3].x! + fitted[3].w! - fitted[1].x!, 200, 1e-3) &&
        close(fitted[3].h, 100, 1e-3),
      fitted
    );
  }

  console.log("\n# a labeled chart chained down a spread sits past its sibling");
  {
    // A chart reads y up and the spread reads it down. The chart's labels
    // make its plot differ from its box, so the spread lays it by its plot,
    // which its view in the spread's axis order must read reflected.
    const data = [
      { k: "a", v: 1 },
      { k: "b", v: 2 },
    ];
    const dl = await spread({ dir: "y", spacing: 16, alignment: "start" }, [
      rect({ w: 30, h: 10 }),
      chart(data, { axes: false, w: 100, h: 50 })
        .flow(spread({ by: "k", dir: "x" }))
        .mark(rect({ h: "v" }).label("v", { position: "center" })),
    ]).toDisplayList({});
    const rects = items(dl).filter((i) => i.kind === "rect");
    const top = Math.min(...rects.slice(1).map((r) => r.y!));
    check(
      "the chart's plot starts 16 px below the rect",
      close(rects[0].y, 0) && close(top, rects[0].y! + 10 + 16),
      rects.map((r) => [r.y, r.h])
    );
  }

  console.log(
    "\n# a layer places a sized chart by its outer box on both axes (#1032)"
  );
  {
    // Labels hanging before the bars on x (a spread, whose scope has no
    // data 0) and below them on y (data 0) are both inside the chart's
    // box, and a caption at x 0 / y 132 counts from that box's corner.
    const data = [
      { k: "a", v: 1 },
      { k: "b", v: 2 },
    ];
    const cell = async (position: "outset-left" | "outset-bottom") => {
      const dl = await layerOf([
        chart(data, { axes: false, w: 100, h: 50 })
          .flow(spread({ by: "k", dir: "x" }))
          .mark(rect({ h: "v" }).label(field("v").sum(), { position })),
        text({ x: 0, y: 132, text: "CAP", fontSize: 12 }),
      ]).toDisplayList({});
      const all = items(dl);
      const rects = all.filter((i) => i.kind === "rect");
      const labels = all.filter((i) => i.kind === "text" && i.text !== "CAP");
      const cap = all.find((i) => i.text === "CAP")!;
      return { rects, labels, cap, height: dl.viewport.h };
    };
    const left = await cell("outset-left");
    const plotLeft = Math.min(...left.rects.map((r) => r.x!));
    check(
      "labels left of the bars: the caption starts where the labels do, and the plot past them",
      close(left.cap.x, Math.min(...left.labels.map((l) => l.x!))) &&
        plotLeft > left.cap.x! + 1,
      [left.cap.x, plotLeft]
    );
    const bottom = await cell("outset-bottom");
    const plotBottom = Math.max(...bottom.rects.map((r) => r.y! + r.h!));
    check(
      "labels below the bars: the caption's height counts from below the labels",
      close(bottom.height, 132 + 12, 0.5) && plotBottom < bottom.height - 1,
      [bottom.height, plotBottom]
    );
  }

  report();
}

main();

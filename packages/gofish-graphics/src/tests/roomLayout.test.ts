/**
 * Room versus box (#1257, #1292): each child is laid out in a room its
 * parent gives it, and its box is the hull of what it draws. In an overlay
 * a child's room is its parent's room; along a chain a child with no size
 * of its own gets its need plus its share of the slack (CSS's
 * `flex: 1 1 auto`). A filler (a rect with no size) is its room, and a
 * percent is a part of the nearest room with a size, in the claim walk and
 * in layout alike (#1300). These cases mirror the layout prototype's
 * `flex.test.ts` and `ring.test.ts` through the real engine.
 * Run: `tsx src/tests/roomLayout.test.ts` (wired into `pnpm test` as
 * `test:room-layout`).
 */
// The library first, so its modules initialize in their usual order.
import {
  chart,
  spread,
  stack,
  scatter,
  rect,
  circle,
  layer,
  percent,
  fr,
} from "../lib";
import { runLayout } from "../ast/gofish";
import { GoFishNode } from "../ast/_node";
import { lowerToDisplayList } from "../ast/displayList/lower";
import { Rect } from "../ast/shapes/rect";
import { layer as Layer } from "../ast/graphicalOperators/layer";
import { Spread } from "../ast/graphicalOperators/spread";
import { Constraint } from "../ast/constraints";
import * as Pwl from "../ast/solver/pwl";
import { check, items, report } from "./testHelpers";

/** Every node of the tree under `n`, `n` included. */
const nodesOf = (n: GoFishNode): GoFishNode[] => [
  n,
  ...n.children.flatMap((c) => (c instanceof GoFishNode ? nodesOf(c) : [])),
];

const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

const rectsOf = async (
  node: { toDisplayList: (o?: any) => Promise<unknown> },
  size?: { w: number; h: number }
) =>
  items((await node.toDisplayList(size)) as any).filter(
    (i) => i.kind === "rect"
  );

async function main() {
  console.log("\n# a filler in an overlay is its parent's room");
  {
    const rects = await rectsOf(
      layer({ w: 100, h: 100 }, [
        rect({ w: 10, h: 40, fill: "red" }),
        rect({ w: 10, fill: "blue" }),
      ])
    );
    check(
      "the sized rect keeps 40 px and the filler is 100 px tall",
      rects.length === 2 && close(rects[0].h, 40) && close(rects[1].h, 100),
      rects.map((r) => r.h)
    );
  }

  console.log("\n# a stack's filler takes what is left");
  {
    const rects = await rectsOf(
      layer({ w: 100, h: 100 }, [
        stack({ dir: "y", spacing: 0 }, [
          rect({ w: 10, h: 30 }),
          rect({ w: 10 }),
        ]),
      ])
    );
    check(
      "a 30 px rect and a 70 px filler fill the 100 px room",
      rects.length === 2 && close(rects[0].h, 30) && close(rects[1].h, 70),
      rects.map((r) => r.h)
    );
  }

  console.log("\n# two fillers split the slack");
  {
    const rects = await rectsOf(
      layer({ w: 100, h: 100 }, [
        stack({ dir: "y", spacing: 0 }, [
          rect({ w: 10, h: 20 }),
          rect({ w: 10 }),
          rect({ w: 10 }),
        ]),
      ])
    );
    check(
      "20 px, then two 40 px fillers",
      rects.length === 3 &&
        close(rects[0].h, 20) &&
        close(rects[1].h, 40) &&
        close(rects[2].h, 40),
      rects.map((r) => r.h)
    );
  }

  console.log("\n# a percent is a part of the room, and may overflow it");
  {
    const rects = await rectsOf(
      layer({ w: 100, h: 100 }, [
        stack({ dir: "y", spacing: 0 }, [
          rect({ w: 10, h: percent(100) }),
          rect({ w: 10, h: 40 }),
        ]),
      ])
    );
    check(
      "percent(100) is the 100 px room, and the 40 px rect sits past it",
      rects.length === 2 && close(rects[0].h, 100) && close(rects[1].h, 40),
      rects.map((r) => r.h)
    );
  }

  console.log("\n# fr weights split the slack");
  {
    const rects = await rectsOf(
      layer({ w: 100, h: 100 }, [
        stack({ dir: "y", spacing: 0 }, [
          rect({ w: 10, h: fr(1) }),
          rect({ w: 10, h: fr(3) }),
        ]),
      ])
    );
    check(
      "fr(1) and fr(3) of 100 px are 25 px and 75 px",
      rects.length === 2 && close(rects[0].h, 25) && close(rects[1].h, 75),
      rects.map((r) => r.h)
    );
  }

  console.log("\n# a backdrop behind a bar fills the band's room");
  {
    const rects = await rectsOf(
      chart(
        [
          { c: "a", v: 3 },
          { c: "b", v: 5 },
        ],
        { axes: false, w: 200, h: 150 }
      )
        .flow(spread({ by: "c", dir: "x" }))
        .mark(layer([rect({ fill: "#ddd" }), rect({ h: "v" })]))
    );
    const backdrops = rects.filter((r) => r.style?.fill === "#ddd");
    const bars = rects.filter((r) => r.style?.fill !== "#ddd");
    check(
      "each backdrop is the whole 150 px plot",
      backdrops.length === 2 && backdrops.every((r) => close(r.h, 150)),
      backdrops.map((r) => r.h)
    );
    check(
      "the tallest bar fills the plot, the other is 3/5 of it",
      bars.length === 2 &&
        close(Math.max(...bars.map((r) => r.h!)), 150) &&
        close(Math.min(...bars.map((r) => r.h!)), 90),
      bars.map((r) => r.h)
    );
  }

  console.log(
    "\n# a one-row scatter's labels have the whole plot as their room"
  );
  {
    const dl = items(
      (await chart(
        [
          { n: "alpha", x: 1, y: 1 },
          { n: "beta", x: 2, y: 1 },
          { n: "gamma", x: 3, y: 1 },
        ],
        { w: 300, h: 120 }
      )
        .flow(scatter({ by: "n", x: "x", y: "y" }))
        .mark(circle({ r: 5 }).label("n"))
        .toDisplayList()) as any
    );
    const labels = dl.filter(
      (i) => i.kind === "text" && ["alpha", "beta", "gamma"].includes(i.text)
    );
    check("every dot is labeled", labels.length === 3, labels.length);
  }

  console.log("\n# a chart's axes take their size, and the plot the rest");
  {
    const data = ["a", "b", "c"].map((k, i) => ({ k, v: i + 1 }));
    const rects = await rectsOf(
      chart(data, { w: 300, h: 300 })
        .flow(spread({ by: "k", dir: "x", spacing: 10 }))
        .mark(rect({ h: "v" }))
    );
    const bars = rects.filter((r) => (r.w ?? 0) > 2 && (r.h ?? 0) > 2);
    const left = Math.min(...bars.map((r) => r.x!));
    const right = Math.max(...bars.map((r) => r.x! + r.w!));
    const tall = Math.max(...bars.map((r) => r.h!));
    check(
      "the plot is most of the 300 px canvas, not an equal share with its axis",
      bars.length === 3 && right - left > 240 && tall > 240,
      { span: right - left, tall }
    );
  }

  console.log("\n# a chart's legend takes its size, and the plot the rest");
  {
    const data = ["a", "b", "c"].map((k, i) => ({ k, v: i + 1 }));
    const rects = await rectsOf(
      chart(data, { axes: false, w: 300, h: 200 })
        .flow(spread({ by: "k", dir: "x", spacing: 10 }))
        .mark(rect({ h: "v", fill: "k" }))
    );
    const bars = rects.filter((r) => (r.h ?? 0) > 20);
    const left = Math.min(...bars.map((r) => r.x!));
    const right = Math.max(...bars.map((r) => r.x! + r.w!));
    check(
      "the plot keeps more than 200 px of the 300 px canvas",
      bars.length === 3 && right - left > 200 && right <= 300,
      { left, right }
    );
  }

  console.log(
    "\n# a percent inside an unsized chain member: claim and layout agree (#1300)"
  );
  {
    // The part has no size of its own, so a percent inside it is of the
    // nearest room with a size (`roomFor`): the 200 px layer. The claim
    // walk and layout read that one room, for a rect and a layer alike.
    const L = Layer as any;
    const R = Rect as any;
    const member = (inner: any) =>
      L({ w: 200, h: 100 }, [
        (Spread as any)({ dir: "x", spacing: 0 }, [
          L([inner]),
          R({ w: 20, h: 10, fill: "blue" }),
        ]),
      ]);
    for (const [name, inner] of [
      ["a rect", () => R({ w: percent(50), h: 10, fill: "red" })],
      ["a layer", () => L({ w: percent(50) }, [R({ h: 10, fill: "red" })])],
    ] as const) {
      const data = await runLayout({}, member(inner()));
      const chain = nodesOf(data.child).find((n) =>
        n.constraints.some((c) => c.type === "distribute")
      )!;
      const claim = chain.resolveExtent()[0]!;
      const claimed = Pwl.at(claim.ascent, 1) - Pwl.at(claim.descent, 1);
      const rects = items({ items: lowerToDisplayList(data.child) }).filter(
        (i) => i.kind === "rect"
      );
      const red = rects.find((r) => r.style?.fill === "red");
      const blue = rects.find((r) => r.style?.fill === "blue");
      check(
        `${name}: percent(50) is 100 px, the claim is 120 px, as laid out`,
        close(red?.w, 100) &&
          close(blue?.x, 100) &&
          close(claimed, 120) &&
          close(chain.dims[0].size, 120),
        { red: red?.w, blueX: blue?.x, claimed, laid: chain.dims[0].size }
      );
    }
  }

  console.log("\n# two parallel chains each split their own slack");
  {
    // [a, b] and [c, d] run along x in one 100 px layer: a and c are 20 px,
    // b and d are fillers. Each chain splits the slack among its own
    // members, so each fills the room: b and d are 80 px, not 40 px.
    const R = Rect as any;
    const parts = {
      a: R({ w: 20, h: 10, fill: "a" }).name("a"),
      b: R({ h: 10, fill: "b" }).name("b"),
      c: R({ w: 20, h: 10, fill: "c" }).name("c"),
      d: R({ h: 10, fill: "d" }).name("d"),
    };
    const node = (Layer as any)(
      { w: 100, h: 100 },
      Object.values(parts)
    ).relate(({ a, b, c, d }: any) => [
      Constraint.distribute({ dir: "x", spacing: 0 }, [a, b]),
      Constraint.distribute({ dir: "x", spacing: 0 }, [c, d]),
      Constraint.distribute({ dir: "y", spacing: 0 }, [a, c]),
    ]);
    const data = await runLayout({}, node);
    const rects = items({ items: lowerToDisplayList(data.child) }).filter(
      (i) => i.kind === "rect"
    );
    const w = (fill: string) => rects.find((r) => r.style?.fill === fill)?.w;
    check(
      "b and d are 80 px",
      close(w("a"), 20) &&
        close(w("b"), 80) &&
        close(w("c"), 20) &&
        close(w("d"), 80),
      ["a", "b", "c", "d"].map(w)
    );
  }

  console.log("\n# a percent of a band is laid out at its claim, ρσ");
  {
    const rects = await rectsOf(
      chart(
        [
          { c: "a", v: 3 },
          { c: "b", v: 5 },
        ],
        { axes: false, w: 200, h: 150 }
      )
        .flow(spread({ by: "c", dir: "x", spacing: 0 }))
        .mark(layer([rect({ fill: "#ddd" }), rect({ w: percent(50), h: "v" })]))
    );
    const bars = rects.filter((r) => r.style?.fill !== "#ddd");
    check(
      "each bar is half its 100 px band",
      bars.length === 2 && bars.every((r) => close(r.w, 50)),
      bars.map((r) => r.w)
    );
  }

  console.log("\n# a plot covers a difference axis's niced width, centered");
  {
    // A centered stack has a difference axis on y: its heights 20, 37 and
    // 31 nice to a width of 40, drawn across the whole 200 px, with the
    // content centered in it. The plot covers that width, so the x axis
    // seats past the y line's end, as it does beside any plot.
    const node = await chart(
      [
        { k: "a", v: 3, u: 20 },
        { k: "b", v: 5, u: 37 },
        { k: "c", v: 2, u: 31 },
      ],
      { w: 300, h: 200 }
    )
      .flow(stack({ by: "k", dir: "x", alignment: "middle" }))
      .mark(rect({ w: "v", h: "u", fill: "k" }))
      .resolve();
    const data = await runLayout({ axes: true }, node);
    const plot = nodesOf(data.child).find((n) => n._axesBeside)!;
    const rects = items({ items: lowerToDisplayList(data.child) }).filter(
      (i) => i.kind === "rect" && i.style?.fill === "gray"
    );
    const yLine = rects.find((r) => r.w === 1 && (r.h ?? 0) > 100)!;
    const xLine = rects.find((r) => r.h === 1 && (r.w ?? 0) > 100)!;
    check(
      "the plot is the whole 200 px, and the x line sits below the y line",
      close(plot.dims[1].size, 200) &&
        yLine !== undefined &&
        xLine !== undefined &&
        xLine.y! >= yLine.y! + yLine.h! - 1e-6,
      { plot: plot.dims[1].size, yLine, xLine }
    );
  }

  console.log("\n# a y-up plot's span is its box's, in its stored pixels");
  {
    // The plot of a scatter with labels covers its niced domain. Its span
    // is in the pixels its box is stored in, so on a y-up plot the domain
    // is reflected, as the box is, and lies inside the box.
    const node = await chart([
      { n: "a", x: 1, y: 10 },
      { n: "b", x: 2, y: 30 },
      { n: "c", x: 3, y: 20 },
    ])
      .flow(scatter({ by: "n", x: "x", y: "y" }))
      .mark(circle({ r: 5 }).label("n"))
      .resolve();
    const data = await runLayout({ w: 300, h: 200, axes: true }, node);
    const plot = nodesOf(data.child).find((n) => n._axesBeside)!;
    for (const axis of [0, 1] as const) {
      const span = plot.localPlotSpan(axis);
      const { min, max } = plot.dims[axis];
      check(
        `the plot's span on ${axis === 0 ? "x" : "y"} lies inside its box`,
        span !== undefined &&
          min !== undefined &&
          max !== undefined &&
          span[0] >= min - 1e-6 &&
          span[1] <= max + 1e-6 &&
          span[1] - span[0] > 100,
        { span, box: [min, max] }
      );
    }
  }

  report();
}

main();

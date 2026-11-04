/**
 * Room versus box (#1257, #1292): each child is laid out in a room its
 * parent gives it, and its box is the hull of what it draws. In an overlay
 * a child's room is its parent's room; along a chain a child with no size
 * of its own gets its need plus its share of the slack (CSS's
 * `flex: 1 1 auto`). A filler (a rect with no size) is its room, and a
 * percent is a part of its room. These cases mirror the layout prototype's
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
import { check, items, report } from "./testHelpers";

const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

const rectsOf = async (
  node: { toDisplayList: (o?: any) => Promise<unknown> },
  size?: { w: number; h: number }
) => items((await node.toDisplayList(size)) as any).filter((i) => i.kind === "rect");

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
      rects.length === 2 &&
        close(rects[0].h, 30) &&
        close(rects[1].h, 70),
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

  console.log("\n# a one-row scatter's labels have the whole plot as their room");
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

  report();
}

main();

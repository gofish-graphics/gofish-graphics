/**
 * Lengths (#1176 step 6): `percent(n)` is a percent of the room a size or
 * gap is laid out in, and `fr(k)` is a weight of k shares of the nearest
 * scope's σ. Run: `tsx src/tests/lengths.test.ts` (wired into `pnpm test`
 * as `test:lengths`).
 */
// The library first, so its modules initialize in their usual order.
import {
  chart,
  spread,
  stack,
  rect,
  layer,
  percent,
  fr,
  value,
  text,
  ellipse,
  treemap,
  table,
  image,
} from "../lib";
import { runLayout } from "../ast/gofish";
import * as Pwl from "../ast/solver/pwl";
import { GoFishNode } from "../ast/_node";
import { check, items, report } from "./testHelpers";

const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

const rectsOf = (dl: any) => items(dl).filter((i) => i.kind === "rect");

/** Every node of the tree under `node`, `node` included. */
const walk = (m: GoFishNode): GoFishNode[] => [
  m,
  ...m.children.flatMap((c) => (c instanceof GoFishNode ? walk(c) : [])),
];

async function main() {
  console.log("\n# percent and fr desugar to their wire forms");
  {
    check(
      "percent(30) is { type: length, percent: 30 }",
      JSON.stringify(percent(30)) ===
        JSON.stringify({ type: "length", percent: 30 })
    );
    check(
      "percent(30).offset(10).offset(-4) adds the pixels",
      JSON.stringify(percent(30).offset(10).offset(-4)) ===
        JSON.stringify({ type: "length", percent: 30, px: 6 })
    );
    check(
      "fr(2) is { type: length, fr: 2 }",
      JSON.stringify(fr(2)) === JSON.stringify({ type: "length", fr: 2 })
    );
    let threw = false;
    try {
      fr(1).offset(3);
    } catch {
      threw = true;
    }
    check("an fr weight takes no offset", threw);
  }

  console.log("\n# a percent passes through boxes that hug their content");
  {
    // The spread and the layer hug their content, so the parts' room is the
    // canvas: 30% and 70% of 500 px.
    const dl = await layer([
      spread({ dir: "x", spacing: 0 }, [
        rect({ w: percent(30), h: 10 }),
        rect({ w: percent(70), h: 10 }),
      ]),
    ]).toDisplayList({ w: 500, h: 50 });
    const rects = rectsOf(dl);
    check(
      "the parts are 150 px and 350 px",
      rects.length === 2 && close(rects[0].w, 150) && close(rects[1].w, 350),
      rects.map((r) => r.w)
    );
  }

  console.log("\n# a percent of a node with a size of its own");
  {
    const dl = await layer({ w: 300, h: 40 }, [
      rect({ w: percent(50).offset(10), h: 10 }),
    ]).toDisplayList({ w: 600, h: 50 });
    const rects = rectsOf(dl);
    check(
      "50% of 300 px plus 10 px is 160 px",
      rects.length === 1 && close(rects[0].w, 160),
      rects.map((r) => r.w)
    );
  }

  const rows = [
    { k: "a", v: 3 },
    { k: "b", v: 5 },
    { k: "c", v: 2 },
    { k: "d", v: 4 },
  ];
  const grid = [
    { c: "a", r: "p" },
    { c: "b", r: "p" },
    { c: "a", r: "q" },
    { c: "b", r: "q" },
  ];
  const bars = (opts: Record<string, unknown>, spacing: any = 0) =>
    chart(rows, { axes: false, ...opts })
      .flow(spread({ by: "k", dir: "x", spacing }))
      .mark(rect({ h: "v" }));

  console.log("\n# an fr spacing is a flexible gap");
  {
    // 4 bands of σ and 3 gaps of σ / 4 fill 400 px: σ = 400 / 4.75.
    const rects = rectsOf(
      await bars({ w: 400, h: 100 }, fr(0.25)).toDisplayList()
    );
    const sigma = 400 / 4.75;
    check(
      "each band is σ and each gap σ / 4",
      rects.length === 4 &&
        rects.every((r) => close(r.w, sigma)) &&
        close(rects[1].x! - (rects[0].x! + rects[0].w!), sigma / 4),
      rects.map((r) => [r.x, r.w])
    );
  }

  console.log("\n# a sidebar and two fr charts share the room left");
  {
    const dl = await spread({ dir: "x", spacing: 10 }, [
      rect({ w: 140, h: 100 }),
      bars({ w: fr(2), h: 100 }),
      bars({ w: fr(1), h: 100 }),
    ]).toDisplayList({ w: 600, h: 100 });
    const rects = rectsOf(dl);
    // 140 + 2 · 10 + 3σ = 600, so the plots are 2σ and σ.
    const sigma = 440 / 3;
    const span = (rs: typeof rects) =>
      Math.max(...rs.map((r) => r.x! + r.w!)) - Math.min(...rs.map((r) => r.x!));
    check(
      "the fr(2) chart's plot is 2σ and the fr(1) chart's is σ",
      rects.length === 9 &&
        close(span(rects.slice(1, 5)), 2 * sigma, 1e-3) &&
        close(span(rects.slice(5)), sigma, 1e-3),
      [span(rects.slice(1, 5)), span(rects.slice(5))]
    );
  }

  console.log("\n# 30% and 70% charts split the canvas");
  {
    const dl = await spread({ dir: "x", spacing: 0 }, [
      bars({ w: percent(30), h: 100 }),
      bars({ w: percent(70), h: 100 }),
    ]).toDisplayList({ w: 500, h: 100 });
    const rects = rectsOf(dl);
    check(
      "the bars of the first chart are 150 / 4 px wide, of the second 350 / 4",
      rects.length === 8 &&
        rects.slice(0, 4).every((r) => close(r.w, 150 / 4)) &&
        rects.slice(4).every((r) => close(r.w, 350 / 4)),
      rects.map((r) => r.w)
    );
    const warned = await warningsOf(() =>
      spread({ dir: "x", spacing: 0 }, [
        bars({ w: percent(30), h: 100 }),
        bars({ w: percent(70), h: 100 }),
      ]).toDisplayList({ w: 500, h: 100 })
    );
    check("nothing warns", warned.length === 0, warned);
  }

  console.log("\n# 30% and 70% with a gap overflow, and warn");
  {
    // No content minimum: 150 + 350 + 12 = 512 px in 500 px.
    const build = () =>
      spread({ dir: "x", spacing: 12 }, [
        rect({ w: percent(30), h: 20 }),
        rect({ w: percent(70), h: 20 }),
      ]);
    const warned = await warningsOf(() =>
      build().toDisplayList({ w: 500, h: 50 })
    );
    check(
      "the layout warns that x overflows",
      warned.some((m) => m.includes("on x") && m.includes("512")),
      warned
    );
    // The same parts in a layer with a size of its own warn there too.
    const inBox = await warningsOf(() =>
      layer({ w: 500, h: 50 }, [build()]).toDisplayList({})
    );
    check(
      "in a 500 px layer it warns too",
      inBox.some((m) => m.includes("on x") && m.includes("512")),
      inBox
    );
  }

  console.log("\n# 3fr and 7fr with a gap fill the room exactly");
  {
    const warned: string[] = [];
    const dl = await collect(warned, () =>
      spread({ dir: "x", spacing: 12 }, [
        rect({ w: fr(3), h: 20 }),
        rect({ w: fr(7), h: 20 }),
      ]).toDisplayList({ w: 500, h: 50 })
    );
    const rects = rectsOf(dl);
    check(
      "the parts are 3 / 10 and 7 / 10 of 488 px, and nothing warns",
      close(rects[0].w, 0.3 * 488, 1e-3) &&
        close(rects[1].w, 0.7 * 488, 1e-3) &&
        warned.length === 0,
      [rects.map((r) => r.w), warned]
    );
  }

  console.log("\n# with no room on x, a percent is of the 400 px canvas");
  {
    const dl = await layer([
      rect({ w: percent(25), h: 10 }),
    ]).toDisplayList({});
    const rects = rectsOf(dl);
    check(
      "25% of 400 px is 100 px",
      close(rects[0].w, 100),
      rects.map((r) => r.w)
    );
  }

  console.log("\n# with no room on x, an fr gap is 0, and warns");
  {
    const warned: string[] = [];
    const dl = await collect(warned, () => bars({}, fr(1)).toDisplayList({}));
    const rects = rectsOf(dl);
    check(
      "the bands touch",
      rects.every(
        (r, i) => i === 0 || close(r.x, rects[i - 1].x! + rects[i - 1].w!)
      ),
      rects.map((r) => [r.x, r.w])
    );
    check(
      "the layout warns once that the spacing has no room on x",
      warned.length === 1 &&
        warned[0].includes("`spacing: fr(1)` has no room on x") &&
        warned[0].includes("w"),
      warned
    );
  }

  console.log("\n# an fr in a scope that data sizes mixes sizes, and warns");
  {
    const build = (spacing: any, flexW: any) =>
      chart(rows, { axes: false, w: 400, h: 100 })
        .flow(spread({ by: "k", dir: "x", spacing }))
        .mark((d: any) =>
          d[0].k === "d"
            ? rect({ w: flexW, h: 10 })
            : rect({ w: value(d[0].v), h: 10 })
        );
    const gap = await warningsOf(() =>
      build(fr(1), value(4)).toDisplayList()
    );
    check(
      "an fr spacing beside data-sized parts warns mixed sizes",
      gap.some(
        (m) => m.includes("mixes data-driven and flexible") && m.includes("fr(1)")
      ),
      gap
    );
    const part = await warningsOf(() => build(0, fr(2)).toDisplayList());
    check(
      "an fr part beside data-sized parts warns mixed sizes",
      part.some(
        (m) => m.includes("mixes data-driven and flexible") && m.includes("fr(2)")
      ),
      part
    );
    // An fr gap and an fr part in one chain: the chain warns once, naming
    // both.
    const both = await warningsOf(() => build(fr(1), fr(2)).toDisplayList());
    const mixed = both.filter((m) =>
      m.includes("mixes data-driven and flexible")
    );
    check(
      "a chain with an fr gap and an fr part warns once, naming both",
      mixed.length === 1 &&
        mixed[0].includes('rect(key: "d") has the size fr(2)') &&
        mixed[0].includes("its spacing fr(1) is flexible"),
      both
    );
  }

  console.log("\n# a gap is read, never written into its constraint");
  {
    // After the layout lays their length gaps out, the constraints hold
    // their spacing as given and nothing else: no gap laid out in σ.
    const specs = (n: GoFishNode) =>
      walk(n).flatMap((m) =>
        m.constraints.filter(
          (c) => c.type === "distribute" || c.type === "grid"
        )
      );
    for (const [what, build] of [
      ["a spread's fr spacing", () => bars({ w: 400, h: 100 }, fr(1))],
      [
        "a table's percent spacing",
        () =>
          chart(grid, { axes: false, w: 200, h: 200 })
            .flow(table({ by: { x: "c", y: "r" }, spacing: percent(10) }))
            .mark(rect({})),
      ],
    ] as const) {
      const node = await build().resolve();
      await runLayout({ w: 400, h: 200 }, node);
      const laid = specs(node);
      check(
        `${what} is not written into its constraint`,
        laid.length === 1 &&
          typeof (laid[0] as any).spacing !== "number" &&
          !("gap" in laid[0]) &&
          !("gaps" in laid[0]),
        laid
      );
    }
  }

  console.log("\n# a percent of a band is a σ term");
  {
    // Each band is σ = 100 px; its marker, 40% of the band, is 0.4σ.
    const build = () =>
      chart(rows, { axes: false, w: 400, h: 100 })
        .flow(spread({ by: "k", dir: "x", spacing: 0 }))
        .mark(() =>
          layer([rect({ h: 10, fill: "#ddd" }), rect({ w: percent(40), h: 5 })])
        );
    const node = await build().resolve();
    await runLayout({ w: 400, h: 100 }, node);
    const marker = walk(node).find((n) => n.lengthOn(0) !== undefined)!;
    const share = marker.shareOf(0);
    check(
      "the marker's length is 0.4σ",
      share !== undefined && Pwl.approxEqual(share, Pwl.affine(0.4, 0)),
      share && Pwl.print(share)
    );
    const rects = rectsOf(await build().toDisplayList());
    check(
      "the bands are 100 px and the markers 40 px",
      rects.length === 8 &&
        rects.filter((_, i) => i % 2 === 0).every((r) => close(r.w, 100)) &&
        rects.filter((_, i) => i % 2 === 1).every((r) => close(r.w, 40)),
      rects.map((r) => r.w)
    );
  }

  console.log("\n# an fr node is a scope for its content");
  {
    const node = await chart(rows, { axes: false, w: 500, h: 100 })
      .flow(spread({ by: "k", dir: "x", spacing: 0 }))
      .mark((d: any) =>
        d[0].k === "a"
          ? layer({ w: fr(2) }, [rect({ h: 10 })])
          : rect({ h: 10 })
      )
      .resolve();
    await runLayout({ w: 500, h: 100 }, node);
    const wide = walk(node).find((n) => n.lengthOn(0) !== undefined)!;
    check("the fr(2) layer is a scope on x", wide.isScope(0));
    check("it is not one on y", !wide.isScope(1));
  }

  console.log("\n# a length where none is accepted is an error");
  {
    const throws = async (what: string, f: () => Promise<unknown>) => {
      let message = "";
      try {
        await f();
      } catch (e) {
        message = (e as Error).message;
      }
      check(what, message.includes("percent"), message);
    };
    await throws("a rect's x", () =>
      rect({ x: percent(10) as any, w: 10, h: 10 }).toDisplayList({})
    );
    await throws("the render's w", () =>
      rect({ w: 10, h: 10 }).toDisplayList({ w: percent(50) as any })
    );
    await throws("a rect's inset of fr", () =>
      rect({ w: 10, h: 10, inset: fr(1) as any }).toDisplayList({})
    );
    await throws("a text's fontSize", async () =>
      text({ text: "a", fontSize: percent(10) as any })
    );
    await throws("a chart's padding", async () =>
      chart(rows, { padding: percent(5) as any })
        .flow(spread({ by: "k", dir: "x" }))
        .mark(rect({ h: "v" }))
        .toDisplayList({})
    );
    await throws("a treemap's spacing", () =>
      chart(rows, { w: 200, h: 200 })
        .flow(treemap({ by: "k", size: "v", spacing: percent(5) as any }))
        .mark(rect({}))
        .toDisplayList()
    );
    await throws("a rect's dims.x.size", () =>
      rect({ h: 10, dims: { x: { size: percent(30) } } } as any).toDisplayList(
        {}
      )
    );
    await throws("a rect's bare dims.x", () =>
      rect({ w: 10, h: 10, dims: { x: percent(30) } } as any).toDisplayList({})
    );
    await throws("a rect's inset of a negative percent", () =>
      rect({ w: 10, h: 10, inset: percent(-10) }).toDisplayList({})
    );
    await throws("a rect's inset with a negative offset", () =>
      rect({ w: 10, h: 10, inset: percent(10).offset(-2) }).toDisplayList({})
    );
    await throws("a stack's spacing", () =>
      chart(rows, { w: 200, h: 200 })
        .flow(stack({ by: "k", dir: "y", spacing: percent(10) } as any))
        .mark(rect({ h: "v", w: 10 }))
        .toDisplayList()
    );
  }

  console.log("\n# a size given as a length and in dims is set twice");
  {
    let message = "";
    try {
      await spread({ dir: "x", spacing: 0 }, [
        rect({ w: fr(1), h: 10, dims: { x: { size: 50 } } } as any),
        rect({ w: fr(1), h: 10 }),
      ]).toDisplayList({ w: 500, h: 50 });
    } catch (e) {
      message = (e as Error).message;
    }
    check(
      "an fr w and a dims.x.size is an error",
      message.includes("set twice"),
      message
    );
    // A dims entry on the axis of a length leaves the length to be laid
    // out in its room.
    const rects = rectsOf(
      await layer({ w: 300, h: 40 }, [
        rect({ w: percent(50), h: 10, dims: { x: { min: 0 } } } as any),
      ]).toDisplayList({ w: 600, h: 50 })
    );
    check(
      "a percent w with a dims.x.min is 50% of 300 px",
      rects.length === 1 && close(rects[0].w, 150),
      rects.map((r) => r.w)
    );
  }

  console.log("\n# an image at a percent of a band");
  {
    const svg =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"></svg>'
      );
    const images = items(
      await chart(rows, { axes: false, w: 400, h: 100 })
        .flow(spread({ by: "k", dir: "x", spacing: 0 }))
        .mark(() =>
          layer([rect({ h: 10 }), image({ href: svg, w: percent(40), h: 5 })])
        )
        .toDisplayList()
    ).filter((i) => i.kind === "image");
    check(
      "each image is 40% of its 100 px band",
      images.length === 4 && images.every((i) => close(i.w, 40)),
      images.map((i) => [i.w, i.h])
    );
  }

  console.log("\n# an ellipse and a table take percents, a table fr");
  {
    const dl = await layer({ w: 300, h: 100 }, [
      ellipse({ w: percent(50), h: 20 }),
    ]).toDisplayList({});
    const e = items(dl).find((i) => i.kind === "ellipse") as any;
    check("an ellipse at 50% of 300 px is 150 px", close(2 * e?.rx, 150), e);
    const cells = rectsOf(
      await chart(grid, { axes: false, w: 200, h: 200 })
        .flow(table({ by: { x: "c", y: "r" }, spacing: percent(10) }))
        .mark(rect({}))
        .toDisplayList()
    );
    // Two columns and a 20 px gap (10% of 200 px) share 200 px.
    check(
      "a table's 10% spacing is 20 px of 200 px",
      cells.length === 4 && cells.every((c) => close(c.w, 90, 1e-3)),
      cells.map((c) => c.w)
    );
    // Two tracks and an fr(1) gap are three shares of 200 px.
    const frCells = rectsOf(
      await chart(grid, { axes: false, w: 200, h: 200 })
        .flow(table({ by: { x: "c", y: "r" }, spacing: fr(1) }))
        .mark(rect({}))
        .toDisplayList()
    );
    check(
      "a table's fr(1) spacing is one share of three",
      frCells.length === 4 &&
        frCells.every((c) => close(c.w, 200 / 3, 1e-3) && close(c.h, 200 / 3, 1e-3)),
      frCells.map((c) => [c.x, c.w, c.h])
    );
  }

  console.log("\n# an unsized table's fill tracks keep the default, as bands do");
  {
    // With no size on an axis the root gives shares no room
    // (`sharesHaveNoRoom`), so a fill cell keeps rect's default 16 px
    // there, as the same rect does in a spread's band.
    const cellsAt = async (opts: Record<string, unknown>) =>
      rectsOf(
        await chart(grid, { axes: false, ...opts })
          .flow(table({ by: { x: "c", y: "r" }, spacing: 10 }))
          .mark(rect({}))
          .toDisplayList()
      );
    const band = rectsOf(
      await chart(grid, { axes: false })
        .flow(spread({ by: "c", dir: "x" }))
        .mark(rect({}))
        .toDisplayList()
    );
    const unsized = await cellsAt({});
    check(
      "a spread's unsized bands are 16 × 16",
      band.length === 2 && band.every((r) => r.w === 16 && r.h === 16),
      band.map((r) => [r.w, r.h])
    );
    check(
      "an unsized table's cells are 16 × 16, 10 px apart",
      unsized.length === 4 &&
        unsized.every((r) => r.w === 16 && r.h === 16) &&
        close(unsized[1].x, 26) &&
        close(unsized[2].y, 26),
      unsized.map((r) => [r.x, r.y, r.w, r.h])
    );
    const wide = await cellsAt({ w: 200 });
    check(
      "with w: 200 the columns share it, and the rows keep 16 px",
      wide.length === 4 &&
        wide.every((r) => close(r.w, 95) && r.h === 16),
      wide.map((r) => [r.x, r.y, r.w, r.h])
    );
  }

  console.log("\n# a table's track no cell sizes, in a scope data sizes, warns");
  {
    // Three columns and two cells: the third column is one share, one data
    // unit wide beside the data-sized cells.
    const warned = await warningsOf(() =>
      layer([
        rect({ w: value(100), h: 10 }),
        table({ numCols: 3, spacing: 0 }, [
          rect({ w: value(10), h: 10 }),
          rect({ w: value(10), h: 10 }),
        ]),
      ]).toDisplayList({ w: 400, h: 100 })
    );
    check(
      "the table warns mixed sizes, naming its third column",
      warned.some(
        (m) =>
          m.includes("mixes data-driven and flexible") &&
          m.includes("its column 3 has no cell that sizes it") &&
          m.includes("its column 3 is drawn one data unit wide")
      ),
      warned
    );
  }

  report();
}

/** Run `f`, keeping each layout warning it prints in `into`. */
async function collect<T>(into: string[], f: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const m = String(args[0]);
    if (m.startsWith("[gofish:layout]")) into.push(m);
    else warn(...args);
  };
  try {
    return await f();
  } finally {
    console.warn = warn;
  }
}

/** The layout warnings `f` prints. */
async function warningsOf(f: () => Promise<unknown>): Promise<string[]> {
  const into: string[] = [];
  await collect(into, f);
  return into;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

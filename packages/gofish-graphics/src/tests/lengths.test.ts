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
      "the layout warns that the spacing has no room on x",
      warned.some(
        (m) => m.includes("`spacing: fr(1)` has no room on x") && m.includes("w")
      ),
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
    const marker = walk(node).find((n) => n.ownLengths?.[0] !== undefined)!;
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
    const wide = walk(node).find((n) => n.ownLengths?.[0] !== undefined)!;
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

/**
 * Measure-keyed domains (#1114) end to end: small figures rendered to a
 * display list, one per review finding on PR #1129, each checking where the
 * marks land. The unit checks of the table and the sharing plans are in
 * `keyedDomains.test.ts` and `sharing.test.ts`.
 *
 * Run: `tsx src/tests/keyedDomainsRender.test.ts` (wired as
 * `pnpm test:keyed-domains-render`).
 */
import { Rect as rect } from "../ast/shapes/rect";
import { Text } from "../ast/shapes/text";
import { layer } from "../ast/graphicalOperators/layer";
import { Frame } from "../ast/graphicalOperators/frame";
import { stackX } from "../ast/graphicalOperators/stackX";
import { spreadX } from "../ast/graphicalOperators/spreadX";
import { Constraint } from "../ast/constraints";
import { toDisplayList } from "../ast/displayList/toDisplayList";
import { value as v, datum } from "../ast/data";
import {
  chart,
  scatter,
  spread,
  selectAll,
  stack,
  Coord,
  rect as rectMark,
  Schema,
} from "../lib";
import { check, items, report, type Item } from "./testHelpers";

declare const process: { exit(code: number): never };

const near = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1e-6;

const byFill = (dl: any, fill: string) =>
  items(dl).filter((i) => i.kind === "rect" && (i as any).style?.fill === fill);

/** The y axis of a display list, as the map from a value to its pixel:
 *  its tick marks (4 x 1 px rects), paired top to bottom with its numeric
 *  labels. Undefined when there is no numeric y axis. */
const yAxisOf = (dl: any) => {
  const all = items(dl);
  const ticks = all
    .filter((i) => i.kind === "rect" && i.w === 4 && i.h === 1)
    .map((i) => i.y! + 0.5)
    .sort((a, b) => a - b);
  const labels = all
    .filter((i) => i.kind === "text" && /^-?[0-9.]+$/.test(i.text ?? ""))
    .sort((a, b) => a.y! - b.y!)
    .map((i) => Number(i.text));
  if (ticks.length < 2 || ticks.length !== labels.length) return undefined;
  const [y0, y1] = [ticks[ticks.length - 1], ticks[0]];
  const [v0, v1] = [labels[labels.length - 1], labels[0]];
  return {
    ticks: ticks.length,
    px: (v: number) => y0 + ((v - v0) / (v1 - v0)) * (y1 - y0),
  };
};

async function main() {
  console.log("# a glyph nested at a datum inherits its parent's σ");
  {
    // The blue rect spans data 0..100 across 200 px, so σ = 2. The red glyph
    // holds pinned data 0..10 and is placed at datum 50: it is 20 px wide,
    // centered on the pixel of 50. Before, it solved its own σ against the
    // whole canvas and filled it.
    const glyph = (layer as any)([
      (rect as any)({ x: v(0), w: v(10), h: 10, fill: "red" }),
    ]).name("g");
    const ruler = (rect as any)({ x: v(0), w: v(100), h: 5, fill: "blue" });
    const node = (layer as any)([ruler, glyph]).relate(({ g }: any) => [
      Constraint.position({ x: datum(50) }, [g]),
    ]);
    const dl = await toDisplayList(node, { w: 200, h: 50 });
    const [blue] = byFill(dl, "blue");
    const [red] = byFill(dl, "red");
    check("the glyph's data is 20 px wide (σ = 2)", near(red?.w, 20), red);
    check(
      "the glyph is centered on the pixel of its datum",
      near((red?.x ?? 0) + 10, (blue?.x ?? 0) + 100),
      { red, blue }
    );
  }

  console.log("# a child nested at a datum does not widen its parent's domain");
  {
    // Bars at x = start with width `width`, both in days. The bar's own
    // width interval [0, width] is in its own frame at the datum, so it
    // must not pull 0 into the day domain: the domain stays [10, 20], and
    // the bars at 10 and 20 sit the whole 200 px apart. Before, the domain
    // was [0, 20] and they sat 100 px apart.
    const tasks = [
      { id: "a", start: 10, width: 2 },
      { id: "b", start: 20, width: 4 },
    ];
    // No axes, so the plot is the whole canvas (#1032).
    const dl = await chart(tasks, {
      axes: false,
      schema: { start: Schema.unit("day"), width: Schema.unit("day") },
    })
      .flow(scatter({ by: "id", x: "start" }))
      .mark(rectMark({ w: "width", h: 10, fill: "green" }))
      .toDisplayList({ w: 200, h: 50 });
    const [a, b] = byFill(dl, "green").sort((p, q) => p.x! - q.x!);
    const center = (r: Item) => r.x! + r.w! / 2;
    // The bars reach past their datums by half their widths, which the
    // canvas keeps clear (#493), so the datums sit a little less than the
    // canvas width apart. Over [0, 20] they would sit at most half of it apart.
    check(
      "the bars' datums sit the plot width apart (domain [10, 20])",
      center(b) - center(a) > 120 && a.x! >= -1e-6 && b.x! + b.w! <= 200 + 1e-6,
      { a, b }
    );
  }

  console.log("# a literal size reports a fixed pixel claim");
  {
    // A 100 px box of data beside a rect of 50 data units, in one 200 px
    // stack: the box takes its 100 px, so σ solves 100 + 50σ = 200 and the
    // rect is 100 px wide. Before, the box passed its content's σ claim up,
    // so the stack solved (10 + 50)σ = 200 and the rect was 167 px wide.
    const node = (stackX as any)({ spacing: 0, alignment: "start" }, [
      (layer as any)({ w: 100, h: 20 }, [
        (rect as any)({ w: v(10), h: 20, fill: "red" }),
      ]),
      (rect as any)({ w: v(50), h: 20, fill: "blue" }),
    ]);
    const dl = await toDisplayList(node, { w: 200, h: 50 });
    const [blue] = byFill(dl, "blue");
    check(
      "the rect beside a fixed box gets the rest (σ = 2)",
      near(blue?.w, 100),
      blue
    );
  }
  {
    // Rendered with no canvas width, a fixed box needs no canvas: it is its
    // own 100 px, not data-scaled room the default canvas would fill.
    const node = (layer as any)({ w: 100, h: 20 }, [
      (rect as any)({ w: v(10), h: 20, fill: "red" }),
    ]);
    const dl: any = await toDisplayList(node, { h: 50 });
    const [red] = byFill(dl, "red");
    check(
      "a fixed box with no render width keeps its own width",
      near(dl.viewport.w - 2 * (red?.x ?? 0), 100),
      { viewport: dl.viewport, red }
    );
  }

  console.log("# a .layer() chart with a size of its own draws its axis there");
  {
    // The root tier is 240 x 160, rendered on a 400 x 400 canvas. Its marks
    // map their domain into its 160 px, so the y axis must too: the 1.1 bar's
    // top lands on the axis's pixel of 1.1. Before, the tier stack drew the
    // axis at the canvas's σ.
    const rows = [
      { item: "p", value: 1.1 },
      { item: "q", value: 0.3 },
    ];
    const dl = await chart(rows, { w: 240, h: 160 })
      .flow(spread({ by: "item", dir: "x", spacing: 12 }))
      .mark(rectMark({ w: 40, h: "value", fill: "steelblue" }).name("bars"))
      .layer(
        chart(selectAll("bars")).mark(rectMark({ w: 4, h: 4, fill: "red" }))
      )
      .toDisplayList({ w: 400, h: 400 });
    const axis = yAxisOf(dl);
    const tall = byFill(dl, "steelblue").sort((p, q) => p.y! - q.y!)[0];
    check(
      "the tallest bar's top is the axis's pixel of 1.1",
      axis !== undefined && near(tall?.y, axis.px(1.1)),
      { tall, axis: axis && [axis.px(0), axis.px(1.1)] }
    );
    check(
      "the bars' baseline is the axis's pixel of 0",
      axis !== undefined && near((tall?.y ?? 0) + (tall?.h ?? 0), axis.px(0))
    );
  }

  console.log("# a sized .layer() chart draws one y axis over all its tiers");
  {
    // The second tier is a chart of its own data. Every tier is the chart's
    // content, so the chart draws one y axis, over 0..1.4, and the tier
    // draws none. Before, the tier was a sibling of the content and drew a
    // second axis over the first: 2 x 15 ticks.
    const rows = [
      { item: "p", value: 1.1 },
      { item: "q", value: 0.3 },
    ];
    const dl = await chart(rows, { w: 240, h: 160 })
      .flow(spread({ by: "item", dir: "x", spacing: 12 }))
      .mark(rectMark({ w: 40, h: "value", fill: "steelblue" }))
      .layer(
        chart([
          { at: 1, value: 0.5 },
          { at: 3, value: 1.4 },
        ])
          .flow(scatter({ x: "at", y: "value" }))
          .mark(rectMark({ w: 4, h: 4, fill: "red" }))
      )
      .toDisplayList({ w: 400, h: 400 });
    const axis = yAxisOf(dl);
    check("the chart draws one y axis", axis?.ticks === 15, axis?.ticks);
    const tall = byFill(dl, "steelblue").sort((p, q) => p.y! - q.y!)[0];
    check(
      "the bars map with the axis",
      axis !== undefined && near(tall?.y, axis.px(1.1)),
      { tall, axis: axis && [axis.px(0), axis.px(1.1)] }
    );
  }

  console.log("# a text placed by its center ignores the w and h it is given");
  {
    // A text's box is its glyphs, so `cx`/`cy` place it by its own size,
    // with or without a `w`/`h`: in x its anchor sits at cx, in y the middle
    // of its box sits at cy. Before, a pixel `w`/`h` derived a `min` the
    // text was placed at, 25 px left and 25 px up of where it is without.
    const at = async (dims: Record<string, number>) => {
      const dl = await toDisplayList(
        (layer as any)([
          (rect as any)({ x: 0, y: 0, w: 1, h: 1, fill: "none" }),
          (Text as any)({ text: "Hello", ...dims }),
        ]),
        { w: 300, h: 300 }
      );
      return items(dl).find((i) => i.kind === "text");
    };
    const bare = await at({ cx: 100, cy: 100 });
    const sized = await at({ cx: 100, w: 50, cy: 100, h: 50 });
    check(
      "a w and h do not move a text placed by its center",
      near(sized?.x, bare!.x!) && near(sized?.y, bare!.y!),
      { bare, sized }
    );
  }

  console.log("# a .layer() tier leaves the root tier's box as it was");
  {
    // The hoisted box is the whole box: the coord, its padding, and the
    // size. A root tier with `padding: 0` under a coord draws the same with
    // or without a tier layered over it. Before, the hoisted coord lost its
    // padding and fell back to the default inset (Bird Migration E).
    const rows = [
      { k: "a", v: 3 },
      { k: "b", v: 5 },
    ];
    const base = () =>
      chart(rows, { coord: Coord.polar(), padding: 0 })
        .flow(stack({ by: "k", dir: "x" }))
        .mark(rectMark({ w: "v", h: "v", fill: "steelblue" }).name("wedges"));
    const shapes = (dl: any) =>
      JSON.stringify(
        items(dl)
          .filter((i) => (i as any).style?.fill === "steelblue")
          .map(({ id: _id, ...rest }: any) => rest)
      );
    // Nested in a frame, as in the story: at the root the padding would be
    // only canvas margin.
    const inFrame = async (b: any) =>
      toDisplayList((Frame as any)({ w: 300, h: 300 }, [await b.resolve()]), {
        w: 300,
        h: 300,
      });
    const alone = await inFrame(base());
    const layered = await inFrame(
      base().layer(chart(selectAll("wedges")).mark(rectMark({ w: 1, h: 1 })))
    );
    check(
      "a layered coord chart keeps its padding",
      shapes(alone) === shapes(layered)
    );
  }

  console.log(
    "# the render root is an implicit chart: a detached piece draws axes only if it is a chart"
  );
  {
    // The root places its content at a literal pixel, which detaches it, so
    // the root's type is undefined on both axes and the root draws no
    // continuous axis. Inside a chart() the same content would draw none, so
    // a bare render draws none either. The same piece written as a chart()
    // draws its own axes.
    const ticks = (dl: any, w: number, h: number) =>
      items(dl).filter((i) => i.kind === "rect" && i.w === w && i.h === h)
        .length;
    const placed = (piece: any) =>
      (layer as any)([(layer as any)([piece]).name("content")]).relate(
        ({ content }: any) => [Constraint.position({ x: 0, y: 0 }, [content])]
      );
    const bare = await toDisplayList(
      placed(
        (layer as any)([
          (rect as any)({ x: v(0), y: v(10), w: 10, h: 2 }),
          (rect as any)({ x: v(40), y: v(50), w: 10, h: 2 }),
        ])
      ),
      { w: 200, h: 200, axes: true }
    );
    check(
      "a detached bare piece draws no continuous axis",
      ticks(bare, 4, 1) === 0 && ticks(bare, 1, 4) === 0,
      [ticks(bare, 4, 1), ticks(bare, 1, 4)]
    );
    const charted = await toDisplayList(
      placed(
        chart([
          { id: 0, x: 0, y: 10 },
          { id: 1, x: 40, y: 50 },
        ])
          .flow(scatter({ by: "id", x: "x", y: "y" }))
          .mark(rectMark({ w: 10, h: 2 }))
      ),
      { w: 200, h: 200, axes: true }
    );
    check(
      "a detached chart() draws its own axes",
      ticks(charted, 4, 1) > 1 && ticks(charted, 1, 4) > 1,
      [ticks(charted, 4, 1), ticks(charted, 1, 4)]
    );
  }

  console.log("# each chart's own axes option applies at that chart");
  {
    // Groups a and b spread along x, each a nested chart that spreads its
    // rows p and q along y: the outer chart draws the a/b axis, each inner
    // chart the p/q axis of its own grouping.
    const rows = [
      { g: "a", i: "p" },
      { g: "a", i: "q" },
      { g: "b", i: "p" },
      { g: "b", i: "q" },
    ];
    const labels = async (outer: any, inner: any, render: any = {}) =>
      items(
        await chart(rows, outer)
          .flow(spread({ by: "g", dir: "x", spacing: 10 }))
          .mark((d: any) =>
            chart(d, inner)
              .flow(spread({ by: "i", dir: "y", spacing: 2 }))
              .mark(rectMark({ w: 10, h: 10 }))
          )
          .toDisplayList({ w: 200, h: 200, ...render })
      )
        .filter((i) => i.kind === "text" && ["a", "p"].includes(i.text ?? ""))
        .map((i) => i.text)
        .sort()
        .join(",");
    check(
      "by default every chart draws its axes",
      (await labels({}, {})) === "a,p,p",
      await labels({}, {})
    );
    check(
      "a nested chart's axes: false turns off only its own axes",
      (await labels({}, { axes: false })) === "a",
      await labels({}, { axes: false })
    );
    check(
      "an outer chart's axes: false leaves the nested charts' axes on",
      (await labels({ axes: false }, {})) === "p,p",
      await labels({ axes: false }, {})
    );
    check(
      "the render's axes overrides only the outermost chart",
      (await labels({}, {}, { axes: false })) === "p,p",
      await labels({}, {}, { axes: false })
    );
    check(
      "a per-axis form applies per dim",
      (await labels({}, { axes: { y: false } })) === "a",
      await labels({}, { axes: { y: false } })
    );
  }

  console.log("# an axis a chart turns off is hidden, not drawn below it");
  {
    // The y domain is shared, so the outer chart owns its axis. With the
    // outer chart's axes off, the nested charts (axes on) do not draw it.
    const rows = [
      { g: "a", i: 0, x: 1, y: 2 },
      { g: "a", i: 1, x: 2, y: 5 },
      { g: "b", i: 0, x: 3, y: 1 },
      { g: "b", i: 1, x: 4, y: 7 },
    ];
    const numbers = async (outer: any) =>
      items(
        await chart(rows, outer)
          .flow(spread({ by: "g", dir: "x", spacing: 10 }))
          .mark((d: any) =>
            chart(d, { w: 80, h: 80 })
              .flow(scatter({ by: "i", x: "x", y: "y" }))
              .mark(rectMark({ w: 4, h: 4 }))
          )
          .toDisplayList({})
      ).filter((i) => i.kind === "text" && /^[0-9.]+$/.test(i.text ?? ""))
        .length;
    check(
      "the shared axis is drawn once, by the outer chart",
      (await numbers({})) > 0,
      await numbers({})
    );
    check(
      "with the outer chart's axes off no nested chart draws it",
      (await numbers({ axes: false })) === 0,
      await numbers({ axes: false })
    );
  }

  console.log("# an unsized render maps its axis at the σ solved below it");
  {
    // NestedCharts: a bare spread of mini charts, each 160 px tall, rendered
    // with no w or h. The default canvas is a fallback, not a size, so the
    // root does not solve its own σ at 400 px: every node that maps the
    // domain solves it at 160 px, and the root's y axis maps it there too.
    // The tick for 90 lands on the top of the 90 bar. Before, the axis
    // spanned 400 px and 90 read as 36.
    const mini = (bars: number[], key: string) =>
      (spreadX as any)(
        { key, spacing: 4, alignment: "start", h: 160 },
        bars.map((b, i) =>
          (rect as any)({
            key: `${key}-${i}`,
            w: 12,
            h: v(b),
            fill: b === 90 ? "red" : "steelblue",
          })
        )
      );
    const node = (spreadX as any)({ spacing: 40, alignment: "start" }, [
      mini([30, 55, 40], "Q1"),
      mini([70, 45, 90], "Q2"),
    ]);
    const dl = await toDisplayList(node, { axes: true });
    const axis = yAxisOf(dl);
    const [ninety] = byFill(dl, "red");
    check(
      "the tick for 90 is at the top of the 90 bar",
      axis !== undefined && near(ninety?.y, axis.px(90)),
      { ninety, axis: axis && [axis.px(0), axis.px(90)] }
    );
    check(
      "the bars' baseline is the axis's pixel of 0",
      axis !== undefined &&
        near((ninety?.y ?? 0) + (ninety?.h ?? 0), axis.px(0))
    );
  }

  console.log("# a facet panel's axis seats at the shared domain's floor");
  {
    // Panels spread down y share one x domain, [0, 10], whose axis the
    // chart draws once below them; each panel draws its own y axis. Panel
    // "b" holds data only from x = 5, but its y axis line must sit at the
    // floor of the shared domain, where panel "a"'s line sits and where the
    // shared x axis starts (#753). Before, it sat just left of b's lowest
    // datum, at the pixel of 5.
    const rows = [
      { g: "a", x: 0, y: 1 },
      { g: "a", x: 10, y: 3 },
      { g: "b", x: 5, y: 2 },
      { g: "b", x: 10, y: 4 },
    ];
    const lines = (dl: any) => {
      const all = items(dl).filter((i) => i.kind === "rect");
      return {
        y: all.filter((i) => i.w === 1 && i.h! > 4).map((i) => i.x!),
        x: all.filter((i) => i.h === 1 && i.w! > 4).map((i) => i.x!),
      };
    };
    const faceted = lines(
      await chart(rows)
        .flow(
          spread({ by: "g", dir: "y", spacing: 20 }),
          scatter({ x: "x", y: "y", axes: { x: false, y: true } })
        )
        .mark(rectMark({ w: 2, h: 2 }))
        .toDisplayList({ w: 200, h: 200 })
    );
    // The same corner in a plain scatter: how far the y axis line sits left
    // of where the x axis line starts.
    const plain = lines(
      await chart(rows)
        .flow(scatter({ x: "x", y: "y" }))
        .mark(rectMark({ w: 2, h: 2 }))
        .toDisplayList({ w: 200, h: 200 })
    );
    const corner = plain.x[0] - plain.y[0];
    check(
      "each panel draws a y axis line",
      faceted.y.length === 2 && faceted.x.length === 1,
      faceted
    );
    check(
      "every panel's y axis line sits at the shared x floor",
      faceted.y.every((x) => near(faceted.x[0] - x, corner)),
      { faceted, corner }
    );
  }

  console.log("# a chart smaller than its render sits at the top-left (#1032)");
  {
    // A 240 x 160 chart on a 400 x 400 canvas: the render size is a fixed
    // slot, and the chart's box sits at its start edge in canvas order, the
    // top, though its y grows upward. The frame top is where the same chart
    // with no size of its own, which fills the slot, has its top. Before, the
    // box sat at the slot's bottom, 240 px lower.
    const rows = [
      { item: "p", value: 1 },
      { item: "q", value: 0.5 },
    ];
    const bars = (size: { w?: number; h?: number }) =>
      chart(rows, size)
        .flow(spread({ by: "item", dir: "x", spacing: 12 }))
        .mark(rectMark({ w: 40, h: "value", fill: "steelblue" }))
        .toDisplayList({ w: 400, h: 400 });
    const axis = yAxisOf(await bars({ w: 240, h: 160 }));
    const filled = yAxisOf(await bars({}));
    check(
      "the plot box's top (the axis's pixel of 1) is the frame top",
      axis !== undefined &&
        filled !== undefined &&
        near(axis.px(1), filled.px(1)),
      [axis && [axis.px(0), axis.px(1)], filled && filled.px(1)]
    );
    check(
      "the plot box is the chart's 160 px",
      axis !== undefined && near(axis.px(0) - axis.px(1), 160)
    );
  }

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

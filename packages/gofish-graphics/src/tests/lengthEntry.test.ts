/**
 * The length entry: a space with no origin is a length scale, so it draws
 * no axis, and the legend gets a bracket of a round amount, an ordinary
 * shape whose length is that amount as data, so it takes the plot's scale.
 * Run: `tsx src/tests/lengthEntry.test.ts` (wired into `pnpm test` as
 * `test:length-entry`).
 */
// The library first, so its modules initialize in their usual order.
import { chart, spread, stack, rect, Baseline, Coord, Serialize } from "../lib";
import { check, items, report } from "./testHelpers";

const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

// Three lakes of two species. The widest cross section is 110, so the
// entry's amount is 20 (d3's `tickStep` over [0, 110] in about four steps).
const DATA = [
  { k: "a", s: "p", v: 30 },
  { k: "a", s: "q", v: 20 },
  { k: "b", s: "p", v: 70 },
  { k: "b", s: "q", v: 40 },
  { k: "c", s: "p", v: 10 },
  { k: "c", s: "q", v: 25 },
];

type Opts = {
  chart?: Record<string, unknown>;
  render?: Record<string, unknown>;
  dir?: "x" | "y";
};

/** A silhouette stack of bars along `dir`, one stack per `k`. */
const spec = ({ chart: copts = {}, dir = "y" }: Opts) =>
  chart(DATA, copts as any)
    .flow(
      spread({ by: "k", dir: dir === "y" ? "x" : "y" }),
      stack({ by: "s", dir, baseline: Baseline.middle() })
    )
    .mark(rect({ [dir === "y" ? "h" : "w"]: "v", fill: "s" } as any));

/** The rects and the text of a display list. */
const shapes = (dl: unknown) => {
  const all = items(dl as any);
  return {
    rects: all.filter((i) => i.kind === "rect"),
    texts: all.filter((i) => i.kind === "text").map((t: any) => t.text),
  };
};

/** σ of the plot, read off the bar of value 70, the length of the entry's
 *  line along `dir` (undefined when there is none), and the text drawn. */
function measure(dl: unknown, dir: "x" | "y" = "y") {
  const len = (r: any) => (dir === "y" ? r.h : r.w);
  const thick = (r: any) => (dir === "y" ? r.w : r.h);
  const { rects, texts } = shapes(dl);
  const bars = rects.filter((r) => r.style?.fill !== "gray");
  const sigma = Math.max(...bars.map(len)) / 70;
  const line = rects.find(
    (r) => r.style?.fill === "gray" && thick(r) === 1 && len(r) > 6
  );
  return { sigma, line: line && len(line), texts, rects };
}

const draw = async (o: Opts) =>
  measure(
    await spec(o).toDisplayList((o.render ?? {}) as any),
    o.dir ?? "y"
  );

async function main() {
  for (const h of [200, 320]) {
    console.log(`\n# the entry is 20 at the plot's scale, chart h ${h}`);
    const m = await draw({ chart: { w: 300, h } });
    check(
      "the line is 20 × σ",
      m.line !== undefined && close(m.line, 20 * m.sigma),
      m
    );
    check(`it is labeled "20 v"`, m.texts.includes("20 v"), m.texts);
  }
  for (const h of [200, 320]) {
    console.log(`\n# the entry is 20 at the plot's scale, render h ${h}`);
    const m = await draw({ render: { w: 400, h } });
    check(
      "the line is 20 × σ",
      m.line !== undefined && close(m.line, 20 * m.sigma),
      m
    );
  }

  console.log("\n# a sized chart in a sized render: one σ for the domain");
  {
    // The chart's plot maps the domain at its own σ. The render's slot
    // holds no data of the root's own, so it sets no second σ for the
    // entry (Python always renders at a size, 800 × 600 by default).
    const m = await draw({
      chart: { w: 300, h: 200 },
      render: { w: 800, h: 600 },
    });
    check(
      "the line is 20 × σ",
      m.line !== undefined && close(m.line, 20 * m.sigma),
      m
    );
  }

  console.log("\n# no axis on the dimension with no origin");
  {
    const m = await draw({ chart: { w: 300, h: 200 } });
    // An axis line on y would be a gray rect 1 px wide and about the
    // plot's height; the entry's line is far shorter.
    const yLines = m.rects.filter(
      (r) => r.style?.fill === "gray" && r.w === 1 && (r.h ?? 0) >= 150
    );
    check("no y axis line", yLines.length === 0, yLines);
  }

  console.log("\n# a horizontal stack's entry lies along x");
  {
    const m = await draw({ chart: { w: 300, h: 200 }, dir: "x" });
    check(
      "the line is 20 × σ",
      m.line !== undefined && close(m.line, 20 * m.sigma),
      m
    );
  }

  console.log("\n# small multiples share one length scale, and one entry");
  {
    // Stacks spread down the page: the root's y is the spread's, and the
    // stacks' widths are one keyed domain in its space.
    const dl = await chart(DATA, { w: 300, h: 300 })
      .flow(
        spread({ by: "k", dir: "y", spacing: 10 }),
        stack({ by: "s", dir: "y", baseline: Baseline.middle() })
      )
      .mark(rect({ h: "v", fill: "s" }))
      .toDisplayList({});
    const m = measure(dl);
    check(
      "the line is 20 × σ",
      m.line !== undefined && close(m.line, 20 * m.sigma),
      m
    );
  }

  console.log("\n# a polar stack draws no entry yet (#1322)");
  {
    const dl = await chart(DATA, { w: 300, h: 300, coord: Coord.clock() })
      .flow(stack({ by: "s", dir: "y", baseline: Baseline.middle() }))
      .mark(rect({ h: "v", fill: "s" }))
      .toDisplayList({});
    const { texts } = shapes(dl);
    check(
      "no length entry",
      !texts.some((t) => /^\d+ v$/.test(t)),
      texts
    );
  }

  console.log("\n# legend options");
  {
    const titled = await draw({
      chart: { w: 300, h: 200, legend: { y: { title: "fish" } } },
    });
    check(
      "a title names the amount",
      titled.texts.includes("20 fish"),
      titled.texts
    );
    const noY = await draw({
      chart: { w: 300, h: 200, legend: { y: false } },
    });
    check(
      "legend: { y: false } drops the entry and keeps the colors",
      noY.line === undefined && noY.texts.includes("p"),
      noY.texts
    );
    const noColor = await draw({
      chart: { w: 300, h: 200, legend: { color: false } },
    });
    check(
      "legend: { color: false } drops the colors and keeps the entry",
      noColor.line !== undefined && !noColor.texts.includes("p"),
      noColor.texts
    );
    const none = await draw({ chart: { w: 300, h: 200, legend: false } });
    check(
      "legend: false drops both",
      none.line === undefined && !none.texts.includes("p"),
      none.texts
    );
    const byRender = await draw({
      chart: { w: 300, h: 200 },
      render: { legend: { color: false } },
    });
    check(
      "the render's legend option applies too",
      byRender.line !== undefined && !byRender.texts.includes("p"),
      byRender.texts
    );
  }

  console.log("\n# the legend option round-trips through the IR");
  {
    const legend = { color: false, y: { title: "fish" } };
    const doc = await spec({ chart: { w: 300, h: 200, legend } }).toJSON();
    const wire = JSON.parse(JSON.stringify(doc));
    check(
      "the chart's legend option is on the wire as written",
      JSON.stringify(wire.root?.options?.legend) === JSON.stringify(legend),
      wire.root?.options
    );
    const m = measure(await Serialize.buildIR(wire).toDisplayList({}));
    check(
      "the rebuilt chart draws the titled entry and no swatches",
      m.texts.includes("20 fish") && !m.texts.includes("p"),
      m.texts
    );
  }

  report();
}

main();

/**
 * A layer's space is a collection of its children's spaces (#1257): the
 * type pass gives each child the space it is in in the layer
 * (`ClaimWalk.parts`). The layer's axes attach to the children whose space
 * there is continuous or ordinal; any other child is dressing, beside or
 * over them: an `enclose` around refs, a chart of outlines or a line
 * layered over a scatter, a value label a gap sets past its bar. A ref is
 * in the part its target is in, a `nest` unifies its outer box with the
 * inner it pads, and an `align` puts each operand in its partner's part,
 * as it has no offset (a flower at the end of its stem). A box placed
 * whole (a chart's box, a node with a size of its own) is pixels to its
 * layer, as a text at a literal pixel is: neither is in the layer's space.
 * Dressing takes room but is no part of the plot.
 * Run: `tsx src/tests/plotSpace.test.ts` (wired into `pnpm test` as
 * `test:plot-space`).
 */
// The library first, so its modules initialize in their usual order.
import {
  chart,
  scatter,
  circle,
  group,
  enclose,
  line,
  selectAll,
  Shape,
  layer,
  rect,
  text,
  spread,
  value,
  Constraint,
} from "../lib";
import { runLayout } from "../ast/gofish";
import { GoFishNode } from "../ast/_node";
import { lowerToDisplayList } from "../ast/displayList/lower";
import { check, items, report } from "./testHelpers";

/** Every node of the tree under `n`, `n` included. */
const nodesOf = (n: GoFishNode): GoFishNode[] => [
  n,
  ...n.children.flatMap((c) => (c instanceof GoFishNode ? nodesOf(c) : [])),
];

/** The indices of `n`'s children that `keep` holds for. */
const indicesWhere = (
  n: GoFishNode,
  keep: (c: GoFishNode["children"][number]) => boolean
): number[] => n.children.flatMap((c, i) => (keep(c) ? [i] : []));

const isLabel = (c: GoFishNode["children"][number]) =>
  c instanceof GoFishNode && c.type === "label";

/** The layer of a laid-out tree that holds its labels (`elaborateLabels`). */
const labelLayer = (root: GoFishNode): GoFishNode =>
  nodesOf(root).find((n) => n.children.some(isLabel))!;

/** The gap an axis line keeps from the plot (`AXIS_CONTENT_GAP`). */
const GAP = 6;

const close = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) <= eps;

const points = [
  { s: "a", x: 1, y: 1 },
  { s: "a", x: 2, y: 3 },
  { s: "b", x: 5, y: 4 },
  { s: "b", x: 6, y: 6 },
];

/** A scatter of `points` with one oval per group layered over it. */
const ovals = (size?: { w: number; h: number }) =>
  chart(points, size)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 2.5, fill: "s" }).name("points"))
    .layer(
      chart(selectAll("points"))
        .flow(group({ by: "s" }))
        .mark(enclose({ shape: Shape.oval(), padding: 6, fill: "s" }))
    );

/** The kind of a node's type on each axis. */
const kinds = (n: GoFishNode) =>
  (n._underlyingSpace ?? []).map((s) => s?.kind).join(",");

/** The x extent of a path's points. */
const pathX = (d: string): [number, number] => {
  const xs = [...d.matchAll(/[ML]([-\d.]+),/g)].map((m) => Number(m[1]));
  return [Math.min(...xs), Math.max(...xs)];
};

/** The axis lines and the points of a laid-out tree, in render pixels. */
const geometry = (root: GoFishNode) => {
  const all = items({ items: lowerToDisplayList(root) });
  const gray = all.filter((i) => i.kind === "rect" && i.style?.fill === "gray");
  const yLine = gray.find((r) => r.w === 1 && (r.h ?? 0) > 50)!;
  const xLine = gray.find((r) => r.h === 1 && (r.w ?? 0) > 50)!;
  const dots = all.filter((i) => i.kind === "ellipse");
  const hull = {
    left: Math.min(...dots.map((d) => d.cx - d.rx)),
    bottom: Math.max(...dots.map((d) => d.cy + d.ry)),
  };
  const outlines = all.filter((i) => i.kind === "path").map((p) => pathX(p.d));
  return { yLine, xLine, hull, outlines };
};

async function main() {
  console.log(
    "\n# the inferred spaces of a scatter with ovals layered over it"
  );
  {
    const node = await ovals().resolve();
    const data = await runLayout({ w: 300, h: 200, axes: true }, node);
    const nodes = nodesOf(data.child);
    // The layer `.layer()` makes: the scatter, then the chart of ovals.
    const layered = nodes.find(
      (n) =>
        n._chartContent === true &&
        n.children.length === 2 &&
        n.children.every((c) => c instanceof GoFishNode && c.type === "layer")
    )!;
    const [scatterPart, ovalChart] = layered.children as GoFishNode[];
    check(
      "the scatter is continuous on both axes",
      kinds(scatterPart) === "continuous,continuous",
      kinds(scatterPart)
    );
    check(
      "the chart of ovals carries no space on either axis",
      kinds(ovalChart) === "undefined,undefined",
      kinds(ovalChart)
    );
    const encloses = nodesOf(ovalChart).filter((n) => n.type === "enclose");
    check(
      "each enclose carries no space",
      encloses.length === 2 &&
        encloses.every((n) => kinds(n) === "undefined,undefined"),
      encloses.map(kinds)
    );
    check(
      "the layer stays continuous",
      kinds(layered) === "continuous,continuous",
      kinds(layered)
    );
    check(
      "the chart of ovals is dressing of the layer on both axes",
      layered.claimWalk?.dressing[0].has(1) === true &&
        layered.claimWalk?.dressing[1].has(1) === true &&
        !layered.claimWalk?.dressing[0].has(0),
      layered.claimWalk?.dressing
    );
    // Its plot is the scatter's box: the ovals are left out.
    const span = layered.localSpan("plot", 0);
    const { min, max } = scatterPart.dims[0];
    check(
      "the layer's plot is the scatter's box on x",
      span !== undefined && close(span[0], min!) && close(span[1], max!),
      { span, scatter: [min, max], layer: layered.dims[0] }
    );
  }

  console.log("\n# a line over the points is dressing; the labels are ink");
  {
    const node = await chart(points)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(circle({ r: 2.5 }).name("p"))
      .layer(chart(selectAll("p")).mark(line()))
      .resolve();
    const data = await runLayout({ w: 300, h: 200, axes: false }, node);
    const layered = nodesOf(data.child).find(
      (n) => n._chartContent === true && n.children.length === 2
    )!;
    const lineChart = layered.children[1] as GoFishNode;
    check(
      "the line chart carries no space",
      kinds(lineChart) === "undefined,undefined",
      kinds(lineChart)
    );
    check(
      "the line chart is dressing",
      layered.claimWalk?.dressing[0].has(1) === true &&
        layered.claimWalk?.dressing[1].has(1) === true,
      layered.claimWalk?.dressing
    );
  }
  {
    const node = await chart(points.map((p, i) => ({ ...p, n: `p${i}` })))
      .flow(scatter({ by: "n", x: "x", y: "y" }))
      .mark(circle({ r: 3 }).label("n"))
      .resolve();
    const data = await runLayout({ w: 300, h: 200, axes: false }, node);
    // The layer of the mark's refs and their labels.
    const labeled = labelLayer(data.child);
    const refs = indicesWhere(labeled, (c) => !(c instanceof GoFishNode));
    const labels = indicesWhere(labeled, isLabel);
    check(
      "a label carries no space",
      labels.every(
        (i) => kinds(labeled.children[i] as GoFishNode) === "undefined,undefined"
      )
    );
    check(
      "a ref stands for its mark: it is never dressing",
      refs.length > 0 &&
        refs.every(
          (i) =>
            !labeled.claimWalk!.dressing[0].has(i) &&
            !labeled.claimWalk!.dressing[1].has(i)
        )
    );
    check(
      "a label beside a ref is dressing or ink, never plot",
      labels.length > 0 &&
        labels.every((i) =>
          ([0, 1] as const).every(
            (a) =>
              labeled.claimWalk!.dressing[a].has(i) ||
              labeled.claimWalk!.ink[a].has(i)
          )
        )
    );
  }

  for (const [title, size, render] of [
    ["a chart with a size of its own", { w: 300, h: 200 }, {}],
    ["a chart sized by its render", undefined, { w: 400, h: 300 }],
  ] as const) {
    console.log(`\n# the axes sit beside the points, not the ovals: ${title}`);
    const node = await ovals(size).resolve();
    const data = await runLayout({ ...render, axes: true }, node);
    const { yLine, xLine, hull, outlines } = geometry(data.child);
    check(
      "the y axis line is the gap left of the points",
      yLine !== undefined && close(hull.left - (yLine.x! + yLine.w!), GAP),
      { yLine, hull }
    );
    check(
      "the x axis line is the gap below the points",
      xLine !== undefined && close(xLine.y! - hull.bottom, GAP),
      { xLine, hull }
    );
    check(
      "an oval reaches past the y axis line, which draws over it",
      outlines.some(([lo]) => lo < yLine.x!),
      { outlines, yLine: yLine.x }
    );
  }

  console.log(
    "\n# a nest's outer box, and a caption beside a chart, are no dressing"
  );
  {
    // The outer box a nest sizes from its data-sized inner is tied to it,
    // so the spread lays the padded boxes `spacing` apart.
    const padded = (v: number) =>
      layer([
        rect({ fill: "#eee" }).name("outer"),
        rect({ w: value(v), h: 18 }).name("inner"),
      ]).relate(({ outer, inner }: any) => [
        Constraint.nest({ x: 8, y: 8 }, [outer, inner]),
      ]);
    const node = spread({ dir: "x", spacing: 10 }, [padded(40), padded(90)]);
    const data = await runLayout(
      { w: 300, h: 80 },
      await (node as any)(undefined)
    );
    const cells = (data.child as GoFishNode).children as GoFishNode[];
    check(
      "the outer box is no dressing of its layer",
      cells.every((c) => c.claimWalk?.dressing[0].size === 0),
      cells.map((c) => [...(c.claimWalk?.dressing[0] ?? [])])
    );
    const rects = items({ items: lowerToDisplayList(data.child) }).filter(
      (i) => i.kind === "rect" && i.style?.fill === "#eee"
    );
    check(
      "the padded boxes sit 10 px apart",
      rects.length === 2 &&
        close(rects[1].x! - (rects[0].x! + rects[0].w!), 10, 1e-3),
      rects.map((r) => [r.x, r.w])
    );

    // A text at a literal pixel beside a chart placed whole: both are
    // pixels to the layer, so it has no part its axes visualize.
    const captioned = layer([
      chart(points, { axes: false, w: 100, h: 50 })
        .flow(scatter({ x: "x", y: "y" }))
        .mark(circle({ r: 2 })),
      text({ x: 0, y: 80, text: "caption" }),
    ]);
    const c = await runLayout({}, await (captioned as any)(undefined));
    check(
      "a caption beside a chart placed whole is no dressing",
      (c.child as GoFishNode).claimWalk?.dressing[1].size === 0,
      [...((c.child as GoFishNode).claimWalk?.dressing[1] ?? [])]
    );
  }

  console.log("\n# an align joins its partner's part; a gap does not");
  {
    // A head with no space of its own, aligned to the end of a stem whose
    // height is data: an align has no offset, so the head's anchor is the
    // stem's end, a datum on y. The head is in the stem's part there.
    const plant = layer([
      rect({ w: 4, h: value(30) }).name("stem"),
      circle({ r: 10 }).name("head"),
    ]).relate(({ stem, head }: any) => [
      Constraint.align({ x: "middle", y: ["end", "middle"] }, [stem, head]),
    ]);
    const data = await runLayout(
      { w: 100, h: 100 },
      await (plant as any)(undefined)
    );
    const walk = (data.child as GoFishNode).claimWalk!;
    check(
      "an align puts the head in the stem's continuous part on y",
      walk.parts(1)?.[1]?.kind === "continuous",
      walk.parts(1)?.map((s) => s.kind)
    );
    check("the aligned head is no dressing", walk.dressing[1].size === 0, [
      ...walk.dressing[1],
    ]);
  }
  {
    // A shade with no height of its own, span-aligned to a bar whose height
    // is data: a span ties both endpoints, so both are at data on y and the
    // shade is in the bar's part there.
    const shaded = layer([
      rect({ y: 0, w: 4, h: value(30) }).name("bar"),
      rect({ w: 12 }).name("shade"),
    ]).relate(({ bar, shade }: any) => [
      Constraint.align({ x: "middle", y: "span" }, [bar, shade]),
    ]);
    const data = await runLayout(
      { w: 100, h: 100 },
      await (shaded as any)(undefined)
    );
    const walk = (data.child as GoFishNode).claimWalk!;
    check(
      "a span align puts the shade in the bar's continuous part on y",
      walk.parts(1)?.[1]?.kind === "continuous",
      walk.parts(1)?.map((s) => s.kind)
    );
    check("the span-aligned shade is no dressing", walk.dressing[1].size === 0, [
      ...walk.dressing[1],
    ]);
  }
  {
    // A value label on its bar: a chain sets it a gap of pixels past the
    // bar's top on y, and an align centers it on the bar on x. On y its
    // anchor is a datum plus pixels, in no space of the layer's, so it is
    // dressing there; on x it is in the bar's part.
    const labeled = async (position?: "center") => {
      const node = await chart([
        { c: "a", v: 10 },
        { c: "b", v: 30 },
      ])
        .flow(spread({ by: "c", dir: "x" }))
        .mark(rect({ h: "v" }).label("v", position ? { position } : {}))
        .resolve();
      const data = await runLayout({ w: 200, h: 100, axes: true }, node);
      const layered = labelLayer(data.child);
      return {
        walk: layered.claimWalk!,
        labels: indicesWhere(layered, isLabel),
      };
    };
    const outset = await labeled();
    check(
      "a label a gap sets past its bar is dressing on y",
      outset.labels.length === 2 &&
        outset.labels.every((i) => outset.walk.dressing[1].has(i)),
      [...outset.walk.dressing[1]]
    );
    check(
      "a label an align centers on its bar is in its part on x",
      outset.labels.every(
        (i) =>
          outset.walk.parts(0)?.[i]?.kind === "ordinal" &&
          !outset.walk.dressing[0].has(i)
      ),
      outset.walk.parts(0)?.map((s) => s.kind)
    );
    const center = await labeled("center");
    check(
      "a label aligned to its bar's center is no dressing",
      center.walk.dressing[0].size === 0 && center.walk.dressing[1].size === 0,
      center.walk.dressing
    );
  }

  report();
}

main();

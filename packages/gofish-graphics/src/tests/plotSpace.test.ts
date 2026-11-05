/**
 * The plot is the part of a layer that carries its space (#1257): a child
 * whose own type on an axis is continuous or ordinal, that a `position`
 * places at a datum, or that stands for a node placed elsewhere (a `ref`)
 * carries the layer's space there. Any other child, in a layer where one
 * does, is dressing: an `enclose` around refs, a chart of outlines or a
 * line layered over a scatter, a value label beside its bar. Dressing
 * takes room but is no part of the plot, and the axes sit beside the plot.
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
  const gray = all.filter(
    (i) => i.kind === "rect" && i.style?.fill === "gray"
  );
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
  console.log("\n# the inferred spaces of a scatter with ovals layered over it");
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
    const span = layered.localPlotSpan(0);
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
    // The layer of the mark's refs and their labels (`elaborateLabels`).
    const labeled = nodesOf(data.child).find((n) =>
      n.children.some((c) => c instanceof GoFishNode && c.type === "label")
    )!;
    const refs = labeled.children
      .map((c, i) => [c, i] as const)
      .filter(([c]) => !(c instanceof GoFishNode));
    const labels = labeled.children
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c instanceof GoFishNode && c.type === "label");
    check(
      "a label carries no space",
      labels.every(([c]) => kinds(c as GoFishNode) === "undefined,undefined")
    );
    check(
      "a ref stands for its mark: it is never dressing",
      refs.length > 0 &&
        refs.every(
          ([, i]) =>
            !labeled.claimWalk!.dressing[0].has(i) &&
            !labeled.claimWalk!.dressing[1].has(i)
        )
    );
    check(
      "a label beside a ref is dressing or ink, never plot",
      labels.length > 0 &&
        labels.every(([, i]) =>
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

  report();
}

main();

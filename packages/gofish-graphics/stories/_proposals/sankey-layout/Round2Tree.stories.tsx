import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, scatter, rect, line, layer, field, selectAll, resolve, Curve } from "../../../src/lib";
import { flatTree, boxTree, contourTree, clusterTree, extent, layers } from "./_proto";
import { flare } from "./data";

// Round 2: tidy trees under approach A's factoring. A tree is a nodes table
// plus a links table (parent → child). Its layer is depth (= layers(...,
// "left")), its order is DFS order. The question is the y placement:
//   FlatA    – today's A: each column is its own centered spread
//   Nested   – nested spreads, each subtree a box (gotree's distribute)
//   Contour  – Reingold–Tilford contour packing (stand-in), placed by scatter
//   Cluster  – d3.cluster's rule (leaves last, parent at the children's mean)
const meta: Meta = { title: "Proposals/Sankey Layout/Round 2 Tree" };
export default meta;

const SIZE = 8; // node extent on y (px)
const GAP = 6; // min gap between two nodes in one layer
const COL = 120; // gap between columns (room for labels)
const t = flatTree(flare);

// `label` is the node's name: a field in the chart() stories, a constant in
// the combinator one (combinator children carry no datum).
const node = (label: any = "name") =>
  rect({ w: SIZE, h: SIZE, fill: "#4682b4" }).label(label, { position: "right", fontSize: 8 } as any);

const edges = (from: string) =>
  chart(t.links)
    .flow(resolve(["source", "target"], { from: selectAll(from) }))
    .mark((es: any[]) =>
      layer(es.map((e) => line({ curve: Curve.bezier(), dir: "x", stroke: "#aaa", strokeWidth: 1, fill: "none" } as any, [e.source, e.target])))
    );

const W = 640;
const draw = (n: any, h: number) => {
  const container = initializeContainer();
  n.render(container, { w: W, h, axes: false, legend: false } as any);
  return container;
};

/** y from a layout, placed by spread (x) + scatter (y). */
const placed = (y: Map<string, number>, layer_: Map<string, number>) => {
  const h = extent(y, SIZE);
  const rows = t.names.map((name) => ({ name, layer: layer_.get(name)!, y: h - y.get(name)! }));
  return draw(
    chart(rows, { axes: false } as any)
      .flow(
        spread({ by: field("layer").sort(), dir: "x", spacing: COL, alignment: "start", axes: false } as any),
        scatter({ by: "name", y: "y", axes: false } as any)
      )
      .mark(node().name("n"))
      .layer(edges("n")),
    h
  );
};

export const FlatA: StoryObj = {
  render: () => {
    const rows = t.names.map((name) => ({ name, layer: t.depth.get(name)!, order: t.order.get(name)! }));
    const cols = new Map<number, number>();
    for (const r of rows) cols.set(r.layer, (cols.get(r.layer) ?? 0) + 1);
    const h = Math.max(...cols.values()) * (SIZE + GAP) - GAP;
    return draw(
      chart(rows, { axes: false } as any)
        .flow(
          spread({ by: field("layer").sort(), dir: "x", spacing: COL, alignment: "middle", axes: false } as any),
          // sort by name in DFS order: resolve() matches links on the leaf key
          spread({ by: field("name").sort(t.names), dir: "y", spacing: GAP, axes: false } as any)
        )
        .mark(node().name("n"))
        .layer(edges("n")),
      h
    );
  },
};

export const Nested: StoryObj = {
  render: () => {
    // gotree-style: a subtree is spread x [parent, spread y children]; the
    // parent is centered on its children's box (alignment: "middle").
    const sub = (n: string): any => {
      const kids = t.kids.get(n)!;
      const me = node(() => n).name(n);
      if (!kids.length) return me;
      return spread({ dir: "x", spacing: COL, alignment: "middle" }, [
        me,
        spread({ dir: "y", spacing: GAP, alignment: "start" }, kids.map(sub)),
      ]);
    };
    const h = extent(boxTree(t, SIZE, GAP), SIZE);
    return draw(
      layer([sub(t.root)]).relate((r: any) =>
        t.links.map((l) =>
          line({ curve: Curve.bezier(), dir: "x", stroke: "#aaa", strokeWidth: 1, fill: "none" } as any, [r[l.source], r[l.target]])
        )
      ),
      h
    );
  },
};

export const Contour: StoryObj = { render: () => placed(contourTree(t, SIZE, GAP), t.depth) };

export const Cluster: StoryObj = {
  render: () => {
    const { y, layer: l } = clusterTree(t, SIZE, GAP);
    return placed(y, l);
  },
};

// Cluster's leaf positions with Layering.justify instead of "from sinks":
// display, flex and physics stay at depth 1, so their links span 2 layers.
export const ClusterJustify: StoryObj = {
  render: () => placed(clusterTree(t, SIZE, GAP).y, layers(t.names, t.links, "justify")),
};

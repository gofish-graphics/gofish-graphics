import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  rect,
  ribbon,
  selectAll,
  group,
  layer,
  field,
  Curve,
  fr,
  text,
  project,
  resolve,
  arrow,
} from "../../../src/lib";
import { layers, barycenterOrder, linkEnds, sortedNames, type Link } from "./_proto";
import { energyNames, energyLinks, smallNames, smallLinks, depNames, depLinks } from "./data";

// Approach A: pure composition. `layers` and `barycenterOrder` are plain-JS
// stand-ins for proposed `derive` helpers that add a `layer` and an `order`
// field. Everything else is today's operators: a spread of columns, a spread
// of nodes with px gaps, and the stacked-ribbons ends table for the links.
const meta: Meta = { title: "Proposals/Sankey Layout/Approach A" };
export default meta;

// NOTE: `alignment: "end"` puts the columns at the TOP only because the label
// layer below flips what start/end mean on y (Repro/AlignStartWithLabels).
const sankey = (names: string[], links: Link[], opts: { w: number; h: number; ordered?: boolean }) => {
  const container = initializeContainer();
  // --- proposed: derive(layers({ from: "source", to: "target", align: "justify" }))
  const col = layers(names, links, "justify");
  // --- proposed: derive(order({ by: "layer", strategy: Order.barycenter() }))
  const order = opts.ordered === false
    ? new Map(names.map((n, i) => [n, i]))
    : barycenterOrder(names, links, col);
  const ends = linkEnds(links, col, order);
  layer([
    chart(ends)
      .flow(
        spread({ by: field("layer").sort(), dir: "x", spacing: fr(1), alignment: "end", axes: false /* see NOTE */ }),
        spread({ by: field("node").sort(sortedNames(names, col, order)), dir: "y", spacing: 10, axes: false }),
        // the ribbon half (stacked-ribbons ends table): in-ports | out-ports
        spread({ by: field("side").sort(["in", "out"]), dir: "x", spacing: 0, alignment: "start", axes: false }),
        spread({ by: field("far").sort(), dir: "y", spacing: 0, axes: false })
      )
      .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ports")),
    chart(selectAll("ports"))
      .flow(group({ by: "link" }))
      .mark(ribbon({ opacity: 0.4, fill: "src", curve: Curve.bezier() })),
    chart(selectAll("ports"))
      .flow(group({ by: "node" }))
      .mark((ports: any[]) =>
        spread({ dir: "x", spacing: 3, alignment: "middle" }, [
          ports[0],
          text({ text: String(project(ports[0], "node")), fontSize: 9 }),
        ])
      ),
  ]).render(container, { w: opts.w, h: opts.h, axes: false, legend: false } as any);
  return container;
};

export const Energy: StoryObj = { render: () => sankey(energyNames, energyLinks, { w: 960, h: 600 }) };
export const Small: StoryObj = { render: () => sankey(smallNames, smallLinks, { w: 480, h: 300 }) };
export const SmallInputOrder: StoryObj = {
  render: () => sankey(smallNames, smallLinks, { w: 480, h: 300, ordered: false }),
};

// The same factoring on a non-sankey DAG: fixed-size boxes, arrows for edges.
export const Dependencies: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const col = layers(depNames, depLinks, "left"); // proposed: derive(layers(...))
    const order = barycenterOrder(depNames, depLinks, col); // proposed: derive(order(...))
    const nodes = depNames.map((name) => ({ name, layer: col.get(name)! }));
    chart(nodes, { axes: false })
      .flow(
        spread({ by: field("layer").sort(), dir: "x", spacing: fr(1), alignment: "middle" }),
        spread({ by: field("name").sort(sortedNames(depNames, col, order)), dir: "y", spacing: 24 })
      )
      .mark(rect({ w: 56, h: 24, fill: "#f3f3f3", stroke: "#555", strokeWidth: 1 }).label("name", { position: "center" }).name("box"))
      .layer(
        chart(depLinks)
          .flow(resolve(["source", "target"], { from: selectAll("box") }))
          .mark((edges: any[]) => layer(edges.map((e) => arrow({ stroke: "#777", strokeWidth: 1.5, bow: 0, stretch: 0, padStart: 2, padEnd: 4 } as any, [e.source, e.target]))))
      )
      .render(container, { w: 480, h: 260 });
    return container;
  },
};

export const EnergyInputOrder: StoryObj = {
  render: () => sankey(energyNames, energyLinks, { w: 960, h: 600, ordered: false }),
};

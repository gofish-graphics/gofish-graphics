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
} from "../../../src/lib";
import { layers, barycenterOrder, linkEnds, sortedNames, type Link, type Align } from "./_proto";
import { energyNames, energyLinks, smallNames, smallLinks } from "./data";

// Approach D: an elaboration macro, like GoTree's `tree(spec, data)`. The
// template takes a small sankey spec and EXPANDS into Approach A's core spec
// (two data helpers, four spread tiers, a ribbon layer, a label layer). It
// adds no layout of its own, so its render is identical to Approach A's.
const meta: Meta = { title: "Proposals/Sankey Layout/Approach D" };
export default meta;

type SankeySpec = {
  layering?: Align; // which column a node goes in (d3 nodeAlign)
  spacing?: number; // px between nodes in a column
  nodeWidth?: number;
  node?: { fill?: string };
  link?: { opacity?: number };
};

// THE TEMPLATE (a library-side function in the proposal; ~25 lines).
function sankey(spec: SankeySpec, data: { nodes: string[]; links: Link[] }) {
  const { layering = "justify", spacing = 10, nodeWidth = 12 } = spec;
  const col = layers(data.nodes, data.links, layering); //  derive(layers(...))
  const order = barycenterOrder(data.nodes, data.links, col); //  derive(order(...))
  const ends = linkEnds(data.links, col, order);
  return layer([
    chart(ends)
      .flow(
        spread({ by: field("layer").sort(), dir: "x", spacing: fr(1), alignment: "end", axes: false }),
        spread({ by: field("node").sort(sortedNames(data.nodes, col, order)), dir: "y", spacing, axes: false }),
        spread({ by: field("side").sort(["in", "out"]), dir: "x", spacing: 0, alignment: "start", axes: false }),
        spread({ by: field("far").sort(), dir: "y", spacing: 0, axes: false })
      )
      .mark(rect({ w: nodeWidth / 2, h: "value", fill: spec.node?.fill ?? "#555" }).name("ports")),
    chart(selectAll("ports"))
      .flow(group({ by: "link" }))
      .mark(ribbon({ opacity: spec.link?.opacity ?? 0.4, fill: "src", curve: Curve.bezier() })),
    chart(selectAll("ports"))
      .flow(group({ by: "node" }))
      .mark((ports: any[]) =>
        spread({ dir: "x", spacing: 3, alignment: "middle" }, [
          ports[0],
          text({ text: String(project(ports[0], "node")), fontSize: 9 }),
        ])
      ),
  ]);
}

// THE USER'S SPEC
export const Energy: StoryObj = {
  render: () => {
    const container = initializeContainer();
    sankey({ layering: "justify", spacing: 10 }, { nodes: energyNames, links: energyLinks })
      .render(container, { w: 960, h: 600, axes: false, legend: false } as any);
    return container;
  },
};

export const Small: StoryObj = {
  render: () => {
    const container = initializeContainer();
    sankey({ spacing: 10 }, { nodes: smallNames, links: smallLinks })
      .render(container, { w: 480, h: 300, axes: false, legend: false } as any);
    return container;
  },
};

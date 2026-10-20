import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { energy } from "../../../src/data/energy";
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
} from "../../../src/lib";
import { sankeyDepths, orderColumns, unpivotLinkEnds } from "./sankeyPrep";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Energy Sankey" };
export default meta;

const names = energy.nodes.map((n) => n.name);
const links = energy.links.map((l) => ({
  source: names[l.source],
  target: names[l.target],
  value: l.value,
}));
const depth = sankeyDepths(names, links);
const order = orderColumns(names, links, depth);
const ends = unpivotLinkEnds(order, links, depth);

const sankey = (nodeTier: Record<string, unknown> = {}) => {
  const container = initializeContainer();
  layer([
    chart(ends)
      .flow(
        spread({ by: field("depth").sort(), dir: "x", spacing: 100, alignment: "start", axes: false }),
        spread({ by: field("node").sort(order), dir: "y", spacing: 10, axes: false, ...nodeTier }),
        spread({ by: field("side").sort(["in", "out"]), dir: "x", spacing: 0, alignment: "start", axes: false }),
        spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
      )
      .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ports")),
    chart(selectAll("ports"), { legend: false })
      .flow(group({ by: "link" }))
      .mark(ribbon({ opacity: 0.4, fill: "src", curve: Curve.bezier() })),
  ]).render(container, { w: 960, h: 600, legend: false } as any);
  return container;
};

export const Default: StoryObj = { render: () => sankey() };

// Probe: d3 makes every column fill the extent by growing the gaps. Does a
// sized node tier (h: 560) do that?
export const FixedColumnHeight: StoryObj = { render: () => sankey({ h: 560 }) };

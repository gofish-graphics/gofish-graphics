import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { type LayeredOptions } from "./_proto";
import { layered } from "./_layered";
import { energyNames, energyLinks, smallNames, smallLinks, depNames, depLinks } from "./data";

// Approach C: one graph-layout operator that owns nodes and edges, with the
// three Sugiyama phases as strategy options (d3-dag / ELK style). `layered`
// below is a throwaway stand-in: `layeredGeometry` computes every position
// and this wrapper emits absolutely placed marks.
const meta: Meta = { title: "Proposals/Sankey Layout/Approach C" };
export default meta;

const render = (node: any, w: number, h: number) => {
  const container = initializeContainer();
  node.render(container, { w, h, axes: false, legend: false });
  return container;
};

const sankeyOpts = (w: number, h: number, coordinates: "stack" | "relax"): LayeredOptions => ({
  w: w - 160, h, layering: "justify", ordering: "barycenter", coordinates, spacing: 10, nodeSize: "value", nodeWidth: 12,
});

export const EnergyRelax: StoryObj = {
  render: () => render(layered(energyNames, energyLinks, sankeyOpts(960, 600, "relax"), "sankey"), 960, 600),
};
export const SmallRelax: StoryObj = {
  render: () => render(layered(smallNames, smallLinks, sankeyOpts(480, 300, "relax"), "sankey"), 480, 300),
};
export const SmallStack: StoryObj = {
  render: () => render(layered(smallNames, smallLinks, sankeyOpts(480, 300, "stack"), "sankey"), 480, 300),
};
export const Dependencies: StoryObj = {
  render: () =>
    render(
      layered(depNames, depLinks, {
        w: 440, h: 220, layering: "left", ordering: "barycenter", coordinates: "stack", spacing: 24, nodeSize: 24, nodeWidth: 56, virtualNodes: true,
      }, "graph"),
      480,
      260
    ),
};

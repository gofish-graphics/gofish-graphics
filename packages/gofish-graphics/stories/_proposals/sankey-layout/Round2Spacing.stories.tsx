import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { layeredGeometry, gapsFromLinks, type LayeredOptions, type Link } from "./_proto";
import { layered } from "./_layered";
import { energyNames, energyLinks, smallNames, smallLinks } from "./data";

// Round 2: column gaps from the links. Same y placement, same canvas width;
// only the x of each column changes. The "LinkGaps" stories size each gap in
// proportion to its steepest link (`gapsFromLinks`, rule "steepest"), a
// stand-in for a column-spacing strategy that runs AFTER y placement.
const meta: Meta = { title: "Proposals/Sankey Layout/Round 2 Spacing" };
export default meta;

const opts = (w: number, h: number, coordinates: "stack" | "relax"): LayeredOptions => ({
  w: w - 160, h, layering: "justify", ordering: "barycenter", coordinates, spacing: 10, nodeSize: "value", nodeWidth: 12,
});

const story = (names: string[], links: Link[], w: number, h: number, coordinates: "stack" | "relax", fitted: boolean): StoryObj => ({
  render: () => {
    let o = opts(w, h, coordinates);
    if (fitted) {
      // phase order: y first (layeredGeometry), then x from the links' Δy
      const { colX } = gapsFromLinks(layeredGeometry(names, links, o), { w: o.w, nodeWidth: 12, minGap: 30 });
      o = { ...o, colX };
    }
    const container = initializeContainer();
    layered(names, links, o, "sankey").render(container, { w, h, axes: false, legend: false } as any);
    return container;
  },
});

export const EnergyBarycenter = story(energyNames, energyLinks, 960, 600, "stack", false);
export const EnergyBarycenterLinkGaps = story(energyNames, energyLinks, 960, 600, "stack", true);
export const EnergyRelax = story(energyNames, energyLinks, 960, 600, "relax", false);
export const EnergyRelaxLinkGaps = story(energyNames, energyLinks, 960, 600, "relax", true);
export const SmallBarycenter = story(smallNames, smallLinks, 480, 300, "stack", false);
export const SmallBarycenterLinkGaps = story(smallNames, smallLinks, 480, 300, "stack", true);
export const SmallRelax = story(smallNames, smallLinks, 480, 300, "relax", false);
export const SmallRelaxLinkGaps = story(smallNames, smallLinks, 480, 300, "relax", true);

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  spread,
  scatter,
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
import { layers, relax, linkEnds, type Link } from "./_proto";
import { energyNames, energyLinks, smallNames, smallLinks } from "./data";

// Approach B: relaxed coordinate assignment. `relax` is a plain-JS port of
// d3-sankey's relaxation (it needs every column and every link at once). It
// returns each node's y in data units (value), which the node tier places
// with today's `scatter` (yMin / yMax). The ports and ribbons are Approach A's.
const meta: Meta = { title: "Proposals/Sankey Layout/Approach B" };
export default meta;

const relaxed = (
  names: string[],
  links: Link[],
  opts: { w: number; h: number; interleave?: boolean }
) => {
  const container = initializeContainer();
  // --- proposed: derive(layers({ from: "source", to: "target", align: "justify" }))
  const col = layers(names, links, "justify");
  // --- stand-in for the relaxed y: d3's sweeps + collision removal, in px,
  //     converted to value units so one y scale serves position and size.
  const { box, ky } = relax(names, links, col, { height: opts.h, padding: 10, interleave: opts.interleave });
  const ends = linkEnds(links, col, new Map([...box].map(([n, b]) => [n, b.y0]))).map((e) => ({
    ...e,
    // the y axis points up: d3's top-down px become bottom-up value units
    yMin: (opts.h - box.get(e.node)!.y1) / ky,
    yMax: (opts.h - box.get(e.node)!.y0) / ky,
  }));
  layer([
    chart(ends)
      .flow(
        spread({ by: field("layer").sort(), dir: "x", spacing: fr(1), alignment: "start", axes: false }),
        scatter({ by: "node", yMin: "yMin", yMax: "yMax", axes: false }),
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

export const Energy: StoryObj = { render: () => relaxed(energyNames, energyLinks, { w: 960, h: 600 }) };
export const Small: StoryObj = { render: () => relaxed(smallNames, smallLinks, { w: 480, h: 300 }) };
// Relaxation as a pure data transform, then ONE per-column overlap removal at
// the end (what "relax is a derive, collisions are a column strategy" gives).
export const SmallRelaxThenResolve: StoryObj = {
  render: () => relaxed(smallNames, smallLinks, { w: 480, h: 300, interleave: false }),
};
export const EnergyRelaxThenResolve: StoryObj = {
  render: () => relaxed(energyNames, energyLinks, { w: 960, h: 600, interleave: false }),
};

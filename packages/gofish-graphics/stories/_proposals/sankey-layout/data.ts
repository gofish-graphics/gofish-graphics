// Datasets for the sankey-layout proposal stories.
import { energy } from "../../../src/data/energy";
import type { Link } from "./_proto";

/** d3's UK energy sankey (48 nodes, 68 links), with names on the links. */
export const energyNames = energy.nodes.map((n) => n.name);
export const energyLinks: Link[] = energy.links.map((l) => ({
  source: energyNames[l.source],
  target: energyNames[l.target],
  value: l.value,
}));

/** A small flow with an uneven last column (3 / 2 / 5 nodes), a link that
 *  skips a column (Gas to Losses), and an input order that crosses. */
export const smallNames = [
  "Gas", "Solar", "Wind",
  "Grid", "Storage",
  "Transport", "Export", "Homes", "Losses", "Industry",
];
export const smallLinks: Link[] = [
  { source: "Solar", target: "Storage", value: 6 },
  { source: "Solar", target: "Grid", value: 2 },
  { source: "Wind", target: "Grid", value: 7 },
  { source: "Wind", target: "Storage", value: 1 },
  { source: "Gas", target: "Grid", value: 5 },
  { source: "Gas", target: "Losses", value: 4 },
  { source: "Grid", target: "Industry", value: 6 },
  { source: "Grid", target: "Export", value: 3 },
  { source: "Grid", target: "Homes", value: 5 },
  { source: "Storage", target: "Homes", value: 4 },
  { source: "Storage", target: "Transport", value: 3 },
];

/** A package dependency graph: an edge `a -> b` means a imports b. Every
 *  edge weighs 1 (layout weight only; boxes have a fixed size). */
export const depNames = [
  "app", "cli", "ui", "api", "router", "http", "react", "zod", "utils", "lodash",
];
export const depLinks: Link[] = [
  ["app", "ui"], ["app", "api"], ["app", "router"], ["cli", "api"],
  ["cli", "utils"], ["ui", "react"], ["ui", "utils"], ["router", "react"],
  ["api", "http"], ["api", "zod"], ["http", "utils"], ["utils", "lodash"],
].map(([source, target]) => ({ source, target, value: 1 }));

// ---------------------------------------------------------------------------
// Round 2: a 44-node subset of the flare class hierarchy (32 leaves, depth 3).
// Uneven on purpose: depth-2 leaves sit next to depth-3 subtrees, which is
// where contour packing (Reingold-Tilford) beats nesting by bounding box.
export type Tree = { name: string; children?: Tree[] };
const leaves = (...names: string[]): Tree[] => names.map((name) => ({ name }));
export const flare: Tree = {
  name: "flare",
  children: [
    {
      name: "analytics",
      children: [
        { name: "cluster", children: leaves("Agglomerative", "Community", "Hierarchical", "MergeEdge") },
        { name: "graph", children: leaves("Betweenness", "LinkDistance", "MaxFlowMinCut", "ShortestPaths", "SpanningTree") },
        { name: "optimization", children: leaves("AspectRatioBanker") },
      ],
    },
    {
      name: "animate",
      children: [
        ...leaves("Easing", "FunctionSequence"),
        { name: "interpolate", children: leaves("ArrayInterp", "ColorInterp", "DateInterp") },
        ...leaves("ISchedulable", "Parallel", "Pause"),
      ],
    },
    {
      name: "data",
      children: [
        { name: "converters", children: leaves("Converters", "DelimitedText", "GraphML") },
        ...leaves("DataField", "DataSchema"),
      ],
    },
    { name: "display", children: leaves("DirtySprite", "LineSprite", "RectSprite", "TextSprite") },
    { name: "flex", children: leaves("FlareVis") },
    { name: "physics", children: leaves("DragForce", "GravityForce", "IForce", "NBodyForce") },
  ],
};

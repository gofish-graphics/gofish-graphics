// Data for pipeline.stages.vue, the stages figure of "What happens between
// chart(...) and the pixels on screen?".
//
// The trees are simplified from
//   pnpm --filter docs book:tree tests/tmp/book/pipeline-bars.mts --full
// and the pixels and item counts come from runLayout + lowerToDisplayList on
// the same three-bar spec at w 300, h 200.

export type Foot = { text: string; coord?: boolean };
export type TreeLn = {
  depth: number;
  type: string;
  name: string;
  added?: boolean;
};
export type Stage = {
  name: string;
  sub: string;
  foot: Foot[];
  tree?: TreeLn[];
  items?: { text: string; added?: boolean }[];
};

export const stages: Stage[] = [
  {
    name: "Build",
    sub: "chain to node tree",
    foot: [],
    tree: [
      { depth: 0, type: "layer", name: "chart" },
      { depth: 1, type: "layer", name: "content" },
      { depth: 2, type: "layer", name: "spread" },
      { depth: 3, type: "rect", name: "A" },
      { depth: 3, type: "rect", name: "B" },
      { depth: 3, type: "rect", name: "C" },
    ],
  },
  {
    name: "Resolve",
    sub: "names, refs, types",
    foot: [
      { text: "Coord: names θ and r", coord: true },
      { text: "up to 3 times per layout" },
    ],
  },
  {
    name: "Elaborate",
    sub: "axes, legend, labels",
    foot: [{ text: "Coord: its axes skip this", coord: true }],
    tree: [
      { depth: 0, type: "layer", name: "ring: titles", added: true },
      { depth: 1, type: "layer", name: "ring: A B C", added: true },
      { depth: 2, type: "layer", name: "ring: ticks", added: true },
      { depth: 3, type: "layer", name: "chart" },
      { depth: 4, type: "…", name: "" },
    ],
  },
  {
    name: "Ask",
    sub: "room needed, then σ",
    foot: [{ text: "waits for the fonts first" }],
  },
  {
    name: "Place",
    sub: "size and place each node",
    foot: [{ text: "Coord: lays out in θ, r", coord: true }],
  },
  {
    name: "Lower",
    sub: "flatten to a display list",
    foot: [{ text: "Coord: bends each shape", coord: true }],
    items: [
      { text: "rect 50 92 78×66" },
      { text: "rect 136 5 78×153" },
      { text: "rect 222 49 78×109" },
      { text: "rect 43 5 1×153", added: true },
      { text: 'text "0" 31 161', added: true },
    ],
  },
  {
    name: "Paint",
    sub: "display list to SVG",
    foot: [{ text: "live() repaints only this" }],
  },
];

/** What flows into the first stage, then out of each stage into the next. */
export const flows = [
  "rows + chain",
  "node tree",
  "typed tree",
  "final tree",
  "σ and the root's size",
  "placed tree",
  "display list",
];

/** The stages that run again: from the end of the loop back to its start. */
export const loops = [
  { from: 2, to: 1, label: "after each rewrite" },
  { from: 4, to: 0, label: 'label.angle "auto": once per angle' },
  { from: 6, to: 0, label: "an input the spec reads changed: all again" },
];

/** The y of each value tick, in canvas pixels (display list). */
export const ticks = [
  157.5, 146.6, 135.6, 124.7, 113.8, 102.9, 91.9, 81, 70.1, 59.1, 48.2, 37.3,
  26.4, 15.4, 4.5,
];

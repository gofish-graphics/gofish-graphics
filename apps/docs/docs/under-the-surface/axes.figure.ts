// The figure of "How does a chart get its axes?": typing, then the rewrite,
// step by step. The picture is in axes.rewrite.vue, inside <TreeStepper>; its
// `data-id`s match the item ids here.
//
// The tree is the one `book:tree` prints for this spec (no .name, no .label):
//   chart([{category:"A",value:3},{category:"B",value:7},{category:"C",value:5}])
//     .flow(spread({ by: "category", dir: "x" })).mark(rect({ h: "value" }))
// with the ring and spread constraints left out. The types and the owners
// come from a probe that prints `_underlyingSpace`, `placedSpace` and the
// `axis` flags right after `resolveAxes` runs on the render root.
//
// Items of kind "type" are not one of the four shared kinds: they are notes
// that typing writes on the tree, not nodes. TreeStepper renders them with
// the class `k-type`, which axes.rewrite.vue styles itself.
import type {
  TreeFigure,
  TreeKind,
} from "../.vitepress/theme/components/book/treeStepper";

const TYPE = "type" as TreeKind;

const figure: TreeFigure = {
  label: "Steps of typing and the rewrite",
  steps: [
    {
      label: "Build",
      note: "The builder makes the chart box (the layer chart() makes), a content layer, the layer for spread, and one rect per row.",
    },
    {
      label: "Type",
      note: "Typing writes a type on each direction: each bar is a free amount, the spread makes x a set of slots, and the chart box, which places the baseline, is the owner of both axes.",
    },
    {
      label: "Number axis",
      note: "Because y is a number line from 0 to 7, the first ring adds an axis line and one tick with a label for each of the 15 tick values.",
    },
    {
      label: "Slot axis",
      note: "Because x is a set of slots, the second ring adds one text per slot beside a ref to that slot's bar, and a span from the first slot to the last.",
    },
    {
      label: "Titles",
      note: "The third ring adds one title per axis, read from the types, centered on a ref to the axis it names.",
    },
  ],
  lines: [
    {
      depth: 0,
      id: "ringT",
      text: "layer  ring: titles",
      kind: "added",
      step: 5,
      more: [
        {
          id: "whyT",
          text: "← titles in x, y",
          kind: TYPE,
          step: 5,
          targets: ["tyX", "tyY"],
        },
      ],
    },
    {
      depth: 1,
      id: "ringC",
      text: "layer  ring: slot axis",
      kind: "added",
      step: 4,
      more: [
        {
          id: "whyC",
          text: "← x: slots",
          kind: TYPE,
          step: 4,
          targets: ["tyX"],
        },
      ],
    },
    {
      depth: 2,
      id: "ringV",
      text: "layer  ring: number axis",
      kind: "added",
      step: 3,
      more: [
        {
          id: "whyV",
          text: "← y: 0 to 7",
          kind: TYPE,
          step: 3,
          targets: ["tyY"],
        },
      ],
    },
    {
      depth: 3,
      id: "box",
      text: "layer  chart",
      kind: "user",
      step: 1,
      more: [
        { id: "tyY", text: "y: 0 to 7", kind: TYPE, step: 2 },
        { id: "own", text: "owner", kind: TYPE, step: 2 },
      ],
    },
    { depth: 4, id: "content", text: "layer  content", kind: "user", step: 1 },
    {
      depth: 5,
      id: "spread",
      text: "layer  spread",
      kind: "user",
      step: 1,
      more: [{ id: "tyX", text: "x: slots A, B, C", kind: TYPE, step: 2 }],
    },
    {
      depth: 6,
      id: "rectA",
      text: "rect  A",
      kind: "user",
      step: 1,
      more: [{ id: "tyA", text: "y: free, 0 to 3", kind: TYPE, step: 2 }],
    },
    {
      depth: 6,
      id: "rectB",
      text: "rect  B",
      kind: "user",
      step: 1,
      more: [{ id: "tyB", text: "y: free, 0 to 7", kind: TYPE, step: 2 }],
    },
    {
      depth: 6,
      id: "rectC",
      text: "rect  C",
      kind: "user",
      step: 1,
      more: [{ id: "tyC", text: "y: free, 0 to 5", kind: TYPE, step: 2 }],
    },
    { depth: 3, id: "axis", text: "rect  axis line", kind: "added", step: 3 },
    {
      depth: 3,
      id: "ticks",
      text: "layer  tick × 15   text, rect",
      kind: "added",
      step: 3,
    },
    {
      depth: 2,
      id: "catA",
      text: 'text "A"',
      kind: "added",
      step: 4,
      more: [
        {
          id: "crefA",
          text: "ref → rect A",
          kind: "ref",
          step: 4,
          targets: ["rectA"],
        },
      ],
    },
    {
      depth: 2,
      id: "catB",
      text: 'text "B"',
      kind: "added",
      step: 4,
      more: [
        {
          id: "crefB",
          text: "ref → rect B",
          kind: "ref",
          step: 4,
          targets: ["rectB"],
        },
      ],
    },
    {
      depth: 2,
      id: "catC",
      text: 'text "C"',
      kind: "added",
      step: 4,
      more: [
        {
          id: "crefC",
          text: "ref → rect C",
          kind: "ref",
          step: 4,
          targets: ["rectC"],
        },
      ],
    },
    {
      depth: 2,
      id: "span",
      text: "axisSpan",
      kind: "added",
      step: 4,
      more: [
        {
          id: "srefs",
          text: "ref → A, ref → C",
          kind: "ref",
          step: 4,
          targets: ["rectA", "rectC"],
        },
      ],
    },
    {
      depth: 1,
      id: "trefS",
      text: "ref → axisSpan",
      kind: "ref",
      step: 5,
      targets: ["span"],
      more: [
        {
          id: "trefV",
          text: "ref → axis line",
          kind: "ref",
          step: 5,
          targets: ["axis"],
        },
      ],
    },
    { depth: 1, id: "titleC", text: 'text "category"', kind: "added", step: 5 },
    { depth: 1, id: "titleV", text: 'text "value"', kind: "added", step: 5 },
  ],
};

export default figure;

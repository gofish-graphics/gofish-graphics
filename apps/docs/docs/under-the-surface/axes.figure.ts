// Figure 1 of "How does a chart get its axes?": the rewrite, step by step.
// The picture is in axes.md, inside <TreeStepper>; its `data-id`s match the
// item ids here. The real tree: `pnpm --filter docs book:tree bars`.
import type { TreeFigure } from "../.vitepress/theme/components/book/treeStepper";

const figure: TreeFigure = {
  label: "Steps of the rewrite",
  steps: [
    {
      label: "Build",
      note: "The builder makes a frame, a content layer, the layer for spread, and one rect per row.",
    },
    {
      label: "Meaning",
      note: "GoFish finds the data ranges and decides who draws each axis. spread installs its own constraints.",
    },
    {
      label: "Value axis",
      note: "A ring wraps the frame. It pins the frame at the origin, then adds the axis line and one text and tick per value.",
    },
    {
      label: "Category axis",
      note: "A second ring goes outside the first. Each category name sits beside a ref to its bar, so it follows the bar wherever layout puts it.",
    },
    {
      label: "Titles",
      note: "The outermost ring adds one title per axis, centered on a ref to that axis.",
    },
    {
      label: "Labels",
      note: "Each .label() becomes a text and a ref to its bar, in one layer inside the content.",
    },
  ],
  lines: [
    {
      depth: 0,
      id: "ringT",
      text: "layer  ring (titles)",
      kind: "added",
      step: 5,
    },
    {
      depth: 1,
      id: "ringC",
      text: "layer  ring (category axis)",
      kind: "added",
      step: 4,
    },
    {
      depth: 2,
      id: "ringV",
      text: "layer  ring (value axis)",
      kind: "added",
      step: 3,
    },
    { depth: 3, id: "frame", text: "layer  frame", kind: "user", step: 1 },
    { depth: 4, id: "content", text: "layer  content", kind: "user", step: 1 },
    { depth: 5, id: "labels", text: "layer  labels", kind: "added", step: 6 },
    {
      depth: 6,
      id: "spread",
      text: "layer  spread",
      kind: "user",
      step: 1,
      more: [
        {
          id: "cons",
          text: "[align, distribute]",
          kind: "constraint",
          step: 2,
        },
      ],
    },
    {
      depth: 7,
      id: "rectA",
      text: "rect  A  name=bars",
      kind: "user",
      step: 1,
    },
    {
      depth: 7,
      id: "rectB",
      text: "rect  B  name=bars",
      kind: "user",
      step: 1,
    },
    {
      depth: 7,
      id: "rectC",
      text: "rect  C  name=bars",
      kind: "user",
      step: 1,
    },
    {
      depth: 6,
      id: "lrefA",
      text: "ref → rect A",
      kind: "ref",
      step: 6,
      targets: ["rectA"],
    },
    {
      depth: 6,
      id: "lrefB",
      text: "ref → rect B",
      kind: "ref",
      step: 6,
      targets: ["rectB"],
    },
    {
      depth: 6,
      id: "lrefC",
      text: "ref → rect C",
      kind: "ref",
      step: 6,
      targets: ["rectC"],
    },
    { depth: 6, id: "lab3", text: 'label "3"', kind: "added", step: 6 },
    { depth: 6, id: "lab7", text: 'label "7"', kind: "added", step: 6 },
    { depth: 6, id: "lab5", text: 'label "5"', kind: "added", step: 6 },
    { depth: 3, id: "axis", text: "rect  axis line", kind: "added", step: 3 },
    {
      depth: 3,
      id: "ticks",
      text: 'layer  tick × 15   text "0" … "7", rect',
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

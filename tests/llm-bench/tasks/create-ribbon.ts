import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/ribbon",
  kind: "create",
  group: "beyond-defaults",
  data: "channel-revenue",
  size: { w: 640, h: 400 },
  instruction:
    "Make a ribbon chart of `revenue` by `year` and `channel`. Draw one vertical stacked bar per " +
    "`year`, left to right in the order the years appear in the data, with a clear gap between " +
    "neighboring bars. Split each bar into one segment per `channel`, stacked from zero with no " +
    "gaps, bottom to top in the order Retail, Online, Wholesale, Partner in every bar; each " +
    "segment's height is its `revenue`. Give each channel its own color, the same in every bar. " +
    "In each gap between two neighboring bars, draw one filled band per channel that connects " +
    "the channel's segment in the left bar to its segment in the right bar: at the left bar's " +
    "right edge the band covers exactly that segment's height, and at the right bar's left edge " +
    "it covers exactly the other segment's height. Color each band like its channel (a lighter " +
    "or semi-transparent version of the color is fine). Include a legend that names each " +
    "channel, show the years on the horizontal axis, and show a numeric vertical axis.",
  checks: [
    {
      check: "ribbons",
      orientation: "vertical",
      category: "year",
      series: "channel",
      value: "revenue",
    },
    {
      check: "textIncludes",
      strings: ["2019", "2023", "Retail", "Online", "Wholesale", "Partner"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

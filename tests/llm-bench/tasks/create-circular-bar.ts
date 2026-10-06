import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/circular-bar",
  kind: "create",
  group: "corpus-pilot",
  data: "arms-exports",
  size: { w: 520, h: 520 },
  instruction:
    "Make a circular bar chart of `exports` by `country`: bars radiate outward from an empty " +
    "circle in the middle, one bar per country, all the same angular width, with a small gap " +
    "between neighbors. Each bar starts at the inner circle (a radius of about 60 pixels), " +
    "and its length outward from that circle is proportional to its `exports` (a linear scale " +
    "from zero). Place the bars clockwise in the order they appear in the data, starting at " +
    "12 o'clock and going once around the full circle. Label each bar with its country name. " +
    "No axes are needed.",
  checks: [
    { check: "radialBars", category: "country", value: "exports" },
    {
      check: "textIncludes",
      strings: ["United States", "Russia", "France", "Italy"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

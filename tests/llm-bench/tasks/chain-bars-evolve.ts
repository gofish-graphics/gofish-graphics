import type { Task } from "../../scripts/llm-bench/tasks";

const LAKES = ["Lake A", "Lake B", "Lake C", "Lake D", "Lake E", "Lake F"];
// `count` per lake, largest first (Lake B, C, D, A, E, F).
const SORTED = [137, 124, 116, 103, 89, 88];

const task: Task = {
  id: "chain/bars-evolve",
  kind: "chain",
  base: "create/bar-basic",
  steps: [
    {
      instruction:
        "Sort the bars by `count`, with the largest bar on the left and the smallest on the " +
        "right. Keep everything else the same.",
      checks: [
        {
          check: "bars",
          orientation: "vertical",
          values: SORTED,
          direction: "forward",
        },
        { check: "textIncludes", strings: LAKES },
        { check: "sizeAbout" },
      ],
      mayChange: [],
    },
    {
      instruction:
        "Turn this into a horizontal bar chart: lakes along the vertical axis, with the largest " +
        "bar at the top and the smallest at the bottom, and `count` as the bar length along the " +
        "horizontal axis, measured from zero. Keep everything else the same.",
      checks: [
        {
          check: "bars",
          orientation: "horizontal",
          values: SORTED,
          direction: "forward",
        },
        { check: "textIncludes", strings: LAKES },
        { check: "sizeAbout" },
      ],
      // Changing orientation moves the category labels from the bottom axis
      // to the left one, so the chart's outer size changes with the axis
      // layout.
      mayChange: ["size"],
    },
    {
      instruction:
        "Highlight Lake B: color its bar orange (#f58518) and leave every other bar in its " +
        "current color. Do not add a legend. Keep everything else the same.",
      checks: [
        {
          check: "bars",
          orientation: "horizontal",
          category: "lake",
          value: "count",
          sort: "desc",
          direction: "forward",
          highlight: { where: { lake: "Lake B" }, color: "#f58518" },
        },
        { check: "textIncludes", strings: LAKES },
        { check: "sizeAbout" },
      ],
      mayChange: ["colors"],
    },
  ],
};
export default task;

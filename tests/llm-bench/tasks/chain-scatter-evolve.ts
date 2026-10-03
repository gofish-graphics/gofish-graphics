import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "chain/scatter-evolve",
  kind: "chain",
  base: "create/scatter-plain",
  steps: [
    {
      instruction:
        "Swap the axes: put `mpg` on the horizontal axis and `horsepower` on the vertical axis, " +
        'both linear, and move the titles with them ("Miles per gallon" on the horizontal axis, ' +
        '"Horsepower" on the vertical axis). Keep everything else the same.',
      checks: [
        { check: "points", x: "mpg", y: "horsepower" },
        { check: "textIncludes", strings: ["Horsepower", "Miles per gallon"] },
        { check: "sizeAbout" },
      ],
      // Swapping the axes swaps their tick labels and titles between the
      // bottom and left axes, and the two fields' tick labels have different
      // widths, so the chart's outer size changes with the axis layout.
      mayChange: ["size"],
    },
    {
      instruction:
        'Rename the axis titles: the horizontal axis title becomes "Fuel economy (mpg)" and the ' +
        'vertical axis title becomes "Engine power (hp)". Keep everything else the same.',
      checks: [
        { check: "points", x: "mpg", y: "horsepower" },
        {
          check: "textIncludes",
          strings: ["Fuel economy (mpg)", "Engine power (hp)"],
        },
        { check: "sizeAbout" },
      ],
      mayChange: ["text"],
    },
    {
      instruction:
        "Color the circles of cars with `mpg` of 30 or more orange (#f58518), and leave the " +
        "other circles in their current color. Do not add a legend. Keep everything else the same.",
      checks: [
        {
          check: "points",
          x: "mpg",
          y: "horsepower",
          highlight: { where: { mpg: { min: 30 } }, color: "#f58518" },
        },
        {
          check: "textIncludes",
          strings: ["Fuel economy (mpg)", "Engine power (hp)"],
        },
        { check: "sizeAbout" },
      ],
      mayChange: ["colors"],
    },
  ],
};
export default task;

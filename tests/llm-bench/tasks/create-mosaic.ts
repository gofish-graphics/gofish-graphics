import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/mosaic",
  kind: "create",
  group: "beyond-defaults",
  data: "phone-sales",
  size: { w: 640, h: 400 },
  instruction:
    "Make a mosaic (Marimekko) chart of `units` by `region` and `brand`. Draw one column per " +
    "`region`, side by side, left to right in the order the regions first appear in the data. " +
    "Each column's width is proportional to that region's total units, and every column spans " +
    "the same full height. Split each column into one rectangle per `brand`, stacked with no " +
    "gaps, bottom to top in the order Apex, Nova, Orbit; each rectangle's height is proportional " +
    "to that brand's share of the region's units. Give each brand its own color, the same in " +
    "every column, and include a legend that names each brand. Label each column with its " +
    "region name.",
  checks: [
    { check: "mosaic", column: "region", segment: "brand", value: "units" },
    {
      check: "textIncludes",
      strings: [
        "North America",
        "Europe",
        "Asia",
        "Latin America",
        "Apex",
        "Nova",
        "Orbit",
      ],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

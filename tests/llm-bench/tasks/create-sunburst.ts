import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/sunburst",
  kind: "create",
  group: "corpus-pilot",
  data: "world-population",
  size: { w: 520, h: 520 },
  instruction:
    "Make a sunburst chart of `population` with two rings around one center. The inner ring " +
    "has one wedge per `region`, whose angle is proportional to the region's total " +
    "population. The outer ring, just outside it, has one wedge per `subregion`, placed " +
    "within its region's angle, whose angle is proportional to the subregion's population on " +
    "the same angular scale, so each region's subregions fill exactly its angle. Give each " +
    "region its own color and draw its subregions in that color (lighter shades are fine). " +
    "Label each region. No axes are needed.",
  checks: [
    {
      check: "sunburst",
      parent: "region",
      leaf: "subregion",
      value: "population",
    },
    {
      check: "textIncludes",
      strings: ["Africa", "Americas", "Asia", "Europe"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

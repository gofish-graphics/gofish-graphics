import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/alluvial",
  kind: "create",
  group: "corpus-pilot",
  data: "titanic-passengers",
  size: { w: 640, h: 420 },
  instruction:
    "Make an alluvial diagram of the passenger `count` across three axes, left to right: " +
    "`class`, `survival` and `gender`. Each axis is a column of node rectangles, one per " +
    "category, top to bottom in the order the categories first appear in the data, with " +
    "small gaps between them; each node's height is proportional to the total count of " +
    "its category, on one scale shared by all columns. Leave a clear gap between the " +
    "columns. Draw one continuous ribbon per row of the data (one combination of class, " +
    "survival and gender), as thick as its `count` on the same scale, that runs from its " +
    "class node to its survival node and on from there to its gender node. The ribbons " +
    "keep one stacking order inside each survival node: a ribbon leaves a survival node " +
    "at the same height at which it arrives. Color each ribbon by its `class` along its " +
    "whole length (a semi-transparent color is fine). Label each node with its category " +
    "name.",
  checks: [
    {
      check: "alluvial",
      steps: ["class", "survival", "gender"],
      value: "count",
    },
    {
      check: "textIncludes",
      strings: ["First", "Third", "Survived", "Died", "Female", "Male"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

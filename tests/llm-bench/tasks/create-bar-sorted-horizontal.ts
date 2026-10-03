import type { Task } from "../../scripts/llm-bench/tasks";

const SITES = [
  "Waseca",
  "Crookston",
  "Morris",
  "University Farm",
  "Duluth",
  "Grand Rapids",
];

const task: Task = {
  id: "create/bar-sorted-horizontal",
  kind: "create",
  data: "barley",
  size: { w: 640, h: 400 },
  instruction:
    "Make a horizontal bar chart with one bar per `site`. A bar's length is that site's total " +
    "`yield`, summed over all of its rows, measured from zero. Sort the bars by total, with the " +
    "largest at the top and the smallest at the bottom. Show each site's name on the vertical " +
    "axis and a numeric horizontal axis.",
  checks: [
    {
      check: "bars",
      orientation: "horizontal",
      // Site totals of `yield`, sorted descending (same order as SITES).
      values: [962.17, 748.4, 708.0, 653.33, 559.93, 498.63],
      direction: "forward",
    },
    { check: "textIncludes", strings: SITES },
    { check: "sizeAbout" },
  ],
};
export default task;

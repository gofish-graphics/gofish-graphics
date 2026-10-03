import type { Task } from "../../scripts/llm-bench/tasks";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const task: Task = {
  id: "create/ridgeline",
  kind: "create",
  group: "beyond-defaults",
  data: "seattle-highs",
  size: { w: 560, h: 480 },
  instruction:
    "Make a ridgeline chart of `days` by `temp_c`, with one ridge per `month`. Each ridge is a " +
    "filled area between its own horizontal baseline and a line through its points: `temp_c` " +
    "along the horizontal axis and `days` as the height above the baseline, joined with " +
    "straight segments in `temp_c` order. All ridges share one horizontal scale (`temp_c`, " +
    "linear) and one height scale. Place the baselines top to bottom in month order, Jan at the " +
    "top and Dec at the bottom, evenly spaced, and scale the heights so the tallest peak in the " +
    "chart is twice the spacing between baselines; the ridges overlap the row above them. Give " +
    "each ridge a thin white outline so overlaps stay readable. Write each month's name at the " +
    "left end of its baseline, and show a horizontal axis for `temp_c`.",
  checks: [
    { check: "ridgeline", category: "month", x: "temp_c", y: "days" },
    { check: "textIncludes", strings: MONTHS },
    { check: "sizeAbout" },
  ],
};
export default task;

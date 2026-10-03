import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/histogram",
  kind: "create",
  data: "penguins",
  size: { w: 640, h: 400 },
  instruction:
    "Make a histogram of `flipper_length_mm` with 7 bins of width 10: 170 to 180, 180 to 190, " +
    "and so on up to 230 to 240. Each bin includes its lower edge and excludes its upper edge, " +
    "so a value of 190 counts in the 190 to 200 bin. Draw one vertical bar per bin, left to " +
    "right from the lowest bin to the highest, whose height is the number of rows in that bin, " +
    "measured from zero. Show a numeric horizontal axis for flipper length and a numeric " +
    "vertical axis for the count.",
  checks: [
    {
      check: "bars",
      orientation: "vertical",
      // Row counts per bin [170,180), [180,190), ..., [230,240).
      values: [1, 23, 39, 10, 26, 10, 3],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

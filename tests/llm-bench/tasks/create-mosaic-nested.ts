import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/mosaic-nested",
  kind: "create",
  group: "beyond-defaults",
  data: "titanic",
  size: { w: 560, h: 440 },
  instruction:
    "Make a three-level mosaic chart of `count` by `class`, `sex` and `survived`, filling one " +
    "rectangle. First split the rectangle into horizontal bands, one per `class`, stacked with " +
    "no gaps from bottom to top in the order First, Second, Third, Crew. Each band spans the " +
    "full width, and its height is proportional to that class's total count. Then split each " +
    "class band from left to right into one rectangle per `sex` (Female, then Male); each spans " +
    "the band's full height, and its width is proportional to that sex's share of the class's " +
    "count. Then split each of those rectangles from bottom to top into one rectangle per " +
    "`survived` value (Yes at the bottom, No above it); each spans its parent's full width, and " +
    "its height is proportional to that value's share of the class-and-sex count. Color the " +
    "smallest rectangles by `survived`, one color for Yes and another for No everywhere, with a " +
    "thin white outline around each, and include a legend that names Yes and No. Label each " +
    "class band with its class name to the left of the chart.",
  checks: [
    {
      check: "mosaic",
      value: "count",
      levels: [
        { by: "class", dir: "y", from: "bottom" },
        { by: "sex", dir: "x", from: "left" },
        { by: "survived", dir: "y", from: "bottom" },
      ],
    },
    {
      check: "textIncludes",
      strings: ["First", "Second", "Third", "Crew", "Yes", "No"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

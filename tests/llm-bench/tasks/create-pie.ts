import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/pie",
  kind: "create",
  data: "budget",
  size: { w: 480, h: 400 },
  instruction:
    "Make a pie chart (a full circle with no hole in the middle) with one slice per `category`, " +
    "where each slice's angle is proportional to `amount`. Give every slice its own color, and " +
    "name each category, either in a legend or next to its slice. Do not draw axes.",
  checks: [
    { check: "wedges", category: "category", value: "amount", hole: false },
    {
      check: "textIncludes",
      strings: ["Housing", "Food", "Transport", "Savings", "Health"],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

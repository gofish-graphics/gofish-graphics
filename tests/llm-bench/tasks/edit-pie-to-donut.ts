import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "edit/pie-to-donut",
  kind: "edit",
  base: "create/pie",
  data: "budget",
  size: { w: 480, h: 400 },
  instruction:
    "Turn the pie into a donut: cut a hole in the middle whose radius is about half the outer " +
    "radius. Keep everything else the same.",
  checks: [
    { check: "wedges", category: "category", value: "amount", hole: true },
    {
      check: "textIncludes",
      strings: ["Housing", "Food", "Transport", "Savings", "Health"],
    },
    { check: "sizeAbout" },
  ],
  mayChange: [],
};
export default task;

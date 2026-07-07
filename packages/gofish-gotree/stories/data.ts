// Sample data + color scale shared by the GoTree gallery stories. Kept as a
// standalone module (not in `src/`) so the docs example scanner treats it as a
// dataset: gallery snippets import `{ sampleTree, byDepth }` and the module's
// contents are shown alongside the example. See apps/docs CLAUDE.md.

// A moderate sample tree (3 levels, uneven) with leaf `value`s so value-driven
// layouts (treemaps) have something to size against.
export const sampleTree = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A1", value: 4 },
        { name: "A2", value: 2 },
        { name: "A3", value: 3 },
      ],
    },
    {
      name: "B",
      children: [
        { name: "B1", value: 5 },
        {
          name: "B2",
          children: [
            { name: "B2a", value: 2 },
            { name: "B2b", value: 1 },
          ],
        },
      ],
    },
    {
      name: "C",
      children: [
        { name: "C1", value: 3 },
        { name: "C2", value: 2 },
      ],
    },
  ],
};

// Sequential blue ramp, dark at the root → light at the leaves.
export const depthBlues = [
  "#08306b",
  "#2171b5",
  "#6baed6",
  "#c6dbef",
  "#deebf7",
];

export const byDepth =
  (range: string[] = depthBlues) =>
  (d: any) =>
    range[Math.min(d.depth, range.length - 1)];

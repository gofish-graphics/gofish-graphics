// Internal-wiki diagram: coord flattening a nested operator tree into a flat,
// absolutely-positioned list. Drawn in GoFish.
const box = (label, fill, w) =>
  gf
    .layer([
      gf
        .rect({ w, h: 30, fill, rx: 5, stroke: "white", strokeWidth: 1.5 })
        .name("r"),
      gf.text({ text: label, fill: "white", fontSize: 12 }).name("t"),
    ])
    .constrain(({ r, t }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
    ]);

const lbl = (text, fill, size) =>
  gf.text({ text, fontSize: size || 12, fill: fill || "#555" });

const OP = "#9aa0a6";
const LEAF = "#51931b";

// One indented row of the "before" tree: a transparent spacer sets the depth.
const treeRow = (depth, label, fill) =>
  gf.stackX({ spacing: 0, alignment: "middle" }, [
    gf.rect({ w: depth * 30 + 0.01, h: 30, fill: "transparent" }),
    box(label, fill, 92),
  ]);

const treeRows = [
  treeRow(0, "coord", OP),
  treeRow(1, "stackX", OP),
  treeRow(2, "rect", LEAF),
  treeRow(2, "rect", LEAF),
  treeRow(1, "stackY", OP),
  treeRow(2, "ellipse", LEAF),
];

// y axis points up — reverse each vertical stack for top-to-bottom order.
const before = gf.stackY(
  { spacing: 11, alignment: "start" },
  treeRows.slice().reverse()
);

const after = gf.stackX({ spacing: 14, alignment: "middle" }, [
  box("rect", LEAF, 96),
  box("rect", LEAF, 96),
  box("ellipse", LEAF, 96),
]);

gf.stackY(
  { spacing: 14, alignment: "start" },
  [
    lbl("Before — nested operator tree", "#333", 13),
    before,
    lbl("↓  flattenLayout", "#999"),
    lbl("After — flat list, transforms baked in", "#333", 13),
    after,
  ]
    .slice()
    .reverse()
).render(root, { w: 320, h: 282 });

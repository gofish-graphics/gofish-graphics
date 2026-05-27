// Internal-wiki diagram: createOperator's split → fmap → combine pipeline.
// Drawn vertically as a fan-out (split picks N pieces) then a fan-in (combine
// assembles N child nodes into one). gf.position places by CENTER; y up.

const N = 4;

const DATA = "#3a7bb5";
const PIECE = "#3a7bb5";
const NODE = "#51931b";
const OUT = "#d65a4a";

const lbl = (text, size, fill, weight) =>
  gf.text({
    text,
    fontSize: size || 12,
    fill: fill || "#444",
    fontWeight: weight || "normal",
    textAnchor: "middle",
  });

const filledPill = (label, fill, w) =>
  gf
    .layer([
      gf
        .rect({
          w,
          h: 30,
          fill,
          rx: 6,
          stroke: "white",
          strokeWidth: 1.5,
        })
        .name("r"),
      gf.text({ text: label, fill: "white", fontSize: 12 }).name("t"),
    ])
    .constrain(({ r, t }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
    ]);

const outlinePill = (label, color, w) =>
  gf
    .layer([
      gf
        .rect({
          w,
          h: 26,
          fill: "white",
          stroke: color,
          strokeWidth: 1.5,
          rx: 4,
        })
        .name("r"),
      gf.text({ text: label, fill: color, fontSize: 11 }).name("t"),
    ])
    .constrain(({ r, t }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
    ]);

// One lane: piece -> arrow -> mark.
const lane = (i) =>
  gf.stackX({ spacing: 14, alignment: "middle" }, [
    outlinePill(`piece ${i}`, PIECE, 108),
    lbl("→", 16, "#aaa"),
    filledPill(`mark(p${i})`, NODE, 116),
  ]);

// y up — reverse so the first lane reads at the top.
const lanes = gf.stackY(
  { spacing: 11, alignment: "middle" },
  Array.from({ length: N }, (_, i) => lane(i)).reverse()
);

// Whole pipeline. Reverse for top-to-bottom reading order:
// data → split → lanes (fmap implicit) → combine → GoFishNode.
gf.stackY(
  { spacing: 14, alignment: "middle" },
  [
    filledPill("data", DATA, 132),
    lbl("↓  split", 13, "#999", "600"),
    lanes,
    lbl("↓  combine", 13, "#999", "600"),
    filledPill("GoFishNode", OUT, 144),
  ]
    .slice()
    .reverse()
).render(root, { w: 380, h: 360 });

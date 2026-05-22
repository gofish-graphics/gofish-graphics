// Internal-wiki diagram: local-propagation layout. A node exchanges sizes only
// with its immediate children — the parent proposes a size, the child reports
// the size it took. Information never leaves a node's local neighborhood.
// gf.position places an element by its CENTER, in a y-up coordinate space.
const box = (label, fill, w, h) =>
  gf
    .layer([
      gf
        .rect({ w, h, fill, rx: 6, stroke: "white", strokeWidth: 1.5 })
        .name("r"),
      gf.text({ text: label, fill: "white", fontSize: 13 }).name("t"),
    ])
    .constrain(({ r, t }) => [
      gf.Constraint.align({ x: "middle", y: "middle" }, [r, t]),
    ]);

const vedge = (cx, cy, h) =>
  gf.position({ x: cx, y: cy }, gf.rect({ w: 3, h, fill: "#c4c8cd" }));

const lbl = (text) => gf.text({ text, fontSize: 12, fill: "#444" });

const W = 420;
const H = 262;
const boxH = 42;
const parentCy = 224; // y up: parent near the top
const childCy = 36; // children near the bottom
const childAx = 142;
const childBx = 278;
const edgeTopY = childCy + boxH / 2; // 57
const edgeBotY = parentCy - boxH / 2; // 203
const edgeH = edgeBotY - edgeTopY; // 146
const edgeCy = (edgeTopY + edgeBotY) / 2; // 130

gf.layer([
  // tree edges (drawn first, behind the boxes)
  vedge(childAx, edgeCy, edgeH),
  vedge(childBx, edgeCy, edgeH),

  // nodes
  gf.position({ x: W / 2, y: parentCy }, box("parent", "#9aa0a6", 252, boxH)),
  gf.position({ x: childAx, y: childCy }, box("child", "#3451b2", 124, boxH)),
  gf.position({ x: childBx, y: childCy }, box("child", "#3451b2", 124, boxH)),

  // local information flow
  gf.position({ x: W / 2, y: 158 }, lbl("↓  proposes a size")),
  gf.position({ x: W / 2, y: 104 }, lbl("↑  reports its size")),
]).render(root, { w: W, h: H });

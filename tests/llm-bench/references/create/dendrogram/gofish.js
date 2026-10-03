import { chart, group, scatter, line, rect } from "gofish-graphics";

// WORKAROUND: GoFish has no tree (dendrogram) layout, so the node positions
// are computed here: leaves at 0, 1, 2, ... in depth-first order, every other
// node at the middle of its children and at its own height.
function layoutTree(rows) {
  const children = new Map(rows.map((d) => [d.name, []]));
  for (const d of rows) if (d.parent) children.get(d.parent).push(d);
  const root = rows.find((d) => !d.parent);
  const pos = new Map();
  let next = 0;
  const place = (d) => {
    const kids = children.get(d.name);
    if (kids.length === 0) pos.set(d.name, next++);
    else {
      kids.forEach(place);
      const xs = kids.map((k) => pos.get(k.name));
      pos.set(d.name, (Math.min(...xs) + Math.max(...xs)) / 2);
    }
  };
  place(root);
  // one elbow per child: up from the child to its parent's height, then
  // across to the parent
  const segments = rows
    .filter((d) => d.parent)
    .map((d) => {
      const p = rows.find((q) => q.name === d.parent);
      return [
        { x: pos.get(d.name), height: d.height },
        { x: pos.get(d.name), height: p.height },
        { x: pos.get(p.name), height: p.height },
      ].map((pt, i) => ({ ...pt, link: d.name, i }));
    });
  const leaves = rows
    .filter((d) => children.get(d.name).length === 0)
    .map((d) => ({ name: d.name, x: pos.get(d.name), height: 0 }));
  return { points: segments.flat(), leaves };
}

export default function render(container, data) {
  const { points, leaves } = layoutTree(data);
  return chart(points, { axes: { x: false, y: { title: "height" } } })
    .flow(group({ by: "link" }), scatter({ by: "i", x: "x", y: "height" }))
    .mark(line({ stroke: "#555", strokeWidth: 1.5, curve: "linear" }))
    .layer(
      chart(leaves)
        .flow(scatter({ by: "name", x: "x", y: "height" }))
        .mark(
          rect({ w: 0, h: 0 }).label("name", {
            position: "outset-bottom",
            fontSize: 12,
          })
        )
    )
    .render(container, { w: 540, h: 320 });
}

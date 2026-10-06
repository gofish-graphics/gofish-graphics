import { layer, ellipse, text } from "gofish-graphics";

// WORKAROUND: GoFish has no circle-packing layout. Its "Circle Treemap"
// (treemap + circle) inscribes each circle in a squarified treemap cell, so
// areas are not proportional and nested leaves sit in the parent's
// rectangle, not inside a parent circle. The packing is computed here and
// the circles are placed at explicit pixel positions.

// Greedy front packing: largest first, each circle placed tangent to two
// placed circles at the free spot nearest the first one.
function pack(circles, pad) {
  const placed = [];
  for (const c of [...circles].sort((a, b) => b.r - a.r)) {
    if (placed.length === 0) Object.assign(c, { x: 0, y: 0 });
    else if (placed.length === 1)
      Object.assign(c, { x: placed[0].r + c.r + pad, y: 0 });
    else {
      let best = null;
      for (const a of placed)
        for (const b of placed) {
          if (a === b) continue;
          const da = a.r + c.r + pad,
            db = b.r + c.r + pad;
          const dx = b.x - a.x,
            dy = b.y - a.y,
            d = Math.hypot(dx, dy);
          const t = (da * da - db * db + d * d) / (2 * d);
          const h = Math.sqrt(da * da - t * t);
          if (!(h >= 0)) continue;
          for (const s of [1, -1]) {
            const x = a.x + (t * dx - s * h * dy) / d;
            const y = a.y + (t * dy + s * h * dx) / d;
            const free = placed.every(
              (q) => Math.hypot(x - q.x, y - q.y) >= q.r + c.r + pad - 1e-6
            );
            if (
              free &&
              (!best || Math.hypot(x, y) < Math.hypot(best.x, best.y))
            )
              best = { x, y };
          }
        }
      Object.assign(c, best);
    }
    placed.push(c);
  }
  // an enclosing circle around the middle of the packed circles' extent
  const x0 = Math.min(...placed.map((c) => c.x - c.r));
  const x1 = Math.max(...placed.map((c) => c.x + c.r));
  const y0 = Math.min(...placed.map((c) => c.y - c.r));
  const y1 = Math.max(...placed.map((c) => c.y + c.r));
  const x = (x0 + x1) / 2,
    y = (y0 + y1) / 2;
  const r = Math.max(...placed.map((c) => Math.hypot(c.x - x, c.y - y) + c.r));
  for (const c of placed) Object.assign(c, { x: c.x - x, y: c.y - y });
  return r; // the circles are now relative to the enclosing circle's center
}

const COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
];

export default function render(container, data) {
  const size = 520;
  const genres = [...new Set(data.map((d) => d.genre))];
  // leaves: radius = sqrt(gross), so area is proportional to gross
  const groups = genres.map((genre) => {
    const leaves = data
      .filter((d) => d.genre === genre)
      .map((d) => ({ r: Math.sqrt(d.gross), genre }));
    return { genre, leaves, r: pack(leaves, 2) };
  });
  const k = (size / 2 - 2) / pack(groups, 6); // scale to fit, same for every radius
  const px = (x) => size / 2 + x * k;
  const py = (y) => size / 2 + y * k;

  const shapes = [];
  groups.forEach((g, i) => {
    shapes.push(
      ellipse({
        cx: px(g.x),
        cy: py(g.y),
        w: 2 * g.r * k,
        h: 2 * g.r * k,
        fill: "#f2f2f2",
        stroke: "#999",
        strokeWidth: 1,
      })
    );
    for (const l of g.leaves) {
      const cx = px(g.x + l.x),
        cy = py(g.y + l.y);
      shapes.push(
        ellipse({ cx, cy, w: 2 * l.r * k, h: 2 * l.r * k, fill: COLORS[i] })
      );
    }
  });
  // genre names inside the top of each genre circle
  groups.forEach((g) =>
    shapes.push(
      text({
        cx: px(g.x),
        cy: py(g.y) - g.r * k + 10,
        text: g.genre,
        fontSize: 12,
        fontWeight: "bold",
        textAnchor: "middle",
      })
    )
  );
  return layer(shapes).render(container, { w: size, h: size });
}

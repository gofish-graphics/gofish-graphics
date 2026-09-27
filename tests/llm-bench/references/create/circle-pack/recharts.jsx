import { ScatterChart, Scatter, XAxis, YAxis } from "recharts";

// Recharts has no circle-packing chart. The packing is computed here, and a
// scatter chart with hidden, equal-scaled axes places the circles through
// custom shapes, with radii converted to pixels at the same scale.

// Greedy front packing: largest first, each circle placed tangent to two
// placed circles at the free spot nearest the first one. Returns the
// enclosing circle's radius; positions become relative to its center.
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
  const x0 = Math.min(...placed.map((c) => c.x - c.r));
  const x1 = Math.max(...placed.map((c) => c.x + c.r));
  const y0 = Math.min(...placed.map((c) => c.y - c.r));
  const y1 = Math.max(...placed.map((c) => c.y + c.r));
  const x = (x0 + x1) / 2,
    y = (y0 + y1) / 2;
  const r = Math.max(...placed.map((c) => Math.hypot(c.x - x, c.y - y) + c.r));
  for (const c of placed) Object.assign(c, { x: c.x - x, y: c.y - y });
  return r;
}

const COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
];
const SIZE = 520;

export default function Chart({ data }) {
  const genres = [...new Set(data.map((d) => d.genre))];
  const groups = genres.map((genre, i) => {
    // radius = sqrt(gross): area proportional to gross
    const leaves = data
      .filter((d) => d.genre === genre)
      .map((d) => ({ r: Math.sqrt(d.gross), color: COLORS[i] }));
    return { genre, leaves, r: pack(leaves, 2) };
  });
  const R = pack(groups, 6);
  const k = SIZE / (2 * R); // px per unit, the same on both axes
  const leaves = groups.flatMap((g) =>
    g.leaves.map((l) => ({ ...l, x: g.x + l.x, y: g.y + l.y }))
  );

  return (
    <ScatterChart
      width={SIZE}
      height={SIZE}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <XAxis type="number" dataKey="x" domain={[-R, R]} hide />
      <YAxis type="number" dataKey="y" domain={[-R, R]} hide />
      <Scatter
        data={groups}
        isAnimationActive={false}
        shape={({ cx, cy, payload }) => (
          <circle
            cx={cx}
            cy={cy}
            r={payload.r * k}
            fill="#f2f2f2"
            stroke="#999"
          />
        )}
      />
      <Scatter
        data={leaves}
        isAnimationActive={false}
        shape={({ cx, cy, payload }) => (
          <circle cx={cx} cy={cy} r={payload.r * k} fill={payload.color} />
        )}
      />
      <Scatter
        data={groups}
        isAnimationActive={false}
        shape={({ cx, cy, payload }) => (
          <text
            x={cx}
            y={cy - payload.r * k + 16}
            textAnchor="middle"
            fontSize={12}
            fontWeight="bold"
          >
            {payload.genre}
          </text>
        )}
      />
    </ScatterChart>
  );
}

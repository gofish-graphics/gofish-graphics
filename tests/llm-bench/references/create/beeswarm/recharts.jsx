import { ScatterChart, Scatter, XAxis, YAxis, Legend } from "recharts";

// Recharts has no beeswarm layout. The swarm is computed here in pixels,
// from the plot area the margins, axis and legend sizes leave, and the
// hidden y axis is scaled in pixels (0 is the center line) so the offsets
// come out as computed.

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"];
const W = 640;
const H = 300;
const MARGIN = { top: 10, right: 20, bottom: 10, left: 20 };
const AXIS_H = 30;
const LEGEND_H = 30;
const R = 6;

export default function Chart({ data }) {
  const genres = [...new Set(data.map((d) => d.genre))];
  const years = data.map((d) => d.year);
  const x0 = Math.floor(Math.min(...years) / 10) * 10;
  const x1 = Math.ceil(Math.max(...years) / 10) * 10;
  const plotW = W - MARGIN.left - MARGIN.right;
  const plotH = H - MARGIN.top - MARGIN.bottom - AXIS_H - LEGEND_H;
  const px = (year) => ((year - x0) / (x1 - x0)) * plotW;

  // Dodge: place circles left to right, each at the offset from the center
  // line nearest zero where it overlaps no circle already placed. The
  // candidates are zero and the offsets that rest it against a neighbor.
  const placed = [];
  for (const d of [...data].sort((a, b) => a.year - b.year)) {
    const cx = px(d.year);
    const near = placed.filter((p) => Math.abs(p.cx - cx) < 2 * R);
    const candidates = [0];
    for (const p of near) {
      const dy = Math.sqrt((2 * R) ** 2 - (p.cx - cx) ** 2);
      candidates.push(p.dy + dy, p.dy - dy);
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b));
    const dy = candidates.find((c) =>
      near.every((p) => Math.hypot(p.cx - cx, p.dy - c) >= 2 * R - 1e-6)
    );
    placed.push({ ...d, cx, dy });
  }

  return (
    <ScatterChart width={W} height={H} margin={MARGIN}>
      <XAxis
        type="number"
        dataKey="year"
        domain={[x0, x1]}
        height={AXIS_H}
        tickCount={(x1 - x0) / 10 + 1}
      />
      <YAxis
        type="number"
        dataKey="dy"
        domain={[-plotH / 2, plotH / 2]}
        allowDataOverflow
        hide
      />
      <Legend verticalAlign="top" height={LEGEND_H} itemSorter={null} />
      {genres.map((g, i) => (
        <Scatter
          key={g}
          name={g}
          data={placed.filter((p) => p.genre === g)}
          fill={COLORS[i]}
          shape={({ cx, cy, fill }) => (
            <circle cx={cx} cy={cy} r={R} fill={fill} />
          )}
          legendType="square"
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Legend,
  usePlotArea,
} from "recharts";

// Recharts has no heatmap. A scatter chart on two category axes places one
// point per cell, and each point is drawn as a rect filling its cell. The
// color bar is a custom legend.

const LIGHT = [239, 243, 255];
const DARK = [8, 48, 107];

function color(t) {
  const c = LIGHT.map((l, i) => Math.round(l + (DARK[i] - l) * t));
  return `rgb(${c.join(",")})`;
}

function makeCell(cols, rows) {
  return function Cell({ cx, cy, payload }) {
    const plot = usePlotArea();
    if (!plot) return null;
    const w = plot.width / cols;
    const h = plot.height / rows;
    return (
      <rect
        x={cx - w / 2 + 1}
        y={cy - h / 2 + 1}
        width={w - 2}
        height={h - 2}
        fill={payload.color}
      />
    );
  };
}

export default function Chart({ data }) {
  const ages = [...new Set(data.map((d) => d.age_range))];
  const savings = [...new Set(data.map((d) => d.savings))];
  const rates = data.map((d) => d.response_rate);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const cells = data.map((d) => ({
    ...d,
    color: color((d.response_rate - lo) / (hi - lo)),
  }));
  const Cell = makeCell(ages.length, savings.length);

  return (
    <ScatterChart
      width={720}
      height={420}
      margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
    >
      <XAxis
        type="category"
        dataKey="age_range"
        allowDuplicatedCategory={false}
        domain={ages}
        ticks={ages}
        interval={0}
      />
      <YAxis
        type="category"
        dataKey="savings"
        allowDuplicatedCategory={false}
        domain={savings}
        ticks={savings}
        reversed
        interval={0}
        width={200}
      />
      <Legend
        content={() => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span>Response rate {lo}%</span>
            <div
              style={{
                width: 200,
                height: 12,
                background: `linear-gradient(to right, ${color(0)}, ${color(1)})`,
              }}
            />
            <span>{hi}%</span>
          </div>
        )}
      />
      <Scatter data={cells} shape={<Cell />} isAnimationActive={false} />
    </ScatterChart>
  );
}

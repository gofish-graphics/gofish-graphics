import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Legend,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

// Recharts has no waffle chart. Each source is a Scatter of its squares'
// (column, row) cells on hidden axes, drawn with a square shape sized to the
// grid pitch.

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"];

function Square({ cx, cy, fill }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  const pitch = Math.min(Math.abs(x(1) - x(0)), Math.abs(y(1) - y(0)));
  const size = pitch * 0.9;
  return (
    <rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      fill={fill}
    />
  );
}

export default function Chart({ data }) {
  // Square i sits at row i / 10 (from the top) and column i % 10, so the
  // grid fills row by row from the top-left, sources in data order.
  let i = 0;
  const series = data.map((d) => ({
    source: d.source,
    cells: Array.from({ length: d.percent }, () => {
      const cell = { col: i % 10, row: Math.floor(i / 10) };
      i++;
      return cell;
    }),
  }));

  return (
    <ScatterChart
      width={560}
      height={400}
      margin={{ top: 20, right: 120, bottom: 20, left: 20 }}
    >
      <XAxis type="number" dataKey="col" domain={[-0.5, 9.5]} hide />
      <YAxis type="number" dataKey="row" domain={[-0.5, 9.5]} reversed hide />
      <Legend
        layout="vertical"
        align="right"
        verticalAlign="top"
        itemSorter={null}
      />
      {series.map((s, k) => (
        <Scatter
          key={s.source}
          name={s.source}
          data={s.cells}
          fill={COLORS[k % COLORS.length]}
          legendType="square"
          shape={<Square />}
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

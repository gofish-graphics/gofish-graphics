import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

// Recharts has no waffle chart. Each lake is a Scatter of its squares'
// (column, row) cells on number axes, drawn with a square shape sized to the
// grid pitch. Block k takes columns 7k to 7k + 4, so neighboring blocks are
// two empty columns apart. The x axis only carries the lake names.

const COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
];
const COLS = 5;
const STEP = COLS + 2;

function Square({ cx, cy, fill }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  const pitch = Math.min(Math.abs(x(1) - x(0)), Math.abs(y(1) - y(0)));
  const size = pitch * 0.8;
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
  // Square i sits in row i / 5 (up from the bottom) and column i % 5.
  const series = data.map((d, k) => ({
    lake: d.lake,
    cells: Array.from({ length: d.count }, (_, i) => ({
      col: k * STEP + (i % COLS),
      row: Math.floor(i / COLS),
    })),
  }));
  const rows = Math.ceil(Math.max(...data.map((d) => d.count)) / COLS);
  const centers = data.map((_, k) => k * STEP + (COLS - 1) / 2);

  return (
    <ScatterChart
      width={560}
      height={400}
      margin={{ top: 30, right: 60, bottom: 32, left: 60 }}
    >
      <XAxis
        type="number"
        dataKey="col"
        domain={[-0.5, data.length * STEP - 2.5]}
        ticks={centers}
        tickFormatter={(v) => data[centers.indexOf(v)]?.lake ?? ""}
        axisLine={false}
        tickLine={false}
        interval={0}
      />
      <YAxis type="number" dataKey="row" domain={[-0.5, rows - 0.5]} hide />
      {series.map((s, k) => (
        <Scatter
          key={s.lake}
          name={s.lake}
          data={s.cells}
          fill={COLORS[k % COLORS.length]}
          shape={<Square />}
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

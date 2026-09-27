import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

// Recharts has no ribbon chart. The bars are an ordinary stacked BarChart
// with a fixed bar width; the ribbons are paths drawn through the axis
// scales, from each segment's right edge to the same channel's segment in
// the next bar.

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2"];
const BAR = 56;

function Ribbons({ rows, channels }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  const paths = [];
  channels.forEach((c, k) => {
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      const x0 = x(a.year, { position: "middle" }) + BAR / 2;
      const x1 = x(b.year, { position: "middle" }) - BAR / 2;
      const xm = (x0 + x1) / 2;
      const [a0, a1] = [y(a.base[c]), y(a.base[c] + a[c])];
      const [b0, b1] = [y(b.base[c]), y(b.base[c] + b[c])];
      paths.push(
        <path
          key={`${c}-${i}`}
          d={
            `M${x0},${a1} C${xm},${a1} ${xm},${b1} ${x1},${b1}` +
            ` L${x1},${b0} C${xm},${b0} ${xm},${a0} ${x0},${a0} Z`
          }
          fill={COLORS[k % COLORS.length]}
          fillOpacity={0.4}
        />
      );
    }
  });
  return <g>{paths}</g>;
}

export default function Chart({ data }) {
  const channels = [...new Set(data.map((d) => d.channel))];
  const byYear = new Map();
  for (const d of data) {
    if (!byYear.has(d.year)) byYear.set(d.year, { year: d.year });
    const row = byYear.get(d.year);
    row[d.channel] = (row[d.channel] ?? 0) + d.revenue;
  }
  const rows = [...byYear.values()];
  // Where each channel's segment starts in each bar (stacked in data order).
  for (const row of rows) {
    let base = 0;
    row.base = {};
    for (const c of channels) {
      row[c] = row[c] ?? 0;
      row.base[c] = base;
      base += row[c];
    }
  }

  return (
    <BarChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="year" />
      <YAxis />
      <Legend itemSorter={null} />
      {channels.map((c, k) => (
        <Bar
          key={c}
          dataKey={c}
          stackId="revenue"
          barSize={BAR}
          fill={COLORS[k % COLORS.length]}
          isAnimationActive={false}
        />
      ))}
      <Ribbons rows={rows} channels={channels} />
    </BarChart>
  );
}

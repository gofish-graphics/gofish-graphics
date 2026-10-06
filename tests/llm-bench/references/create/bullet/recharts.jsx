import { ComposedChart, Bar, Scatter, XAxis, YAxis } from "recharts";

// Recharts has no bullet chart. The bands are a stacked horizontal bar
// chart; the sales bar sits on a second, hidden category axis with the same
// categories so it overlaps the bands instead of standing beside them; the
// target is a scatter point drawn as a vertical line.

const BAND = 36;
const BAR = 12;

function Target({ cx, cy }) {
  return (
    <line
      x1={cx}
      x2={cx}
      y1={cy - BAND / 3}
      y2={cy + BAND / 3}
      stroke="#d62728"
      strokeWidth={3}
    />
  );
}

export default function Chart({ data }) {
  const rows = data.map((d) => ({
    ...d,
    band1: d.poor,
    band2: d.average - d.poor,
    band3: d.good - d.average,
  }));

  return (
    <ComposedChart
      layout="vertical"
      width={640}
      height={300}
      data={rows}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <XAxis
        type="number"
        domain={[0, "auto"]}
        tickFormatter={(v) => `${v / 1000}k`}
      />
      <YAxis yAxisId="bands" type="category" dataKey="category" width={110} />
      <YAxis yAxisId="bar" type="category" dataKey="category" hide />
      <Bar
        yAxisId="bands"
        dataKey="band1"
        stackId="b"
        barSize={BAND}
        fill="#999999"
        isAnimationActive={false}
      />
      <Bar
        yAxisId="bands"
        dataKey="band2"
        stackId="b"
        barSize={BAND}
        fill="#c4c4c4"
        isAnimationActive={false}
      />
      <Bar
        yAxisId="bands"
        dataKey="band3"
        stackId="b"
        barSize={BAND}
        fill="#e6e6e6"
        isAnimationActive={false}
      />
      <Bar
        yAxisId="bar"
        dataKey="sales"
        barSize={BAR}
        fill="#1f3a5f"
        isAnimationActive={false}
      />
      <Scatter
        yAxisId="bar"
        dataKey="target"
        shape={<Target />}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
}

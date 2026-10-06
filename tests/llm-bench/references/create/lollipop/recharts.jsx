import {
  ComposedChart,
  Bar,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// Recharts has no lollipop mark. Each lollipop is a thin bar (the stem) and a
// scatter point (the head) at the same value.

export default function Chart({ data }) {
  const rows = [...data].sort((a, b) => b.sales - a.sales);
  return (
    <ComposedChart
      layout="vertical"
      width={560}
      height={320}
      data={rows}
      margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis
        type="number"
        domain={[0, "auto"]}
        tickFormatter={(v) => `${v / 1000}k`}
      />
      <YAxis type="category" dataKey="region" width={70} />
      <Bar
        dataKey="sales"
        barSize={2}
        fill="#4e79a7"
        isAnimationActive={false}
      />
      <Scatter
        dataKey="sales"
        fill="#4e79a7"
        shape={({ cx, cy, fill }) => (
          <circle cx={cx} cy={cy} r={7} fill={fill} />
        )}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
}

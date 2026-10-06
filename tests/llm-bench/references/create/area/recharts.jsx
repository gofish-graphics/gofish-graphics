import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#59a14f"];

export default function Chart({ data }) {
  const categories = [...new Set(data.map((d) => d.category))];
  // One row per date with a column per category, dates as timestamps.
  const byDate = new Map();
  for (const d of data) {
    const t = new Date(d.date).getTime();
    if (!byDate.has(t)) byDate.set(t, { t });
    byDate.get(t)[d.category] = d.sales;
  }
  const rows = [...byDate.values()].sort((a, b) => a.t - b.t);

  return (
    <AreaChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="t"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        tickFormatter={(t) => {
          const d = new Date(t);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        }}
      />
      <YAxis domain={[0, "auto"]} tickFormatter={(v) => `${v / 1000}k`} />
      <Legend itemSorter={null} />
      {categories.map((c, i) => (
        <Area
          key={c}
          dataKey={c}
          type="linear"
          stackId="sales"
          stroke={COLORS[i]}
          fill={COLORS[i]}
          fillOpacity={0.8}
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  );
}

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Chart({ data }) {
  const totals = {};
  for (const d of data) totals[d.site] = (totals[d.site] ?? 0) + d.yield;
  const rows = Object.entries(totals)
    .map(([site, total]) => ({ site, total }))
    .sort((a, b) => b.total - a.total);

  return (
    <BarChart
      width={640}
      height={400}
      data={rows}
      layout="vertical"
      margin={{ top: 20, right: 20, bottom: 20, left: 30 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" />
      <YAxis type="category" dataKey="site" width={100} />
      <Bar dataKey="total" fill="steelblue" isAnimationActive={false} />
    </BarChart>
  );
}

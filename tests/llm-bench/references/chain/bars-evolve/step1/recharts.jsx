import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Chart({ data }) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  return (
    <BarChart
      width={640}
      height={400}
      data={sorted}
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="lake" />
      <YAxis />
      <Bar dataKey="count" fill="steelblue" isAnimationActive={false} />
    </BarChart>
  );
}

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Chart({ data }) {
  return (
    <BarChart
      width={640}
      height={400}
      data={data}
      layout="vertical"
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" />
      <YAxis type="category" dataKey="lake" />
      <Bar dataKey="count" fill="steelblue" isAnimationActive={false} />
    </BarChart>
  );
}

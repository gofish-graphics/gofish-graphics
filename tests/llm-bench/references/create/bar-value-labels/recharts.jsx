import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";

export default function Chart({ data }) {
  return (
    <BarChart
      width={640}
      height={400}
      data={data}
      margin={{ top: 30, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="store" />
      <YAxis />
      <Bar dataKey="sales" fill="steelblue" isAnimationActive={false}>
        <LabelList
          dataKey="sales"
          position="top"
          formatter={(v) => v.toLocaleString("en-US")}
        />
      </Bar>
    </BarChart>
  );
}

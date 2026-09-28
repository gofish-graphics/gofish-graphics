import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export default function Chart({ data }) {
  return (
    <BarChart
      layout="vertical"
      width={560}
      height={480}
      data={data}
      margin={{ top: 20, right: 30, bottom: 20, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" />
      <YAxis type="category" dataKey="sub_category" width={90} interval={0} />
      <ReferenceLine x={0} stroke="#666" />
      <Bar dataKey="profit_ratio" isAnimationActive={false}>
        {data.map((d) => (
          <Cell
            key={d.sub_category}
            fill={d.profit_ratio < 0 ? "#d62728" : "#4e79a7"}
          />
        ))}
      </Bar>
    </BarChart>
  );
}

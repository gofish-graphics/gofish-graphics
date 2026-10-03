import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export default function Chart({ data }) {
  const mean = data.reduce((s, d) => s + d.rain_mm, 0) / data.length;
  return (
    <BarChart
      width={640}
      height={400}
      data={data}
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="month" />
      <YAxis />
      <Bar dataKey="rain_mm" fill="steelblue" isAnimationActive={false} />
      <ReferenceLine
        y={mean}
        stroke="#333"
        strokeDasharray="6 4"
        label={{
          value: `Mean = ${mean.toFixed(1)}`,
          position: "insideBottomRight",
        }}
      />
    </BarChart>
  );
}

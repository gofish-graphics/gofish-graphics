import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
];

export default function Chart({ data }) {
  const months = [...new Set(data.map((d) => d.month))];
  const subs = [...new Set(data.map((d) => d.sub_category))];

  return (
    <ScatterChart
      width={640}
      height={380}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        type="number"
        dataKey="sales"
        domain={[0, "auto"]}
        tickFormatter={(v) => `${v / 1000}k`}
      />
      <YAxis
        type="category"
        dataKey="month"
        allowDuplicatedCategory={false}
        reversed
        ticks={months}
        domain={months}
        width={70}
      />
      <Legend itemSorter={null} />
      {subs.map((s, i) => (
        <Scatter
          key={s}
          name={s}
          data={data.filter((d) => d.sub_category === s)}
          fill={COLORS[i % COLORS.length]}
          shape="circle"
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

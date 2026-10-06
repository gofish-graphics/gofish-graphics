import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

// A spine chart is a stacked horizontal bar chart with signed stacking: the
// Women values are negated so they extend left of zero, and the axis shows
// absolute values.

export default function Chart({ data }) {
  const byNationality = new Map();
  for (const d of data) {
    if (!byNationality.has(d.nationality))
      byNationality.set(d.nationality, { nationality: d.nationality });
    const row = byNationality.get(d.nationality);
    row[d.gender] = d.gender === "Women" ? -d.percent : d.percent;
  }
  const rows = [...byNationality.values()];

  return (
    <BarChart
      layout="vertical"
      width={560}
      height={420}
      data={rows}
      stackOffset="sign"
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis
        type="number"
        domain={[-100, 100]}
        tickFormatter={(v) => `${Math.abs(v)}%`}
      />
      <YAxis type="category" dataKey="nationality" width={100} interval={0} />
      <Legend itemSorter={null} />
      <ReferenceLine x={0} stroke="#333" />
      <Bar
        dataKey="Women"
        stackId="gender"
        fill="#e15759"
        isAnimationActive={false}
      />
      <Bar
        dataKey="Men"
        stackId="gender"
        fill="#4e79a7"
        isAnimationActive={false}
      />
    </BarChart>
  );
}

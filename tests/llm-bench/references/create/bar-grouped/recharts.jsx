import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"];

export default function Chart({ data }) {
  const species = [...new Set(data.map((d) => d.species))];
  const byLake = new Map();
  for (const d of data) {
    if (!byLake.has(d.lake)) byLake.set(d.lake, { lake: d.lake });
    const row = byLake.get(d.lake);
    row[d.species] = (row[d.species] ?? 0) + d.count;
  }
  const rows = [...byLake.values()];

  return (
    <BarChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="lake" />
      <YAxis />
      <Legend />
      {species.map((s, i) => (
        <Bar
          key={s}
          dataKey={s}
          fill={COLORS[i % COLORS.length]}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

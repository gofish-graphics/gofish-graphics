import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759"];

export default function Chart({ data }) {
  const countries = [...new Set(data.map((d) => d.country))];
  const byYear = new Map();
  for (const d of data) {
    if (!byYear.has(d.year)) byYear.set(d.year, { year: d.year });
    byYear.get(d.year)[d.country] = d.life_expect;
  }
  const rows = [...byYear.values()].sort((a, b) => a.year - b.year);

  return (
    <LineChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} />
      <YAxis domain={["auto", "auto"]} />
      <Legend />
      {countries.map((c, i) => (
        <Line
          key={c}
          dataKey={c}
          type="linear"
          stroke={COLORS[i % COLORS.length]}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}

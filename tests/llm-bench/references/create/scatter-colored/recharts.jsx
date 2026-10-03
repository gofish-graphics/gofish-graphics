import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#59a14f"];

export default function Chart({ data }) {
  const species = [...new Set(data.map((d) => d.species))];
  return (
    <ScatterChart
      width={640}
      height={400}
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        type="number"
        dataKey="bill_length_mm"
        name="Bill length (mm)"
        domain={["auto", "auto"]}
      />
      <YAxis
        type="number"
        dataKey="flipper_length_mm"
        name="Flipper length (mm)"
        domain={["auto", "auto"]}
      />
      <Legend />
      {species.map((s, i) => (
        <Scatter
          key={s}
          name={s}
          data={data.filter((d) => d.species === s)}
          fill={COLORS[i % COLORS.length]}
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

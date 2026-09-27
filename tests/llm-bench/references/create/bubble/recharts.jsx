import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2"];
const MAX_R = 30;

export default function Chart({ data }) {
  const regions = [...new Set(data.map((d) => d.region))];
  const maxPop = Math.max(...data.map((d) => d.population));
  return (
    <ScatterChart
      width={640}
      height={440}
      margin={{ top: 20, right: 30, bottom: 30, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        type="number"
        dataKey="gdp_per_capita"
        domain={[0, 70]}
        label={{
          value: "GDP per capita (thousand USD)",
          position: "insideBottom",
          offset: -15,
        }}
      />
      <YAxis
        type="number"
        dataKey="life_expectancy"
        domain={[50, 90]}
        label={{
          value: "Life expectancy (years)",
          angle: -90,
          position: "insideLeft",
        }}
      />
      {/* ZAxis maps the value linearly to the symbol's area (px^2). */}
      <ZAxis
        type="number"
        dataKey="population"
        domain={[0, maxPop]}
        range={[0, Math.PI * MAX_R * MAX_R]}
      />
      <Legend verticalAlign="top" />
      {regions.map((r, i) => (
        <Scatter
          key={r}
          name={r}
          data={data.filter((d) => d.region === r)}
          fill={COLORS[i]}
          fillOpacity={0.6}
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

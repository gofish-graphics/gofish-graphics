import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Chart({ data }) {
  return (
    <ScatterChart
      width={640}
      height={400}
      margin={{ top: 20, right: 20, bottom: 30, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        type="number"
        dataKey="horsepower"
        name="Horsepower"
        domain={["auto", "auto"]}
        label={{ value: "Horsepower", position: "insideBottom", offset: -15 }}
      />
      <YAxis
        type="number"
        dataKey="mpg"
        name="Miles per gallon"
        domain={["auto", "auto"]}
        label={{
          value: "Miles per gallon",
          angle: -90,
          position: "insideLeft",
          style: { textAnchor: "middle" },
        }}
      />
      <Scatter
        data={data}
        fill="steelblue"
        fillOpacity={0.7}
        isAnimationActive={false}
      />
    </ScatterChart>
  );
}

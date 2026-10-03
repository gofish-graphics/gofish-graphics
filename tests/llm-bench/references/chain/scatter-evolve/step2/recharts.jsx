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
        dataKey="mpg"
        name="Fuel economy (mpg)"
        domain={["auto", "auto"]}
        label={{
          value: "Fuel economy (mpg)",
          position: "insideBottom",
          offset: -15,
        }}
      />
      <YAxis
        type="number"
        dataKey="horsepower"
        name="Engine power (hp)"
        domain={["auto", "auto"]}
        label={{
          value: "Engine power (hp)",
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

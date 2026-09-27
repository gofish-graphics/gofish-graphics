import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Chart({ data }) {
  const rows = [...data].sort((a, b) => a.year - b.year);
  return (
    <LineChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 20, right: 30, bottom: 30, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="year"
        type="number"
        domain={["dataMin", "dataMax"]}
        label={{ value: "Year", position: "insideBottom", offset: -15 }}
      />
      <YAxis
        label={{
          value: "Wheat price (shillings)",
          angle: -90,
          position: "insideLeft",
          style: { textAnchor: "middle" },
        }}
      />
      <Line
        dataKey="wheat"
        type="linear"
        stroke="steelblue"
        strokeWidth={2}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

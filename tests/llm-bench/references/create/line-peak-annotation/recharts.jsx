import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
} from "recharts";

export default function Chart({ data }) {
  const rows = [...data].sort((a, b) => a.year - b.year);
  const peak = rows.reduce((a, b) => (b.visitors > a.visitors ? b : a));
  return (
    <LineChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 30, right: 30, bottom: 20, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} />
      <YAxis />
      <Line
        type="linear"
        dataKey="visitors"
        stroke="steelblue"
        strokeWidth={2}
        dot={false}
        isAnimationActive={false}
      />
      <ReferenceDot
        x={peak.year}
        y={peak.visitors}
        r={5}
        fill="#d62728"
        stroke="none"
        label={{
          value: `Peak: ${peak.visitors.toLocaleString("en-US")} in ${peak.year}`,
          position: "left",
        }}
      />
    </LineChart>
  );
}

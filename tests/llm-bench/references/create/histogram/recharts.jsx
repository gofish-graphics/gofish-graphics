import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Chart({ data }) {
  // Bins [170, 180), [180, 190), ..., [230, 240).
  const bins = [];
  for (let start = 170; start < 240; start += 10) {
    const count = data.filter(
      (d) => d.flipper_length_mm >= start && d.flipper_length_mm < start + 10
    ).length;
    bins.push({ bin: `${start}–${start + 10}`, count });
  }

  return (
    <BarChart
      width={640}
      height={400}
      data={bins}
      barCategoryGap={1}
      margin={{ top: 20, right: 20, bottom: 30, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="bin"
        label={{
          value: "Flipper length (mm)",
          position: "insideBottom",
          offset: -15,
        }}
      />
      <YAxis
        allowDecimals={false}
        label={{ value: "Count", angle: -90, position: "insideLeft" }}
      />
      <Bar dataKey="count" fill="steelblue" isAnimationActive={false} />
    </BarChart>
  );
}

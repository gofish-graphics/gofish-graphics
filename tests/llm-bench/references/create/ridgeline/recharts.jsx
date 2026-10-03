import { ComposedChart, Area, XAxis, YAxis } from "recharts";

// Recharts has no ridgeline chart. Each month is a range Area whose
// dataKey returns [baseline, baseline + height]; baselines are one unit
// apart on a numeric y axis (Jan at the top), and the tallest peak rises 2.

export default function Chart({ data }) {
  const months = [...new Set(data.map((d) => d.month))];
  const n = months.length;
  const scale = 2 / Math.max(...data.map((d) => d.days));
  const temps = [...new Set(data.map((d) => d.temp_c))].sort((a, b) => a - b);
  const rows = temps.map((t) => {
    const row = { temp_c: t };
    for (const d of data) if (d.temp_c === t) row[d.month] = d.days;
    return row;
  });
  const base = (i) => n - 1 - i;

  return (
    <ComposedChart
      width={560}
      height={480}
      data={rows}
      margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
    >
      <XAxis dataKey="temp_c" type="number" domain={["dataMin", "dataMax"]} />
      <YAxis
        type="number"
        domain={[0, n + 1]}
        ticks={months.map((_, i) => base(i))}
        tickFormatter={(v) => months[n - 1 - v]}
        interval={0}
        axisLine={false}
        tickLine={false}
      />
      {months.map((m, i) => (
        <Area
          key={m}
          type="linear"
          dataKey={(row) => [base(i), base(i) + row[m] * scale]}
          fill="steelblue"
          fillOpacity={1}
          stroke="white"
          isAnimationActive={false}
        />
      ))}
    </ComposedChart>
  );
}

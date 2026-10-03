import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid } from "recharts";

// A waterfall is a bar chart of range bars: each bar's value is the pair
// [low, high] of the running total before and after the row.

const COLORS = { total: "#4e79a7", up: "#59a14f", down: "#e15759" };

export default function Chart({ data }) {
  let total = 0;
  const rows = data.map((d, i) => {
    const before = total;
    total += d.amount;
    return {
      label: d.label,
      range: [Math.min(before, total), Math.max(before, total)],
      kind: i === 0 ? "total" : d.amount >= 0 ? "up" : "down",
    };
  });
  rows.push({ label: "End", range: [0, total], kind: "total" });

  return (
    <BarChart
      width={560}
      height={360}
      data={rows}
      margin={{ top: 20, right: 20, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" interval={0} />
      <YAxis domain={[0, "auto"]} />
      <Bar dataKey="range" isAnimationActive={false}>
        {rows.map((r) => (
          <Cell key={r.label} fill={COLORS[r.kind]} />
        ))}
      </Bar>
    </BarChart>
  );
}

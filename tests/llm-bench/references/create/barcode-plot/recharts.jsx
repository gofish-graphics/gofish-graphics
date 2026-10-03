import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid } from "recharts";

// A barcode plot is a scatter chart on a category y axis whose points are
// drawn as short vertical ticks.

function Tick({ cx, cy }) {
  return (
    <line
      x1={cx}
      x2={cx}
      y1={cy - 7.5}
      y2={cy + 7.5}
      stroke="#4e79a7"
      strokeWidth={2}
    />
  );
}

export default function Chart({ data }) {
  const subs = [...new Set(data.map((d) => d.sub_category))];
  return (
    <ScatterChart
      width={640}
      height={300}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis type="number" dataKey="avg_sales" domain={[0, "auto"]} />
      <YAxis
        type="category"
        dataKey="sub_category"
        allowDuplicatedCategory={false}
        reversed
        ticks={subs}
        domain={subs}
        width={80}
      />
      <Scatter data={data} shape={<Tick />} isAnimationActive={false} />
    </ScatterChart>
  );
}

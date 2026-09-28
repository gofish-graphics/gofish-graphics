import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
} from "recharts";

// A scatter chart on a time x axis and a category y axis. ZAxis maps sales
// to the symbol's area linearly from zero, so area is proportional to sales.

const COLORS = ["#4e79a7", "#f28e2b", "#59a14f"];
const R_MAX = 18;

export default function Chart({ data }) {
  const categories = [...new Set(data.map((d) => d.category))];
  const rows = data.map((d) => ({ ...d, t: new Date(d.date).getTime() }));
  const maxSales = Math.max(...rows.map((d) => d.sales));
  // Ticks on January 1 of each year, from the first year to after the last.
  const years = rows.map((d) => new Date(d.t).getUTCFullYear());
  const ticks = [];
  for (let y = Math.min(...years); y <= Math.max(...years) + 1; y++)
    ticks.push(Date.UTC(y, 0, 1));

  return (
    <ScatterChart
      width={640}
      height={300}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis
        type="number"
        dataKey="t"
        scale="time"
        domain={[ticks[0], ticks[ticks.length - 1]]}
        ticks={ticks}
        tickFormatter={(t) => String(new Date(t).getUTCFullYear())}
      />
      <YAxis
        type="category"
        dataKey="category"
        allowDuplicatedCategory={false}
        reversed
        ticks={categories}
        domain={categories}
        width={100}
      />
      <ZAxis
        type="number"
        dataKey="sales"
        domain={[0, maxSales]}
        range={[0, Math.PI * R_MAX * R_MAX]}
      />
      {categories.map((c, i) => (
        <Scatter
          key={c}
          name={c}
          data={rows.filter((d) => d.category === c)}
          fill={COLORS[i]}
          fillOpacity={0.8}
          shape="circle"
          isAnimationActive={false}
        />
      ))}
    </ScatterChart>
  );
}

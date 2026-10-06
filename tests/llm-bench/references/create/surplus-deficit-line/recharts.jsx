import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// Two areas from zero: one of the positive part of the balance and one of
// the negative part. Where the line crosses zero between two months, a point
// at the crossing is added so each area meets zero exactly there.

export default function Chart({ data }) {
  const pts = data.map((d) => ({
    t: new Date(d.date).getTime(),
    balance: d.balance,
  }));
  const rows = [];
  pts.forEach((p, i) => {
    const q = pts[i - 1];
    if (q && q.balance * p.balance < 0) {
      const t = q.t + ((p.t - q.t) * q.balance) / (q.balance - p.balance);
      rows.push({ t, pos: 0, neg: 0 });
    }
    rows.push({
      t: p.t,
      balance: p.balance,
      pos: Math.max(p.balance, 0),
      neg: Math.min(p.balance, 0),
    });
  });
  const years = pts.map((p) => new Date(p.t).getUTCFullYear());
  const ticks = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++)
    ticks.push(Date.UTC(y, 0, 1));

  return (
    <ComposedChart
      width={640}
      height={400}
      data={rows}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="t"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        ticks={ticks}
        tickFormatter={(t) => String(new Date(t).getUTCFullYear())}
      />
      <YAxis tickFormatter={(v) => `${v / 1000}k`} />
      <Area
        dataKey="pos"
        type="linear"
        stroke="none"
        fill="#59a14f"
        fillOpacity={0.6}
        baseValue={0}
        isAnimationActive={false}
      />
      <Area
        dataKey="neg"
        type="linear"
        stroke="none"
        fill="#e15759"
        fillOpacity={0.6}
        baseValue={0}
        isAnimationActive={false}
      />
      <ReferenceLine y={0} stroke="#666" />
      <Line
        dataKey="balance"
        type="linear"
        stroke="#333"
        strokeWidth={1.5}
        dot={false}
        connectNulls
        isAnimationActive={false}
      />
    </ComposedChart>
  );
}

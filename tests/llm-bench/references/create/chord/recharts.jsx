import { PieChart, Pie, Cell } from "recharts";

// Recharts has no chord layout. The ring is a Pie of each channel's total
// count (a donut with padding between segments). The ribbons are computed
// here on the same angles Pie uses, and drawn as paths inside the chart.

const COLORS = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2"];
const SIZE = 480;
const C = SIZE / 2;
const R_OUT = 190;
const R_IN = 170;
const PAD = 3; // degrees between segments
const START = 90;
const END = -270; // clockwise from 12 o'clock
const RADIAN = Math.PI / 180;

// Recharts angles: degrees counterclockwise from 3 o'clock, y up.
const point = (a, r) => [
  C + r * Math.cos(a * RADIAN),
  C - r * Math.sin(a * RADIAN),
];

function Ribbons({ ribbons }) {
  const r = R_IN - 2;
  return (
    <g>
      {ribbons.map((b) => {
        const [s0, s1, t0, t1] = [b.s0, b.s1, b.t0, b.t1].map((a) =>
          point(a, r)
        );
        // Angles decrease clockwise, so each arc is drawn clockwise (sweep 1).
        const arc = (to, a, z) =>
          `A${r},${r} 0 ${Math.abs(a - z) > 180 ? 1 : 0} 1 ${to[0]},${to[1]}`;
        const d =
          `M${s0[0]},${s0[1]} ${arc(s1, b.s0, b.s1)}` +
          ` Q${C},${C} ${t0[0]},${t0[1]} ${arc(t1, b.t0, b.t1)}` +
          ` Q${C},${C} ${s0[0]},${s0[1]} Z`;
        return <path key={b.key} d={d} fill={b.color} fillOpacity={0.6} />;
      })}
    </g>
  );
}

function NodeLabel({ cx, cy, midAngle, outerRadius, name }) {
  const [x, y] = [
    cx + (outerRadius + 18) * Math.cos(midAngle * RADIAN),
    cy - (outerRadius + 18) * Math.sin(midAngle * RADIAN),
  ];
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={13}
    >
      {name}
    </text>
  );
}

export default function Chart({ data }) {
  const names = [...new Set(data.flatMap((d) => [d.source, d.target]))];
  const nodes = names.map((name, i) => ({
    name,
    color: COLORS[i % COLORS.length],
    total: data
      .filter((d) => d.source === name || d.target === name)
      .reduce((s, d) => s + d.count, 0),
  }));

  // The same angles Pie gives its sectors: with a full circle there is one
  // pad per sector, and the rest is shared by value.
  const sum = nodes.reduce((s, n) => s + n.total, 0);
  const perUnit = (Math.abs(END - START) - nodes.length * PAD) / sum;
  let at = START;
  for (const n of nodes) {
    n.start = at;
    n.cursor = at;
    at -= n.total * perUnit + PAD;
  }
  // Each link takes the next piece of both of its nodes' segments.
  const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
  const take = (n, count) => {
    const a = n.cursor;
    n.cursor -= count * perUnit;
    return [a, n.cursor];
  };
  const ribbons = data.map((d) => {
    const [s0, s1] = take(byName[d.source], d.count);
    const [t0, t1] = take(byName[d.target], d.count);
    return {
      key: `${d.source}-${d.target}`,
      s0,
      s1,
      t0,
      t1,
      color: byName[d.source].color,
    };
  });

  return (
    <PieChart
      width={SIZE}
      height={SIZE}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <Pie
        data={nodes}
        dataKey="total"
        nameKey="name"
        cx={C}
        cy={C}
        innerRadius={R_IN}
        outerRadius={R_OUT}
        startAngle={START}
        endAngle={END}
        paddingAngle={PAD}
        stroke="none"
        label={NodeLabel}
        labelLine={false}
        isAnimationActive={false}
      >
        {nodes.map((n) => (
          <Cell key={n.name} fill={n.color} />
        ))}
      </Pie>
      <Ribbons ribbons={ribbons} />
    </PieChart>
  );
}

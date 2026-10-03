import {
  ComposedChart,
  XAxis,
  YAxis,
  Rectangle,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

// Recharts has no alluvial diagram (its Sankey re-aggregates the flows at
// every node, so a row cannot keep its own ribbon). The layout is computed
// here in data units: x is the step index (0, 1, 2) and y is the passenger
// count, with gaps between nodes also in counts. Hidden axes map both to
// pixels, and the nodes and ribbons are drawn through the axis scales.

const STEPS = ["class", "survival", "gender"];
const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2"];
const NODE_W = 0.05; // node width, in step units
const GAP = 30; // gap between nodes, in counts

function Alluvial({ nodes, ribbons, colorOf }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  // One outline per ribbon: along its top edge, curving across each gap and
  // straight through the middle node, then back along its bottom edge.
  const curve = (xa, ya, xb, yb) => {
    const xm = x((xa + xb) / 2);
    return `C${xm},${y(ya)} ${xm},${y(yb)} ${x(xb)},${y(yb)}`;
  };
  const outline = ({ y: [y0, y1, y2], t }) =>
    [
      `M${x(NODE_W)},${y(y0)}`,
      curve(NODE_W, y0, 1, y1),
      `H${x(1 + NODE_W)}`,
      curve(1 + NODE_W, y1, 2, y2),
      `V${y(y2 + t)}`,
      curve(2, y2 + t, 1 + NODE_W, y1 + t),
      `H${x(1)}`,
      curve(1, y1 + t, NODE_W, y0 + t),
      "Z",
    ].join(" ");
  return (
    <g>
      {ribbons.map((r) => (
        <path
          key={r.key}
          fill={colorOf[r.row.class]}
          fillOpacity={0.5}
          d={outline(r)}
        />
      ))}
      {nodes.map((n) => (
        <g key={`${n.step}-${n.name}`}>
          <Rectangle
            x={x(n.i)}
            y={y(n.y)}
            width={x(n.i + NODE_W) - x(n.i)}
            height={y(n.y + n.value) - y(n.y)}
            fill="#444"
          />
          <text
            x={n.i === 0 ? x(n.i) - 6 : x(n.i + NODE_W) + 6}
            y={y(n.y + n.value / 2)}
            textAnchor={n.i === 0 ? "end" : "start"}
            dominantBaseline="central"
            fontSize={12}
          >
            {n.name}
          </text>
        </g>
      ))}
    </g>
  );
}

export default function Chart({ data }) {
  const cats = STEPS.map((s) => [...new Set(data.map((d) => d[s]))]);
  const total = data.reduce((s, d) => s + d.count, 0);
  const height = total + GAP * (Math.max(...cats.map((c) => c.length)) - 1);
  const colorOf = Object.fromEntries(
    cats[0].map((c, i) => [c, COLORS[i % COLORS.length]])
  );

  // Nodes, top to bottom in first-appearance order (y grows downward).
  const nodes = [];
  STEPS.forEach((step, i) => {
    let at = 0;
    for (const name of cats[i]) {
      const value = data
        .filter((d) => d[step] === name)
        .reduce((s, d) => s + d.count, 0);
      nodes.push({ step, i, name, y: at, value });
      at += value + GAP;
    }
  });

  // One ribbon per row. Inside each node the ribbons are stacked by the
  // other two steps' categories, so a ribbon enters and leaves the middle
  // node at the same height.
  const ribbons = data.map((row) => ({
    key: STEPS.map((s) => row[s]).join("-"),
    row,
    t: row.count,
    y: [],
  }));
  const rank = (j, r) => cats[j].indexOf(r.row[STEPS[j]]);
  STEPS.forEach((step, i) => {
    const [a, b] = [0, 1, 2].filter((j) => j !== i);
    for (const n of nodes.filter((n) => n.i === i)) {
      let at = n.y;
      ribbons
        .filter((r) => r.row[step] === n.name)
        .sort((p, q) => rank(a, p) - rank(a, q) || rank(b, p) - rank(b, q))
        .forEach((r) => {
          r.y[i] = at;
          at += r.t;
        });
    }
  });

  return (
    <ComposedChart
      width={640}
      height={420}
      data={nodes}
      margin={{ top: 20, right: 70, bottom: 20, left: 70 }}
    >
      <XAxis type="number" dataKey="i" domain={[0, 2 + NODE_W]} hide />
      <YAxis type="number" dataKey="y" domain={[0, height]} reversed hide />
      <Alluvial nodes={nodes} ribbons={ribbons} colorOf={colorOf} />
    </ComposedChart>
  );
}

import { ComposedChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

// Recharts has no tree layout. The layout is computed here: leaves evenly
// spaced in depth-first order (x = leaf index), each other node at the
// middle of its children, y = the node's height. Each link is a Line series
// of three points: up from the child, then across to the parent.

export default function Chart({ data }) {
  const children = new Map();
  for (const d of data)
    if (d.parent)
      children.set(d.parent, [...(children.get(d.parent) ?? []), d.name]);
  const byName = new Map(data.map((d) => [d.name, d]));
  const root = data.find((d) => !d.parent).name;

  const x = new Map();
  const leaves = [];
  const place = (name) => {
    const kids = children.get(name) ?? [];
    if (kids.length === 0) {
      x.set(name, leaves.length);
      leaves.push(name);
    } else {
      kids.forEach(place);
      const xs = kids.map((k) => x.get(k));
      x.set(name, (Math.min(...xs) + Math.max(...xs)) / 2);
    }
  };
  place(root);

  const links = data
    .filter((d) => d.parent)
    .map((d) => {
      const p = byName.get(d.parent);
      return {
        key: d.name,
        points: [
          { x: x.get(d.name), h: d.height },
          { x: x.get(d.name), h: p.height },
          { x: x.get(p.name), h: p.height },
        ],
      };
    });

  return (
    <ComposedChart
      width={640}
      height={400}
      margin={{ top: 20, right: 30, bottom: 10, left: 10 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis
        type="number"
        dataKey="x"
        domain={[-0.5, leaves.length - 0.5]}
        ticks={leaves.map((_, i) => i)}
        tickFormatter={(i) => leaves[i]}
        interval={0}
        axisLine={false}
        tickLine={false}
      />
      <YAxis type="number" dataKey="h" domain={[0, "auto"]} />
      {links.map((l) => (
        <Line
          key={l.key}
          data={l.points}
          dataKey="h"
          type="linear"
          stroke="#555"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      ))}
    </ComposedChart>
  );
}

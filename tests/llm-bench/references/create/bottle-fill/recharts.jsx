import { BarChart, Bar, XAxis, YAxis, LabelList } from "recharts";

// Recharts has no bottle chart. It is a bar chart on a 0-100 axis whose
// plot is 200 px tall, so a bar's height is its level; each bar is drawn
// with a custom shape: the bottle outline and the bar's rect clipped to it.

const W = 60;
const PLOT_H = 200;

function Bottle({ x, y, width, height, index }) {
  const left = x + (width - W) / 2;
  const bottom = y + height;
  const top = bottom - PLOT_H;
  const outline = `M${left},${bottom} h${W} v${-150} h${-20} v${-50} h${-20} v${50} h${-20} Z`;
  const id = `bottle-${index}`;
  return (
    <g>
      <clipPath id={id}>
        <path d={outline} />
      </clipPath>
      <rect
        x={left}
        y={y}
        width={W}
        height={height}
        fill="#4caf50"
        clipPath={`url(#${id})`}
      />
      <path d={outline} fill="none" stroke="#444" strokeWidth={2} />
      <text x={left + W / 2} y={top - 8} textAnchor="middle" fontSize={12}>
        {`${Math.round((height / PLOT_H) * 100)}%`}
      </text>
    </g>
  );
}

export default function Chart({ data }) {
  return (
    <BarChart
      width={560}
      height={360}
      data={data}
      margin={{ top: 60, right: 40, bottom: 70, left: 40 }}
    >
      <XAxis dataKey="wine" axisLine={false} tickLine={false} />
      <YAxis domain={[0, 100]} hide />
      <Bar
        dataKey="fill_pct"
        shape={(props) => <Bottle {...props} />}
        isAnimationActive={false}
      />
    </BarChart>
  );
}

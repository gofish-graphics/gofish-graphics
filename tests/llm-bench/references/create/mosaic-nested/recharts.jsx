import {
  ComposedChart,
  XAxis,
  YAxis,
  Legend,
  DefaultLegendContent,
  Rectangle,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

// Recharts has no mosaic chart. Both axes run over [0, 1] (shares), and the
// cells are drawn with Rectangle through the axis scales. The y axis ticks
// sit at the middle of each class band and show the class names.

const COLORS = { Yes: "#4e79a7", No: "#bab0ac" };

function Cells({ cells }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  return (
    <g>
      {cells.map((c, i) => (
        <Rectangle
          key={i}
          x={x(c.x0)}
          y={y(c.y1)}
          width={x(c.x1) - x(c.x0)}
          height={y(c.y0) - y(c.y1)}
          fill={COLORS[c.survived]}
          stroke="white"
        />
      ))}
    </g>
  );
}

export default function Chart({ data }) {
  const uniq = (key, rows) => [...new Set(rows.map((d) => d[key]))];
  const sum = (rows) => rows.reduce((s, d) => s + d.count, 0);

  // Class bands bottom to top, sex left to right, survived bottom to top.
  const cells = [];
  const bands = [];
  let y0 = 0;
  for (const c of uniq("class", data)) {
    const inClass = data.filter((d) => d.class === c);
    const y1 = y0 + sum(inClass) / sum(data);
    bands.push({ at: (y0 + y1) / 2, c });
    let x0 = 0;
    for (const s of uniq("sex", inClass)) {
      const inSex = inClass.filter((d) => d.sex === s);
      const x1 = x0 + sum(inSex) / sum(inClass);
      let v0 = y0;
      for (const o of uniq("survived", inSex)) {
        const v1 =
          v0 +
          ((y1 - y0) * sum(inSex.filter((d) => d.survived === o))) / sum(inSex);
        cells.push({ survived: o, x0, x1, y0: v0, y1: v1 });
        v0 = v1;
      }
      x0 = x1;
    }
    y0 = y1;
  }

  return (
    <ComposedChart
      data={cells}
      width={560}
      height={440}
      margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
    >
      <XAxis dataKey="x1" type="number" domain={[0, 1]} hide />
      <YAxis
        dataKey="y1"
        type="number"
        domain={[0, 1]}
        ticks={bands.map((b) => b.at)}
        tickFormatter={(v) => bands.find((b) => b.at === v)?.c ?? ""}
        tickLine={false}
        axisLine={false}
        interval={0}
      />
      <Legend
        content={() => (
          <DefaultLegendContent
            payload={Object.entries(COLORS).map(([k, color]) => ({
              value: k,
              type: "square",
              color,
            }))}
          />
        )}
      />
      <Cells cells={cells} />
    </ComposedChart>
  );
}

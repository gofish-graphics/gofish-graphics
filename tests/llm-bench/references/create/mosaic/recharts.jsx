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

// Recharts has no mosaic chart. The axes are numeric (x in cumulative units,
// y in shares), and the tiles are drawn with Rectangle through the axis
// scales.

const COLORS = ["#4e79a7", "#f28e2b", "#e15759"];

function Tiles({ cells, colors }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  return (
    <g>
      {cells.map((c) => (
        <Rectangle
          key={`${c.region}-${c.brand}`}
          x={x(c.x0)}
          y={y(c.y1)}
          width={x(c.x1) - x(c.x0)}
          height={y(c.y0) - y(c.y1)}
          fill={colors[c.brand]}
          stroke="white"
        />
      ))}
    </g>
  );
}

export default function Chart({ data }) {
  const regions = [...new Set(data.map((d) => d.region))];
  const brands = [...new Set(data.map((d) => d.brand))];
  const colors = Object.fromEntries(
    brands.map((b, i) => [b, COLORS[i % COLORS.length]])
  );
  const units = (r, b) =>
    data
      .filter((d) => d.region === r && d.brand === b)
      .reduce((s, d) => s + d.units, 0);

  const cells = [];
  const mids = [];
  let x0 = 0;
  for (const region of regions) {
    const total = brands.reduce((s, b) => s + units(region, b), 0);
    let y0 = 0;
    for (const brand of brands) {
      const share = units(region, brand) / total;
      cells.push({ region, brand, x0, x1: x0 + total, y0, y1: y0 + share });
      y0 += share;
    }
    mids.push({ at: x0 + total / 2, region });
    x0 += total;
  }

  return (
    <ComposedChart
      data={cells}
      width={640}
      height={400}
      margin={{ top: 20, right: 45, bottom: 20, left: 10 }}
    >
      <XAxis
        dataKey="x1"
        type="number"
        domain={[0, x0]}
        ticks={mids.map((m) => m.at)}
        tickFormatter={(v) => mids.find((m) => m.at === v)?.region ?? ""}
        interval={0}
      />
      <YAxis
        dataKey="y1"
        type="number"
        domain={[0, 1]}
        tickFormatter={(v) => `${Math.round(v * 100)}%`}
      />
      <Legend
        content={() => (
          <DefaultLegendContent
            payload={brands.map((b) => ({
              value: b,
              type: "square",
              color: colors[b],
            }))}
          />
        )}
      />
      <Tiles cells={cells} colors={colors} />
    </ComposedChart>
  );
}

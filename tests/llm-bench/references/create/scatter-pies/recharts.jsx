import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  DefaultLegendContent,
  Sector,
} from "recharts";

// Recharts has no pie glyphs. One Scatter point per lake, drawn with a
// custom shape: a small pie of Sectors around the point's (cx, cy).

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"];
const R = 20;

function PieGlyph({ cx, cy, payload, colors }) {
  const total = payload.slices.reduce((s, d) => s + d.count, 0);
  let angle = 90; // start at 12 o'clock, go clockwise
  return (
    <g>
      {payload.slices.map((d) => {
        const sweep = (360 * d.count) / total;
        const sector = (
          <Sector
            key={d.species}
            cx={cx}
            cy={cy}
            innerRadius={0}
            outerRadius={R}
            startAngle={angle}
            endAngle={angle - sweep}
            fill={colors[d.species]}
          />
        );
        angle -= sweep;
        return sector;
      })}
    </g>
  );
}

export default function Chart({ data }) {
  const species = [...new Set(data.map((d) => d.species))];
  const colors = Object.fromEntries(
    species.map((s, i) => [s, COLORS[i % COLORS.length]])
  );
  const lakes = [...new Set(data.map((d) => d.lake))].map((lake) => {
    const slices = data.filter((d) => d.lake === lake);
    return { lake, x: slices[0].x, y: slices[0].y, slices };
  });

  return (
    <ScatterChart
      width={560}
      height={480}
      margin={{ top: 30, right: 30, bottom: 30, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" dataKey="x" name="x" domain={[-10, 150]} />
      <YAxis type="number" dataKey="y" name="y" domain={[0, 200]} />
      <Legend
        content={() => (
          <DefaultLegendContent
            payload={species.map((s) => ({
              value: s,
              type: "square",
              color: colors[s],
            }))}
          />
        )}
      />
      <Scatter
        data={lakes}
        shape={(props) => <PieGlyph {...props} colors={colors} />}
        isAnimationActive={false}
      />
    </ScatterChart>
  );
}

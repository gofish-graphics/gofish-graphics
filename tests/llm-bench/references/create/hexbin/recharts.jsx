import {
  ScatterChart,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale,
  usePlotArea,
} from "recharts";

// Recharts has no hexbin. A child component reads the axis scales, bins the
// films in pixels as d3-hexbin does, and draws one hexagon per nonempty bin,
// with a legend of swatches beside the plot.

const RADIUS = 25; // px, center to corner
const SX = Math.sqrt(3) * RADIUS; // centers in a row
const SY = 3 * RADIUS; // rows of the same offset
const LIGHT = [254, 232, 200];
const DARK = [127, 0, 0];

function color(t) {
  const c = LIGHT.map((l, i) => Math.round(l + (DARK[i] - l) * t));
  return `rgb(${c.join(",")})`;
}

// The nearer center of the two offset lattices around a pixel.
function center(px, py) {
  const a = [Math.round(px / SX) * SX, Math.round(py / SY) * SY];
  const b = [
    (Math.floor(px / SX) + 0.5) * SX,
    (Math.floor(py / SY) + 0.5) * SY,
  ];
  const d = ([x, y]) => (px - x) ** 2 + (py - y) ** 2;
  return d(a) <= d(b) ? a : b;
}

const CORNERS = [0, 1, 2, 3, 4, 5].map((k) => {
  const angle = (Math.PI / 3) * k;
  return [RADIUS * Math.sin(angle), -RADIUS * Math.cos(angle)];
});

function Hexbins({ data }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  const area = usePlotArea();
  if (!x || !y || !area) return null;
  const bins = new Map();
  for (const d of data) {
    const [cx, cy] = center(x(d.budget), y(d.box_office));
    const key = `${cx},${cy}`;
    if (!bins.has(key)) bins.set(key, { cx, cy, count: 0 });
    bins.get(key).count++;
  }
  const max = Math.max(...[...bins.values()].map((b) => b.count));
  const fill = (n) => color(n / max);
  const counts = Array.from({ length: max }, (_, i) => i + 1);
  const lx = area.x + area.width + 16;
  return (
    <g>
      {[...bins.values()].map((b) => (
        <polygon
          key={`${b.cx},${b.cy}`}
          points={CORNERS.map(([dx, dy]) => `${b.cx + dx},${b.cy + dy}`).join(
            " "
          )}
          fill={fill(b.count)}
          stroke="white"
          strokeWidth={0.5}
        />
      ))}
      <text x={lx} y={area.y + 10} fontSize={12}>
        Films
      </text>
      {counts.map((n, i) => (
        <g key={n} transform={`translate(${lx},${area.y + 20 + i * 18})`}>
          <rect width={12} height={12} fill={fill(n)} />
          <text x={18} y={10} fontSize={11}>
            {n}
          </text>
        </g>
      ))}
    </g>
  );
}

export default function Chart({ data }) {
  return (
    <ScatterChart
      width={600}
      height={450}
      margin={{ top: 20, right: 80, bottom: 20, left: 20 }}
    >
      <XAxis
        type="number"
        dataKey="budget"
        domain={[-50, 450]}
        allowDataOverflow
        label={{ value: "Budget ($M)", position: "insideBottom", offset: -10 }}
      />
      <YAxis
        type="number"
        dataKey="box_office"
        domain={[1200, 4000]}
        allowDataOverflow
        label={{ value: "Box office ($M)", angle: -90, position: "insideLeft" }}
      />
      <Hexbins data={data} />
    </ScatterChart>
  );
}

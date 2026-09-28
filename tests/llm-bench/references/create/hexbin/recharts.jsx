import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

// Recharts has no hexbin. The bins are computed here; a scatter chart places
// one point per nonempty bin and draws it as a hexagon whose corners go
// through the axis scales, so the hexagons are sized in data units.

const X_STEP = 100;
const Y_STEP = 1000;
const LIGHT = [254, 232, 200];
const DARK = [127, 0, 0];

function color(t) {
  const c = LIGHT.map((l, i) => Math.round(l + (DARK[i] - l) * t));
  return `rgb(${c.join(",")})`;
}

// Corners of a pointy-top hexagon around (x, y), in data units.
const CORNERS = [
  [0, Y_STEP / 3],
  [X_STEP / 2, Y_STEP / 6],
  [X_STEP / 2, -Y_STEP / 6],
  [0, -Y_STEP / 3],
  [-X_STEP / 2, -Y_STEP / 6],
  [-X_STEP / 2, Y_STEP / 6],
];

function Hexagon({ payload }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  const pts = CORNERS.map(
    ([dx, dy]) => `${x(payload.x + dx)},${y(payload.y + dy)}`
  ).join(" ");
  return (
    <polygon
      points={pts}
      fill={payload.color}
      stroke="white"
      strokeWidth={0.5}
    />
  );
}

// The nearest center on either lattice, by (dx/X_STEP)^2 + 3 (dy/Y_STEP)^2.
function binOf(bx, by) {
  const u = bx / X_STEP;
  const v = by / Y_STEP;
  const a = [Math.round(u), Math.round(v)];
  const b = [Math.floor(u) + 0.5, Math.floor(v) + 0.5];
  const d = ([i, j]) => (u - i) ** 2 + 3 * (v - j) ** 2;
  const [i, j] = d(a) <= d(b) ? a : b;
  return { x: i * X_STEP, y: j * Y_STEP };
}

export default function Chart({ data }) {
  const bins = new Map();
  for (const d of data) {
    const c = binOf(d.budget, d.box_office);
    const key = `${c.x},${c.y}`;
    if (!bins.has(key)) bins.set(key, { ...c, count: 0 });
    bins.get(key).count++;
  }
  const max = Math.max(...[...bins.values()].map((b) => b.count));
  const cells = [...bins.values()].map((b) => ({
    ...b,
    color: color(max === 1 ? 1 : (b.count - 1) / (max - 1)),
  }));
  // Axis domains that hold every hexagon, on whole steps, ticked every step.
  const span = (vs, half, step) => [
    Math.floor((Math.min(...vs) - half) / step) * step,
    Math.ceil((Math.max(...vs) + half) / step) * step,
  ];
  const steps = ([lo, hi], step) =>
    Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);
  const xDomain = span(
    cells.map((c) => c.x),
    X_STEP / 2,
    X_STEP
  );
  const yDomain = span(
    cells.map((c) => c.y),
    Y_STEP / 3,
    Y_STEP
  );
  const counts = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <ScatterChart
      width={600}
      height={450}
      margin={{ top: 20, right: 30, bottom: 20, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        type="number"
        dataKey="x"
        domain={xDomain}
        ticks={steps(xDomain, X_STEP)}
        name="budget"
        label={{ value: "Budget ($M)", position: "insideBottom", offset: -10 }}
      />
      <YAxis
        type="number"
        dataKey="y"
        domain={yDomain}
        ticks={steps(yDomain, Y_STEP)}
        name="box office"
        label={{ value: "Box office ($M)", angle: -90, position: "insideLeft" }}
      />
      <Legend
        verticalAlign="top"
        content={() => (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              fontSize: 12,
            }}
          >
            <span>Films per bin:</span>
            {counts.map((n) => (
              <span
                key={n}
                style={{ display: "flex", alignItems: "center", gap: 2 }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    background: color(max === 1 ? 1 : (n - 1) / (max - 1)),
                  }}
                />
                {n}
              </span>
            ))}
          </div>
        )}
      />
      <Scatter data={cells} shape={<Hexagon />} isAnimationActive={false} />
    </ScatterChart>
  );
}

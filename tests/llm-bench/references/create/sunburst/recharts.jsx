import { PieChart, Pie, Cell } from "recharts";

// A two-level sunburst as two concentric Pies over the same angle range:
// the regions in the inner ring and the subregions, grouped by region in
// the same order, in the outer ring. (Recharts' SunburstChart labels each
// sector with its value, not its name, so the nested pies are used instead.)

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#59a14f", "#b07aa1"];

// Mix a hex color toward white by t (0 to 1).
function lighten(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (255 - v) * t)
  );
  return `rgb(${c.join(",")})`;
}

const RADIAN = Math.PI / 180;

function RegionLabel({ cx, cy, midAngle, innerRadius, outerRadius, name }) {
  const r = (innerRadius + outerRadius) / 2;
  return (
    <text
      x={cx + r * Math.cos(-midAngle * RADIAN)}
      y={cy + r * Math.sin(-midAngle * RADIAN)}
      textAnchor="middle"
      dominantBaseline="central"
      fill="white"
      fontSize={13}
      fontWeight="bold"
    >
      {name}
    </text>
  );
}

export default function Chart({ data }) {
  const regions = [...new Set(data.map((d) => d.region))].map((region, i) => ({
    region,
    color: COLORS[i % COLORS.length],
    population: data
      .filter((d) => d.region === region)
      .reduce((s, d) => s + d.population, 0),
  }));
  const colorOf = Object.fromEntries(regions.map((r) => [r.region, r.color]));
  const subregions = regions.flatMap((r) =>
    data.filter((d) => d.region === r.region)
  );

  const common = {
    cx: "50%",
    cy: "50%",
    startAngle: 90,
    endAngle: -270,
    stroke: "white",
    isAnimationActive: false,
  };

  return (
    <PieChart width={520} height={520}>
      <Pie
        {...common}
        data={regions}
        dataKey="population"
        nameKey="region"
        innerRadius={50}
        outerRadius={140}
        label={RegionLabel}
        labelLine={false}
      >
        {regions.map((r) => (
          <Cell key={r.region} fill={r.color} />
        ))}
      </Pie>
      <Pie
        {...common}
        data={subregions}
        dataKey="population"
        nameKey="subregion"
        innerRadius={140}
        outerRadius={220}
      >
        {subregions.map((s, i) => (
          <Cell
            key={s.subregion}
            fill={lighten(colorOf[s.region], 0.25 + 0.12 * (i % 3))}
          />
        ))}
      </Pie>
    </PieChart>
  );
}

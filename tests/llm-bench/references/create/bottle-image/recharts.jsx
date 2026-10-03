import { BarChart, Bar, XAxis, YAxis } from "recharts";

// A bar chart on a 0-100 axis whose plot is 240 px tall (the image's
// height), so a bar's top is its fill level. Each bar is drawn with a custom
// shape: the bottle image in grayscale, and the bar's rect in the liquid
// color, blended with `mix-blend-mode: color` and masked by the image's
// alpha so it follows the bottle's shape.

const H = 240;
const W = (H * 157) / 650;
const SRC = "/assets/bottle.png";

function Bottle({ x, y, width, height, index, payload }) {
  const left = x + (width - W) / 2;
  const bottom = y + height;
  const top = bottom - H;
  const id = `bottle-alpha-${index}`;
  return (
    <g>
      <defs>
        <filter id={`gray-${index}`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <mask
          id={id}
          maskContentUnits="userSpaceOnUse"
          style={{ maskType: "alpha" }}
        >
          <image href={SRC} x={left} y={top} width={W} height={H} />
        </mask>
      </defs>
      <g style={{ isolation: "isolate" }}>
        <image
          href={SRC}
          x={left}
          y={top}
          width={W}
          height={H}
          filter={`url(#gray-${index})`}
        />
        <rect
          x={left}
          y={y}
          width={W}
          height={height}
          fill="#00c853"
          mask={`url(#${id})`}
          style={{ mixBlendMode: "color" }}
        />
      </g>
      <line x1={left} x2={left + W} y1={y} y2={y} stroke="#666666" />
      <text
        x={left + W + 4}
        y={y}
        dominantBaseline="middle"
        fill="#666666"
        fontSize={14}
      >
        {`${payload.fill_pct}%`}
      </text>
    </g>
  );
}

export default function Chart({ data }) {
  return (
    <BarChart
      width={640}
      height={360}
      data={data}
      margin={{ top: 60, right: 60, bottom: 30, left: 20 }}
      style={{ background: "white" }}
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

import { Treemap } from "recharts";

const COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
];

// Drawn for every node; only films (depth 2) draw anything: the cell
// outline and the inscribed circle, 1px clear of the long sides. The last
// film of a genre also names the genre (`root` is its genre node), so the
// name is drawn over the genre's circles.
function Cell({ depth, x, y, width, height, color, index, root }) {
  if (depth !== 2) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="#ccc"
      />
      <circle
        cx={x + width / 2}
        cy={y + height / 2}
        r={Math.min(width, height) / 2 - 1}
        fill={color}
      />
      {index === root.children.length - 1 && (
        <text
          x={root.x + 4}
          y={root.y + 14}
          fontSize={12}
          fontWeight="bold"
          stroke="white"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {root.name}
        </text>
      )}
    </g>
  );
}

export default function Chart({ data }) {
  const genres = [...new Set(data.map((d) => d.genre))];
  const tree = genres.map((genre, i) => ({
    name: genre,
    children: data
      .filter((d) => d.genre === genre)
      .map((d) => ({ name: d.title, gross: d.gross, color: COLORS[i] })),
  }));
  return (
    <Treemap
      width={600}
      height={400}
      data={tree}
      dataKey="gross"
      isAnimationActive={false}
      content={<Cell />}
    />
  );
}

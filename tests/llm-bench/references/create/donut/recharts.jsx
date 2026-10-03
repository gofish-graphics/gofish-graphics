import { PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f"];

export default function Chart({ data }) {
  return (
    <PieChart width={480} height={400}>
      <Pie
        data={data}
        dataKey="visits"
        nameKey="channel"
        cx="50%"
        cy="45%"
        innerRadius={70}
        outerRadius={140}
        startAngle={90}
        endAngle={-270}
        stroke="white"
        isAnimationActive={false}
      >
        {data.map((d, i) => (
          <Cell key={d.channel} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Legend />
    </PieChart>
  );
}

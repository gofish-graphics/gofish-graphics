import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

const COLORS = ["#4e79a7", "#f28e2b", "#e15759"];

export default function Chart({ data }) {
  const answers = [...new Set(data.map((d) => d.answer))];
  const byQuestion = new Map();
  for (const d of data) {
    if (!byQuestion.has(d.question))
      byQuestion.set(d.question, { question: d.question });
    const row = byQuestion.get(d.question);
    row[d.answer] = (row[d.answer] ?? 0) + d.count;
  }
  const rows = [...byQuestion.values()];

  return (
    <BarChart
      width={640}
      height={400}
      data={rows}
      layout="vertical"
      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" />
      <YAxis type="category" dataKey="question" width={90} />
      <Legend />
      {answers.map((a, i) => (
        <Bar
          key={a}
          dataKey={a}
          stackId="answers"
          fill={COLORS[i % COLORS.length]}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

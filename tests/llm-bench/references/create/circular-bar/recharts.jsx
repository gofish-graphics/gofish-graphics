import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  PolarRadiusAxis,
  LabelList,
} from "recharts";

// A RadialBarChart in the "centric" layout puts the categories around the
// angle axis and the values along the radius, so bars radiate outward from
// the inner radius. The angles run clockwise (endAngle below startAngle), but
// Recharts draws each bar counterclockwise from its tick, one slot before it,
// so the range starts one slot after 12 o'clock to put the first bar just
// clockwise of 12. The labels sit outside the middle of each bar.

export default function Chart({ data }) {
  const max = Math.max(...data.map((d) => d.exports));
  const slot = 360 / data.length;
  return (
    <RadialBarChart
      layout="centric"
      width={520}
      height={520}
      data={data}
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={190}
      startAngle={90 - slot}
      endAngle={-270 - slot}
      barCategoryGap="8%"
    >
      <PolarAngleAxis
        type="category"
        dataKey="country"
        tick={false}
        axisLine={false}
      />
      <PolarRadiusAxis
        type="number"
        domain={[0, max]}
        tick={false}
        axisLine={false}
      />
      <RadialBar dataKey="exports" fill="#4e79a7" isAnimationActive={false}>
        <LabelList
          dataKey="country"
          position="outside"
          fontSize={11}
          fill="#333"
        />
      </RadialBar>
    </RadialBarChart>
  );
}

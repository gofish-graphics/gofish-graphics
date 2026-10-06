import { chart, scatter, circle, palette } from "gofish-graphics";

const W = 440;

export default function render(container, data) {
  const maxPop = Math.max(...data.map((d) => d.population));
  // WORKAROUND: a data-driven `r` is the circle's DIAMETER in x-axis data
  // units, not a pixel radius, so a 30 px radius has to be converted through
  // the x scale by hand (the axis runs 0-70 over W px after rounding).
  const pxPerUnit = W / 70;
  const diameter = (d) =>
    (2 * 30 * Math.sqrt(d.population / maxPop)) / pxPerUnit;
  return (
    chart(data, {
      axes: {
        x: { title: "GDP per capita (thousand USD)" },
        y: { title: "Life expectancy (years)" },
      },
      color: palette("tableau10"),
    })
      .flow(scatter({ x: "gdp_per_capita", y: "life_expectancy" }))
      // area proportional to population: the size is sqrt(population)
      .mark(circle({ r: diameter, fill: "region", opacity: 0.6 }))
      .render(container, { w: W, h: 330 })
  );
}

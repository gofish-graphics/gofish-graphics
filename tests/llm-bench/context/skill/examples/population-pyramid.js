// Population Pyramid
// Women and men in each age band drawn outward from a shared center, so the two sides of the population compare at a glance.

import {
  Schema,
  chart,
  field,
  palette,
  rect,
  spread,
  stack,
} from "gofish-graphics";
const BANDS = [
  ["0-4", 9.6, 10.0],
  ["5-9", 9.9, 10.3],
  ["10-14", 10.4, 10.8],
  ["15-19", 10.5, 10.9],
  ["20-24", 10.6, 11.0],
  ["25-29", 11.2, 11.6],
  ["30-34", 11.0, 11.2],
  ["35-39", 10.9, 10.8],
  ["40-44", 10.1, 9.9],
  ["45-49", 10.1, 9.8],
  ["50-54", 10.6, 10.3],
  ["55-59", 11.0, 10.4],
  ["60-64", 10.6, 9.8],
  ["65-69", 9.2, 8.2],
  ["70-74", 7.6, 6.6],
  ["75-79", 5.3, 4.3],
  ["80-84", 3.4, 2.5],
  ["85+", 3.9, 2.2],
];
const population = BANDS.flatMap(([age, women, men]) => [
  { age, sex: "Women", people: women },
  { age, sex: "Men", people: men },
]);
const container = document.getElementById("app");
chart(population, {
  schema: { sex: Schema.ordered(["Women", "Men"]).diverging() },
  color: palette({ Women: "#c05780", Men: "#3b75af" }),
  axes: { x: { title: "People (millions)" }, y: true },
})
  .flow(
    spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
    stack({ by: "sex", dir: "x" }),
  )
  .mark(rect({ w: "people", fill: "sex" }))
  .render(container, { w: 480, h: 440 });

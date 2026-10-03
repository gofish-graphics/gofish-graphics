import type { Task } from "../../scripts/llm-bench/tasks";

const task: Task = {
  id: "create/bubble",
  kind: "create",
  data: "countries",
  size: { w: 640, h: 440 },
  instruction:
    "Make a bubble chart with one circle per country: `gdp_per_capita` on the horizontal axis " +
    "and `life_expectancy` on the vertical axis (both linear). Each circle's area is " +
    "proportional to `population`: the radius is proportional to the square root of the " +
    "population, so a population of zero would have zero area. Make the largest circle about " +
    "30 px in radius. Color the circles by `region`, one color per region, draw them " +
    "semi-transparent so overlapping circles stay visible, and include a legend that names " +
    'each region. Title the horizontal axis "GDP per capita (thousand USD)" and the vertical ' +
    'axis "Life expectancy (years)".',
  checks: [
    {
      check: "points",
      x: "gdp_per_capita",
      y: "life_expectancy",
      size: "population",
      maxRadius: 30,
      colorBy: "region",
    },
    {
      check: "textIncludes",
      strings: [
        "Asia",
        "Europe",
        "Americas",
        "Africa",
        "GDP per capita (thousand USD)",
        "Life expectancy (years)",
      ],
    },
    { check: "sizeAbout" },
  ],
};
export default task;

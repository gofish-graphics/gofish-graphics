/**
 * Data for the build-in prototype gallery. Small tables are inline; the rest
 * are shaped from datasets already in the repo.
 */
import { seattleWeather } from "../../../src/data/seatle-weather";
import { penguins } from "../../../src/data/penguins";
import {
  categoryBrands,
  everyYearBrands,
} from "../../../src/data/categoryBrands";

/** Relative frequency of each letter in English text (the D3 bar chart
 *  classic). */
export const alphabet = Object.entries({
  A: 0.08167,
  B: 0.01492,
  C: 0.02782,
  D: 0.04253,
  E: 0.12702,
  F: 0.02288,
  G: 0.02015,
  H: 0.06094,
  I: 0.06966,
  J: 0.00153,
  K: 0.00772,
  L: 0.04025,
  M: 0.02406,
  N: 0.06749,
  O: 0.07507,
  P: 0.01929,
  Q: 0.00095,
  R: 0.05987,
  S: 0.06327,
  T: 0.09056,
  U: 0.02758,
  V: 0.00978,
  W: 0.0236,
  X: 0.0015,
  Y: 0.01974,
  Z: 0.00074,
}).map(([letter, frequency]) => ({ letter, frequency }));

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Average monthly precipitation in inches for three cities. Rounded
 *  approximations of the 1991-2020 normals, for illustration. */
const PRECIPITATION: Record<string, number[]> = {
  Seattle: [5.8, 3.8, 4.2, 3.2, 2.0, 1.5, 0.6, 0.8, 1.7, 3.9, 6.3, 5.9],
  "New York": [3.6, 3.2, 4.3, 4.1, 4.0, 4.5, 4.6, 4.6, 4.3, 4.4, 3.6, 4.4],
  Chicago: [2.1, 1.9, 2.5, 3.8, 4.9, 4.5, 4.2, 4.3, 3.4, 3.5, 2.4, 2.1],
};
export const weather = MONTHS.flatMap((month, m) =>
  Object.entries(PRECIPITATION).map(([city, values]) => ({
    month,
    city,
    precipitation: values[m],
  }))
);

/** Days of each kind of weather in Seattle, 2012-2015, by month. */
export const seattle = (() => {
  const counts = new Map<string, number>();
  for (const d of seattleWeather) {
    const month = MONTHS[new Date(d.date).getUTCMonth()];
    const key = `${month}|${d.weather}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return MONTHS.flatMap((month) =>
    ["sun", "fog", "drizzle", "rain", "snow"].map((weather) => ({
      month,
      weather,
      count: counts.get(`${month}|${weather}`) ?? 0,
    }))
  );
})();

/** Quarterly revenue of three products (the Canis stacked bar example's
 *  shape; made-up values). */
export const sales = [
  { quarter: "Q1", product: "Alpha", revenue: 12 },
  { quarter: "Q1", product: "Beta", revenue: 8 },
  { quarter: "Q1", product: "Gamma", revenue: 5 },
  { quarter: "Q2", product: "Alpha", revenue: 14 },
  { quarter: "Q2", product: "Beta", revenue: 9 },
  { quarter: "Q2", product: "Gamma", revenue: 7 },
  { quarter: "Q3", product: "Alpha", revenue: 11 },
  { quarter: "Q3", product: "Beta", revenue: 12 },
  { quarter: "Q3", product: "Gamma", revenue: 9 },
  { quarter: "Q4", product: "Alpha", revenue: 16 },
  { quarter: "Q4", product: "Beta", revenue: 10 },
  { quarter: "Q4", product: "Gamma", revenue: 12 },
];

/** Chinstrap penguins with every measurement present, standing in for CAST
 *  Fig. 3's counties: a scatterplot whose dots appear in order of a third
 *  value (here body mass; there the unemployment rate). */
export const chinstraps = penguins
  .filter(
    (d) =>
      d.Species === "Chinstrap" &&
      d["Beak Length (mm)"] !== null &&
      d["Beak Depth (mm)"] !== null &&
      d["Body Mass (g)"] !== null
  )
  .map((d) => ({
    beakLength: d["Beak Length (mm)"] as number,
    beakDepth: d["Beak Depth (mm)"] as number,
    mass: d["Body Mass (g)"] as number,
    sex: d.Sex ?? "unknown",
  }));

/** The bar chart race's brands: the 37 with a value in every year. */
export const brands = everyYearBrands(categoryBrands);

/** A small project plan (made-up), for the CAST+ Gantt scenario: each task
 *  starts on a day and lasts some days. */
export const tasks = [
  { task: "Research", start: 0, days: 5 },
  { task: "Design", start: 4, days: 7 },
  { task: "Prototype", start: 10, days: 4 },
  { task: "Build", start: 13, days: 12 },
  { task: "Test", start: 22, days: 6 },
  { task: "Launch", start: 28, days: 2 },
];

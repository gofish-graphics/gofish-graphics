/**
 * The spike's test specs, built with the public API. Data comes in as
 * arguments so this module has no fs access and can live in the engine
 * bundle. Copied from (and noted against) existing stories.
 */
import {
  chart,
  spread,
  stack,
  scatter,
  group,
  rect,
  circle,
  line,
  polygon,
  field,
  Color,
  Coord,
  Unit,
} from "../../../packages/gofish-graphics/src/lib";

export type Data = {
  weather: any[]; // vega-datasets seattle-weather.csv rows
  stocks: any[]; // vega-datasets stocks.csv rows
  seafood: any[];
  world110m: any[];
  birds: any[];
};

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

/** Deterministic 1,000-point, 3-cluster scatter data (an LCG, no Math.random). */
export function clusterRows(n = 1000) {
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const centers = [
    { group: "alpha", x: 20, y: 30 },
    { group: "beta", x: 55, y: 70 },
    { group: "gamma", x: 80, y: 25 },
  ];
  return Array.from({ length: n }, (_, i) => {
    const c = centers[i % 3];
    return {
      id: i,
      group: c.group,
      x: c.x + gauss() * 8,
      y: c.y + gauss() * 9,
    };
  });
}

/** Weather rows with `month` precomputed, so the spec needs no `derive`
 *  callback and serializes to IR (the story uses a JS `derive`). */
export function weatherWithMonth(weather: any[]) {
  return weather.map((r) => ({
    ...r,
    month: MONTHS[new Date(r.date).getMonth()],
  }));
}

export function yearlyStocks(rows: any[]) {
  const acc = new Map<
    string,
    { symbol: string; date: string; sum: number; n: number }
  >();
  for (const d of rows) {
    const year = new Date(d.date).getFullYear();
    const key = `${d.symbol}${year}`;
    const e = acc.get(key) ?? {
      symbol: d.symbol,
      date: `${year}-07-01`,
      sum: 0,
      n: 0,
    };
    e.sum += +d.price;
    e.n += 1;
    acc.set(key, e);
  }
  return [...acc.values()].map((e) => ({
    symbol: e.symbol,
    date: e.date,
    price: Math.round((e.sum / e.n) * 100) / 100,
  }));
}

/** Each spec: the builder plus its render options (w/h/axes/legend). */
export function buildSpecs(d: Data) {
  return {
    // (a) stories/vega-lite/Bar/StackedBarChart.stories.tsx (derive replaced by a precomputed month)
    bars: {
      node: chart(weatherWithMonth(d.weather), {
        color: Color.palette({
          sun: "#e7ba52",
          fog: "#dfdfdf",
          drizzle: "#79a1d5",
          rain: "#1f77b4",
          snow: "#9467bd",
        }),
      })
        .flow(
          spread({ by: field("month").sort(MONTHS), dir: "x" }),
          stack({
            by: field("weather").sort([
              "sun",
              "fog",
              "drizzle",
              "rain",
              "snow",
            ]),
            dir: "y",
          })
        )
        .mark(rect({ h: field("date").count(), fill: "weather" })),
      opts: { w: 400, h: 300, axes: true },
    },
    // (b) stories/vega-lite/ColoredScatterPlot.stories.tsx shape, 1,000 synthetic rows
    scatter: {
      node: chart(clusterRows(1000))
        .flow(scatter({ by: "id", x: "x", y: "y" }))
        .mark(circle({ r: 2.5, fill: "group" })),
      opts: { w: 400, h: 400, axes: true },
    },
    // (c) stories/forwardsyntax/LabelPlacement.stories.tsx LineEndLabels, with a legend instead of end labels
    lines: {
      node: chart(yearlyStocks(d.stocks), { schema: { date: Unit.time() } })
        .flow(
          group({ by: "symbol" }),
          scatter({ by: "date", x: "date", y: "price" })
        )
        .mark(line({ stroke: "symbol", strokeWidth: 2 })),
      opts: { w: 560, h: 320, axes: true, legend: true },
    },
    // (d) stories/forwardsyntax/Pie.stories.tsx Basic
    polar: {
      node: chart(d.seafood, { coord: Coord.clock(), axes: true })
        .flow(stack({ by: "species", dir: "x" }))
        .mark(rect({ w: "count", fill: "species" })),
      opts: { w: 300, h: 300 },
    },
    // (e) stories/animated-vega-lite/BirdMigrationStatic.stories.tsx A_StaticLines
    geo: {
      node: chart(d.world110m, {
        coord: Coord.geo("equalEarth", { lon: [-180, -58.7], lat: [-60, 84] }),
        legend: false,
      })
        .mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }))
        .layer(
          chart(d.birds)
            .flow(
              group({ by: "species" }),
              scatter({ by: "day", x: "lon", y: "lat" })
            )
            .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
        ),
      opts: { w: 600, h: 600 },
    },
  } as const;
}

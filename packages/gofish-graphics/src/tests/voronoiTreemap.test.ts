/**
 * Voronoi treemaps (#1222): the tiling (`geometry/voronoiTiling.ts`), and
 * the shapes a parent hands its children at layout (`geometry/ring.ts`):
 * a treemap's cells, an enclosure's oval, and the errors for a shape a
 * child cannot fill.
 *
 * Run: `tsx src/tests/voronoiTreemap.test.ts` (wired as
 * `pnpm test:voronoi-treemap`).
 */
import {
  fitPowerCells,
  voronoiTiling,
  TOLERANCE,
} from "../ast/geometry/voronoiTiling";
import {
  boxRing,
  ovalRing,
  ringArea,
  ringCentroid,
} from "../ast/geometry/ring";
import { isConvex } from "../ast/geometry/clip";
import { pointInRing } from "../ast/geometry/plane";
import { countryPopulations } from "../data/countryPopulations";
import {
  chart,
  circle,
  enclose,
  rect,
  region,
  Shape,
  spread,
  text,
  Tile,
  treemap,
} from "../lib";
import { check, items, report } from "./testHelpers";

type Pt = readonly [number, number];

/** Each value's share of `region`'s area, and how far each cell is off it,
 *  as a share of its target. */
const areaErrors = (region: readonly Pt[], values: number[], cells: Pt[][]) => {
  const total = values.reduce((a, b) => a + b, 0);
  const area = ringArea(region);
  return cells.map((c, i) => {
    const target = (values[i] / total) * area;
    return Math.abs(ringArea(c) - target) / target;
  });
};

const sums = (key: "continent" | "region") => {
  const by = new Map<string, number>();
  for (const d of countryPopulations)
    by.set(d[key], (by.get(d[key]) ?? 0) + d.pop);
  return [...by.values()];
};

console.log("# a Voronoi tiling gives each value its share of the area");
for (const [name, region, values] of [
  ["continents in a box", boxRing(480, 480), sums("continent")],
  ["continents in an oval", ovalRing(480, 360), sums("continent")],
  ["regions in a box", boxRing(320, 320), sums("region")],
  [
    "countries in a box",
    boxRing(320, 320),
    countryPopulations.map((d) => d.pop),
  ],
] as const) {
  const cells = voronoiTiling(region, values, 0);
  const worst = Math.max(...areaErrors(region, [...values], cells));
  check(
    `${name}: every cell within ${TOLERANCE * 100}% of its area`,
    worst < TOLERANCE,
    `worst ${(worst * 100).toFixed(2)}%`
  );
  check(
    `${name}: every cell is convex and inside the region`,
    cells.every(
      (c) =>
        isConvex(c) &&
        c.every(
          (p) =>
            pointInRing(p, region) ||
            region.some(
              (q, i) =>
                // On an edge of the region (a cell shares the region's edge).
                Math.abs(
                  (region[(i + 1) % region.length][0] - q[0]) * (p[1] - q[1]) -
                    (region[(i + 1) % region.length][1] - q[1]) * (p[0] - q[0])
                ) <
                1e-6 * 480 * 480
            )
        )
    )
  );
}

console.log("# the fitting loop converges in far fewer than its cap (#1274)");
{
  const region = boxRing(320, 320);
  const values = countryPopulations.map((d) => d.pop);
  const total = values.reduce((a, b) => a + b, 0);
  const targets = values.map((v) => (v / total) * ringArea(region));
  for (let seed = 0; seed < 3; seed++) {
    const fit = fitPowerCells(region, targets, seed);
    check(
      `70 countries in a box, seed ${seed}: within ${TOLERANCE * 100}% in at most 100 iterations`,
      fit.error < TOLERANCE && fit.iterations <= 100,
      { error: fit.error, iterations: fit.iterations }
    );
  }
}

console.log("# the same seed gives the same cells, another seed others");
{
  const values = sums("continent");
  const a = voronoiTiling(boxRing(300, 200), values, 3);
  const b = voronoiTiling(boxRing(300, 200), values, 3);
  const c = voronoiTiling(boxRing(300, 200), values, 4);
  check("seed 3 twice is the same", JSON.stringify(a) === JSON.stringify(b));
  check("seed 4 is not seed 3", JSON.stringify(a) !== JSON.stringify(c));
}

console.log("# spacing parts siblings and leaves the region's edges alone");
{
  const values = sums("continent");
  const cells = voronoiTiling(boxRing(300, 200), values, 0, 10);
  const xs = cells.flat().map((p) => p[0]);
  const ys = cells.flat().map((p) => p[1]);
  check(
    "the cells still reach all four sides of the box",
    Math.min(...xs) < 1e-6 &&
      Math.max(...xs) > 300 - 1e-6 &&
      Math.min(...ys) < 1e-6 &&
      Math.max(...ys) > 200 - 1e-6,
    [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  );
  const total = cells.reduce((s, c) => s + ringArea(c), 0);
  check("the gaps take area away", total < 300 * 200 - 1000, total);
}

console.log("# values that are not positive get no cell");
{
  const cells = voronoiTiling(boxRing(100, 100), [3, 0, 1, -2], 0);
  check(
    "a 0 and a negative value get empty cells, the others share the box",
    cells[1].length === 0 &&
      cells[3].length === 0 &&
      Math.abs(ringArea(cells[0]) + ringArea(cells[2]) - 10000) < 1e-6,
    cells.map((c) => ringArea(c))
  );
  const one = voronoiTiling(boxRing(100, 50), [5], 0);
  check("one value is the whole region", ringArea(one[0]) === 5000);
}

/** A path item's points (one closed loop of M/L commands). */
const pathPoints = (it: any): Pt[] => {
  const nums = (it.d as string).match(/-?[\d.]+(e-?\d+)?/g)!.map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
};

/** The area of a path item's points. */
const pathArea = (it: any): number => ringArea(pathPoints(it));

/** The message `run` throws, or "" when it does not. */
const errorOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

const rows = [
  { g: "a", k: "p", v: 3 },
  { g: "a", k: "q", v: 1 },
  { g: "b", k: "r", v: 2 },
  { g: "b", k: "s", v: 2 },
];

console.log("# region() fills a treemap's cell");
{
  const dl = await chart(rows, { axes: false })
    .flow(treemap({ by: "k", size: "v", tile: Tile.voronoi }))
    .mark(region({ fill: "#888" }))
    .toDisplayList({ w: 200, h: 100 });
  const paths = items(dl).filter((it) => it.kind === "path");
  const areas = paths.map(pathArea).sort((a, b) => b - a);
  check(
    "four polygons whose areas follow the values (3 : 2 : 2 : 1 of 20000)",
    paths.length === 4 &&
      [7500, 5000, 5000, 2500].every(
        (t, i) => Math.abs(areas[i] - t) / t < TOLERANCE
      ),
    areas
  );
  const rects = await chart(rows, { axes: false })
    .flow(treemap({ by: "k", size: "v" }))
    .mark(region({ fill: "#888" }))
    .toDisplayList({ w: 200, h: 100 });
  const filled = items(rects).filter((it) => it.kind === "path");
  check(
    "in a squarified treemap it draws each tile",
    filled.length === 4 &&
      Math.abs(filled.map(pathArea).reduce((a, b) => a + b, 0) - 20000) < 1,
    filled.map(pathArea)
  );
}

console.log("# enclose hands its oval down to a treemap");
{
  const dl = await chart(rows, { axes: false })
    .flow(
      enclose({ shape: Shape.oval, padding: 0, fill: "none" }),
      treemap({ by: "k", size: "v", tile: Tile.voronoi })
    )
    .mark(region({ fill: "#888" }))
    .toDisplayList({ w: 200, h: 200 });
  const paths = items(dl).filter((it) => it.kind === "path");
  // The first path is the oval itself, under the cells.
  const total = paths
    .slice(1)
    .map(pathArea)
    .reduce((a, b) => a + b, 0);
  const oval = Math.PI * 100 * 100;
  check(
    "the cells fill the circle (within its polygon's area)",
    paths.length === 5 && Math.abs(total - oval) / oval < 0.01,
    { count: paths.length, total, oval }
  );
}

console.log("# a treemap's box is its whole region, its padding inside it");
for (const tile of [Tile.squarify, Tile.voronoi]) {
  // Two 200 x 100 treemaps side by side, nothing between them: the second
  // starts where the first one's box ends.
  const dl = await chart(rows, { axes: false })
    .flow(
      spread({ by: "g", dir: "x", spacing: 0 }),
      treemap({ by: "k", size: "v", padding: 10, w: 200, h: 100, tile })
    )
    .mark(region({ fill: "#888" }))
    .toDisplayList({ w: 400, h: 100 });
  const pts = items(dl).flatMap(pathPoints);
  const extent = (ps: Pt[]) => {
    const xs = ps.map((p) => p[0]);
    const ys = ps.map((p) => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };
  const first = extent(pts.filter((p) => p[0] < 200));
  const second = extent(pts.filter((p) => p[0] >= 200));
  const near = (got: number[], want: number[]) =>
    got.every((v, i) => Math.abs(v - want[i]) < 0.5);
  check(
    `${tile.kind}: each box is its full 200 x 100 slot, its tiles 10 px inside`,
    near(first, [10, 190, 10, 90]) && near(second, [210, 390, 10, 90]),
    { first, second }
  );
}

console.log("# a rectangular tiling in a Voronoi cell is an error");
{
  const message = await errorOf(() =>
    chart(countryPopulations, { axes: false })
      .flow(
        treemap({ by: "continent", size: "pop", tile: Tile.voronoi }),
        treemap({ by: "region", size: "pop", tile: Tile.squarify })
      )
      .mark(region({ fill: "continent" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  check(
    "it names the treemap, the tiling and the fix",
    message.startsWith(
      'treemap (by "region"): Tile.squarify needs a rectangular region'
    ) && message.includes("Use Tile.voronoi here."),
    message
  );
  const fine = await errorOf(() =>
    chart(countryPopulations, { axes: false })
      .flow(
        enclose({ shape: Shape.box, fill: "none" }),
        treemap({ by: "region", size: "pop", tile: Tile.squarify })
      )
      .mark(rect({ fill: "continent" }))
      .toDisplayList({ w: 300, h: 300 })
  );
  check("inside a box it is fine", fine === "", fine);
}

console.log(
  "# enclose around a child that fills its space needs a convex shape"
);
{
  const message = await errorOf(() =>
    chart(rows, { axes: false })
      .flow(
        enclose({ shape: Shape.fillet, fill: "none" }),
        treemap({ by: "k", size: "v", tile: Tile.voronoi })
      )
      .mark(region({ fill: "#888" }))
      .toDisplayList({ w: 200, h: 200 })
  );
  check(
    "Shape.fillet around a treemap is an error naming the fix",
    message.startsWith("enclose({ shape }): Shape.fillet") &&
      message.includes("Use Shape.box or Shape.oval"),
    message
  );
}

console.log("# a cell with no area holds an empty child, with no error");
{
  const empty = voronoiTiling(
    [
      [0, 0],
      [100, 0],
      [100, 0],
      [0, 0],
    ],
    [1, 2, 3],
    0
  );
  check(
    "a region with no area gives every value an empty cell",
    empty.every((c) => c.length === 0),
    empty
  );
  // 1 in 10000 of a 200 px wide treemap rounds to a tile of no width.
  const tiny = [
    { k: "big", v: 10000 },
    { k: "tiny", v: 1 },
  ];
  const rounded = await errorOf(() =>
    chart(tiny, { axes: false })
      .flow(treemap({ by: "k", size: "v" }))
      .mark(region({ fill: "#888", inset: 2 }))
      .toDisplayList({ w: 200, h: 100 })
  );
  check("an inset region in a tile rounded away", rounded === "", rounded);
  const eaten = await errorOf(() =>
    chart(tiny, { axes: false })
      .flow(treemap({ by: "k", size: "v", spacing: 4, round: false }))
      .mark(region({ fill: "#888", inset: 1 }))
      .toDisplayList({ w: 200, h: 100 })
  );
  check("an inset region in a tile its spacing ate", eaten === "", eaten);
  const nested = await errorOf(() =>
    chart(
      [
        { g: "big", k: "a", v: 10000 },
        { g: "tiny", k: "b", v: 1 },
        { g: "tiny", k: "c", v: 1 },
      ],
      { axes: false }
    )
      .flow(
        treemap({ by: "g", size: "v" }),
        treemap({ by: "k", size: "v", padding: 1, tile: Tile.voronoi })
      )
      .mark(region({ fill: "#888" }))
      .toDisplayList({ w: 200, h: 100 })
  );
  check(
    "a padded Voronoi treemap in a tile rounded away",
    nested === "",
    nested
  );
}

console.log("# a child that does not fill its cell sits at its centroid");
{
  // Cells whose box centers are well off their centroids.
  const skew = [
    { k: "p", v: 5 },
    { k: "q", v: 1 },
    { k: "r", v: 3 },
    { k: "s", v: 2 },
    { k: "t", v: 1 },
  ];
  const flow = treemap({ by: "k", size: "v", tile: Tile.voronoi });
  const cellOf = new Map<string, Pt[]>(
    items(
      await chart(skew, { axes: false })
        .flow(flow)
        .mark(region({ fill: "#888" }))
        .toDisplayList({ w: 300, h: 200 })
    )
      .filter((it) => it.kind === "path")
      .map((it: any) => [it.datum[0].k, pathPoints(it)])
  );
  const offCenter = Math.max(
    ...[...cellOf.values()].map((c) => {
      const [gx, gy] = ringCentroid(c);
      const xs = c.map((p) => p[0]);
      const ys = c.map((p) => p[1]);
      return Math.hypot(
        (Math.min(...xs) + Math.max(...xs)) / 2 - gx,
        (Math.min(...ys) + Math.max(...ys)) / 2 - gy
      );
    })
  );
  check(
    "(some cell's box center is more than 2 px off its centroid)",
    offCenter > 2,
    offCenter
  );
  const circles = items(
    await chart(skew, { axes: false })
      .flow(flow)
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 300, h: 200 })
  ).filter((it) => it.kind === "ellipse") as any[];
  check(
    "each circle is centered on its cell's centroid, inside the cell",
    circles.length === skew.length &&
      circles.every((c) => {
        const cell = cellOf.get(c.datum[0].k)!;
        const [gx, gy] = ringCentroid(cell);
        return (
          Math.hypot(c.cx - gx, c.cy - gy) < 1e-6 &&
          pointInRing([c.cx, c.cy], cell)
        );
      }),
    circles.map((c) => [c.datum[0].k, c.cx, c.cy])
  );
  const texts = items(
    await chart(skew, { axes: false })
      .flow(flow)
      .mark(text({ text: "k" }))
      .toDisplayList({ w: 300, h: 200 })
  ).filter((it) => it.kind === "text") as any[];
  check(
    "each label is at its cell's centroid (within its own size), inside",
    texts.length === skew.length &&
      texts.every((t) => {
        const cell = cellOf.get(t.datum[0].k)!;
        const [gx, gy] = ringCentroid(cell);
        return (
          Math.hypot(t.x - gx, t.y - gy) < 8 && pointInRing([t.x, t.y], cell)
        );
      }),
    texts.map((t) => [t.text, t.x, t.y])
  );
}

report();

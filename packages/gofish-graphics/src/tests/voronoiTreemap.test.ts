/**
 * Voronoi treemaps (#1222): the tiling (`geometry/voronoiTiling.ts`), and
 * the shapes a parent hands its children at layout (`geometry/ring.ts`):
 * a treemap's cells, an enclosure's oval, and the errors for a shape a
 * child cannot fill.
 *
 * Run: `tsx src/tests/voronoiTreemap.test.ts` (wired as
 * `pnpm test:voronoi-treemap`).
 */
import { voronoiTiling, TOLERANCE } from "../ast/geometry/voronoiTiling";
import { boxRing, ovalRing, ringArea } from "../ast/geometry/ring";
import { isConvex } from "../ast/geometry/clip";
import { pointInRing } from "../ast/geometry/plane";
import { countryPopulations } from "../data/countryPopulations";
import { chart, enclose, rect, region, Shape, Tile, treemap } from "../lib";
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

console.log("# the same seed gives the same cells, another seed others");
{
  const values = sums("continent");
  const a = voronoiTiling(boxRing(300, 200), values, 3);
  const b = voronoiTiling(boxRing(300, 200), values, 3);
  const c = voronoiTiling(boxRing(300, 200), values, 4);
  check("seed 3 twice is the same", JSON.stringify(a) === JSON.stringify(b));
  check("seed 4 is not seed 3", JSON.stringify(a) !== JSON.stringify(c));
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

/** The area of a path item's points (one closed loop of M/L commands). */
const pathArea = (it: any): number => {
  const nums = (it.d as string).match(/-?[\d.]+(e-?\d+)?/g)!.map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return ringArea(pts);
};

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
        enclose({ shape: Shape.arcs, fill: "none" }),
        treemap({ by: "k", size: "v", tile: Tile.voronoi })
      )
      .mark(region({ fill: "#888" }))
      .toDisplayList({ w: 200, h: 200 })
  );
  check(
    "Shape.arcs around a treemap is an error naming the fix",
    message.startsWith("enclose({ shape }): Shape.arcs") &&
      message.includes("Use Shape.box or Shape.oval"),
    message
  );
}

report();

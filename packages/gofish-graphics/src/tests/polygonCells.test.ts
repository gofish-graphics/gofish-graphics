/**
 * Cells of the plane (#1059): `struct({ x, y }).bin(b)` maps each row's point
 * to its cell, for `b` a call in the Bin family. Covers the hex grid (a
 * point's hexagon, including points on an edge, the grid covering the
 * domain, a radius per axis), Voronoi cells (nearest seed, clipping to the
 * box of the data and seeds, seeds at one point), the struct key (its wire
 * form, the errors for a struct with no bin), and the `partition` operator
 * over polygon cells, which hands each child its outline.
 *
 * Run: `pnpm build && tsx src/tests/polygonCells.test.ts` (wired as `pnpm
 * test:polygon-cells`). The rendering checks import from `dist`, like
 * cells.test.ts.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import "../lib";
import {
  hexAt,
  hexCells,
  hexCenter,
  voronoiCells,
  type PolygonCell,
} from "../ast/polygonCells";
import { splitEntries } from "../ast/datumProjection";
import { struct } from "../ast/structExpr";
import * as Bin from "../families/bin";
import { field } from "../ast/data";
import { partition as srcPartition } from "../lib";

const { chart, partition, region, circle } = GoFish as any;
const DistBin = (GoFish as any).Bin;
const distStruct = (GoFish as any).struct;
const distField = (GoFish as any).field;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function errorOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}
async function asyncErrorOf(
  fn: () => Promise<unknown>
): Promise<string | undefined> {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}

/** Whether `p` is inside the closed convex polygon `outline` (within eps). */
function inside(
  p: readonly [number, number],
  outline: readonly (readonly [number, number])[],
  eps = 1e-9
): boolean {
  let sign = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) <= eps) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** A small seeded random number generator, so the checks are the same every
 *  run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function main() {
  console.log("\n# hexagons");
  {
    const rand = rng(7);
    let wrong = 0;
    for (let i = 0; i < 2000; i++) {
      const u = (rand() - 0.5) * 20;
      const v = (rand() - 0.5) * 20;
      const [q, r] = hexAt(u, v);
      const [cu, cv] = hexCenter(q, r);
      const d = Math.hypot(u - cu, v - cv);
      // The hexagon a point falls in has the nearest center.
      for (let dq = -1; dq <= 1; dq++)
        for (let dr = -1; dr <= 1; dr++) {
          const [nu, nv] = hexCenter(q + dq, r + dr);
          if (Math.hypot(u - nu, v - nv) < d - 1e-9) wrong++;
        }
    }
    check("a point falls in the hexagon with the nearest center", wrong === 0);

    check(
      "the hexagon (0, 0) is centered on the origin",
      JSON.stringify(hexAt(0, 0)) === "[0,0]" &&
        JSON.stringify(hexCenter(0, 0)) === "[0,0]"
    );

    const where = "test";
    const fields = { x: "a", y: "b" };
    const grid = hexCells(
      { kind: "hex", radius: 1 },
      fields,
      [0, 10],
      [0, 6],
      where
    );
    // Points on a hexagon's edges and corners fall in a hexagon that holds
    // them, and the same one every time.
    const c0 = grid.cells.find((c) => c.id === "0,0")!;
    const onEdge: [number, number][] = [
      [Math.sqrt(3) / 2, 0], // the middle of the right edge
      [0, 1], // the top corner
      [Math.sqrt(3) / 2, 0.5], // a corner shared by three hexagons
    ];
    check(
      "a point on an edge or a corner falls in a hexagon that holds it",
      onEdge.every((p) => {
        const c = grid.cellOf(p[0], p[1])!;
        return c !== undefined && inside(p, c.outline, 1e-6);
      })
    );
    check(
      "a point on an edge falls in the same hexagon every time",
      onEdge.every(
        (p) => grid.cellOf(p[0], p[1]) === grid.cellOf(p[0], p[1])
      ) && c0 !== undefined
    );

    // The grid covers the domain: every point of the box is in a cell of the
    // grid, and every cell meets the box.
    const rand2 = rng(11);
    let uncovered = 0;
    for (let i = 0; i < 2000; i++) {
      const x = rand2() * 10;
      const y = rand2() * 6;
      const c = grid.cellOf(x, y);
      if (c === undefined || !inside([x, y], c.outline, 1e-6)) uncovered++;
    }
    const corners: [number, number][] = [
      [0, 0],
      [10, 0],
      [0, 6],
      [10, 6],
    ];
    check(
      "the grid covers the domain's box, corners included",
      uncovered === 0 && corners.every(([x, y]) => grid.cellOf(x, y))
    );
    const meetsBox = (c: PolygonCell) =>
      c.box.x[0] < 10 && c.box.x[1] > 0 && c.box.y[0] < 6 && c.box.y[1] > 0;
    check(
      "every cell of the grid meets the domain's box",
      grid.cells.every(meetsBox)
    );
    check(
      "a hexagon has six corners at the radius from its center",
      grid.cells.every((c) => {
        const [q, r] = c.id.split(",").map(Number);
        const [cu, cv] = hexCenter(q, r);
        return (
          c.outline.length === 6 &&
          c.outline.every(
            ([x, y]) => Math.abs(Math.hypot(x - cu, y - cv) - 1) < 1e-9
          )
        );
      })
    );

    const perAxis = hexCells(
      { kind: "hex", radius: { x: 2, y: 500 } },
      fields,
      [10, 40],
      [1500, 5000],
      where
    );
    check(
      "a radius per axis scales each hexagon by the x radius on x and the y radius on y",
      perAxis.cells.every((c) => {
        const w = c.box.x[1] - c.box.x[0];
        const h = c.box.y[1] - c.box.y[0];
        return Math.abs(w - 2 * Math.sqrt(3)) < 1e-9 && Math.abs(h - 1000) < 1e-9;
      })
    );
    const cell = perAxis.cellOf(20, 3000)!;
    check(
      "a point falls in a hexagon of the per-axis grid that holds it",
      inside([20, 3000], cell.outline, 1e-6)
    );
    check(
      "an empty domain has no hexagons",
      hexCells({ kind: "hex", radius: 1 }, fields, [], [], where).cells
        .length === 0
    );
  }

  console.log("\n# Voronoi cells");
  {
    const fields = { x: "x", y: "y" };
    const seeds = [
      { name: "A", x: 0, y: 0 },
      { name: "B", x: 10, y: 0 },
      { name: "C", x: 5, y: 8 },
    ];
    const v = voronoiCells(
      { kind: "voronoi", seeds },
      fields,
      [1, 9, 5, -2],
      [1, 1, 7, 3],
      "test"
    );
    check("one cell per seed", v.cells.length === 3);
    check(
      "a point goes to its nearest seed",
      v.cellOf(1, 1)!.id === "0" &&
        v.cellOf(9, 1)!.id === "1" &&
        v.cellOf(5, 7)!.id === "2"
    );
    const xs = v.cells.flatMap((c) => c.outline.map((p) => p[0]));
    const ys = v.cells.flatMap((c) => c.outline.map((p) => p[1]));
    check(
      "the cells are clipped to the box of the data and the seeds",
      Math.min(...xs) === -2 &&
        Math.max(...xs) === 10 &&
        Math.min(...ys) === 0 &&
        Math.max(...ys) === 8,
      JSON.stringify([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)])
    );
    check(
      "each seed is inside its own cell",
      v.cells.every((c) =>
        inside(
          [seeds[Number(c.id)].x, seeds[Number(c.id)].y],
          c.outline as [number, number][],
          1e-6
        )
      )
    );
    const twice = voronoiCells(
      { kind: "voronoi", seeds: [...seeds, { name: "A2", x: 0, y: 0 }] },
      fields,
      [],
      [],
      "test"
    );
    check(
      "seeds at one point share one cell, that of the first",
      twice.cells.length === 3 && twice.cellOf(0, 0)!.id === "0"
    );
    check(
      "no seeds is an error",
      /at least one seed/.test(
        errorOf(() =>
          voronoiCells({ kind: "voronoi", seeds: [] }, fields, [1], [1], "t")
        ) ?? ""
      )
    );
    check(
      "a seed without the key's fields is an error",
      /seed 0 must have numbers in "x" and "y"/.test(
        errorOf(() =>
          voronoiCells(
            { kind: "voronoi", seeds: [{ lon: 1, lat: 2 }] },
            fields,
            [1],
            [1],
            "t"
          )
        ) ?? ""
      )
    );
  }

  console.log("\n# struct keys");
  {
    const key = struct({ x: "a", y: "b" }).bin(Bin.hex({ radius: 0.5 }));
    check(
      "a binned struct writes its wire form",
      JSON.stringify(key.toJSON()) ===
        JSON.stringify({
          type: "struct",
          fields: { x: "a", y: "b" },
          ops: [{ op: "bin", partition: { kind: "hex", radius: 0.5 } }],
        })
    );
    check(
      "a struct takes exactly x and y",
      /exactly the keys x and y/.test(
        errorOf(() => struct({ x: "a" } as any)) ?? ""
      )
    );
    check(
      "a struct is binned only by a call in the Bin family",
      /Bin family/.test(
        errorOf(() => struct({ x: "a", y: "b" }).bin({ step: 1 } as any)) ??
          ""
      )
    );
    const zero = errorOf(() =>
      struct({ x: "a", y: "b" }).bin(Bin.hex({ radius: 0 }))
    );
    check("a hex radius must be above 0", /above 0/.test(zero ?? ""), zero);
    const rows = [
      { a: 0.1, b: 0.1 },
      { a: 0.2, b: -0.1 },
      { a: 3, b: 3 },
    ];
    const entries = splitEntries(key, rows);
    const counts = [...entries.values()].map((g) => g.length);
    check(
      "a split over a binned struct keeps every cell, empty ones included",
      counts.reduce((s, n) => s + n, 0) === 3 &&
        counts.some((n) => n === 2) &&
        counts.some((n) => n === 0)
    );
    check(
      "a struct with no bin is an error as a key",
      /needs \.bin/.test(
        errorOf(() => splitEntries(struct({ x: "a", y: "b" }), rows)) ?? ""
      )
    );
    check(
      "partition over a struct with no bin is an error",
      /has none until it is binned/.test(
        (await asyncErrorOf(() =>
          chart(rows, { axes: false })
            .flow(partition({ by: distStruct({ x: "a", y: "b" }) }))
            .mark(region())
            .toDisplayList({ w: 100, h: 100 })
        )) ?? ""
      )
    );
    check(
      "partition over a struct takes no dir",
      /do not apply/.test(
        errorOf(() =>
          partition({
            by: distStruct({ x: "a", y: "b" }).bin(DistBin.hex({ radius: 1 })),
            dir: "x",
          })
        ) ?? ""
      )
    );
  }

  console.log("\n# partition over cells of the plane");
  {
    const pathsOf = (dl: any): any[] => {
      const out: any[] = [];
      const walk = (it: any) => {
        if (it.kind === "path") out.push(it);
        for (const c of it.children ?? []) walk(c);
      };
      dl.items.forEach(walk);
      return out;
    };
    const rows = [
      { a: 0, b: 0 },
      { a: 0.1, b: 0.2 },
      { a: 2, b: 1 },
    ];
    const key = distStruct({ x: "a", y: "b" }).bin(DistBin.hex({ radius: 1 }));
    const dl = await chart(rows, { axes: false })
      .flow(partition({ by: key }))
      .mark(region({ fill: distField("a").count() }))
      .toDisplayList({ w: 300, h: 200 });
    const paths = pathsOf(dl);
    // A closed path of six corners: a move, then five lines and one back to
    // the first corner.
    const corners = (d: string) => (d.match(/[ML]/g) ?? []).length - 1;
    check(
      "a region in a hexagon draws the hexagon: one path of six corners per cell",
      paths.length > 2 && paths.every((p) => corners(p.d) === 6),
      JSON.stringify(paths.map((p) => p.d))
    );
    const circlesDl = await chart(rows, { axes: false })
      .flow(partition({ by: key }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 300, h: 200 });
    const ellipses: any[] = [];
    const walkE = (it: any) => {
      if (it.kind === "ellipse") ellipses.push(it);
      for (const c of it.children ?? []) walkE(c);
    };
    circlesDl.items.forEach(walkE);
    // A hexagon's center is the mean of its corners (the closing corner
    // left out).
    const centerOf = (d: string) => {
      const pts = [...d.matchAll(/[ML]([-\d.e]+),([-\d.e]+)/g)]
        .slice(0, -1)
        .map((m) => [Number(m[1]), Number(m[2])]);
      return pts
        .reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0])
        .map((v) => +(v / pts.length).toFixed(3));
    };
    const hexCenters = paths.map((p) => centerOf(p.d).join()).sort();
    const circleCenters = ellipses
      .map((e) => [+e.cx.toFixed(3), +e.cy.toFixed(3)].join())
      .sort();
    check(
      "a mark with a size of its own sits at the center of its hexagon",
      JSON.stringify(hexCenters) === JSON.stringify(circleCenters),
      JSON.stringify({ hexCenters, circleCenters })
    );
    const seeds = [
      { a: 0, b: 0 },
      { a: 2, b: 1 },
    ];
    const vdl = await chart(rows, { axes: false })
      .flow(
        partition({
          by: distStruct({ x: "a", y: "b" }).bin(DistBin.voronoi({ seeds })),
        })
      )
      .mark(region({ stroke: "white" }))
      .toDisplayList({ w: 300, h: 200 });
    check(
      "a Voronoi partition draws one region per seed",
      pathsOf(vdl).length === 2
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

/** Type-level checks only: never called. */
export function structKeyTypes(): void {
  {
    // @ts-expect-error a struct with no bin has no region
    srcPartition({ by: struct({ x: "a", y: "b" }) });
    srcPartition({ by: struct({ x: "a", y: "b" }).bin(Bin.hex({ radius: 1 })) });
    srcPartition({
      by: struct({ x: "a", y: "b" }).bin(Bin.voronoi({ seeds: [] })),
    });
    // @ts-expect-error a struct divides both axes, so it takes no dir
    srcPartition({ by: struct({ x: "a", y: "b" }).bin(Bin.hex({ radius: 1 })), dir: "x" });
    // @ts-expect-error a field is binned by a 1D partition, not a Bin call
    field("a").bin(Bin.hex({ radius: 1 }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

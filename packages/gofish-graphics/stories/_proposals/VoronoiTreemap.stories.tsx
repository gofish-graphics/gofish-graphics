// PROTOTYPE (#1222): throwaway stories for the Voronoi treemap proposal.
// Do not tag for the gallery; delete once the proposal is decided.
//
// The "current" stories use the real treemap operator. The Voronoi stories
// compute polygons with the PROTOTYPE helper next to this file and draw them
// with real GoFish `polygon()` marks, one chart per depth in a `layer`.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  countryPopulations,
  type CountryPopulation,
} from "../../src/data/countryPopulations";
import { chart, layer, pack, polygon, rect, treemap, Tile } from "../../src/lib";
import {
  circleRing,
  inscribedCircle,
  nestedTreemap,
  packAt,
  rectRing,
  type Cell,
  type Level,
  type Ring,
} from "./voronoiTreemapPrototype";

const meta: Meta = {
  title: "Proposals/Voronoi Treemap (PROTOTYPE)",
};
export default meta;

const S = 320; // side of each strategy-grid panel
const pop = (d: CountryPopulation) => d.pop;

// PROTOTYPE: draw cells of every depth as polygons, leaves filled by
// continent, each group above them as an outline that thickens toward the top.
// The charts in one layer share their position scales, so the depths line up.
const drawCells = (
  cells: Cell<CountryPopulation>[],
  w: number,
  h: number,
  { leafDepth, outline = "white" }: { leafDepth: number; outline?: string }
) => {
  const strokeAt = [5, 2.5, 1];
  return layer({ w, h }, [
    chart(cells.filter((c) => c.depth === leafDepth), { axes: false })
      .mark(polygon({ points: "ring", fill: "continent", stroke: outline, strokeWidth: strokeAt[leafDepth] ?? 1 })),
    ...Array.from({ length: leafDepth }, (_, d) => leafDepth - 1 - d).map((d) =>
      chart(cells.filter((c) => c.depth === d), { axes: false })
        .mark(polygon({ points: "ring", fill: "none", stroke: outline, strokeWidth: strokeAt[d] }))
    ),
  ]);
};

// --- A. the same one-level data under each tile --------------------------------

// Thirteen regions, each one tile, area ∝ population.
const strategy = (tile: Tile.Tile): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(countryPopulations, { axes: false, w: S, h: S })
      .flow(treemap({ by: "region", size: "pop", spacing: 2, tile }))
      .mark(rect({ fill: "continent" }))
      .render(container);
    return container;
  },
});

export const StrategySquarify = strategy(Tile.squarify());
export const StrategyBinary = strategy(Tile.binary());
export const StrategySlice = strategy(Tile.slice());
export const StrategyDice = strategy(Tile.dice());
export const StrategySliceDice = strategy(Tile.sliceDice());

// PROPOSED: treemap({ by: "region", size: "pop", spacing: 2, tile: Tile.voronoi() })
export const StrategyVoronoi: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const region = rectRing(0, 0, S, S);
    const cells = nestedTreemap(
      countryPopulations,
      region,
      [{ by: "region", tile: "voronoi" }],
      pop
    );
    layer({ w: S, h: S }, [
      chart(cells, { axes: false }).mark(
        polygon({ points: "ring", fill: "continent", stroke: "white", strokeWidth: 2 })
      ),
    ]).render(container);
    return container;
  },
};

// --- B, C. nested Voronoi treemaps -------------------------------------------

// PROPOSED:
//   chart(countryPopulations)
//     .flow(
//       treemap({ by: "continent", size: "pop", tile: Tile.voronoi() }),
//       treemap({ by: "region", size: "pop", tile: Tile.voronoi() }),
//       treemap({ size: "pop", tile: Tile.voronoi() })
//     )
//     .mark(polygon({ fill: "continent", stroke: "white" }))  // a mark that fills its cell
const voronoi3: Level[] = [
  { by: "continent", tile: "voronoi", padding: 0 },
  { by: "region", tile: "voronoi", padding: 0 },
  { tile: "voronoi" },
];

export const VoronoiNestedSquare: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const region = rectRing(0, 0, 480, 480);
    const cells = nestedTreemap(countryPopulations, region, voronoi3, pop);
    drawCells(cells, 480, 480, { leafDepth: 2 }).render(container);
    return container;
  },
};

export const VoronoiNestedCircle: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const region = circleRing(240, 240, 240);
    const cells = nestedTreemap(countryPopulations, region, voronoi3, pop);
    drawCells(cells, 480, 480, { leafDepth: 2 }).render(container);
    return container;
  },
};

// --- D. mixed levels -----------------------------------------------------------

// PROPOSED:
//   .flow(
//     treemap({ by: "continent", size: "pop" }),                     // squarify
//     treemap({ by: "region", size: "pop", tile: Tile.voronoi() }),
//     treemap({ size: "pop", tile: Tile.voronoi() })
//   )
export const MixedSquarifyVoronoi: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const region = rectRing(0, 0, 480, 480);
    const cells = nestedTreemap(
      countryPopulations,
      region,
      [
        { by: "continent", tile: "squarify", padding: 4 },
        { by: "region", tile: "voronoi" },
        { tile: "voronoi" },
      ],
      pop
    );
    drawCells(cells, 480, 480, { leafDepth: 2 }).render(container);
    return container;
  },
};

// PROPOSED:
//   .flow(
//     treemap({ by: "continent", size: "pop", tile: Tile.voronoi() }),
//     pack({ by: "region", spacing: 4 }),
//     enclose({ shape: Shape.arcs({ radius: 8 }), padding: 4, fill: "none" }),
//     pack()
//   )
//   .mark(circle({ r: "pop", fill: "continent" }))
// APPROXIMATION: each continent's bubble treemap is drawn at one shared
// radius scale (the largest that fits every continent's pack inside its
// cell's inscribed circle); region contours are plain enclosing circles
// instead of Shape.arcs, since this is drawn by the prototype, not by pack.
export const MixedVoronoiPack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const region = rectRing(0, 0, 480, 480);
    const top = nestedTreemap(
      countryPopulations,
      region,
      [{ by: "continent", tile: "voronoi" }],
      pop
    );
    const spacing = 3;
    // Per continent: pack countries per region, then pack the regions.
    const packContinent = (rows: CountryPopulation[], k: number) => {
      const regions = Array.from(new Set(rows.map((r) => r.region)));
      const inner = regions.map((g) => {
        const rs = rows.filter((r) => r.region === g);
        return { rows: rs, ...packAt(rs.map(pop), k, spacing) };
      });
      // The regions as circles of their pack radius, plus padding.
      const pad = 4;
      const outer = packAt(
        inner.map((p) => (p.R + pad) ** 2),
        1,
        spacing
      );
      return { inner, outer };
    };
    // One shared scale: the largest k at which every pack fits its cell.
    const fits = top.map((c) => {
      const ic = inscribedCircle(c.ring);
      const at1 = packContinent(c.rows, 1).outer.R;
      return { c, ic, k: (ic.r - 6) / at1 };
    });
    const k = Math.min(...fits.map((f) => f.k)) * 0.98;
    const countries: any[] = [];
    const contours: any[] = [];
    for (const { c, ic } of fits) {
      const { inner, outer } = packContinent(c.rows, k);
      outer.circles.forEach((oc, i) => {
        const cx = ic.cx + oc.x;
        const cy = ic.cy + oc.y;
        contours.push({ ring: circleRing(cx, cy, oc.r, 64) });
        inner[i].circles.forEach((pc, j) =>
          countries.push({
            ...inner[i].rows[j],
            ring: circleRing(cx + pc.x, cy + pc.y, Math.max(pc.r, 0.5), 32),
          })
        );
      });
    }
    layer({ w: 480, h: 480 }, [
      chart([{ ring: region }, ...top], { axes: false }).mark(
        polygon({ points: "ring", fill: "#f4f1ea", stroke: "#999", strokeWidth: 2 })
      ),
      chart(contours, { axes: false }).mark(
        polygon({ points: "ring", fill: "none", stroke: "#bbb", strokeWidth: 1 })
      ),
      chart(countries, { axes: false }).mark(
        polygon({ points: "ring", fill: "continent" })
      ),
    ]).render(container);
    return container;
  },
};

// --- E. the current state, real API ----------------------------------------------

// Today: a nested treemap is one treemap per level in the flow. Each inner
// treemap fills the tile its parent gave it.
export const CurrentNestedSquarify: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(countryPopulations, { axes: false, w: 480, h: 480 })
      .flow(
        treemap({ by: "continent", size: "pop", spacing: 6 }),
        treemap({ by: "region", size: "pop", spacing: 3 }),
        treemap({ size: "pop", spacing: 1 })
      )
      .mark(rect({ fill: "continent" }))
      .render(container);
    return container;
  },
};

// Today, real API: a pack level whose children are squarified treemaps. The
// pack keeps its children at their pixel size, and a treemap with no size of
// its own fills the slot it is given, so each continent's treemap needs a
// literal size: there is no way yet to say "this treemap's area ∝ its total".
export const CurrentPackOfTreemaps: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(countryPopulations, { axes: false })
      .flow(
        pack({ by: "continent", spacing: 8 }),
        treemap({ by: "region", size: "pop", spacing: 3, w: 100, h: 100 }),
        treemap({ size: "pop", spacing: 1 })
      )
      .mark(rect({ fill: "continent" }))
      .render(container, { w: 480, h: 480 });
    return container;
  },
};

// Today, real API: slice-and-dice across levels is two flow steps, one tiling each.
export const CurrentSliceThenDice: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(countryPopulations, { axes: false, w: 320, h: 320 })
      .flow(
        treemap({ by: "continent", size: "pop", spacing: 4, tile: Tile.slice() }),
        treemap({ by: "region", size: "pop", spacing: 2, tile: Tile.dice() })
      )
      .mark(rect({ fill: "continent" }))
      .render(container);
    return container;
  },
};

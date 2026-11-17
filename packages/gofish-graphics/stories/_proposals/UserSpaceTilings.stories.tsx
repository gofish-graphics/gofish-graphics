import type { Meta, StoryObj } from "@storybook/html";
import { Delaunay } from "d3-delaunay";
import { initializeContainer } from "../helper";
import { countryPopulations } from "../../src/data/countryPopulations";
import {
  Bin,
  chart,
  circle,
  layer,
  line,
  partition,
  rect,
  region,
  resolve,
  scatter,
  selectAll,
  spread,
  stack,
  struct,
  Tile,
  treemap,
  v,
} from "../../src/lib";

// Throwaway prototypes for the user-space layouts proposal: can treemap
// tilings be written in user space, as a plain-JS plan drawn with nested
// stacks, and can a Voronoi relaxation be run in user space and drawn with
// `partition`? Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/User Space Tilings",
};
export default meta;

const W = 360;
const H = 300;

// The twenty most populous countries, largest first.
type Country = (typeof countryPopulations)[number];
const countries: Country[] = [...countryPopulations]
  .sort((a, b) => b.pop - a.pop)
  .slice(0, 20);

type Dir = "x" | "y";
const across = (dir: Dir): Dir => (dir === "x" ? "y" : "x");
const sum = (ws: number[]) => ws.reduce((a, b) => a + b, 0);
const total = (items: Country[]) => sum(items.map((d) => d.pop));

// ─────────────────────────────────────────────────────────────────────────
// Built-in tilings
// ─────────────────────────────────────────────────────────────────────────

const builtin =
  (tile: any, spacing: number, round = true) =>
  () => {
    const container = initializeContainer();
    chart(countries, { axes: false, w: W, h: H })
      .flow(treemap({ size: "pop", spacing, tile, round }))
      .mark(
        tile.kind === "voronoi"
          ? region({ fill: "continent", stroke: "white", strokeWidth: 1 })
          : rect({ fill: "continent", stroke: "white", strokeWidth: 1 })
      )
      .render(container);
    return container;
  };

export const BuiltinSquarify: StoryObj = { render: builtin(Tile.squarify, 2) };
export const BuiltinBinary: StoryObj = { render: builtin(Tile.binary, 2) };
export const BuiltinSlice: StoryObj = { render: builtin(Tile.slice, 2) };
export const BuiltinVoronoi: StoryObj = { render: builtin(Tile.voronoi, 2) };
// The same with no spacing and no rounding, to compare against the stacks.
export const BuiltinSquarify0: StoryObj = {
  render: builtin(Tile.squarify, 0, false),
};
export const BuiltinBinary0: StoryObj = {
  render: builtin(Tile.binary, 0, false),
};

// ─────────────────────────────────────────────────────────────────────────
// Tilings as nested stacks
// ─────────────────────────────────────────────────────────────────────────

// Each child of a stack gets its share of the stack's length. A stack along
// y runs upward, and the built-in treemap runs downward, so a y stack is
// reversed to put its first child on top.
const shares = (ws: number[]) => ws.map((w) => v(w / sum(ws)));
const along = (dir: Dir, weights: number[]) => ({
  dir,
  reverse: dir === "y",
  size: shares(weights),
});
const cell = (d: Country) =>
  rect({ fill: v(d.continent), stroke: "white", strokeWidth: 1 });

// Children side by side along `dir`, each with its weight's share: a stack,
// or a spread `gap` px apart (to try the built-in's `spacing`). WALL: in the
// same frame a spread along y runs downward while a stack runs upward, so
// the spread must not be reversed.
const group = (dir: Dir, weights: number[], children: any[], gap = 0) =>
  gap
    ? spread({ ...along(dir, weights), reverse: false, spacing: gap }, children)
    : stack(along(dir, weights), children);

const render = (node: any) => () => {
  const container = initializeContainer();
  layer({ w: W, h: H }, [node]).render(container, { axes: false });
  return container;
};

// --- Squarify ---------------------------------------------------------------

// A plan: the first row's cells, stacked across `dir`, then the rest of the
// plan, the two stacked along `dir`.
type Plan = { dir: Dir; row: Country[]; rest?: Plan };

const PHI = (1 + Math.sqrt(5)) / 2;

// The squarify row rule (Bruls et al. 2000, as d3's squarifyRatio): add
// items to the row while its worst aspect ratio does not get worse. A wide
// box gets a column at its left, a tall box a row at its top.
function squarify(
  items: Country[],
  [w, h]: [number, number],
  ratio = PHI
): Plan | undefined {
  if (items.length === 0) return undefined;
  const alpha = Math.max(w / h, h / w) / (total(items) * ratio);
  const worst = (row: Country[]) => {
    const beta = total(row) ** 2 * alpha;
    const ws = row.map((d) => d.pop);
    return Math.max(Math.max(...ws) / beta, beta / Math.min(...ws));
  };
  let k = 1;
  while (
    k < items.length &&
    worst(items.slice(0, k + 1)) <= worst(items.slice(0, k))
  )
    k++;
  const dir = w < h ? "y" : "x";
  const share = total(items.slice(0, k)) / total(items);
  const rest: [number, number] =
    dir === "x" ? [w * (1 - share), h] : [w, h * (1 - share)];
  return { dir, row: items.slice(0, k), rest: squarify(items.slice(k), rest) };
}

const flatten = (plan?: Plan): Country[] =>
  plan ? [...plan.row, ...flatten(plan.rest)] : [];

// Draw a plan: the row's cells stacked across, then the rest stacked along.
function drawSquarify({ dir, row, rest }: Plan, gap = 0): any {
  const cells = group(
    across(dir),
    row.map((d) => d.pop),
    row.map(cell),
    gap
  );
  if (!rest) return cells;
  return group(
    dir,
    [total(row), total(flatten(rest))],
    [cells, drawSquarify(rest, gap)],
    gap
  );
}

export const StacksSquarify: StoryObj = {
  render: render(drawSquarify(squarify(countries, [W, H])!)),
};

// The same plan with spreads 2 px apart, to set beside BuiltinSquarify.
export const StacksSquarifySpaced: StoryObj = {
  render: render(drawSquarify(squarify(countries, [W, H])!, 2)),
};

// --- Strip ------------------------------------------------------------------

// A strip treemap: rows across the whole width, one below the other. A row
// takes items while its worst aspect ratio does not get worse; its height
// is its share of the total weight.
function strip(items: Country[], [w, h]: [number, number]): Country[][] {
  const worst = (row: Country[]) => {
    const rowH = (h * total(row)) / total(items);
    return Math.max(
      ...row.map((d) => {
        const cellW = (w * d.pop) / total(row);
        return Math.max(cellW / rowH, rowH / cellW);
      })
    );
  };
  const rows: Country[][] = [];
  let i = 0;
  while (i < items.length) {
    let k = i + 1;
    while (
      k < items.length &&
      worst(items.slice(i, k + 1)) <= worst(items.slice(i, k))
    )
      k++;
    rows.push(items.slice(i, k));
    i = k;
  }
  return rows;
}

const drawStrip = (rows: Country[][]) =>
  stack(
    along("y", rows.map(total)),
    rows.map((row) =>
      stack(
        along(
          "x",
          row.map((d) => d.pop)
        ),
        row.map(cell)
      )
    )
  );

export const StacksStrip: StoryObj = {
  render: render(drawStrip(strip(countries, [W, H]))),
};

// --- Binary -----------------------------------------------------------------

// A binary plan: a leaf, or two halves of near-equal weight side by side
// along the longer side of the box (d3's treemapBinary).
type Split = Country | { dir: Dir; parts: [Split, Split]; weights: number[] };

function binary(items: Country[], [w, h]: [number, number]): Split {
  if (items.length === 1) return items[0];
  // The split point whose left part's weight is nearest half the total.
  const sums = items.map((_, i) => total(items.slice(0, i + 1)));
  const half = total(items) / 2;
  let k = 1;
  for (let i = 1; i < items.length; i++)
    if (Math.abs(sums[i - 1] - half) < Math.abs(sums[k - 1] - half)) k = i;
  const [a, b] = [items.slice(0, k), items.slice(k)];
  const share = total(a) / total(items);
  const dir = w > h ? "x" : "y";
  const [boxA, boxB]: [number, number][] =
    dir === "x"
      ? [
          [w * share, h],
          [w * (1 - share), h],
        ]
      : [
          [w, h * share],
          [w, h * (1 - share)],
        ];
  return {
    dir,
    parts: [binary(a, boxA), binary(b, boxB)],
    weights: [total(a), total(b)],
  };
}

const drawBinary = (s: Split): any =>
  "pop" in s
    ? cell(s)
    : stack(along(s.dir, s.weights), s.parts.map(drawBinary));

export const StacksBinary: StoryObj = {
  render: render(drawBinary(binary(countries, [W, H]))),
};

// ─────────────────────────────────────────────────────────────────────────
// Voronoi by relaxation (Lloyd)
// ─────────────────────────────────────────────────────────────────────────

type Site = { id: string; continent: string; x: number; y: number };

// A small seeded generator (mulberry32), so the start is the same each run.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The centroid of a closed polygon (d3-delaunay repeats the first corner).
function centroid(ring: [number, number][]): [number, number] {
  let [a, cx, cy] = [0, 0, 0];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// Lloyd's relaxation: move every site to the centroid of its cell, clipped
// to the box, `steps` times.
function relax(sites: Site[], steps: number): Site[] {
  for (let s = 0; s < steps; s++) {
    const voronoi = Delaunay.from(sites.map((d) => [d.x, d.y])).voronoi([
      0,
      0,
      W,
      H,
    ]);
    sites = sites.map((d, i) => {
      const [x, y] = centroid(voronoi.cellPolygon(i) as any);
      return { ...d, x, y };
    });
  }
  return sites;
}

const rand = random(7);
const start: Site[] = countries.map((d) => ({
  id: d.country,
  continent: d.continent,
  x: rand() * W,
  y: rand() * H,
}));

// WALL: `Bin.voronoi` clips its cells to the box that holds the data and
// the seeds, and a number column's domain cannot be declared, so the box
// would shrink to the sites' own bounding box. Two extra rows at the box's
// corners, each a copy of its nearest site, stretch the data to the whole
// 360 x 300 box; each lands in its own site's cell.
function framed(sites: Site[]): Site[] {
  const delaunay = Delaunay.from(sites.map((d) => [d.x, d.y]));
  const corner = (x: number, y: number) => ({
    ...sites[delaunay.find(x, y)],
    x,
    y,
  });
  return [...sites, corner(0, 0), corner(W, H)];
}

// The cells of the sites, drawn by `partition`: each site is its own seed,
// so each row is in its own cell.
const cells = (sites: Site[]) =>
  chart(framed(sites))
    .flow(
      partition({
        by: struct({ x: "x", y: "y" }).bin(Bin.voronoi({ seeds: sites })),
      })
    )
    .mark(region({ fill: "continent", stroke: "white", strokeWidth: 1.5 }));

const points = (sites: Site[]) =>
  chart(sites)
    .flow(scatter({ by: "id", x: "x", y: "y" }))
    .mark(circle({ r: 2.5, fill: "black" }).name("sites"));

const voronoiStory = (steps: number) => () => {
  const container = initializeContainer();
  const sites = relax(start, steps);
  layer({ w: W, h: H }, [cells(sites), points(sites)]).render(container, {
    axes: false,
  });
  return container;
};

export const VoronoiRelax0: StoryObj = { render: voronoiStory(0) };
export const VoronoiRelax2: StoryObj = { render: voronoiStory(2) };
export const VoronoiRelax30: StoryObj = { render: voronoiStory(30) };

// The Delaunay neighbor pairs of the step-30 sites, drawn as lines between
// the named site points.
export const VoronoiNeighbors: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const sites = relax(start, 30);
    const delaunay = Delaunay.from(sites.map((d) => [d.x, d.y]));
    const edges: { source: string; target: string }[] = [];
    sites.forEach((d, i) => {
      for (const j of delaunay.neighbors(i))
        if (i < j) edges.push({ source: d.id, target: sites[j].id });
    });
    layer({ w: W, h: H }, [
      cells(sites),
      points(sites),
      chart(edges)
        .flow(resolve(["source", "target"], { from: selectAll("sites") }))
        .mark(
          line({ from: "source", to: "target", stroke: "#222", strokeWidth: 1 })
        ),
    ]).render(container, { axes: false });
    return container;
  },
};

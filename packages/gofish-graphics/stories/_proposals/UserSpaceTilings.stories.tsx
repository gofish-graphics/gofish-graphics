import type { Meta, StoryObj } from "@storybook/html";
import { Delaunay } from "d3-delaunay";
import { initializeContainer } from "../helper";
import { countryPopulations } from "../../src/data/countryPopulations";
import {
  Binning,
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
  tile,
  Tiling,
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
  (tiling: any, spacing: number, round = true) =>
  () => {
    const container = initializeContainer();
    chart(countries, { axes: false, w: W, h: H })
      .flow(tile({ size: "pop", spacing, tiling, round }))
      .mark(
        tiling.kind === "voronoi"
          ? region({ fill: "continent", stroke: "white", strokeWidth: 1 })
          : rect({ fill: "continent", stroke: "white", strokeWidth: 1 })
      )
      .render(container);
    return container;
  };

export const BuiltinSquarify: StoryObj = { render: builtin(Tiling.squarify, 2) };
export const BuiltinBinary: StoryObj = { render: builtin(Tiling.binary, 2) };
export const BuiltinSlice: StoryObj = { render: builtin(Tiling.slice, 2) };
export const BuiltinVoronoi: StoryObj = { render: builtin(Tiling.voronoi, 2) };
// The same with no spacing and no rounding, to compare against the stacks.
export const BuiltinSquarify0: StoryObj = {
  render: builtin(Tiling.squarify, 0, false),
};
export const BuiltinBinary0: StoryObj = {
  render: builtin(Tiling.binary, 0, false),
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
// One sequential algorithm (Baudel and Broeksema 2012)
// ─────────────────────────────────────────────────────────────────────────

// Every chunk takes one full side of the room that is left, and its items
// run across that side in one direction.
type Side = "N" | "S" | "E" | "W";
type Direction = "right" | "left" | "down" | "up";
type Config = { side: Side; direction: Direction };
type Chunk<T> = Config & { items: T[]; sizes: number[]; sum: number };
// A plan lists the chunks in placement order. A chunk the algorithm
// recursed into keeps its items and also has the plan of its own box.
type SeqPlan<T> = (Chunk<T> & { subplan?: SeqPlan<T> })[];
// What a score or phrase function can read: the room that is left, the
// size of the items still to place in it, and the size and count of all
// the items in this run of the algorithm.
type State = {
  w: number;
  h: number;
  remaining: number;
  total: number;
  count: number;
};
type Options<T> = {
  order?: (items: T[]) => T[];
  size: (item: T) => number;
  score: (chunk: Chunk<T>, size: number, state: State) => number;
  phrase: (previous: Chunk<T> | undefined, state: State) => Config;
  recurse?: (chunk: Chunk<T>) => boolean;
};

const isColumn = (side: Side) => side === "W" || side === "E";

// The universal algorithm (the paper's Listing 2). An item joins the chunk
// unless the chunk's score with the item is lower than its score before;
// then the chunk closes, takes its share of the room, and the next chunk
// starts on the side `phrase` picks.
function sequential<T>(
  items: T[],
  [w, h]: [number, number],
  options: Options<T>
): SeqPlan<T> {
  const { order = (xs) => xs, size, score, phrase, recurse } = options;
  items = order(items);
  const sizes = items.map(size);
  const plan: SeqPlan<T> = [];
  let i = 0;
  while (i < items.length) {
    const remaining = sum(sizes.slice(i));
    const state = { w, h, remaining, total: sum(sizes), count: items.length };
    const config = phrase(plan[plan.length - 1], state);
    const chunk: Chunk<T> = { ...config, items: [], sizes: [], sum: 0 };
    let last = -Infinity;
    while (i < items.length) {
      const next = score(chunk, sizes[i], state);
      if (next < last) break;
      last = next;
      chunk.items.push(items[i]);
      chunk.sizes.push(sizes[i]);
      chunk.sum += sizes[i];
      i++;
    }
    const share = chunk.sum / remaining;
    const box: [number, number] = isColumn(chunk.side)
      ? [w * share, h]
      : [w, h * share];
    if (isColumn(chunk.side)) w *= 1 - share;
    else h *= 1 - share;
    const whole = chunk.items.length === items.length;
    plan.push(
      !whole && recurse?.(chunk)
        ? { ...chunk, subplan: sequential(chunk.items, box, options) }
        : chunk
    );
  }
  return plan;
}

// Draw any plan as nested stacks: the first chunk and the rest of the plan
// side by side, the chunk first on N and W and last on S and E; the chunk's
// items stacked across it, in reverse when they run up or left.
function drawSequential<T extends Country>(plan: SeqPlan<T>): any {
  const [chunk, ...rest] = plan;
  const reverse = chunk.direction === "up" || chunk.direction === "left";
  const flip = <X,>(xs: X[]) => (reverse ? [...xs].reverse() : xs);
  const here = chunk.subplan
    ? drawSequential(chunk.subplan)
    : stack(
        along(isColumn(chunk.side) ? "y" : "x", flip(chunk.sizes)),
        flip(chunk.items).map(cell)
      );
  if (rest.length === 0) return here;
  const parts = [
    { weight: chunk.sum, node: here },
    { weight: sum(rest.map((c) => c.sum)), node: drawSequential(rest) },
  ];
  if (chunk.side === "S" || chunk.side === "E") parts.reverse();
  return stack(
    along(
      isColumn(chunk.side) ? "x" : "y",
      parts.map((p) => p.weight)
    ),
    parts.map((p) => p.node)
  );
}

// --- Score functions (the paper's Listings 4 to 7) --------------------------

type ScoreFn = Options<Country>["score"];
const fold = (r: number) => (r > 1 ? 1 / r : r);
// The chunk with one more item: its length along its side of the room, its
// thickness across, and its size.
function grown(chunk: Chunk<unknown>, size: number, s: State) {
  const [length, across] = isColumn(chunk.side) ? [s.h, s.w] : [s.w, s.h];
  const sum = chunk.sum + size;
  return { length, thick: (across * sum) / s.remaining, sum };
}

const Score = {
  // One chunk holds every item.
  slice: ((c, _, s) => (c.items.length === s.count ? 1 : 0)) as ScoreFn,
  // Every item is its own chunk.
  dice: ((c) => 1 - c.items.length) as ScoreFn,
  // Chunks of about the square root of the item count.
  grid: ((c, _, s) => (c.items.length ** 2 <= s.count ? 1 : 0)) as ScoreFn,
  // The aspect ratio of the item of average length, folded under 1.
  bestAverageAspectRatio: ((c, size, s) => {
    const g = grown(c, size, s);
    return fold(g.length / (c.items.length + 1) / g.thick);
  }) as ScoreFn,
  // The aspect ratio of the smallest item, folded under 1.
  bestMinAspectRatio: ((c, size, s) => {
    const g = grown(c, size, s);
    const min = Math.min(size, ...c.sizes);
    return fold((g.length * min) / g.sum / g.thick);
  }) as ScoreFn,
  // Highest where the chunk holds half the size still to place.
  pivotBySplitSize: ((c, size, s) =>
    -((c.sum + size - s.remaining / 2) ** 2)) as ScoreFn,
  // The squarify row rule above: minus the row's worst aspect ratio.
  squarified:
    (ratio = PHI): ScoreFn =>
    (c, size, s) => {
      const alpha = Math.max(s.w / s.h, s.h / s.w) / (s.remaining * ratio);
      const beta = (c.sum + size) ** 2 * alpha;
      const sizes = [...c.sizes, size];
      return -Math.max(Math.max(...sizes) / beta, beta / Math.min(...sizes));
    },
};

// --- Phrase functions (the paper's section 5.3 and 6.3) ---------------------

type PhraseFn = Options<Country>["phrase"];
// Spiral turns clockwise: after a chunk on one side, the next side.
const clockwise: Record<Side, Config> = {
  N: { side: "E", direction: "down" },
  E: { side: "S", direction: "left" },
  S: { side: "W", direction: "up" },
  W: { side: "N", direction: "right" },
};

const Phrase = {
  // Every chunk a row at the top, its items left to right.
  strip: (() => ({ side: "N", direction: "right" })) as PhraseFn,
  // Rows at the top, the items' direction flipping each row.
  zigzag: ((prev) => ({
    side: "N",
    direction: prev?.direction === "right" ? "left" : "right",
  })) as PhraseFn,
  // Each chunk on the next side clockwise, continuing from the last item.
  spiral: ((prev) => clockwise[prev?.side ?? "W"]) as PhraseFn,
  // The chunk on the side that makes the room squarer (a column at the left
  // of a wide room, a row at the top of a tall one), its first item at the
  // room's top left corner, next to the first item of the chunk before.
  bestDiscontinuous: ((_, s) =>
    s.w >= s.h
      ? { side: "W", direction: "down" }
      : { side: "N", direction: "right" }) as PhraseFn,
};

const pop = (d: Country) => d.pop;
const seq = (options: Options<Country>) =>
  render(drawSequential(sequential(countries, [W, H], options)));

export const SeqSliceDice: StoryObj = {
  render: seq({ size: pop, score: Score.dice, phrase: Phrase.strip }),
};
export const SeqStrip: StoryObj = {
  render: seq({
    size: pop,
    score: Score.bestMinAspectRatio,
    phrase: Phrase.strip,
  }),
};
export const SeqZigzag: StoryObj = {
  render: seq({
    size: pop,
    score: Score.bestMinAspectRatio,
    phrase: Phrase.zigzag,
  }),
};
export const SeqSpiral: StoryObj = {
  render: seq({
    order: (xs) => [...xs].sort((a, b) => b.pop - a.pop),
    size: pop,
    score: Score.bestMinAspectRatio,
    phrase: Phrase.spiral,
  }),
};
export const SeqSquarify: StoryObj = {
  render: seq({
    size: pop,
    score: Score.squarified(),
    phrase: Phrase.bestDiscontinuous,
  }),
};
export const SeqPivot: StoryObj = {
  render: seq({
    size: pop,
    score: Score.pivotBySplitSize,
    recurse: (c) => c.items.length > 2,
    phrase: Phrase.bestDiscontinuous,
  }),
};
// The paper's Fig. 10b setting: the same with Strip phrasing.
export const SeqPivotStrip: StoryObj = {
  render: seq({
    size: pop,
    score: Score.pivotBySplitSize,
    recurse: (c) => c.items.length > 2,
    phrase: Phrase.strip,
  }),
};
export const SeqGrid: StoryObj = {
  render: seq({ size: () => 1, score: Score.grid, phrase: Phrase.strip }),
};
export const SeqBestDiscontinuous: StoryObj = {
  render: seq({
    size: pop,
    score: Score.bestMinAspectRatio,
    phrase: Phrase.bestDiscontinuous,
  }),
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

// WALL: `Binning.voronoi` clips its cells to the box that holds the data and
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
        by: struct({ x: "x", y: "y" }).bin(Binning.voronoi({ seeds: sites })),
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

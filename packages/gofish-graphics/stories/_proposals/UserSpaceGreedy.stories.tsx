import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { seafood } from "../../src/data/catch";
import {
  chart,
  circle,
  scatter,
  offset,
  position,
  group,
  layer,
  rect,
  pack,
  Overlap,
} from "../../src/lib";

// Throwaway prototypes for the user-space layouts proposal: are a beeswarm
// and a circle pack the same greedy rule ("each item, in order, takes the
// lowest-cost candidate that does not collide")? Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/User Space Greedy",
};
export default meta;

const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);

// ---------------------------------------------------------------------------
// The one generic helper.

type Pos = { x: number; y: number };
type Placed = Pos & { r: number };

function greedyPlace<T extends { r: number }>(
  items: T[],
  rule: {
    candidates: (item: T, placed: Placed[]) => Pos[];
    cost: (pos: Pos, item: T, placed: Placed[]) => number;
    collides: (pos: Pos, item: T, placed: Placed[]) => boolean;
  }
): Placed[] {
  const placed: Placed[] = [];
  for (const item of items) {
    let best = { x: NaN, y: NaN };
    let bestCost = Infinity;
    for (const pos of rule.candidates(item, placed)) {
      const c = rule.cost(pos, item, placed);
      if (c < bestCost && !rule.collides(pos, item, placed)) {
        best = pos;
        bestCost = c;
      }
    }
    placed.push({ ...best, r: item.r });
  }
  return placed;
}

const EPS = 1e-6;
const overlapsAny = (pos: Pos, r: number, placed: Placed[], pad = 0) =>
  placed.some((p) => Math.hypot(pos.x - p.x, pos.y - p.y) < r + p.r + pad - EPS);

// ---------------------------------------------------------------------------
// Swarm

export const BuiltinSwarm: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(weighed, { w: 420, h: 260 })
      .flow(
        scatter({
          x: "Body Mass (g)",
          alignment: "middle",
          overlap: Overlap.separate({ padding: 1 }),
        })
      )
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container);
    return container;
  },
};

// The x scale GoFish picks for this chart, rebuilt by hand: the axis shows a
// nice domain [2500, 6500] over the 420 px width.
const xPx = (mass: number) => ((mass - 2500) / (6500 - 2500)) * 420;

const PAD = 1;
const swarm = greedyPlace(
  weighed.map((p) => ({ x: xPx(p["Body Mass (g)"]!), r: 3 })),
  {
    candidates: (item, placed) => [
      { x: item.x, y: 0 },
      ...placed.flatMap((p) => {
        const dr = item.r + p.r + PAD;
        const dx = item.x - p.x;
        if (Math.abs(dx) >= dr) return [];
        const dy = Math.sqrt(dr * dr - dx * dx);
        return [
          { x: item.x, y: p.y - dy },
          { x: item.x, y: p.y + dy },
        ];
      }),
    ],
    cost: (pos) => Math.abs(pos.y),
    collides: (pos, item, placed) => overlapsAny(pos, item.r, placed, PAD),
  }
);

// The height the swarm needs, which scatter cannot see through `offset`.
const swarmH = 2 * Math.max(...swarm.map((p) => Math.abs(p.y) + p.r));

export const GreedySwarm: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = weighed.map((p, i) => ({ ...p, dy: swarm[i].y }));
    chart(rows, { w: 420, h: 260 })
      .flow(scatter({ x: "Body Mass (g)", alignment: "middle" }))
      .mark((d: typeof rows) =>
        // `offset` moves only the drawing, not the box scatter lays out, so
        // the plot does not grow to hold the swarm: push it down by half its
        // height so it stays inside the 260 px plot.
        offset({ y: d[0].dy + swarmH / 2 }, [circle({ r: 3, fill: "Species" })(d)])
      )
      .render(container);
    return container;
  },
};

// WALL: `position` on a baseline-aligned scatter. scatter aligns each child's
// box on the free axis, and position's box moves with its child, so the
// offset is aligned away: every dot lands on the line.
export const WallSwarmPosition: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = weighed.map((p, i) => ({ ...p, dy: swarm[i].y }));
    chart(rows, { w: 420, h: 260 })
      .flow(scatter({ x: "Body Mass (g)" }))
      .mark((d: typeof rows) =>
        position({ y: d[0].dy - 3 }, [circle({ r: 3, fill: "Species" })(d)])
      )
      .render(container);
    return container;
  },
};

// WALL: everything in pixels inside a layer (group places nothing). It draws,
// but with no data position there is no x axis.
export const WallSwarmPixels: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = weighed.map((p, i) => ({ ...p, i, ...swarm[i] }));
    chart(rows, { w: 420, h: 260 })
      .flow(group({ by: "i" }))
      .mark((d: typeof rows) =>
        circle({ cx: d[0].x, cy: d[0].y + 130, r: 3, fill: "Species" })(d)
      )
      .render(container);
    return container;
  },
};

// WALL: the pixel offset as a data field on y. GoFish fits a y scale to it,
// so the dots spread apart (no longer touching) and a meaningless "dy" axis
// appears. There is no way to say "this field is already in pixels".
export const WallSwarmDataY: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = weighed.map((p, i) => ({ ...p, dy: swarm[i].y }));
    chart(rows, { w: 420, h: 260 })
      .flow(scatter({ x: "Body Mass (g)", y: "dy" }))
      .mark(circle({ r: 3, fill: "Species" }))
      .render(container);
    return container;
  },
};

// ---------------------------------------------------------------------------
// Pack

const radius = (count: number) => 4.5 * Math.sqrt(count);

export const BuiltinPack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(seafood, { w: 320, h: 320 })
      .flow(pack())
      .mark((d: typeof seafood) =>
        circle({ r: radius(d[0].count), fill: "species" })(d)
      )
      .render(container);
    return container;
  },
};

// The two centers where a circle of radius r touches both a and b.
function tangentToBoth(a: Placed, b: Placed, r: number): Pos[] {
  const ra = a.r + r;
  const rb = b.r + r;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > ra + rb || d < Math.abs(ra - rb) || d === 0) return [];
  const along = (d * d + ra * ra - rb * rb) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - along * along));
  const mx = a.x + (along * dx) / d;
  const my = a.y + (along * dy) / d;
  return [
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
  ];
}

// The mean of the placed centers (the origin while nothing is placed).
const centroid = (placed: Placed[]): Pos => ({
  x: placed.reduce((s, p) => s + p.x, 0) / (placed.length || 1),
  y: placed.reduce((s, p) => s + p.y, 0) / (placed.length || 1),
});

const greedyPack = (
  items: { r: number }[],
  center: "origin" | "centroid" = "origin"
) =>
  greedyPlace(items, {
    candidates: (item, placed) => {
      if (placed.length === 0) return [{ x: 0, y: 0 }];
      if (placed.length === 1) return [{ x: placed[0].r + item.r, y: 0 }];
      return placed.flatMap((a, i) =>
        placed.slice(i + 1).flatMap((b) => tangentToBoth(a, b, item.r))
      );
    },
    cost: (pos, _item, placed) => {
      const c = center === "origin" ? { x: 0, y: 0 } : centroid(placed);
      return Math.hypot(pos.x - c.x, pos.y - c.y);
    },
    collides: (pos, item, placed) => overlapsAny(pos, item.r, placed),
  });

// Draw circles at pixel centers: `group` with one row per group is a layer,
// which places nothing, so a literal cx/cy is a pixel position.
const drawAt = (container: HTMLElement, placed: Placed[], order: number[]) => {
  const rows = order.map((k, i) => ({ ...seafood[k], i, ...placed[i] }));
  chart(rows, { w: 320, h: 320 })
    .flow(group({ by: "i" }))
    .mark((d: typeof rows) =>
      circle({ cx: d[0].x, cy: d[0].y, r: d[0].r, fill: "species" })(d)
    )
    .render(container);
};

const dataOrder = seafood.map((_, k) => k);
const bySize = [...dataOrder].sort(
  (a, b) => seafood[b].count - seafood[a].count
);

export const GreedyPack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const items = dataOrder.map((k) => ({ r: radius(seafood[k].count) }));
    drawAt(container, greedyPack(items, "origin"), dataOrder);
    return container;
  },
};

export const GreedyPackCentroid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const items = dataOrder.map((k) => ({ r: radius(seafood[k].count) }));
    drawAt(container, greedyPack(items, "centroid"), dataOrder);
    return container;
  },
};

export const GreedyPackSorted: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const items = bySize.map((k) => ({ r: radius(seafood[k].count) }));
    drawAt(container, greedyPack(items, "origin"), bySize);
    return container;
  },
};

// The built-in on the same largest-first order, for comparison.
export const BuiltinPackSorted: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const sorted = bySize.map((k) => seafood[k]);
    chart(sorted, { w: 320, h: 320 })
      .flow(pack())
      .mark((d: typeof seafood) =>
        circle({ r: radius(d[0].count), fill: "species" })(d)
      )
      .render(container);
    return container;
  },
};

// ---------------------------------------------------------------------------
// Squares: the same helper, other geometry. `r` is half the side, sized so a
// square has the same area as the circle above.

const squaresOverlap = (a: Placed, b: Placed) =>
  Math.abs(a.x - b.x) < a.r + b.r - EPS && Math.abs(a.y - b.y) < a.r + b.r - EPS;

const squarePack = greedyPlace(
  bySize.map((k) => ({ r: (radius(seafood[k].count) * Math.sqrt(Math.PI)) / 2 })),
  {
    // Flush against a side of a placed square, lined up with one of its
    // corners: eight spots per placed square.
    candidates: (item, placed) =>
      placed.length === 0
        ? [{ x: 0, y: 0 }]
        : placed.flatMap((p) => {
            const d = p.r + item.r;
            const e = p.r - item.r;
            return [
              [d, e], [d, -e], [-d, e], [-d, -e],
              [e, d], [-e, d], [e, -d], [-e, -d],
            ].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
          }),
    cost: (pos) => Math.hypot(pos.x, pos.y),
    collides: (pos, item, placed) =>
      placed.some((p) => squaresOverlap({ ...pos, r: item.r }, p)),
  }
);

export const GreedyPackSquares: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = bySize.map((k, i) => ({ ...seafood[k], i, ...squarePack[i] }));
    chart(rows, { w: 320, h: 320 })
      .flow(group({ by: "i" }))
      .mark((d: typeof rows) => {
        const { x, y, r } = d[0];
        return rect({
          x: x - r,
          y: y - r,
          w: 2 * r,
          h: 2 * r,
          fill: "species",
          stroke: "white",
          strokeWidth: 1,
        })(d);
      })
      .render(container);
    return container;
  },
};

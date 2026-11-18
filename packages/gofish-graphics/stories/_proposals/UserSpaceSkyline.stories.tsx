import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { penguins } from "../../src/data/penguins";
import { seafood } from "../../src/data/catch";
import {
  chart,
  circle,
  scatter,
  offset,
  group,
  pack,
  line,
  Overlap,
  Coord,
} from "../../src/lib";

// Throwaway prototypes for the user-space layouts proposal: are a one-sided
// beeswarm and a circle pack the same rule along one axis ("slide in along
// a ray until you first touch something")? Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/User Space Skyline",
};
export default meta;

// ---------------------------------------------------------------------------
// The one function.

type Pos = { x: number; y: number };
type Placed = Pos & { r: number };

/** A family of straight rays: `at(lane, depth)` is the point `depth` along
 *  ray `lane`, and `laneOf(p)` is the ray through `p`. */
type Rays = {
  at: (lane: number, depth: number) => Pos;
  laneOf: (p: Pos) => number;
};

/**
 * Each item, in order, slides in along a ray from far away until it first
 * touches a placed item (or reaches `floor`). `lane` gives the ray; without
 * it the ray is chosen: of the rays through the spots that touch two placed
 * items, the one where the item comes to rest deepest in.
 */
function skyline<T extends { r: number }>(
  items: T[],
  rays: Rays,
  opts: {
    lane?: (item: T, i: number) => number;
    floor?: number;
    pad?: number;
  } = {}
): Placed[] {
  const { lane, floor = 0, pad = 0 } = opts;
  const placed: Placed[] = [];
  // How deep an item of radius r rests on ray l: past every placed circle.
  const depth = (l: number, r: number) => {
    const o = rays.at(l, 0);
    const u = rays.at(l, 1);
    let d = floor;
    for (const q of placed) {
      const wx = q.x - o.x;
      const wy = q.y - o.y;
      const a = wx * (u.x - o.x) + wy * (u.y - o.y);
      const R = q.r + r + pad;
      const disc = R * R - (wx * wx + wy * wy) + a * a;
      if (disc >= 0) d = Math.max(d, a + Math.sqrt(disc));
    }
    return d;
  };
  items.forEach((item, i) => {
    let best = lane ? lane(item, i) : 0;
    if (!lane) {
      let bestDepth = depth(best, item.r);
      for (const [a, b] of pairs(placed))
        for (const p of touching(a, b, item.r + pad)) {
          const l = rays.laneOf(p);
          const d = depth(l, item.r);
          // Exact ties are common (every notch against the first circle
          // is equally deep), so the first one found wins.
          if (d < bestDepth - 1e-9) [best, bestDepth] = [l, d];
        }
    }
    placed.push({ ...rays.at(best, depth(best, item.r)), r: item.r });
  });
  return placed;
}

const pairs = <T,>(xs: T[]) =>
  xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

// The two centers where a circle of radius r touches both a and b.
function touching(a: Placed, b: Placed, r: number): Pos[] {
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

// The two coordinate systems: vertical rays over x, and rays from an origin.
const cartesian: Rays = { at: (x, y) => ({ x, y }), laneOf: (p) => p.x };
const polar: Rays = {
  at: (t, d) => ({ x: d * Math.cos(t), y: d * Math.sin(t) }),
  laneOf: (p) => Math.atan2(p.y, p.x),
};

// ---------------------------------------------------------------------------
// Swarm (one-sided): lane = x from the data, depth = y.

const weighed = penguins.filter((p) => p["Body Mass (g)"] !== null);
// The x scale GoFish picks for this chart: nice domain [2500, 6500] over 420 px.
const xPx = (mass: number) => ((mass - 2500) / (6500 - 2500)) * 420;
const DOT = 3;

const swarm = skyline(
  weighed.map((p) => ({ x: xPx(p["Body Mass (g)"]!), r: DOT })),
  cartesian,
  { lane: (d) => d.x, floor: DOT, pad: 1 }
);

export const SkylineSwarm: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // `start` alignment rests every dot on the line (center at y = r), so
    // the offset is the depth above that.
    const rows = weighed.map((p, i) => ({ ...p, dy: swarm[i].y - DOT }));
    chart(rows, { w: 420, h: 260 })
      .flow(scatter({ x: "Body Mass (g)", alignment: "start" }))
      .mark((d: typeof rows) =>
        offset({ y: d[0].dy }, [circle({ r: DOT, fill: "Species" })(d)])
      )
      .render(container);
    return container;
  },
};

export const BuiltinSwarmOneSided: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(weighed, { w: 420, h: 260 })
      .flow(
        scatter({
          x: "Body Mass (g)",
          alignment: "start",
          overlap: Overlap.separate({ padding: 1 }),
        })
      )
      .mark(circle({ r: DOT, fill: "Species" }))
      .render(container);
    return container;
  },
};

// ---------------------------------------------------------------------------
// Pack: lane = angle (chosen), depth = distance from the first circle.

const radius = (count: number) => 4.5 * Math.sqrt(count);
const circles = seafood.map((d) => ({ r: radius(d.count) }));

const notchPack = skyline(circles, polar);
const goldenPack = skyline(circles, polar, {
  lane: (_, i) => (i * 137.50776 * Math.PI) / 180,
});

// Draw circles at pixel centers: `group` with one row per group is a layer,
// which places nothing, so a literal cx/cy is a pixel position.
const drawAt = (container: HTMLElement, placed: Placed[]) => {
  const rows = seafood.map((d, i) => ({ ...d, i, ...placed[i] }));
  chart(rows, { w: 320, h: 320 })
    .flow(group({ by: "i" }))
    .mark((d: typeof rows) =>
      circle({ cx: d[0].x, cy: d[0].y, r: d[0].r, fill: "species" })(d)
    )
    .render(container);
};

export const SkylinePack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    drawAt(container, notchPack);
    return container;
  },
};

export const SkylinePackGolden: StoryObj = {
  render: () => {
    const container = initializeContainer();
    drawAt(container, goldenPack);
    return container;
  },
};

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

// The same circles as (angle, distance) rows.
const TAU = 2 * Math.PI;
const polarRows = seafood.map((d, i) => {
  const { x, y, r } = notchPack[i];
  return {
    ...d,
    i,
    r,
    theta: (Math.atan2(y, x) + TAU) % TAU,
    rho: Math.hypot(x, y),
  };
});

// Drawn through a polar space: scatter places each circle at (theta, rho).
// WALL: the circles stay round and keep their pixel radii, and the angle is
// exact once two invisible rows pin its scale to [0, 2π] (it spans the
// data's own min..max otherwise). But rho is a data scale fit to the plot:
// it lands at 21.6 + 0.577 * rho px (the inset is the radius of the circle
// at rho 0), so the pack shrinks toward a ring and circles overlap. There is
// no way to say "rho is already in pixels".
export const SkylinePackPolar: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const pins = [0, TAU].map((theta, k) => ({
      ...polarRows[0],
      i: 100 + k,
      r: 0,
      theta,
      rho: 0,
    }));
    chart([...polarRows, ...pins], { coord: Coord.polar(), w: 320, h: 320 })
      .flow(scatter({ by: "i", x: "theta", y: "rho" }))
      .mark((d: typeof polarRows) => circle({ r: d[0].r, fill: "species" })(d))
      .render(container);
    return container;
  },
};

// Unrolled: each circle's outline redrawn with angle on x and distance on y.
// The top edge of the picture is the skyline the next circle would slide in
// against. An outline that crosses angle 0 is cut in two there.
const unrolled = notchPack.flatMap(({ x, y, r }, i) => {
  const pts = Array.from({ length: 145 }, (_, k) => {
    const phi = (k / 144) * TAU;
    const px = x + r * Math.cos(phi);
    const py = y + r * Math.sin(phi);
    return {
      theta: ((Math.atan2(py, px) + TAU) % TAU) * (180 / Math.PI),
      rho: Math.hypot(px, py),
    };
  });
  // The first circle holds the origin: its outline is the line rho = r.
  if (i === 0)
    return [0, 360].map((theta) => ({
      seg: "0",
      k: theta,
      theta,
      rho: r,
      species: seafood[0].species,
    }));
  let part = 0;
  return pts.map((p, k) => {
    if (k > 0 && Math.abs(p.theta - pts[k - 1].theta) > 180) part++;
    return { seg: `${i}-${part}`, k, ...p, species: seafood[i].species };
  });
});

export const SkylineUnrolled: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows = unrolled.map((d) => ({
      ...d,
      "angle (degrees)": d.theta,
      "distance from first center (px)": d.rho,
    }));
    chart(rows, { w: 480, h: 260 })
      .flow(
        group({ by: "seg" }),
        scatter({
          by: "k",
          x: "angle (degrees)",
          y: "distance from first center (px)",
        })
      )
      .mark(line({ stroke: "species", strokeWidth: 1.5 }))
      .render(container);
    return container;
  },
};

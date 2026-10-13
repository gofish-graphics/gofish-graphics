// Ribbon particles (cf. Elijah Meeks, "Sankey Particles"). The ribbon is the
// SPATIAL trace of a flow; a particle is the same flow played in TIME. Each
// particle has two keyframes, a stop at a lane of its species' segment in one
// lake (on the bar's right edge) and a stop at the same lane of the segment in
// the next lake (on its left edge), and a `time.transition` threads them with
// the ribbon's own curve, `Curve.bezier()`, so a particle at lane 0.3 travels
// exactly the curve 30% of the way across the ribbon's band.
//
// The stops are drawn inside the bar layout, so where a stop sits is decided
// by the same spread and stack that place the bars: its y is `lane x count`
// in the segment's own units, above the segment's base.
import {
  Curve,
  chart,
  circle,
  field,
  group,
  layer,
  rect,
  ribbon,
  selectAll,
  spread,
  stack,
  time,
  timer,
  v,
} from "../../../../src/lib";
import { seafood } from "../../../../src/data/catch";

export type ParticleClock = { playing?: boolean; at?: number };

/** A small seeded random source (mulberry32), so every render, and every
 *  frame of the filmstrip, draws the same particles. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Stop = {
  pid: string;
  /** The keyframe's time, in loops: the playhead runs over [0, 1). */
  k: number;
  lake: string;
  species: string;
  lane: number;
  side: "out" | "in";
};

/**
 * The particle table: per flow (a species from one lake to the next), one
 * particle per `per` fish of the flow, each with a lane in the band, a start
 * in the loop and a speed. A particle is two stops. One whose trip runs past
 * the end of the loop also leaves a loop earlier, so the loop has no seam.
 */
export function particleStops({
  per = 1.2,
  single = false,
}: { per?: number; single?: boolean } = {}): Stop[] {
  const rand = random(7);
  const lakes = [...new Set(seafood.map((d) => d.lake))];
  const count = new Map(seafood.map((d) => [`${d.lake}|${d.species}`, d.count]));
  const species = [...new Set(seafood.map((d) => d.species))];
  const stops: Stop[] = [];
  lakes.slice(0, -1).forEach((from, i) => {
    const to = lakes[i + 1];
    for (const s of species) {
      const value = (count.get(`${from}|${s}`)! + count.get(`${to}|${s}`)!) / 2;
      const n = single ? 1 : Math.max(1, Math.round(value / per));
      for (let j = 0; j < n; j++) {
        const lane = single ? 0.5 : 0.15 + 0.7 * rand();
        const start = single ? (i * 0.13) % 1 : rand();
        const trip = single ? 0.6 : 0.45 / (0.75 + 0.5 * rand());
        const pid = `${from}|${s}|${j}`;
        for (const shift of start + trip > 1 ? [0, -1] : [0]) {
          const id = shift === 0 ? pid : `${pid}'`;
          const k0 = start + shift;
          stops.push(
            { pid: id, k: k0, lake: from, species: s, lane, side: "out" },
            { pid: id, k: k0 + trip, lake: to, species: s, lane, side: "in" }
          );
        }
      }
    }
  });
  return stops;
}

const W = 24;
const R = 2;
/** One loop of the clock, in ms, and the size of a GIF frame. */
export const LOOP_MS = 4000;
export const CELL: [number, number] = [600, 380];
const SIZE = { w: 420, h: 300 };

export default (
  container: HTMLElement,
  clock: ParticleClock = {},
  opts: { single?: boolean; keyframes?: boolean } = {}
) => {
  const stops = particleStops(opts);
  // The stops of each segment, by lake and species: a lookup join of the
  // particle table onto the catch table.
  const stopsAt = new Map<string, Stop[]>();
  for (const s of stops) {
    const key = `${s.lake}|${s.species}`;
    stopsAt.set(key, [...(stopsAt.get(key) ?? []), s]);
  }
  const loop = timer({
    domain: [0, 1],
    duration: LOOP_MS,
    loop: true,
    playing: clock.playing ?? true,
  });
  if (clock.at !== undefined) loop.set(clock.at);

  const ribbons = chart(seafood)
    .flow(
      spread({ by: "lake", dir: "x", spacing: 56 }),
      stack({ by: field("species").sort("count"), dir: "y" })
    )
    // PROTOTYPE SHORTCUT: a combinator child has no datum of its own, so
    // each segment's rect and stops are bound to their rows by hand (`bind`),
    // for `selectAll` to group them by.
    .mark(((rows: typeof seafood) => {
      const row = rows[0];
      const { lake, species, count } = row;
      return layer([
        bind(row, rect({ w: W, h: v(count), fill: v(species) }).name("bars")),
        ...(stopsAt.get(`${lake}|${species}`) ?? []).map((s) =>
          bind(
            s,
            circle({
              r: opts.single ? 3.5 : R,
              x: s.side === "out" ? W : 0,
              y: v(s.lane * count),
              fill: v(species).darken(0.45),
            }).name("stops")
          )
        ),
      ]);
    }) as any)
    .layer(
      chart(selectAll("bars"))
        .flow(group({ by: "species" }))
        .mark(ribbon({ opacity: 0.5 }))
    );
  // The keyframes alone: every stop drawn where it stands, nothing moving.
  if (opts.keyframes) return ribbons.render(container, SIZE);
  return ribbons
    .layer(
      chart(selectAll("stops"))
        .flow(group({ by: "pid" }))
        .mark(time.transition({ along: "k", at: loop, curve: Curve.bezier() }))
    )
    .render(container, SIZE);
};

/** A mark called with `row` as its datum, wherever it is resolved. */
const bind =
  (row: unknown, mark: any) =>
  (_d: unknown, key: unknown, context: unknown) =>
    mark(row, key, context);

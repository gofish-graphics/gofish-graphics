// Periscopic, "U.S. Gun Deaths" (2013), https://guns.periscopic.com/?year=2013
//
// Each victim is one cubic arc over an age axis, from birth to the age they
// might have lived to. The arc is split where x is their age at death: the
// orange part is the life they lived, the grey part the years stolen. Each
// arc DRAWS: first its life, then (from the moment it ends, when a dot drops
// on the axis) its stolen years. One life plays alone, then a few, then the
// lives come faster and faster until thousands overlap.
//
// PROTOTYPE (animation grammar, approach A: time composes like space). The
// syntax is not signed off. `bezier` is a prototype mark (src/ast/shapes/
// bezier.tsx); `Animation.draw`, the combinator `time.stagger(opts, [...])`,
// `lag` as a function and `layer([...]).transition({ enter: time.stagger })`
// are prototype additions on this branch.
import {
  Animation,
  chart,
  circle,
  datum,
  layer,
  text,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { bezier } from "../../../src/ast/shapes/bezier";
import { gunDeaths2013, type GunDeath } from "../../../src/data/gunDeaths2013";

const ORANGE = "#f26c21";
const GREY = "#b4b4b4";
const N = gunDeaths2013.length;

/** One frame of the original (it counts in animation frames), in ms. The
 *  original runs at 60 fps; this plays it about twice as fast. */
const F = 8;

/** How long person i's whole arc takes to draw (the original: 400 frames for
 *  the first two lives, then 300 / ln(i + 10)). */
const drawTime = (i: number) => (i < 2 ? 400 : 300 / Math.log(i + 10)) * F;

// ---- Geometry (the data side: plain arithmetic on each row) ----------------

type P = [number, number];
const mix = (a: P, b: P, t: number): P => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
/** A small deterministic hash in [0, 1), so arc heights vary like the
 *  original's without a random seed. */
const hash = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** The whole arc: from age 0 to `potential`, control points at 25% and 75%
 *  of the way, its peak height growing with the years stolen (plus a jitter,
 *  INVENTED: the original's height rule is not reproduced exactly). */
const arcOf = (d: GunDeath): [P, P, P, P] => {
  const stolen = (d.potential - d.age) / d.potential;
  const peak = d.potential * (0.1 + 0.18 * stolen + 0.14 * hash(d.i));
  const c = peak / 0.75; // a symmetric cubic peaks at 3/4 of its control height
  return [
    [0, 0],
    [0.25 * d.potential, c],
    [0.75 * d.potential, c],
    [d.potential, 0],
  ];
};

/** The parameter where the arc's x is `age` (x rises along the arc). */
const paramAt = ([p0, p1, p2, p3]: P[], age: number) => {
  const x = (t: number) =>
    (1 - t) ** 3 * p0[0] +
    3 * (1 - t) ** 2 * t * p1[0] +
    3 * (1 - t) * t ** 2 * p2[0] +
    t ** 3 * p3[0];
  let [lo, hi] = [0, 1];
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (x(mid) < age) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/** de Casteljau: the arc cut at `t` into the life part and the stolen part. */
const split = (b: [P, P, P, P], t: number) => {
  const [a, c1, c2, z] = b;
  const ab = mix(a, c1, t),
    bc = mix(c1, c2, t),
    cd = mix(c2, z, t);
  const abc = mix(ab, bc, t),
    bcd = mix(bc, cd, t);
  const m = mix(abc, bcd, t);
  return {
    life: [a, ab, abc, m] as [P, P, P, P],
    stolen: [m, bcd, cd, z] as [P, P, P, P],
  };
};

// ---- One life ---------------------------------------------------------------

/** One victim: the life drawn, then a dot on the axis where it ended, then the
 *  stolen years drawn, then a dot where they would have ended. */
const victim = (d: GunDeath) => {
  const arc = arcOf(d);
  const { life, stolen } = split(arc, paramAt(arc, d.age));
  const s = d.age / d.potential; // the share of the arc that was lived
  const pen = { strokeWidth: 1, opacity: 0.5 };
  const dot = (age: number, fill: string) =>
    circle({
      x: datum(age),
      y: datum(0),
      r: 1.6,
      fill,
      opacity: 0.5,
    }).transition({
      enter: Animation.appear({ duration: 0 }),
    });
  return layer([
    bezier({ points: life, stroke: ORANGE, ...pen }).transition({
      enter: Animation.draw({ duration: s * drawTime(d.i), ease: "linear" }),
    }),
    dot(d.age, ORANGE),
    bezier({ points: stolen, stroke: GREY, ...pen }).transition({
      enter: Animation.draw({
        duration: (1 - s) * drawTime(d.i),
        ease: "linear",
      }),
    }),
    dot(d.potential, GREY),
  ]).transition({ enter: time.stagger({ spacing: 0 }) }); // one after another
};

// ---- The three acts ------------------------------------------------------------

/** The original's staging, as three acts played one after another:
 *  one life, then the next; a few lives 90 frames apart; then everyone, each
 *  starting 2500/N·4/ln(i + 10) frames after the one before, so the lives come
 *  faster and faster. */
const acts = [
  { spacing: 0 }, // lives 0 and 1
  { lag: 90 * F }, // lives 2 to 4
  // lives 5 on; wave w is life i = w + 5
  { lag: (w: number) => ((2500 / N) * 4 * F) / Math.log(w + 5 + 10) },
];
const actOf = (i: number) => (i < 2 ? 0 : i < 5 ? 1 : 2);

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(gunDeaths2013.map((d) => ({ ...d, act: actOf(d.i) })))
    .flow(time.stagger({ by: "act", spacing: 60 * F }))
    .mark((rows: (GunDeath & { act: number })[]) =>
      time.stagger(acts[rows[0].act], rows.map(victim))
    )
    .layer(
      bezier({
        points: [
          [0, 0],
          [36, 0],
          [72, 0],
          [108, 0],
        ],
        stroke: "#555",
      })
    )
    .layer(
      text({
        x: datum(0),
        y: datum(-2),
        text: "AGE 0",
        fontSize: 9,
        fill: "#888",
      })
    )
    .layer(
      text({
        x: datum(108),
        y: datum(-2),
        text: "108",
        fontSize: 9,
        fill: "#888",
      })
    )
    .render(container, { w: 880, h: 330, axes: false, ...clock });

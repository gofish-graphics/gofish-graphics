// R2D3, "A Visual Introduction to Machine Learning, Part 1" (Stephanie Yee
// and Tony Chu, 2015), http://www.r2d3.us/visual-intro-to-machine-learning-part-1/
//
// The same 492 homes, three encodings, one segue each:
//   1. a scatterplot: elevation (y) against price per square foot (x),
//      colored San Francisco (green) / New York (blue);
//   2. a stacked-dot histogram of elevation: each dot slides sideways into
//      its 10 m bin, the dots STAGGERED by their own elevation (Gemini's
//      "byElev"), lowest first;
//   3. the decision tree's first split at 73 m (240 ft): a threshold line
//      appears, then the dots fall into two piles, the homes above the line
//      and the homes at or below it.
//
// The piece is a `time.sequence` of three scenes that loops: the combinator
// for a timeline chain of scenes and gaps.
//
// PROTOTYPE (animation grammar proposal). Syntax not signed off. The dots
// match from scene to scene by the row each one draws (the same home), though
// each scene puts it under different operators (scatter, bin, pile); the
// threshold draws no rows, so it matches by its name. See
// src/animation/identity.ts.
import {
  Animation,
  chart,
  circle,
  Color,
  datum,
  field,
  layer,
  rect,
  scatter,
  stack,
  text,
  time,
} from "../../../src/lib";
import { r2d3Homes } from "../../../src/data/r2d3Homes";

export const SF = "#1f9e57";
export const NY = "#2f6fb8";
/** The split: 240 ft, in meters. */
export const THRESHOLD = 73;
const BIN = 10;
/** Dots per row of a pile in the split. */
const COLS = 50;
// PROTOTYPE SHORTCUT: the piles' rows are placed in METERS on the elevation
// axis, one row every PILE_ROW m, a spacing picked by eye to match a dot's
// pitch at this chart size. The honest spelling grows each pile away from
// the line in pixels (a `spread` of rows anchored at y = 73 m), which needs
// an anchor-at-a-data-value that the prototype's spread does not have.
const PILE_ROW = 6;

// ---- Data side: plain arithmetic on each row ---------------------------------

/** Each home with its elevation bin, and its row in the pile of its side of
 *  the split. NY first, then by elevation, so in a bin and in a pile the
 *  blue dots come first, as in R2D3. */
const sorted = [...r2d3Homes].sort(
  (a, b) => a.in_sf - b.in_sf || a.elevation - b.elevation
);
const rank = new Map<number, number>();
const count = { below: 0, above: 0 };
for (const d of sorted) {
  rank.set(d.id, count[d.elevation > THRESHOLD ? "above" : "below"]++);
}
export const homes = sorted.map((d) => {
  const above = d.elevation > THRESHOLD;
  const row = Math.floor(rank.get(d.id)! / COLS);
  // 10 m bins with an edge at the threshold (..., 63-73, 73-83, ...), so the
  // line falls between two rows of the histogram.
  const bin =
    Math.floor((d.elevation - THRESHOLD) / BIN) * BIN + THRESHOLD;
  return {
    ...d,
    bin,
    binMid: bin + BIN / 2,
    pileRow: `${above ? "above" : "below"} ${row}`,
    // Above the line the pile grows up from it; below, down from it.
    pileY: above
      ? THRESHOLD + 8 + row * PILE_ROW
      : THRESHOLD - 8 - row * PILE_ROW,
  };
});

// ---- The three encodings ------------------------------------------------------

const color = Color.palette({ SF, NY });
const dot = () => circle({ r: 2, fill: "city" });
/** Elevation is one measure wherever a keyframe places by it, so the
 *  keyframes share one elevation axis (keyframes share scales). */
const meters = (name: string) => field(name, "meters");

export const scatterplot = () =>
  chart(homes, { color })
    .flow(scatter({ by: "id", x: "price_per_sqft", y: meters("elevation") }))
    .mark(dot());

export const histogram = () =>
  chart(homes, { color })
    .flow(
      // Arriving here, the dots move one elevation at a time, lowest first.
      scatter({ by: "bin", y: meters("binMid") }).transition({
        update: time.stagger({ by: field("elevation").sort(), dwell: 0.6 }),
      }),
      stack({ by: "id", dir: "x", spacing: 0.6 })
    )
    .mark(dot());

export const split = () =>
  chart(homes, { color })
    .flow(
      scatter({ by: "pileRow", y: meters("pileY") }),
      stack({ by: "id", dir: "x", spacing: 0.6 })
    )
    .mark(dot());

/** The threshold: a rule at 73 m and its label. */
export const threshold = () =>
  layer([
    rect({ y: datum(THRESHOLD), w: 330, h: 1.5, fill: "#222" }),
    text({
      x: 336,
      y: datum(THRESHOLD),
      text: "240 ft (73 m)",
      fontSize: 11,
      fill: "#222",
    }),
  ]).name("threshold");

export type Hold = { playing?: boolean; at?: number };

// ---- The sequence -------------------------------------------------------------

/** One loop in ms: the three scenes and the three gaps, the last of them the
 *  wrap from the split back to the scatterplot. */
export const LOOP = 3000 + 2000 + 3000 + 1400 + 3000 + 1400;

/** Three scenes: the scatterplot, the histogram (its threshold built in 600
 *  ms into the scene), and the split, which wraps back into the
 *  scatterplot. A transition spans each gap; the dots match by the row each
 *  one draws. */
export const r2d3 = (container: HTMLElement, hold?: Hold) =>
  time
    .sequence({ gap: [2000, 1400, 1400], cyclic: true, ...hold }, [
      scatterplot().duration(3000),
      layer([
        histogram(),
        threshold().transition({ enter: Animation.fadeIn({ delay: 600 }) }),
      ]).duration(3000),
      layer([split(), threshold()]).duration(3000),
    ])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 560, h: 400 });

export default r2d3;

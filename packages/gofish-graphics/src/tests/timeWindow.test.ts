/**
 * Unit tests for the window a `time.sequence` shows (`src/timeWindow.ts`):
 * the keyframes' band rule, the trail a transition leaves behind, and the cut
 * of a line threaded through them. Run:
 * `tsx src/tests/timeWindow.test.ts` (wired into `pnpm test` as
 * `test:time-window`).
 *
 * The contract: with no history the band rule is exactly the step rule a
 * sequence has always played by, and a threaded line is cut by DATA time, so
 * the cut point inside a segment is at the segment's own parameter
 * `u = (T − t_i) / (t_{i+1} − t_i)`, whatever the segment's length on screen.
 */

import {
  keyframeOf,
  keyframeRule,
  markSequence,
  sequenceWindow,
  showingAt,
  trailRule,
  windowAt,
  windowPath,
  type Keyframe,
  type SequenceWindow,
} from "../timeWindow";
import { sourceIndex } from "../interpolate";
import {
  curve,
  lerpPoint,
  segment,
  type BezierCurve,
  type Path,
  type PathSegment,
  type Point,
} from "../path";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const nearPoint = (p: Point, q: Point) => near(p[0], q[0]) && near(p[1], q[1]);

/** A cubic evaluated at `u` by de Casteljau, independently of the cut. */
function bezierAt(c: BezierCurve, u: number): Point {
  const p01 = lerpPoint(c.start, c.control1, u);
  const p12 = lerpPoint(c.control1, c.control2, u);
  const p23 = lerpPoint(c.control2, c.end, u);
  return lerpPoint(lerpPoint(p01, p12, u), lerpPoint(p12, p23, u), u);
}
const startOf = (s: PathSegment): Point =>
  s.type === "line" ? s.points[0] : s.start;
const endOf = (s: PathSegment): Point =>
  s.type === "line" ? s.points[1] : s.end;

// A run of three keyframes whose two segments are very different lengths on
// screen (10 and 1000), so a cut by arc length and a cut by time disagree.
const knots = [2000, 2001, 2003];
const a: Point = [0, 0];
const b: Point = [10, 0];
const c: Point = [10, 1000];
const straight: Path = [segment(a, b), segment(b, c)];
const smooth: Path = [
  curve(a, [3, 5], [7, -5], b),
  curve(b, [20, 300], [0, 700], c),
];
/** A path cut into the pieces `windowPath` takes: one per knot interval. */
const pieces = (path: Path): Path[] => path.map((seg) => [seg]);

/** The keyframe `times[index]` of a sequence keeping `history` and parked at
 *  playhead `T`. */
const keyframeAt = (
  times: number[],
  index: number,
  T: number,
  history: number
): Keyframe => ({
  t: times[index],
  index,
  sequence: sequenceWindow(
    () => times,
    () => T,
    history
  ),
});

console.log("# the band rule: history 0 is the step rule");
{
  const bands = [1955, 1960, 1965, 1970];
  const playheads = [1900, 1955, 1957.5, 1960, 1964.99, 1965, 1970, 2100];
  const showing = (j: number, t: number, times = bands) =>
    keyframeRule(keyframeAt(times, j, t, 0))();
  const agree = playheads.every((t) =>
    bands.every(
      (_, j) => showing(j, t) === (j === sourceIndex(bands, t, "step"))
    )
  );
  ok("each playhead shows exactly the step rule's keyframe", agree);
  ok("the first band reaches back before the run", showing(0, 1900));
  ok("the last band runs on past the end", showing(3, 2100));
  ok("a lone keyframe owns all of time", showing(0, 0, [1955]));
}

console.log("# the cut: straight segments");
{
  const cut = windowPath(pieces(straight), knots, windowAt(2000.5, Infinity));
  ok("cuts inside the first segment", cut.length === 1);
  ok(
    "at the segment's own parameter (u = 0.5)",
    nearPoint(endOf(cut[0]), [5, 0]),
    JSON.stringify(cut)
  );
  const later = windowPath(pieces(straight), knots, windowAt(2002.5, Infinity));
  ok(
    "by data time, not arc length: 2002.5 is three quarters up the long segment",
    later.length === 2 && nearPoint(endOf(later[1]), [10, 750]),
    JSON.stringify(later)
  );
  ok(
    "the whole first segment is kept exactly",
    later[0].type === "line" &&
      later[0].points[0] === a &&
      later[0].points[1] === b
  );
}

console.log("# the cut: cubic segments");
{
  const cut = windowPath(pieces(smooth), knots, windowAt(2001.5, Infinity));
  const tail = cut[1] as BezierCurve;
  ok("keeps one piece per segment reached", cut.length === 2);
  ok(
    "the tip is the curve at u = 0.25 (de Casteljau)",
    nearPoint(tail.end, bezierAt(smooth[1] as BezierCurve, 0.25))
  );
  const s = 0.6;
  ok(
    "and the piece is the same curve, reparameterized onto [0, 0.25]",
    nearPoint(bezierAt(tail, s), bezierAt(smooth[1] as BezierCurve, 0.25 * s))
  );
}

console.log("# the cut: both ends");
{
  const within = windowPath(pieces(smooth), knots, windowAt(2002.5, 1));
  const piece = within[0] as BezierCurve;
  const original = smooth[1] as BezierCurve;
  ok("a window inside one segment is one piece", within.length === 1);
  ok("starting at u = 0.25", nearPoint(piece.start, bezierAt(original, 0.25)));
  ok("and ending at u = 0.75", nearPoint(piece.end, bezierAt(original, 0.75)));
  ok(
    "which is the curve between them",
    nearPoint(bezierAt(piece, 0.5), bezierAt(original, 0.5))
  );
  const across = windowPath(pieces(straight), knots, windowAt(2001.5, 1));
  ok(
    "a window across a knot cuts both segments",
    across.length === 2 &&
      nearPoint(startOf(across[0]), [5, 0]) &&
      nearPoint(endOf(across[0]), b) &&
      nearPoint(endOf(across[1]), [10, 250]),
    JSON.stringify(across)
  );
}

console.log("# the cut: edges of the run");
{
  ok(
    "history 0 is an instant, and draws nothing",
    windowPath(pieces(straight), knots, windowAt(2001.5, 0)).length === 0
  );
  const all = windowPath(pieces(smooth), knots, windowAt(2003, Infinity));
  ok(
    "Infinity at the last knot draws the whole path, unchanged",
    all.length === 2 && all[0] === smooth[0] && all[1] === smooth[1]
  );
  const onKnot = windowPath(pieces(straight), knots, windowAt(2001, Infinity));
  ok(
    "a cut exactly at a knot ends there, with no zero-length piece",
    onKnot.length === 1 && onKnot[0] === straight[0]
  );
  const fromKnot = windowPath(pieces(straight), knots, windowAt(2003, 2));
  ok(
    "and a window starting exactly at a knot starts there",
    fromKnot.length === 1 && fromKnot[0] === straight[1]
  );
  ok(
    "a playhead before the first knot draws nothing",
    windowPath(pieces(straight), knots, windowAt(1999, Infinity)).length === 0
  );
  ok(
    "a playhead on the first knot draws nothing (an instant of the run)",
    windowPath(pieces(straight), knots, windowAt(2000, Infinity)).length === 0
  );
  ok(
    "a playhead after the last knot keeps the whole run",
    JSON.stringify(
      windowPath(pieces(straight), knots, windowAt(2050, Infinity))
    ) === JSON.stringify(straight)
  );
  const trailing = windowPath(pieces(straight), knots, windowAt(2004, 2));
  ok(
    "and a finite window past the end keeps only what it still reaches",
    trailing.length === 1 &&
      nearPoint(startOf(trailing[0]), [10, 500]) &&
      nearPoint(endOf(trailing[0]), c),
    JSON.stringify(trailing)
  );
  ok(
    "until it has passed the run entirely",
    windowPath(pieces(straight), knots, windowAt(2010, 2)).length === 0
  );
}

console.log("# the keyframe record");
{
  const sequence: SequenceWindow = {
    keyframes: () => [1999, 2000, 2001],
    history: 0,
    showing: () => showingAt([1999, 2000, 2001], 2000, 0),
  };
  const frame = { parent: undefined };
  markSequence(frame, sequence);
  const group = { parent: frame as unknown, key: "2000" as unknown };
  const mark = { parent: { parent: group } };
  ok("a mark inside a keyframe finds it", keyframeOf(mark)?.t === 2000);
  ok("and its place in the sequence", keyframeOf(mark)?.index === 1);
  ok("and the sequence it belongs to", keyframeOf(mark)?.sequence === sequence);
  ok(
    "a node outside every keyframe finds none",
    keyframeOf({ parent: undefined }) === undefined
  );
  ok(
    "a key that is not one of the sequence's times makes no keyframe",
    keyframeOf({ parent: frame, key: "1998" }) === undefined
  );
  // A pass that wraps the keyframe moves its key onto the wrapper, which
  // takes the keyframe's place under the Frame.
  const wrapper = { parent: frame, key: "2000" };
  group.parent = wrapper;
  group.key = undefined;
  const beside = { parent: wrapper };
  ok(
    "a wrapper's key covers the keyframe and what is added beside it",
    keyframeOf(beside)?.t === 2000 && keyframeOf(mark)?.t === 2000
  );
}

console.log("# the trail rule, over a grid of playheads");
{
  // Keyframes five years apart, one of them after a ten-year gap, so the
  // bands are uneven.
  const times = [1955, 1960, 1965, 1975, 1980];
  const playheads = [
    1950, 1955, 1956, 1959.99, 1960, 1962.5, 1965, 1970, 1974.9, 1975, 1977,
    1980, 1985,
  ];
  const histories = [0, 0.5, 3, 5, 10, 17, Infinity];
  /** Which keyframes show at `T`, written out by hand from the rule on #903
   *  rather than through the rules under test. */
  const expected = (
    reading: "none" | "glide" | "step",
    T: number,
    h: number
  ): number[] =>
    times.filter((t, j) => {
      const start = j === 0 ? -Infinity : t;
      const end = j === times.length - 1 ? Infinity : times[j + 1];
      if (reading === "glide") return T - h <= t && t < T;
      const overlaps = start <= T && end > T - h;
      if (reading === "none") return overlaps;
      // A step keyframe's band overlaps the window but no longer holds the
      // playhead: its band is over, and its end is still inside the window.
      return overlaps && !(start <= T && T < end);
    });
  const shown = (
    reading: "none" | "glide" | "step",
    T: number,
    h: number
  ): number[] =>
    times.filter((_, j) => {
      const keyframe = keyframeAt(times, j, T, h);
      if (reading === "none") return keyframeRule(keyframe)();
      // No rule means the trail is always empty.
      const rule = trailRule(
        keyframe.sequence,
        keyframe.index,
        reading === "glide"
      );
      return rule !== undefined && rule();
    });
  for (const reading of ["none", "glide", "step"] as const) {
    const misses: string[] = [];
    for (const T of playheads) {
      for (const h of histories) {
        const [a, b] = [shown(reading, T, h), expected(reading, T, h)];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          misses.push(`T=${T} h=${h}: ${a} vs ${b}`);
        }
      }
    }
    ok(
      `${reading === "none" ? "no transition" : reading}: every playhead and history`,
      misses.length === 0,
      misses.slice(0, 3).join("; ")
    );
  }
  ok(
    "with no history, a transition shows no keyframe at all",
    playheads.every(
      (T) =>
        shown("glide", T, 0).length === 0 && shown("step", T, 0).length === 0
    )
  );
  ok(
    "a gliding trail leaves each keyframe the moment the mark moves off it",
    JSON.stringify(shown("glide", 1965, Infinity)) === "[1955,1960]" &&
      JSON.stringify(shown("glide", 1965.01, Infinity)) === "[1955,1960,1965]"
  );
  ok(
    "a jumping trail keeps each old keyframe one step longer",
    JSON.stringify(shown("glide", 1981, 10)) === "[1975,1980]" &&
      JSON.stringify(shown("step", 1981, 10)) === "[1965,1975]"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

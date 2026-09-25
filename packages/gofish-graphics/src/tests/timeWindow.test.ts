/**
 * Unit tests for when a `time.sequence`'s keyframes show
 * (`src/timeWindow.ts`): the keyframes' band rule, the window a
 * `time.history` widens it to, the lifetime of a mark made of parts, and the
 * cut of a line threaded through the keyframes. Run:
 * `tsx src/tests/timeWindow.test.ts` (wired into `pnpm test` as
 * `test:time-window`).
 *
 * The contract: with lifetime 0 the band rule is exactly the step rule a
 * sequence has always played by, and a threaded line is cut by DATA time, so
 * the cut point inside a segment is at the segment's own parameter
 * `u = (T − t_i) / (t_{i+1} − t_i)`, whatever the segment's length on screen.
 */

import {
  historiesIn,
  keyframeOf,
  lifetimeOf,
  lifetimeRule,
  markHistory,
  markSequence,
  sequenceWindow,
  showingAt,
  foldTime,
  unrollOrder,
  unrollRun,
  windowAt,
  type Cycle,
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

/** The keyframe `times[index]` of a sequence parked at playhead `T`. */
const keyframeAt = (times: number[], index: number, T: number): Keyframe => ({
  t: times[index],
  index,
  sequence: sequenceWindow(
    () => times,
    () => T
  ),
});

console.log("# the band rule: lifetime 0 is the step rule");
{
  const bands = [1955, 1960, 1965, 1970];
  const playheads = [1900, 1955, 1957.5, 1960, 1964.99, 1965, 1970, 2100];
  const showing = (j: number, t: number, times = bands) =>
    lifetimeRule(keyframeAt(times, j, t), 0)();
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
  const sequence: SequenceWindow = sequenceWindow(
    () => [1999, 2000, 2001],
    () => 2000
  );
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

console.log("# the history window, over a grid of playheads");
{
  // Keyframes five years apart, one of them after a ten-year gap, so the
  // bands are uneven.
  const times = [1955, 1960, 1965, 1975, 1980];
  const playheads = [
    1950, 1955, 1956, 1959.99, 1960, 1962.5, 1965, 1970, 1974.9, 1975, 1977,
    1980, 1985,
  ];
  const lasts = [0, 0.5, 3, 5, 10, 17, Infinity];
  /** Which keyframes show at `T` for lifetime `last`, written out by hand:
   *  every one whose band overlaps `[T − last, T]`. */
  const expected = (T: number, last: number): number[] =>
    times.filter((_, j) => {
      const start = j === 0 ? -Infinity : times[j];
      const end = j === times.length - 1 ? Infinity : times[j + 1];
      return start <= T && end > T - last;
    });
  const shown = (T: number, last: number): number[] =>
    times.filter((_, j) => lifetimeRule(keyframeAt(times, j, T), last)());
  const misses: string[] = [];
  for (const T of playheads) {
    for (const last of lasts) {
      const [a, b] = [shown(T, last), expected(T, last)];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        misses.push(`T=${T} last=${last}: ${a} vs ${b}`);
      }
    }
  }
  ok(
    "every playhead and lifetime: the bands the window overlaps",
    misses.length === 0,
    misses.slice(0, 3).join("; ")
  );
  ok(
    "a history includes the keyframe the playhead is in",
    playheads.every((T) =>
      lasts.every((last) =>
        shown(T, last).includes(times[sourceIndex(times, T, "step")])
      )
    )
  );
  ok(
    "Infinity keeps everything the playhead has reached",
    JSON.stringify(shown(1977, Infinity)) === "[1955,1960,1965,1975]"
  );
  // One sequence answers for several lifetimes at the same playhead.
  const sequence = sequenceWindow(
    () => times,
    () => 1977
  );
  ok(
    "one sequence, several lifetimes",
    JSON.stringify(sequence.showing(0).shown) ===
      "[false,false,false,true,false]" &&
      sequence.showing(Infinity).shown.slice(0, 4).every(Boolean) &&
      sequence.showing(0).shown[3]
  );
}

console.log("# lifetimes: the nearest time.history, and the union of parts");
{
  type N = { parent?: N; key?: unknown; children: N[] };
  const node = (children: N[] = []): N => {
    const n: N = { children };
    for (const c of children) c.parent = n;
    return n;
  };
  // frame > keyframe > layer([ history(10)[ dot ], head ])
  const dot = node();
  const trail = node([dot]);
  markHistory(trail, 10);
  const head = node();
  const both = node([trail, head]);
  const keyframe = node([both]);
  keyframe.key = "2000";
  const frame = node([keyframe]);
  markSequence(
    frame,
    sequenceWindow(
      () => [2000],
      () => 2000
    )
  );
  ok("a bare mark lives for its band", lifetimeOf(head) === 0);
  ok("a mark under a history lives as long as it says", lifetimeOf(dot) === 10);
  ok("the history itself", lifetimeOf(trail) === 10);
  ok(
    "a mark of parts lives as long as its longest-lived part",
    lifetimeOf(both) === 10 && lifetimeOf(keyframe) === 10
  );
  // A nearer history wins over one further up.
  const inner = node([node()]);
  markHistory(inner, 2);
  const outer = node([inner, node()]);
  markHistory(outer, Infinity);
  const other = node([outer]);
  other.key = "2000";
  other.parent = frame;
  ok(
    "the nearest history decides for the marks under it",
    lifetimeOf(inner.children[0]) === 2 &&
      lifetimeOf(outer.children[1]) === Infinity &&
      lifetimeOf(outer) === Infinity
  );
  ok(
    "the histories in a keyframe",
    historiesIn(keyframe).length === 1 && historiesIn(other).length === 2
  );
  // A history above the keyframe (outside the sequence) is not the keyframe's.
  const above = node([frame]);
  markHistory(above, 5);
  ok(
    "a history outside the keyframe does not reach into it",
    lifetimeOf(head) === 0
  );
  ok(
    "a ref lives as long as the mark it refers to",
    lifetimeOf({ targetNode: dot }) === 10
  );
}

console.log("# one rule per keyframe and lifetime");
{
  let T = 2000;
  const sequence = sequenceWindow(
    () => [1999, 2000, 2001],
    () => T
  );
  const rule = sequence.rule(1, 0);
  ok(
    "every mark of a keyframe with one lifetime shares its rule",
    sequence.rule(1, 0) === rule &&
      sequence.rule(1, 5) !== rule &&
      sequence.rule(0, 0) !== rule
  );
  const shownThen = rule();
  T = 2001;
  ok("and the rule reads the playhead", shownThen && !rule());
  ok(
    "a keyframe's place, and none for a time that is not one",
    sequence.indexOf(2001) === 2 && sequence.indexOf(2002) === -1
  );
}

console.log("# a cyclic time axis");
{
  // Days 1 to 10 of a ten-day cycle.
  const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const cycle: Cycle = { origin: 1, period: 10 };
  ok(
    "a playhead folds into the one cycle",
    foldTime(11, cycle) === 1 &&
      foldTime(0.5, cycle) === 10.5 &&
      foldTime(23, cycle) === 3 &&
      foldTime(7, undefined) === 7
  );
  ok(
    "the window reaches back at most one period",
    JSON.stringify(windowAt(13, 4, cycle)) === '{"from":-1,"to":3}' &&
      JSON.stringify(windowAt(3, Infinity, cycle)) === '{"from":-7,"to":3}'
  );
  const run = unrollRun([1, 4, 8], cycle);
  ok(
    "a run unrolls over the cycle before and the start of the cycle after",
    JSON.stringify(run.knots) === "[-9,-6,-2,1,4,8,11,14]" &&
      JSON.stringify(run.index) === "[0,1,2,0,1,2,0,1]"
  );
  ok(
    "a run on an axis that does not repeat is itself",
    JSON.stringify(unrollRun([1, 4, 8], undefined).knots) === "[1,4,8]"
  );
  // Marks in any order: which one stands at each point of the run.
  const marks = unrollOrder([8, 1, 4], cycle);
  ok(
    "a run of marks sorts them in time and says which mark stands where",
    JSON.stringify(marks.knots) === "[-9,-6,-2,1,4,8,11,14]" &&
      JSON.stringify(marks.operand) === "[1,2,0,1,2,0,1,2]"
  );
  ok(
    "and backward in time is the same run",
    JSON.stringify(unrollOrder([8, 4, 1], undefined)) ===
      '{"knots":[1,4,8],"operand":[2,1,0]}'
  );
  const shownAt = (T: number, last: number): number[] =>
    days.filter((_, i) => showingAt(days, T, last, cycle).shown[i]);
  ok(
    "the last keyframe's band runs up to the next cycle's first",
    JSON.stringify(shownAt(10.5, 0)) === "[10]"
  );
  ok(
    "a history across the seam: day 2 with the last 3 days is 9, 10, 1, 2",
    JSON.stringify(shownAt(2, 3)) === "[1,2,9,10]"
  );
  ok(
    "a history inside the cycle is as before",
    JSON.stringify(shownAt(6, 2)) === "[4,5,6]"
  );
  ok(
    "a history longer than the cycle keeps every keyframe",
    shownAt(3, Infinity).length === 10 && shownAt(3, 25).length === 10
  );
  ok(
    "a playhead in a later cycle reads as the same day",
    JSON.stringify(shownAt(22, 3)) === JSON.stringify(shownAt(2, 3))
  );
  // A line through three knots of a cycle, unrolled: the window cuts the
  // seam piece from the last knot to the first.
  const a: Point = [0, 0];
  const b: Point = [10, 0];
  const c: Point = [10, 10];
  const loop = unrollRun([1, 4, 8], cycle);
  const points = loop.index.map((i) => [a, b, c][i]);
  const steps = points.slice(1).map((p, i) => [segment(points[i], p)]);
  const drawn = windowPath(steps, loop.knots, windowAt(2.5, 2, cycle));
  ok(
    "a threaded line across the seam runs from the last knot to the first",
    drawn.length === 2 &&
      nearPoint(startOf(drawn[0]), lerpPoint(c, a, (0.5 - -2) / 3)) &&
      nearPoint(endOf(drawn[0]), a) &&
      nearPoint(endOf(drawn[1]), lerpPoint(a, b, 0.5)),
    JSON.stringify(drawn)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

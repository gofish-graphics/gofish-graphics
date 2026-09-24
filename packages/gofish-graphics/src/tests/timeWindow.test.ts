/**
 * Unit tests for the window a `time.sequence` shows (`src/timeWindow.ts`):
 * the keyframes' band rule and the cut of a line threaded through them. Run:
 * `tsx src/tests/timeWindow.test.ts` (wired into `pnpm test` as
 * `test:time-window`).
 *
 * The contract: with no history the band rule is exactly the step rule a
 * sequence has always played by, and a threaded line is cut by DATA time, so
 * the cut point inside a segment is at the segment's own parameter
 * `u = (T − t_i) / (t_{i+1} − t_i)`, whatever the segment's length on screen.
 */

import {
  bandInWindow,
  keyframeBand,
  keyframeOf,
  markKeyframe,
  windowAt,
  windowPath,
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

console.log("# the band rule: history 0 is the step rule");
{
  const bands = [1955, 1960, 1965, 1970];
  const playheads = [1900, 1955, 1957.5, 1960, 1964.99, 1965, 1970, 2100];
  const agree = playheads.every((t) =>
    bands.every(
      (_, j) =>
        bandInWindow(keyframeBand(bands, j), windowAt(t, 0)) ===
        (j === sourceIndex(bands, t, "step"))
    )
  );
  ok("each playhead shows exactly the step rule's keyframe", agree);
  ok(
    "the first band reaches back before the run",
    bandInWindow(keyframeBand(bands, 0), windowAt(1900, 0))
  );
  ok(
    "the last band runs on past the end",
    bandInWindow(keyframeBand(bands, 3), windowAt(2100, 0))
  );
  ok(
    "a lone keyframe owns all of time",
    bandInWindow(keyframeBand([1955], 0), windowAt(0, 0))
  );
}

console.log("# the band rule: history widens the window");
{
  const bands = [1955, 1960, 1965, 1970];
  const shown = (t: number, h: number) =>
    bands.filter((_, j) =>
      bandInWindow(keyframeBand(bands, j), windowAt(t, h))
    );
  ok(
    "Infinity shows every keyframe reached",
    JSON.stringify(shown(1966, Infinity)) === "[1955,1960,1965]"
  );
  ok(
    "a finite history shows every band the window reaches",
    JSON.stringify(shown(1966, 3)) === "[1960,1965]"
  );
  ok(
    "a band the window only touches at its open end is not shown",
    JSON.stringify(shown(1970, 5)) === "[1965,1970]"
  );
}

console.log("# the cut: straight segments");
{
  const cut = windowPath(straight, knots, windowAt(2000.5, Infinity));
  ok("cuts inside the first segment", cut.length === 1);
  ok(
    "at the segment's own parameter (u = 0.5)",
    nearPoint(endOf(cut[0]), [5, 0]),
    JSON.stringify(cut)
  );
  const later = windowPath(straight, knots, windowAt(2002.5, Infinity));
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
  const cut = windowPath(smooth, knots, windowAt(2001.5, Infinity));
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
  const within = windowPath(smooth, knots, windowAt(2002.5, 1));
  const piece = within[0] as BezierCurve;
  const original = smooth[1] as BezierCurve;
  ok("a window inside one segment is one piece", within.length === 1);
  ok("starting at u = 0.25", nearPoint(piece.start, bezierAt(original, 0.25)));
  ok("and ending at u = 0.75", nearPoint(piece.end, bezierAt(original, 0.75)));
  ok(
    "which is the curve between them",
    nearPoint(bezierAt(piece, 0.5), bezierAt(original, 0.5))
  );
  const across = windowPath(straight, knots, windowAt(2001.5, 1));
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
    windowPath(straight, knots, windowAt(2001.5, 0)).length === 0
  );
  const all = windowPath(smooth, knots, windowAt(2003, Infinity));
  ok(
    "Infinity at the last knot draws the whole path, unchanged",
    all.length === 2 && all[0] === smooth[0] && all[1] === smooth[1]
  );
  const onKnot = windowPath(straight, knots, windowAt(2001, Infinity));
  ok(
    "a cut exactly at a knot ends there, with no zero-length piece",
    onKnot.length === 1 && onKnot[0] === straight[0]
  );
  const fromKnot = windowPath(straight, knots, windowAt(2003, 2));
  ok(
    "and a window starting exactly at a knot starts there",
    fromKnot.length === 1 && fromKnot[0] === straight[1]
  );
  ok(
    "a playhead before the first knot draws nothing",
    windowPath(straight, knots, windowAt(1999, Infinity)).length === 0
  );
  ok(
    "a playhead on the first knot draws nothing (an instant of the run)",
    windowPath(straight, knots, windowAt(2000, Infinity)).length === 0
  );
  ok(
    "a playhead after the last knot keeps the whole run",
    JSON.stringify(windowPath(straight, knots, windowAt(2050, Infinity))) ===
      JSON.stringify(straight)
  );
  const trailing = windowPath(straight, knots, windowAt(2004, 2));
  ok(
    "and a finite window past the end keeps only what it still reaches",
    trailing.length === 1 &&
      nearPoint(startOf(trailing[0]), [10, 500]) &&
      nearPoint(endOf(trailing[0]), c),
    JSON.stringify(trailing)
  );
  ok(
    "until it has passed the run entirely",
    windowPath(straight, knots, windowAt(2010, 2)).length === 0
  );
}

console.log("# the keyframe record");
{
  const sequence: SequenceWindow = {
    history: 0,
    window: () => windowAt(2000, 0),
  };
  const group = { parent: undefined };
  const mark = { parent: { parent: group } };
  markKeyframe(group, { t: 2000, band: [-Infinity, 2001], sequence });
  ok("a mark inside a keyframe finds it", keyframeOf(mark)?.t === 2000);
  ok("and the sequence it belongs to", keyframeOf(mark)?.sequence === sequence);
  ok(
    "a node outside every keyframe finds none",
    keyframeOf({ parent: undefined }) === undefined
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

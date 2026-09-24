/**
 * The window of time a `time.sequence` shows, and the two things that read it.
 *
 * A sequence gives each keyframe a BAND of time: keyframe `i` owns
 * `[t_i, t_{i+1})`, the first band also reaches back before the run (a
 * playhead before the first keyframe holds it) and the last band runs on past
 * the end. A sequence with `history: h` shows, at playhead `T`, the window
 * `W(T) = [T − h, T]`. At `h = 0` the window is the instant `T`, and the one
 * keyframe whose band contains it is the one shown. At `h = Infinity` it is
 * everything up to `T`, which is Animated Vega-Lite's `lte` predicate.
 *
 * Two readers, one window. A KEYFRAME shows while its band overlaps the
 * window. A `line` THREADED through the keyframes (its knots are keyframes of
 * the sequence, so it runs along the time tier) draws only the part of itself
 * that lies inside the window, cut at the exact point in DATA time: knot `i`
 * sits at its keyframe's time `t_i`, and inside a segment time moves linearly
 * with the segment's own parameter. So the tip of a line drawn up to the
 * playhead is where a `time.transition()` dot would be at the same moment.
 * Arc length would pace the drawing by distance on screen instead, and the
 * distance one year covers can differ many times over from one year to the
 * next.
 *
 * Both reads happen at PAINT time, like every read of the playhead. Layout
 * places every keyframe and gives a threaded line the box of its whole run, so
 * nothing above them sees the window move.
 */
import {
  type Path,
  type PathSegment,
  lerpPoint,
  segment,
  subdivideCurve1,
} from "./path";

/** A stretch of time, closed at both ends, in the sequence field's units. */
export type TimeWindow = { from: number; to: number };

/** The window a sequence keeping `history` shows at playhead `t`:
 *  `[t − history, t]`. The one definition of it, which the keyframes'
 *  visibility and a threaded line's cut both go through. */
export function windowAt(t: number, history: number): TimeWindow {
  return { from: t - history, to: t };
}

/** The band keyframe `j` owns among `keyframes` (sorted, distinct):
 *  `[t_j, t_{j+1})`, with the first band open toward the past and the last
 *  toward the future. */
export function keyframeBand(keyframes: number[], j: number): [number, number] {
  return [
    j === 0 ? -Infinity : keyframes[j],
    j === keyframes.length - 1 ? Infinity : keyframes[j + 1],
  ];
}

/** Whether the band `[start, end)` overlaps a window. When the window is an
 *  instant `t` this is `start <= t < end`: the band contains the playhead,
 *  which is the step rule a sequence with no history plays by. */
export function bandInWindow(
  [start, end]: [number, number],
  { from, to }: TimeWindow
): boolean {
  return start <= to && end > from;
}

/**
 * The part of a threaded path that lies inside a window, cut by data time.
 *
 * `path` has exactly one segment per knot interval: segment `i` runs from knot
 * `i` to knot `i + 1`, as a straight line or as one cubic of a Catmull-Rom
 * chain. `knots` are the knots' times, strictly increasing. A point at local
 * parameter `u` of segment `i` sits at time `t_i + u·(t_{i+1} − t_i)`, so a
 * segment the window's edge falls inside is cut at that edge's `u`: a line by
 * interpolating its endpoints, a cubic by de Casteljau. A window that meets
 * the run in a single instant, or not at all, draws nothing.
 */
export function windowPath(
  path: Path,
  knots: number[],
  window: TimeWindow
): Path {
  const from = Math.max(window.from, knots[0]);
  const to = Math.min(window.to, knots[knots.length - 1]);
  if (!(from < to)) return [];
  const out: Path = [];
  for (let i = 0; i < path.length; i++) {
    const [a, b] = [knots[i], knots[i + 1]];
    if (b <= from || a >= to) continue;
    out.push(
      cutSegment(
        path[i],
        a < from ? (from - a) / (b - a) : 0,
        b > to ? (to - a) / (b - a) : 1
      )
    );
  }
  return out;
}

/** The piece of a segment between local parameters `u0 < u1`. An end the cut
 *  does not move is kept exactly as it was, so a whole segment comes back
 *  unchanged. */
function cutSegment(seg: PathSegment, u0: number, u1: number): PathSegment {
  if (u0 === 0 && u1 === 1) return seg;
  if (seg.type === "line") {
    const [p, q] = seg.points;
    return segment(
      u0 === 0 ? p : lerpPoint(p, q, u0),
      u1 === 1 ? q : lerpPoint(p, q, u1)
    );
  }
  const head = u1 === 1 ? seg : subdivideCurve1(seg, u1)[0];
  return u0 === 0 ? head : subdivideCurve1(head, u0 / u1)[1];
}

/** What one sequence tells its keyframes: how much history it keeps, and the
 *  window it is showing right now (a paint-time read of its clock). There is
 *  one per `time.sequence(...)` call, so two keyframes belong to the same
 *  sequence exactly when they share it. */
export type SequenceWindow = { history: number; window: () => TimeWindow };

/** A keyframe of a sequence: its time value, the band of time it owns, and
 *  the sequence it belongs to. */
export type Keyframe = {
  t: number;
  band: [number, number];
  sequence: SequenceWindow;
};

/** Each keyframe group node's record, set by the sequence that laid it out. A
 *  side table rather than a field, so a node carries nothing it does not
 *  need. */
const keyframes = new WeakMap<object, Keyframe>();

/** Record that `node` is a keyframe of a sequence. */
export function markKeyframe(node: object, keyframe: Keyframe): void {
  keyframes.set(node, keyframe);
}

/** The keyframe `node` is part of: its own record, or its nearest
 *  ancestor's. A keyframe is a group, and the marks that draw it sit inside
 *  it. */
export function keyframeOf(
  node: { parent?: unknown } | undefined
): Keyframe | undefined {
  for (let n = node; n; n = n.parent as { parent?: unknown } | undefined) {
    const keyframe = keyframes.get(n);
    if (keyframe !== undefined) return keyframe;
  }
  return undefined;
}

/** Whether a keyframe is showing right now: its band overlaps the window its
 *  sequence is showing. Read at paint. */
export function keyframeShowing(keyframe: Keyframe): boolean {
  return bandInWindow(keyframe.band, keyframe.sequence.window());
}

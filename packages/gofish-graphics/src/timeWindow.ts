/**
 * The window of time a `time.sequence` shows, and the things that read it.
 *
 * A sequence gives each keyframe a BAND of time: keyframe `i` owns
 * `[t_i, t_{i+1})`, the first band also reaches back before the run (a
 * playhead before the first keyframe holds it) and the last band runs on past
 * the end. A sequence with `history: h` shows, at playhead `T`, the window
 * `W(T) = [T − h, T]`. At `h = 0` the window is the instant `T`, and the one
 * keyframe whose band contains it is the one shown. At `h = Infinity` it is
 * everything up to `T`, which is Animated Vega-Lite's `lte` predicate.
 *
 * Three readers, one window:
 *
 * - A KEYFRAME shows while its band overlaps the window (`keyframeRule`).
 * - A keyframe whose mark a `time.transition()` moves shows only as part of
 *   the trail the moving mark leaves behind (`trailRule`).
 * - A `line` THREADED through the keyframes (its knots are keyframes of the
 *   sequence, so it runs along the time tier) draws only the part of itself
 *   that lies inside the window, cut at the exact point in DATA time: knot `i`
 *   sits at its keyframe's time `t_i`, and inside a segment time moves
 *   linearly with the segment's own parameter (`windowPath`). So the tip of a
 *   line drawn up to the playhead is where a `time.transition()` dot would be
 *   at the same moment. Arc length would pace the drawing by distance on
 *   screen instead, and the distance one year covers can differ many times
 *   over from one year to the next.
 *
 * Every read happens at PAINT time, like every read of the playhead, and a
 * sequence works out what it shows once per playhead value (`showingAt`).
 * Layout places every keyframe and gives a threaded line the box of its whole
 * run, so nothing above them sees the window move.
 */
import { locate, sourceIndex } from "./interpolate";
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
 *  `[t − history, t]`. The one definition of it, which every reader of a
 *  sequence goes through (`showingAt`). */
export function windowAt(t: number, history: number): TimeWindow {
  return { from: t - history, to: t };
}

/** What a sequence shows at one playhead: its window, and the first and last
 *  of its keyframes whose bands the window overlaps. */
export type Showing = { window: TimeWindow; first: number; last: number };

/**
 * What a sequence with these keyframes (sorted, distinct) shows at playhead
 * `t`. The bands the window overlaps are the ones from the band holding its
 * start to the band holding its end, and the band holding a moment is the
 * keyframe the step rule reads there (`sourceIndex`): the last keyframe at or
 * before it, or the first when it is before the run.
 */
export function showingAt(
  keyframes: number[],
  t: number,
  history: number
): Showing {
  const window = windowAt(t, history);
  return {
    window,
    first: sourceIndex(keyframes, window.from, "step"),
    last: sourceIndex(keyframes, window.to, "step"),
  };
}

/**
 * The part of a threaded run that lies inside a window, cut by data time.
 *
 * `pieces[i]` is the step from knot `i` to knot `i + 1`, drawn as ONE straight
 * or cubic segment (the caller checks that), and `knots` are the knots' times,
 * strictly increasing. A point at local parameter `u` of piece `i` sits at
 * time `t_i + u·(t_{i+1} − t_i)`, so a piece the window's edge falls inside is
 * cut at that edge's `u`: a line by interpolating its endpoints, a cubic by de
 * Casteljau. A window that meets the run in a single instant, or not at all,
 * draws nothing, and a window ending exactly on a knot ends with the piece
 * before it.
 */
export function windowPath(
  pieces: Path[],
  knots: number[],
  window: TimeWindow
): Path {
  const from = Math.max(window.from, knots[0]);
  const to = Math.min(window.to, knots[knots.length - 1]);
  if (!(from < to)) return [];
  const start = locate(knots, from);
  const end = locate(knots, to);
  const last = end.u === 0 ? end.i - 1 : end.i;
  const out: Path = [];
  for (let i = start.i; i <= last; i++) {
    out.push(
      cutSegment(
        pieces[i][0],
        i === start.i ? start.u : 0,
        i === end.i ? end.u : 1
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

/** What a run of keyframes shows on a clock: their times (sorted, distinct),
 *  how much history it keeps, and what it is showing right now (a paint-time
 *  read of the clock). A sequence has one (`time.sequence(...)`), so two
 *  keyframes belong to the same sequence exactly when they share it, and a
 *  transition builds one for its trail on its own clock and knots. */
export type SequenceWindow = {
  keyframes: () => number[];
  history: number;
  showing: () => Showing;
};

/** The window of these keyframes on `clock`, keeping `history`. What it shows
 *  is worked out once per playhead value and kept until the clock moves (or
 *  the keyframes change); the clock itself is read on every call, so a
 *  paint-time read still registers it. */
export function sequenceWindow(
  keyframes: () => number[],
  clock: () => number,
  history: number
): SequenceWindow {
  let last: { t: number; keyframes: number[]; showing: Showing } | undefined;
  return {
    keyframes,
    history,
    showing: () => {
      const t = clock();
      const times = keyframes();
      if (last === undefined || last.t !== t || last.keyframes !== times) {
        last = { t, keyframes: times, showing: showingAt(times, t, history) };
      }
      return last.showing;
    },
  };
}

/** A keyframe of a sequence: its time, its place among the sequence's
 *  keyframes, and the sequence. */
export type Keyframe = { t: number; index: number; sequence: SequenceWindow };

/** Each sequence's record, on the Frame it lays its keyframes out in. */
const sequences = new WeakMap<object, SequenceWindow>();

/** Record that `frame` is the Frame a sequence lays its keyframes out in. */
export function markSequence(frame: object, sequence: SequenceWindow): void {
  sequences.set(frame, sequence);
}

type TreeNode = { parent?: unknown; key?: unknown };

/**
 * The keyframe `node` is part of. A sequence lays its keyframes out as the
 * children of one Frame, each keyed by its time, so this walks up to the node
 * whose parent is a sequence's Frame and reads that node's key. A pass that
 * wraps a keyframe in a new node gives the wrapper the keyframe's key
 * (`wrapPreservingIdentity`), so what the pass adds beside the keyframe, e.g.
 * its label texts, is part of the keyframe too. A key the sequence could not
 * read as one of its keyframes' times makes no keyframe.
 */
export function keyframeOf(node: TreeNode | undefined): Keyframe | undefined {
  let n = node;
  while (n !== undefined) {
    const parent = n.parent as TreeNode | undefined;
    const sequence = parent === undefined ? undefined : sequences.get(parent);
    if (sequence !== undefined) {
      const t = Number(n.key);
      const index = sequence.keyframes().indexOf(t);
      return index < 0 ? undefined : { t, index, sequence };
    }
    n = parent;
  }
  return undefined;
}

/** When a keyframe shows: while its band overlaps the window its sequence is
 *  showing. Read at paint; captures only the keyframe. */
export function keyframeRule(keyframe: Keyframe): () => boolean {
  const { index, sequence } = keyframe;
  return () => {
    const { first, last } = sequence.showing();
    return first <= index && index <= last;
  };
}

/**
 * When a keyframe whose mark a `time.transition()` moves shows: only as part
 * of the trail the moving mark leaves behind (#903).
 *
 * The span of time the keyframe covers depends on the transition's curve. A
 * gliding curve (`glides`: every curve but `"step"`) covers the time between
 * two keyframes with the moving mark, so the keyframe covers only its own
 * moment `t_i`: the mark leaves the keyframe behind the moment it moves off
 * it, and the trail has no gap behind the moving mark. Under `"step"` the
 * moving mark holds the keyframe's value for its whole band, so the keyframe
 * covers its band. The keyframe shows while its span overlaps the window,
 * except while its span contains the playhead, because the moving mark stands
 * in for it then. So a gliding keyframe shows while `T − h <= t_i < T`, and a
 * step keyframe shows once its band is over and until the window has left it
 * behind, which keeps each old keyframe one step longer than a gliding trail.
 *
 * The trail is read on the TRANSITION's own playhead and knots, so it cannot
 * disagree with the moving mark: `trail` is the window of the transition's
 * run (`index` is the keyframe's place in it), on the transition's clock,
 * keeping the history of the sequence the keyframes belong to.
 *
 * Undefined when the trail is always empty, which is known before anything is
 * painted: keyframes that belong to no sequence have no history to show
 * (`trail` is undefined), and with no history the window is the playhead
 * alone, so the only keyframe whose span it can reach is the one the moving
 * mark stands in for. A transition then draws the moving mark alone.
 */
export function trailRule(
  trail: SequenceWindow | undefined,
  index: number,
  glides: boolean
): (() => boolean) | undefined {
  if (trail === undefined || trail.history === 0) return undefined;
  const showing = trail.showing;
  const t = trail.keyframes()[index];
  if (glides) {
    return () => {
      const { window } = showing();
      return window.from <= t && t < window.to;
    };
  }
  return () => {
    const { first, last } = showing();
    return first <= index && index < last;
  };
}

/**
 * When the keyframes of a `time.sequence` show, and the things that read it.
 *
 * A sequence gives each keyframe a BAND of time: keyframe `i` owns
 * `[t_i, t_{i+1})`, the first band also reaches back before the run (a
 * playhead before the first keyframe holds it) and the last band runs on past
 * the end. A keyframe shows while its band holds the playhead `T`: one
 * keyframe at a time.
 *
 * `time.history({ last })` widens that for the marks it wraps. At playhead `T`
 * it looks at the window `W(T) = [T − last, T]`, and a mark it wraps shows
 * while its keyframe's band overlaps the window. At `last = 0` the window is
 * the instant `T`, which is the band rule again. At `last = Infinity` it is
 * everything up to `T`, which is Animated Vega-Lite's `lte` predicate. So a
 * mark's LIFETIME is a number, the `last` of the nearest `time.history` above
 * it, or 0 with none, and every rule here reads a lifetime through the same
 * window (`windowAt`).
 *
 * Three readers, one window:
 *
 * - A KEYFRAME's marks show while its band overlaps the window of their
 *   lifetime (`lifetimeRule`).
 * - A `line` THREADED through the keyframes (its knots are keyframes of the
 *   sequence, so it runs along the time tier) draws only the part of itself
 *   that lies inside the window of the lifetime of the marks it connects, cut
 *   at the exact point in DATA time: knot `i` sits at its keyframe's time
 *   `t_i`, and inside a segment time moves linearly with the segment's own
 *   parameter (`windowPath`). So the tip of a line drawn up to the playhead is
 *   where a moving mark would be at the same moment. Arc length would pace the
 *   drawing by distance on screen instead, and the distance one year covers
 *   can differ many times over from one year to the next.
 * - A mark's lifetime, for the line, is the union of the lifetimes of the
 *   marks it is made of (`lifetimeOf`), the way its box is the union of their
 *   boxes.
 *
 * The time axis may be a CYCLE (`time.sequence({ cyclic })`): time repeats
 * every period. Two things here are all that knows it, and every reader goes
 * through them. `windowAt` folds the playhead into one cycle and measures the
 * distance back from it, and `unrollRun` lays a run of times out over the
 * cycle before, its own cycle and the start of the next. The window is read
 * on the unrolled run, so a keyframe's band, a trail, a threaded line and a
 * moving mark all cross the seam from the last keyframe to the first the way
 * they cross any other step. On an axis that does not repeat both are the
 * identity.
 *
 * Every read happens at PAINT time, like every read of the playhead, and a
 * sequence works out what it shows once per playhead value and lifetime
 * (`SequenceWindow.showing`). Layout places every keyframe and gives a
 * threaded line the box of its whole run, so nothing above them sees the
 * window move.
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

/** A cyclic time axis (`time.sequence({ cyclic })`): time repeats every
 *  `period`, one cycle starting at `origin`, the first keyframe. */
export type Cycle = { origin: number; period: number };

/** Time `t` in the one cycle that starts at the first keyframe: `t` itself on
 *  an axis that does not repeat. */
export function foldTime(t: number, cycle: Cycle | undefined): number {
  if (cycle === undefined) return t;
  const { origin, period } = cycle;
  return origin + ((((t - origin) % period) + period) % period);
}

/** The window a mark with lifetime `last` looks at, at playhead `t`:
 *  `[t − last, t]`. On a cyclic axis the playhead is folded into one cycle
 *  and the window reaches back at most one period, so it is measured on the
 *  run unrolled one period back (`unrollRun`). The one place a distance back
 *  in time from the playhead is measured, which every reader goes through. */
export function windowAt(t: number, last: number, cycle?: Cycle): TimeWindow {
  if (cycle === undefined) return { from: t - last, to: t };
  const to = foldTime(t, cycle);
  return { from: to - Math.min(last, cycle.period), to };
}

/**
 * A run of times (sorted, distinct) laid out along the time axis: the run
 * itself on an axis that does not repeat, and on a cyclic one the run
 * unrolled over the cycle before it, its own cycle, and the first two times
 * of the cycle after it. That covers every window (`windowAt`) and every
 * playhead folded into one cycle, gives the step from the last time back to
 * the first (the seam) its own piece, and gives a smooth curve through the
 * run neighbors on both sides of the seam. `index[k]` is the run position
 * `knots[k]` repeats.
 */
export function unrollRun(
  times: number[],
  cycle: Cycle | undefined
): { knots: number[]; index: number[] } {
  const n = times.length;
  const own = times.map((_, i) => i);
  if (cycle === undefined || n === 0) return { knots: times, index: own };
  const { period } = cycle;
  const after = own.slice(0, Math.min(2, n));
  return {
    knots: [
      ...times.map((t) => t - period),
      ...times,
      ...after.map((i) => times[i] + period),
    ],
    index: [...own, ...own, ...after],
  };
}

/** What a sequence shows at one playhead, for one lifetime: the window, and
 *  for each keyframe whether its band overlaps the window. */
export type Showing = { window: TimeWindow; shown: boolean[] };

/**
 * What a sequence with these keyframes (sorted, distinct) shows at playhead
 * `t`, for marks with lifetime `last`. The bands the window overlaps are the
 * ones from the band holding its start to the band holding its end, and the
 * band holding a moment is the keyframe the step rule reads there
 * (`sourceIndex`): the last keyframe at or before it, or the first when it is
 * before the run. On a cyclic axis the bands are read on the unrolled run, so
 * the last keyframe's band runs up to the next cycle's first keyframe, and a
 * window that reaches back past the first keyframe reaches the end of the
 * cycle before.
 */
export function showingAt(
  keyframes: number[],
  t: number,
  last: number,
  cycle?: Cycle
): Showing {
  const window = windowAt(t, last, cycle);
  const run = unrollRun(keyframes, cycle);
  const shown = keyframes.map(() => false);
  const to = sourceIndex(run.knots, window.to, "step");
  for (let k = sourceIndex(run.knots, window.from, "step"); k <= to; k++) {
    shown[run.index[k]] = true;
  }
  return { window, shown };
}

/** Whether keyframe `index` is among the ones `showing` shows. */
export function shows(showing: Showing, index: number): boolean {
  return showing.shown[index];
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

/** A run of keyframes on a clock: their times (sorted, distinct), the cycle
 *  of the time axis if it repeats, and what it is showing right now for a
 *  lifetime (a paint-time read of the clock). A sequence has one
 *  (`time.sequence(...)`), so two keyframes belong to the same sequence
 *  exactly when they share it. */
export type SequenceWindow = {
  keyframes: () => number[];
  cycle: () => Cycle | undefined;
  showing: (last: number) => Showing;
};

/** The window of these keyframes on `clock`. What it shows is worked out
 *  once per playhead value and lifetime, and kept until the clock moves (or
 *  the keyframes change); the clock itself is read on every call, so a
 *  paint-time read still registers it. */
export function sequenceWindow(
  keyframes: () => number[],
  clock: () => number,
  cycle: () => Cycle | undefined = () => undefined
): SequenceWindow {
  let t: number | undefined;
  let times: number[] | undefined;
  const cache = new Map<number, Showing>();
  return {
    keyframes,
    cycle,
    showing: (last) => {
      const now = clock();
      const current = keyframes();
      if (now !== t || current !== times) {
        t = now;
        times = current;
        cache.clear();
      }
      let showing = cache.get(last);
      if (showing === undefined) {
        showing = showingAt(current, now, last, cycle());
        cache.set(last, showing);
      }
      return showing;
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

type TreeNode = { parent?: unknown; key?: unknown; children?: unknown[] };

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

/** The node a `time.history` built, with its `last`. */
const histories = new WeakMap<object, number>();

/** Record that `node` is a `time.history({ last })`. */
export function markHistory(node: object, last: number): void {
  histories.set(node, last);
}

/** The `last` of a `time.history` node, or undefined for any other node. */
export function historyOf(node: object): number | undefined {
  return histories.get(node);
}

/** When the marks of a keyframe with lifetime `last` show: while the
 *  keyframe's band overlaps the window of that lifetime. Read at paint;
 *  captures only the keyframe. */
export function lifetimeRule(keyframe: Keyframe, last: number): () => boolean {
  const { index, sequence } = keyframe;
  return () => shows(sequence.showing(last), index);
}

/**
 * The `time.history` nodes inside a keyframe, `node` itself included. The
 * walk stops at another sequence's Frame: the keyframes inside it belong to
 * that sequence, which reads its own.
 */
export function historiesIn(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode): void => {
    if (sequences.has(n)) return;
    if (histories.has(n)) out.push(n);
    for (const child of n.children ?? []) walk(child as TreeNode);
  };
  walk(node);
  return out;
}

/**
 * A mark's lifetime, as a `last`: the union of the lifetimes of the marks it
 * is made of, the way its box is the union of theirs. A mark with no parts
 * lives as long as the nearest `time.history` above it says, or for its
 * keyframe's band (`last = 0`) when there is none between it and its
 * keyframe. A `time.history` sets the lifetime of everything under it, and
 * one nearer a mark wins. Lifetimes of one keyframe are nested windows ending
 * at the playhead, so their union is the longest.
 */
export function lifetimeOf(node: TreeNode): number {
  let inherited = 0;
  for (let n: TreeNode | undefined = node; n !== undefined; ) {
    const last = histories.get(n);
    if (last !== undefined) {
      inherited = last;
      break;
    }
    const parent = n.parent as TreeNode | undefined;
    // The keyframe is the node whose parent is a sequence's Frame; nothing
    // above it is part of the keyframe.
    if (parent === undefined || sequences.has(parent)) break;
    n = parent;
  }
  const below = (n: TreeNode, above: number): number => {
    const own = n === node ? above : (histories.get(n) ?? above);
    const parts = (n.children ?? []) as TreeNode[];
    if (parts.length === 0 || sequences.has(n)) return own;
    return Math.max(...parts.map((part) => below(part, own)));
  };
  return below(node, inherited);
}

/**
 * A staggered UPDATE: `spread(...).transition({ update: time.stagger({ lag })
 * })` inside a `time.sequence`, D3's Sortable Bar Chart re-sort. Between two
 * keyframes the operator's children do not all move together; each starts
 * its move a lag after the one before, in the order they have at the stretch's
 * END (so the stagger sweeps down the new ranking, as D3 sorts the selection
 * by target position before it sets the delay).
 *
 * The same time layout as the build-in places the moves (`schedule.ts`): each
 * child's move lasts the whole stretch, and the stagger spreads them. That
 * would run past the next keyframe, so the whole arrangement FITS the stretch
 * (the default the sketch settles on): the lag and every move shrink by one
 * factor until the last child arrives at the keyframe, which keeps the dwell
 * (the share of the time spent between starts) and keeps every keyframe's
 * layout true at its own time.
 *
 * It is read by `time.transition()`'s tween as a per-key WARP of the
 * playhead: a key reads the stretch `[a, b]` at `a + u_k·(b − a)`, where `u_k`
 * is its own fitted progress. Before its start it holds `a`; after its end,
 * `b`. Keyframe times are fixed points, so every keyframe still draws exactly.
 */
import { GoFishNode } from "../ast/_node";
import { groupEntries, rowsOf } from "./grouping";
import { solveSchedule, wavesOf, type Arrangement } from "./schedule";
import { nodeTransition } from "./transition";

/** Where one keyframe mark sits in its operator's update arrangement. */
export type UpdateSlot = {
  arrangement: Arrangement;
  /** Its wave: the groups the stagger starts together, in start order. */
  wave: number;
  waves: number;
};

/** The update slot of a keyframe mark: the nearest operator above it whose
 *  `.transition({ update })` arranges its children, and which of those
 *  children holds the mark. `undefined` when nothing above it staggers. */
export function updateSlotOf(mark: GoFishNode): UpdateSlot | undefined {
  for (let n: GoFishNode = mark; n.parent instanceof GoFishNode; ) {
    const parent: GoFishNode = n.parent;
    const spec = nodeTransition(parent)?.update;
    if (spec !== undefined) {
      const kids = parent.children.filter(
        (c): c is GoFishNode => c instanceof GoFishNode
      );
      const groups = [...groupEntries(kids, rowsOf, spec.by).values()];
      const group = groups.findIndex((g) => g.includes(n));
      const { by: _by, ...arrangement } = spec;
      const from =
        arrangement.kind === "stagger" ? arrangement.from : undefined;
      const waves = wavesOf(groups.length, from ?? "first");
      return {
        // The waves are already in start order.
        arrangement:
          arrangement.kind === "stagger"
            ? { ...arrangement, from: "first" }
            : arrangement,
        wave: waves.findIndex((w) => w.includes(group)),
        waves: waves.length,
      };
    }
    n = parent;
  }
  return undefined;
}

/**
 * The playhead as one key reads it. `frames` are the sequence's keyframes,
 * `knots` the key's own (sorted), `slots` its update slot at each knot, and
 * `msPerUnit` the clock's milliseconds per unit of time (a lag is in ms, the
 * playhead in the sequence's own units). The identity when nothing staggers.
 */
export function updateWarp(
  frames: number[] | undefined,
  knots: number[],
  slots: (UpdateSlot | undefined)[],
  msPerUnit: (() => number) | undefined
): (t: number) => number {
  if (
    frames === undefined ||
    frames.length < 2 ||
    msPerUnit === undefined ||
    slots.every((s) => s === undefined)
  ) {
    return (t) => t;
  }
  const slotAt = new Map(knots.map((k, i) => [k, slots[i]]));
  /** Per stretch: the key's fitted start and length, as shares of it. */
  const fitted = new Map<number, { start: number; length: number } | null>();
  const fitOf = (i: number) => {
    let fit = fitted.get(i);
    if (fit !== undefined) return fit;
    const [a, b] = [frames[i], frames[i + 1]];
    // The order the stretch ends in: the key's slot at `b`, or at `a` for a
    // key that leaves.
    const slot = slotAt.get(b) ?? slotAt.get(a);
    if (slot === undefined) {
      fit = null;
    } else {
      const move = (b - a) * msPerUnit();
      const { items, total } = solveSchedule({
        kind: "group",
        arrangement: slot.arrangement,
        groups: Array.from({ length: slot.waves }, (_, w) => [
          { kind: "leaf" as const, duration: move, payload: w },
        ]),
      });
      const start = items.find((it) => it.payload === slot.wave)!.start;
      fit = total > 0 ? { start: start / total, length: move / total } : null;
    }
    fitted.set(i, fit);
    return fit;
  };
  return (t) => {
    if (!(t > frames[0] && t < frames[frames.length - 1])) return t;
    let i = 0;
    while (i < frames.length - 2 && t >= frames[i + 1]) i++;
    const fit = fitOf(i);
    if (fit === null) return t;
    const [a, b] = [frames[i], frames[i + 1]];
    const u = (t - a) / (b - a);
    const local =
      fit.length > 0
        ? Math.min(1, Math.max(0, (u - fit.start) / fit.length))
        : u >= fit.start
          ? 1
          : 0;
    return a + local * (b - a);
  };
}

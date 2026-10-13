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
import { locate } from "../interpolate";
import { groupEntries, rowsOf } from "./grouping";
import { solveSchedule, type Arrangement, type Schedule } from "./schedule";
import { nodeTransition, type ArrangementSpec } from "./transition";

/** One operator node's staggered update: its arrangement, how many groups
 *  its children fall into, and the time layout of a stretch of each length,
 *  solved once and shared by every key that moves in it. */
type Stagger = {
  arrangement: Arrangement;
  groups: number;
  layouts: Map<number, Schedule<number>>;
};

/** Where one keyframe mark sits in its operator's update arrangement: the
 *  stagger, and which of its groups holds the mark. */
export type UpdateSlot = { stagger: Stagger; group: number };

/** Each staggering operator node's marks, by the slot each one holds. */
const slotsByOperator = new WeakMap<GoFishNode, Map<GoFishNode, UpdateSlot>>();

/** The marks (leaves) under a node. */
const leavesOf = (node: GoFishNode): GoFishNode[] => {
  const kids = node.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode
  );
  return kids.length === 0 ? [node] : kids.flatMap(leavesOf);
};

/** The update slots of the marks under an operator node, grouped once.
 *  Without `by`, each child is a group and its marks share its slot. With
 *  `by`, the MARKS are split by it (R2D3: a histogram's dots staggered by
 *  their own elevation, below the bins the operator splits into); a child
 *  whose rows agree on `by` puts all its marks in one group, so this is the
 *  children-grouping it was before wherever that one was defined. */
function slotsOf(
  node: GoFishNode,
  spec: ArrangementSpec
): Map<GoFishNode, UpdateSlot> {
  let slots = slotsByOperator.get(node);
  if (slots === undefined) {
    const kids = node.children.filter(
      (c): c is GoFishNode => c instanceof GoFishNode
    );
    const { by, ...arrangement } = spec;
    // With `by`, only marks that draw rows are split: chrome under the
    // operator (its axis labels) has no value of `by` and does not move.
    const groups =
      by === undefined
        ? kids.map(leavesOf)
        : [
            ...groupEntries(
              kids.flatMap(leavesOf).filter((l) => rowsOf(l).length > 0),
              rowsOf,
              by
            ).values(),
          ];
    const stagger: Stagger = {
      arrangement,
      groups: groups.length,
      layouts: new Map(),
    };
    slots = new Map(
      groups.flatMap((members, group) =>
        members.map((leaf) => [leaf, { stagger, group }] as const)
      )
    );
    slotsByOperator.set(node, slots);
  }
  return slots;
}

/** The update slot of a keyframe mark: the nearest operator above it whose
 *  `.transition({ update })` arranges what is under it, and which group
 *  holds the mark. `undefined` when nothing above it staggers. */
export function updateSlotOf(mark: GoFishNode): UpdateSlot | undefined {
  for (let n: GoFishNode = mark; n.parent instanceof GoFishNode; ) {
    const parent: GoFishNode = n.parent;
    const record = nodeTransition(parent);
    if (record?.kind === "operator" && record.update !== undefined) {
      // A moving mark may be a composite (a bar and its label): it moves
      // with its first mark's group.
      return slotsOf(parent, record.update).get(leavesOf(mark)[0]);
    }
    n = parent;
  }
  return undefined;
}

/** When the key in `slot` moves, as shares of a stretch that lasts `move`
 *  ms: its fitted start and length. `undefined` for a stretch with no time
 *  in it. */
function fitOf(
  { stagger, group }: UpdateSlot,
  move: number
): { start: number; length: number } | undefined {
  let layout = stagger.layouts.get(move);
  if (layout === undefined) {
    layout = solveSchedule({
      kind: "group",
      arrangement: stagger.arrangement,
      groups: Array.from({ length: stagger.groups }, (_, g) => [
        { kind: "leaf" as const, duration: move, payload: g },
      ]),
    });
    stagger.layouts.set(move, layout);
  }
  const { items, total } = layout;
  if (!(total > 0)) return undefined;
  return { start: items[group].start / total, length: move / total };
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
  return (t) => {
    if (!(t > frames[0] && t < frames[frames.length - 1])) return t;
    const { i, u } = locate(frames, t);
    const [a, b] = [frames[i], frames[i + 1]];
    // The order the stretch ends in: the key's slot at `b`, or at `a` for a
    // key that leaves.
    const slot = slotAt.get(b) ?? slotAt.get(a);
    const fit = slot && fitOf(slot, (b - a) * msPerUnit());
    if (fit === undefined) return t;
    const local =
      fit.length > 0
        ? Math.min(1, Math.max(0, (u - fit.start) / fit.length))
        : u >= fit.start
          ? 1
          : 0;
    return a + local * (b - a);
  };
}

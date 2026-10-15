/**
 * What a node carries for a `timeline` (`timeline.ts`), kept in a module with
 * no imports so the mark modifiers can write it without an import cycle.
 *
 * PROTOTYPE (animation grammar proposal).
 *
 *   - `.hold(ms)`: how long a node is on screen as a scene of a timeline.
 *   - the timeline mark: which layer nodes are timelines, whose children are
 *     scenes (different pictures over time) rather than parts of one picture.
 */

const holds = new WeakMap<object, number>();

/** Record `.hold(ms)` on a node. */
export function setHold(node: object, ms: number): void {
  if (!(typeof ms === "number" && Number.isFinite(ms) && ms >= 0)) {
    throw new Error(
      `[gofish] .hold(${String(ms)}): a hold is how long the scene is on ` +
        `screen, a number of milliseconds, 0 or more.`
    );
  }
  holds.set(node, ms);
}

/** The `.hold(ms)` written on a node, if any. */
export const holdOf = (node: object): number | undefined => holds.get(node);

const timelines = new WeakSet<object>();

/** Mark a node as a timeline: its children are scenes. */
export const markTimeline = (node: object): void => {
  timelines.add(node);
};

export const isTimeline = (node: object): boolean => timelines.has(node);

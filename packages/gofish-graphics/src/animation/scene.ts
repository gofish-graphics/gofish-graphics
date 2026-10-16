/**
 * What a node carries for a `timeline` (`timeline.ts`), kept in a module with
 * no imports so the mark modifiers can write it without an import cycle.
 *
 * PROTOTYPE (animation grammar proposal).
 *
 *   - `.duration(d)`: a node's size on t, how long it is on screen as a scene
 *     of a timeline. Like a spatial size, it is either FIXED, a number of
 *     milliseconds (the twin of `w: 50`, pixels), or DATA, `datum(v)`, an
 *     amount in the data's own units that the enclosing timeline scales to
 *     milliseconds (the twin of `w: datum(5)` or `w: "field"`). On a timeline
 *     itself it is the timeline's total, which its data-valued scenes fit, as
 *     a spread with a fixed `w` fits its data-sized children.
 *   - the timeline mark: which layer nodes are timelines, whose children are
 *     scenes (different pictures over time) rather than parts of one picture,
 *     with the timeline's own options.
 */

/** A scene's duration as written: milliseconds, or a data amount. */
export type SceneDuration = number | { type: "datum"; datum: unknown };

const durations = new WeakMap<object, SceneDuration>();

const isDatum = (v: unknown): v is { type: "datum"; datum: unknown } =>
  typeof v === "object" &&
  v !== null &&
  (v as { type?: unknown }).type === "datum";

/** Record `.duration(d)` on a node. */
export function setDuration(node: object, d: SceneDuration): void {
  const amount = isDatum(d) ? Number(d.datum) : d;
  if (!(typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) {
    throw new Error(
      `[gofish] .duration(${isDatum(d) ? `datum(${String(d.datum)})` : String(d)}): ` +
        `a duration is how long the scene is on screen: a number of ` +
        `milliseconds, 0 or more, or datum(v) for an amount in the data's ` +
        `own units that the timeline scales.`
    );
  }
  durations.set(node, d);
}

/** The `.duration(d)` written on a node, if any. */
export const durationOf = (node: object): SceneDuration | undefined =>
  durations.get(node);

/** A duration split into its fixed milliseconds and its data amount: the
 *  scene is `fixed + σ · data` ms long at a scale of σ ms per data unit. */
export const durationParts = (
  d: SceneDuration
): { fixed: number; data: number } =>
  isDatum(d) ? { fixed: 0, data: Number(d.datum) } : { fixed: d, data: 0 };

export type TimelineOptions = {
  /** The scenes are a cycle: the timeline is time on a circle, and one
   *  `time.after` clause may close the loop from a later scene back to the
   *  first (the clock then loops). */
  cyclic?: boolean;
  /** Start this timeline's clock. Default: the render option `playing`. */
  playing?: boolean;
  /** Where this timeline's playhead starts, in ms. Default: the render
   *  option `at`. */
  at?: number;
};

const timelines = new WeakMap<object, TimelineOptions>();

/** Mark a node as a timeline: its children are scenes. */
export const markTimeline = (
  node: object,
  opts: TimelineOptions = {}
): void => {
  timelines.set(node, opts);
};

export const isTimeline = (node: object): boolean => timelines.has(node);

export const timelineOptions = (node: object): TimelineOptions =>
  timelines.get(node) ?? {};

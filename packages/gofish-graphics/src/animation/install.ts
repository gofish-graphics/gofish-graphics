/**
 * The build-in: every mark with an enter effect enters once, on the first
 * render, as the ENTER case of a transition from the empty chart.
 *
 * `installBuildIn` runs once per rendered chart, after the chart has been
 * resolved. It has three steps, and each is small because the pieces it needs
 * already exist:
 *
 *   1. READ THE TIMELINE off the resolved tree. The records the chained form
 *      (`.transition()` on operators and marks) and the selection form
 *      (`time.stagger` / `time.parallel` in a `.layer(chart(selectAll(...)))`
 *      flow, and `time.transition({ enter })`) leave on their nodes are read
 *      by one walk (`clipOf`): an operator with an arrangement is a time
 *      frame over its children, a mark with effects is a leaf, and anything
 *      else is `parallel` over what is under it.
 *   2. TIME its leaves (`timeLeaves`: a duration and a warp for each effect,
 *      as the marks it animates resolve them) and SOLVE it (`schedule.ts`): a
 *      start for every leaf.
 *   3. PLAY IT on one clock for the whole chart, a `timer` over [0, total] ms
 *      that plays once. Each animated mark gets a paint-time rule
 *      (`paint.ts`), so the chart is laid out once and the clock patches the
 *      moving items' attributes per frame.
 *
 * The timeline depends on the chart's STRUCTURE and data (and the effects'
 * durations), never on where layout puts things, so it is read here, before
 * layout, off the tree the builder resolved. Chrome that later passes add
 * (axes, legends) is therefore never part of it and appears at once; labels
 * are part of their marks (`GoFishNode._attachments`) and follow them.
 *
 * A chart whose flow has a `time.sequence` plays DATA time instead: its marks
 * enter, move and leave with the data, through `time.transition()`, so the
 * walk plays none of those tiers (`playsDataTime`). It still checks their
 * records, as it checks every record against the clock that plays it
 * (`checkPhases`): the walk is where that clock is known.
 */
import { GoFishNode } from "../ast/_node";
import type { GoFishAST } from "../ast/_ast";
import { timer, type Timer } from "../interaction/inputs";
import {
  DEFAULT_DURATION,
  fadeIn,
  resolveEase,
  type Effect,
  type TimedEffect,
} from "./effects";
import { groupEntries, rowsOf } from "./grouping";
import { projectPath } from "../ast/datumProjection";
import { makeRule } from "./paint";
import {
  solveSchedule,
  type Arrangement,
  type Clip,
  type Schedule,
} from "./schedule";
import { checkPhases, nodeTransition, playsDataTime } from "./transition";

/** How to play the build clock: the render options `playing` and `at`,
 *  which mirror `time.sequence`'s. `playing: false` holds the chart still at
 *  `at` (ms into the build, default 0), which is what a screenshot or a test
 *  wants. */
export type BuildClockOptions = { playing?: boolean; at?: number };

/** A leaf as the walk reads it off a node: the effects its marks enter with,
 *  as written, and the marks. */
type Found = { effects: Effect[]; targets: GoFishNode[] };

/** The timeline as the walk reads it: a `Clip` whose leaves are not timed
 *  yet. */
type Draft =
  | { kind: "leaf"; found: Found }
  | { kind: "group"; arrangement: Arrangement; groups: Draft[][] };

/** A leaf of the build: its effects, timed for its marks, and the marks. */
type Leaf = { effects: TimedEffect[]; targets: GoFishNode[] };

export type BuildIn = {
  schedule: Schedule<Leaf>;
  clock: Timer<number>;
};

/** Read the timeline off `root`, solve it, and put every animated mark on
 *  one clock. `undefined` when nothing in the chart enters. */
export function installBuildIn(
  root: GoFishNode,
  options: BuildClockOptions = {}
): BuildIn | undefined {
  const draft = clipOf(root, false);
  if (draft === undefined) return undefined;
  const schedule = solveSchedule(timeLeaves(draft));
  const { total } = schedule;
  const clock = timer<number>({
    domain: [0, total],
    duration: total,
    loop: false,
    playing: options.playing ?? true,
  });
  if (options.at !== undefined) clock.set(options.at);
  // The playhead the marks read, per frame, at paint.
  const playhead = (): number => clock();
  for (const { start, payload } of schedule.items) {
    const rule = makeRule(playhead, start, payload.effects);
    for (const target of payload.targets) {
      for (const leaf of leavesOf(target)) {
        for (const { effect } of payload.effects) effect.fits(leaf.type);
        if (leaf.__gfAnimate !== undefined) {
          throw new Error(
            `[gofish] build-in: a "${leaf.type}" mark is animated twice, ` +
              `e.g. by its own .transition({ enter }) and by a ` +
              `time.transition({ enter }) that selects it. Give it one.`
          );
        }
        leaf.INTERNAL_animate(rule);
      }
    }
  }
  return { schedule, clock };
}

/** The longest value a field-valued duration reaches, which the shortcut
 *  time scale maps to 1000 ms (see `EffectOptions.duration`). */
const FIELD_DURATION_MAX_MS = 1000;

/**
 * Time every leaf of `draft`: each effect gets its duration in ms and its
 * warp, and the leaf lasts as long as its longest effect. A FIELD-valued
 * duration is the marks' value of the field, on a linear scale whose largest
 * value (over every mark the effect animates) is 1000 ms.
 */
function timeLeaves(draft: Draft): Clip<Leaf> {
  // Each leaf's values of the field-valued durations it plays (in effect
  // order), and each such effect's largest value over its leaves.
  const values = new Map<Found, number[]>();
  const largest = new Map<Effect, number>();
  const measure = (d: Draft): void => {
    if (d.kind === "group") return d.groups.forEach((g) => g.forEach(measure));
    const { effects, targets } = d.found;
    const vs = effects.map((e) =>
      typeof e.duration === "string" ? fieldValue(targets, e.duration) : 0
    );
    effects.forEach((e, i) => {
      if (typeof e.duration !== "string") return;
      largest.set(e, Math.max(largest.get(e) ?? 0, vs[i]));
    });
    values.set(d.found, vs);
  };
  measure(draft);

  const time = (d: Draft): Clip<Leaf> => {
    if (d.kind === "group") {
      return { ...d, groups: d.groups.map((g) => g.map(time)) };
    }
    const vs = values.get(d.found)!;
    const effects = d.found.effects.map((effect, i): TimedEffect => {
      const top = largest.get(effect) ?? 0;
      const duration =
        typeof effect.duration !== "string"
          ? (effect.duration ?? DEFAULT_DURATION)
          : top > 0
            ? (FIELD_DURATION_MAX_MS * vs[i]) / top
            : 0;
      return { effect, duration, ease: resolveEase(effect.ease) };
    });
    return {
      kind: "leaf",
      duration: Math.max(0, ...effects.map((e) => e.duration)),
      payload: { effects, targets: d.found.targets },
    };
  };
  return time(draft);
}

/** The marks' one value of `field`, for a field-valued duration. */
function fieldValue(targets: GoFishNode[], field: string): number {
  const value = Number(projectPath(targets.flatMap(rowsOf), field));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `[gofish] animation({ duration: "${field}" }): a mark's duration ` +
        `comes from its own value of "${field}", and this mark has no ` +
        `single number there (0 or more).`
    );
  }
  return value;
}

/** The marks that draw: a mark with no children draws itself; a composite
 *  mark is animated leaf by leaf, each from its own baseline (DECLARED
 *  PROTOTYPE BEHAVIOR). */
function leavesOf(node: GoFishNode): GoFishNode[] {
  const kids = node.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode
  );
  return kids.length === 0 ? [node] : kids.flatMap(leavesOf);
}

/**
 * The timeline under `node`. `underArrangement` says an operator above has an
 * enter arrangement: a mark under one with no effect of its own enters with
 * `animation.fadeIn()`, the default #892 gives an entering mark. Every record
 * the walk meets is checked against the clock that plays it (`checkPhases`).
 */
function clipOf(node: GoFishAST, underArrangement: boolean): Draft | undefined {
  if (!(node instanceof GoFishNode)) return undefined;
  if (playsDataTime(node)) {
    checkDataTime(node);
    return undefined;
  }
  const record = nodeTransition(node);
  if (record !== undefined) checkPhases(record, false);
  if (record?.kind === "mark" && record.enter !== undefined) {
    return {
      kind: "leaf",
      found: { effects: record.enter, targets: record.targets ?? [node] },
    };
  }
  const kids = node.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode
  );
  if (record?.kind === "operator" && record.enter !== undefined) {
    const { by, ...arrangement } = record.enter;
    const children = kids
      .map((kid) => ({ kid, clip: clipOf(kid, true) }))
      .filter((c): c is { kid: GoFishNode; clip: Draft } => !!c.clip);
    const groups = [
      ...groupEntries(children, (c) => rowsOf(c.kid), by).values(),
    ];
    return {
      kind: "group",
      arrangement,
      groups: groups.map((g) => g.map((c) => c.clip)),
    };
  }
  if (kids.length === 0) {
    if (!underArrangement) return undefined;
    return { kind: "leaf", found: { effects: [fadeIn()], targets: [node] } };
  }
  const clips = kids
    .map((kid) => clipOf(kid, underArrangement))
    .filter((c): c is Draft => c !== undefined);
  if (clips.length === 0) return undefined;
  if (clips.length === 1) return clips[0];
  return {
    kind: "group",
    arrangement: { kind: "parallel" },
    groups: clips.map((c) => [c]),
  };
}

/** Check the records under a subtree that plays data time. The build-in
 *  plays none of it: its marks enter and leave with the data. */
function checkDataTime(node: GoFishAST): void {
  if (!(node instanceof GoFishNode)) return;
  const record = nodeTransition(node);
  if (record !== undefined) checkPhases(record, true);
  for (const child of node.children) checkDataTime(child);
}

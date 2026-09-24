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
 *   2. SOLVE IT (`schedule.ts`): a start and a duration for every leaf.
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
 * walk leaves those tiers alone (`playsDataTime`).
 */
import { GoFishNode } from "../ast/_node";
import type { GoFishAST } from "../ast/_ast";
import { timer, type Timer } from "../interaction/inputs";
import { checkEffectFits, fadeIn, type Effect } from "./effects";
import { groupEntries, rowsOf } from "./grouping";
import { makeRule } from "./paint";
import { solveSchedule, type Clip, type Schedule } from "./schedule";
import { nodeTransition, playsDataTime } from "./transition";

/** How to play the build clock: the render options `playing` and `at`,
 *  which mirror `time.sequence`'s. `playing: false` holds the chart still at
 *  `at` (ms into the build, default 0), which is what a screenshot or a test
 *  wants. */
export type BuildClockOptions = { playing?: boolean; at?: number };

type Leaf = { effects: Effect[]; targets: GoFishNode[] };

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
  const clip = clipOf(root, false);
  if (clip === undefined) return undefined;
  const schedule = solveSchedule(clip);
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
        for (const e of payload.effects) checkEffectFits(e, leaf.type);
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
 * `animation.fadeIn()`, the default #892 gives an entering mark.
 */
function clipOf(
  node: GoFishAST,
  underArrangement: boolean
): Clip<Leaf> | undefined {
  if (!(node instanceof GoFishNode) || playsDataTime(node)) return undefined;
  const record = nodeTransition(node);
  if (record?.unbuilt !== undefined || record?.exit !== undefined) {
    const phases = [
      ...(record.unbuilt ?? []),
      ...(record.exit !== undefined ? ["exit"] : []),
    ];
    throw new Error(
      `[gofish] .transition({ ${phases.join(", ")} }): in a chart with no ` +
        `time.sequence, marks enter once, on the first render, and nothing ` +
        `updates or leaves after that. Update and exit phases need a data ` +
        `change to trigger them, which this prototype does not have.`
    );
  }
  if (record?.enter !== undefined) {
    return {
      kind: "leaf",
      duration: Math.max(0, ...record.enter.map((e) => e.duration)),
      payload: { effects: record.enter, targets: record.targets ?? [node] },
    };
  }
  const kids = node.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode
  );
  if (record?.arrangement !== undefined) {
    const { by, ...arrangement } = record.arrangement;
    const children = kids
      .map((kid) => ({ kid, clip: clipOf(kid, true) }))
      .filter((c): c is { kid: GoFishNode; clip: Clip<Leaf> } => !!c.clip);
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
    const effects = [fadeIn()];
    return {
      kind: "leaf",
      duration: effects[0].duration,
      payload: { effects, targets: [node] },
    };
  }
  const clips = kids
    .map((kid) => clipOf(kid, underArrangement))
    .filter((c): c is Clip<Leaf> => c !== undefined);
  if (clips.length === 0) return undefined;
  if (clips.length === 1) return clips[0];
  return {
    kind: "group",
    arrangement: { kind: "parallel" },
    groups: clips.map((c) => [c]),
  };
}

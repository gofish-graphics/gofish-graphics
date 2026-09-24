/**
 * The `time` namespace — GoFish's first animation surface.
 *
 * The model is the one the animation design note argues for
 * (`apps/docs/docs/internals/design/animation.md`, §5): time is an axis, and
 * the spatial strata reinterpret over it. The SURFACE is deliberately its own
 * vocabulary rather than `dir: "t"` on the spatial operators (§9.1), so
 * reading `spread` always means spatial layout. Two equivalences hold this
 * first version together:
 *
 *   time.sequence  ≡  spread on t   (one keyframe per value of a data field)
 *   time.transition ≡ line on t     (a connection mark threading the keyframes)
 *
 * Read against the spatial twin, which renders today: `spread({by: "year"})`
 * lays a panel per year across x and `line({along: "year"})` threads each
 * country through the panels. Replace the spread with `time.sequence` and the
 * line with `time.transition` and the same picture plays: the panels collapse
 * onto one another (a keyframe is a panel with no room of its own), and the
 * line becomes the moving dot that would have traced it.
 *
 * A transitioned mark moves between two neighboring keyframes that both have
 * a row for it, and fades in place across a stretch where only one of them
 * does (see `tween.tsx`): the temporal reading of a line drawing nothing past
 * its endpoints, with the fade Keynote's Magic Move gives unmatched objects.
 *
 * What this version does NOT do: sequence/parallel composition of clips,
 * staggering, easing across keyframes as a first-class clip, enter/exit
 * styling (sliding in, fading out), and segues between two different specs. Those are §§5-9 of the
 * note and are not built.
 */
import { createOperator } from "./createOperator";
import { createRelationalMark } from "./chart";
import { Frame } from "../graphicalOperators/frame";
import { tween } from "../graphicalOperators/tween";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { projectPath, splitEntries, type TimeTier } from "../datumProjection";
import { timer, type Timer } from "../../interaction/inputs";
import { readLive } from "../../interaction/live";
import type { MaybeValue } from "../data";
import { sourceIndex, type InterpolationMethod } from "../../interpolate";
import { buildIn, stagger, parallel } from "../../animation/timeArrangements";
import { effectList, type Effect } from "../../animation/effects";
import { checkSequencePhases } from "../../animation/transition";

export type SequenceOptions = {
  /** The data field whose values are the keyframes. Must be numeric: the
   *  playhead moves through the field's own units, so the field has to be
   *  something a playhead can be between. */
  by: string;
  /** Wall-clock milliseconds one pass through the whole field takes. */
  duration?: number;
  /** Start over at the beginning when the end is reached. Default true. */
  loop?: boolean;
  /** Start the clock. Default true; `false` holds the chart still, which is
   *  what a screenshot or a scrubbed-by-hand chart wants. */
  playing?: boolean;
  /** Where the playhead starts, in the field's units (e.g. `at: 1975`).
   *  Defaults to the first keyframe. */
  at?: number;
  /** A clock to play on, instead of the one the sequence would have built.
   *  Hand it a `timer(...)` when something outside the sequence has to read
   *  the same playhead — a year readout beside the chart, or a second chart
   *  that has to move in lockstep with this one. The clock then owns its own
   *  domain and its own playback, so `duration`, `loop`, `playing` and `at`
   *  are errors alongside it. */
  on?: Timer<number>;
};

/** The options a sequence's own clock is built from — the ones a supplied
 *  `on` clock owns instead. */
const CLOCK_OPTIONS = ["duration", "loop", "playing", "at"] as const;

/**
 * `time.sequence({ by })` — one keyframe per value of `by`, played through.
 *
 * Spatially, every keyframe group is laid out in ONE shared frame,
 * superimposed, with no space of its own. That is what makes the axes hold
 * still while the chart plays: the x and y domains are inferred over every
 * row of every keyframe at once, so nothing rescales as the playhead moves.
 * It is `spread` with the spacing taken away, which is what "spread on t"
 * looks like when it is drawn in two dimensions.
 *
 * Every keyframe is laid out, and one of them is SHOWN. A spread gives each
 * group a band of x; a sequence gives each group a band of time, so keyframe
 * `i` owns `[t_i, t_{i+1})` and the chart draws whichever band the playhead is
 * in. The others keep their boxes and their data — which is what holds the
 * axes still — and paint nothing. So a sequence on its own already animates: it
 * holds a frame, then jumps to the next one, exactly as Animated Vega-Lite's
 * band scale on time does.
 *
 * Which band is showing is a PAINT-time fact, like a transition's playhead and
 * for the same reason: every keyframe group is laid out either way — it has to
 * be, or the domains would move — so the clock changes nothing above the marks
 * it shows and hides. The hold is therefore a live opacity on the keyframes'
 * own items (`INTERNAL_visibleWhile`), read per frame in paint position, and
 * the chart is laid out once however long it plays.
 *
 * A `time.transition()` layered over it takes the keyframes over completely:
 * their box leaves emit no items at all (`INTERNAL_emitNothing`) and their
 * text leaves hand their drawing to the transition
 * (`INTERNAL_takeOverLowering`), so there is nothing left to show or hide and
 * the two compose with nothing to coordinate.
 *
 * The operator also owns the chart's clock, and builds it lazily: the domain
 * is the field's own range, which is not known until the data has been split,
 * so the first read of the playhead is what creates the timer (a read the
 * operator makes through `readLive`, which creates and registers the clock
 * without making it a pipeline dependency). One `sequence` call is one clock,
 * so two charts on a page keep their own time — unless `on` hands them the
 * same one.
 */
export function sequence(opts: SequenceOptions) {
  /** The field's values, sorted and distinct: the keyframes, and the clock's
   *  domain from the first to the last. */
  let keyframes: number[] = [];
  let clock: Timer<number> | undefined = opts.on;

  if (opts.on !== undefined) {
    const owned = CLOCK_OPTIONS.filter((k) => opts[k] !== undefined);
    if (owned.length > 0) {
      throw new Error(
        `[gofish] time.sequence({ by: "${opts.by}", on }): the clock owns ` +
          `${owned.map((k) => `\`${k}\``).join(", ")}. A supplied clock has ` +
          `its own domain, duration and play state, so set them on the ` +
          `\`timer(...)\` instead — or drop \`on\` and let the sequence build ` +
          `a clock of its own.`
      );
    }
  }

  /** Record the field's values as the flow splits, so the clock is built from
   *  the data rather than from a hand-written domain. */
  const observe = (values: unknown[]): void => {
    const numbers = values.map(Number).filter((v) => Number.isFinite(v));
    if (numbers.length === 0) return;
    keyframes = [...new Set(numbers)].sort((a, b) => a - b);
  };

  // Built per call so the split hook can close over this sequence's own
  // `observe`; every other operator is a module-level factory because it has
  // no state to keep.
  const operator = createOperator<any, SequenceOptions>(
    (_o, children) => {
      // Read ONCE, HERE, and only for what a resolve-time read is for: this is
      // where the clock is lazily built (the domain is known by now) and where
      // it registers with the chart's interaction runtime, which is installed
      // around resolve and nowhere else. `readLive` is what keeps it
      // paint-time — untracked and flagged, so the clock wires up for events
      // without becoming a pipeline dependency (see `src/interaction/live.ts`).
      readLive(tier.clock);
      // WHICH keyframe is held is then decided per frame, in paint position.
      hold(children, tier.clock, tier.knots());
      return Frame({}, children);
    },
    {
      split: ({ by }, d) => {
        const entries = splitEntries(by, d);
        observe([...entries.keys()]);
        return entries;
      },
      // Positions nothing in x or y; its `by` is the tier a
      // `time.transition()` threads (the role `along` names for a spatial
      // connector).
      arrangement: { kind: "none" },
    }
  )(opts);

  const tier: TimeTier = {
    by: opts.by,
    knots: () => keyframes,
    clock: () => {
      if (clock === undefined) {
        if (keyframes.length === 0) {
          throw new Error(
            `[gofish] time.sequence({ by: "${opts.by}" }): "${opts.by}" has no ` +
              `numeric values to play through — a sequence's field is the ` +
              `playhead's own units, so it must be a number (a year, a day, a ` +
              `step index).`
          );
        }
        clock = timer<number>({
          domain: [keyframes[0], keyframes.at(-1)!],
          duration: opts.duration ?? 5000,
          loop: opts.loop ?? true,
          playing: opts.playing ?? true,
        });
        if (opts.at !== undefined) clock.set(opts.at);
      }
      return clock();
    },
  };
  (operator as any).__timeTier = tier;
  // The clock is a live JS signal, so a sequence cannot cross the Python
  // bridge; leaving the IR tag off makes the emitter treat it as opaque.
  return operator;
}

export type TransitionOptions = {
  /** The field the keyframes are keyed by in time, i.e. where each keyframe
   *  sits on the playhead's axis. It is the same role `along` names on a
   *  spatial connector, and it is normally inferred from the flow's
   *  `time.sequence(...)`; writing it out is what the desugaring tower's
   *  level 1 does. An explicit `along` wins over the inferred one, and is
   *  read off each keyframe's own datum either way. */
  along?: string;
  /** The playhead, in `along`'s own units — a signal (`() => number`, e.g. a
   *  `timer`) or a fixed number. Normally the transition reads the clock the
   *  flow's `time.sequence(...)` owns; `at` hands it one instead, so a chart
   *  with a plain `group({ by })` and a raw `timer(...)` plays the same way.
   *  Read at PAINT time: a moving value patches the mark's attributes rather
   *  than re-resolving the chart. A plain number holds it still. */
  at?: (() => number) | number;
  /** How the run is read between keyframes. `"auto"` smooths a numeric time
   *  field with a Catmull-Rom through the whole run — the temporal reading of
   *  `connect`'s auto rule, and the same curve the spatial twin's `line`
   *  draws through the same points. `"linear"` moves straight from each
   *  keyframe to the next. `"step"` does not move between them at all: the
   *  mark holds one keyframe's value until the next keyframe's own time
   *  arrives, and then jumps — the same picture the keyframes alone draw. */
  curve?: "auto" | "step" | "linear" | "catmullRom";
  /** Time warp inside one keyframe interval, `u -> u'` on `[0, 1]`. */
  ease?: (u: number) => number;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
  /** How the marks enter. With no `time.sequence` (and no `along`/`at`) this
   *  is a BUILD-IN: the marks enter once, from the empty chart, with these
   *  effects (`src/animation/`). Under a sequence it can only be the default
   *  fade, `animation.fadeIn()`. */
  enter?: Effect | Effect[];
  /** How the marks leave; under a sequence only `animation.fadeOut()`. */
  exit?: Effect | Effect[];
};

/**
 * `time.transition()` — the mark that moves between the keyframes.
 *
 * It is built from the same machinery as `line`, because it is the same kind
 * of thing: a relational mark over a run of already-placed marks, with no
 * size claim of its own. The inference is the same too, and needs no options.
 * The path tier is the sequence's field, the way `along` names it for a
 * spatial connector, and the split is that tier's complement — here one run
 * per country, which is Animated Vega-Lite's `key`, inferred rather than
 * written down.
 *
 * Every inferred piece can also be written out, which is what the desugaring
 * tower in `apps/docs/docs/js/animation.md` does: `along` names the time
 * field, `at` supplies the playhead, and a `.layer(chart(selectAll(...)))`
 * tier with its own `group({ by })` spells the split. The sugar and the
 * spelled-out form resolve to the same geometry.
 */
export const transition = createRelationalMark<TransitionOptions>(
  "time.transition",
  (o, children, inferred) => {
    const tier = inferred.time;
    // BUILD MODE: no keyframes at all, so the transition is from the empty
    // chart and every selected mark enters (`src/animation/`).
    if (
      tier === undefined &&
      o.along === undefined &&
      o.at === undefined &&
      o.enter !== undefined
    ) {
      if (o.exit !== undefined) {
        throw new Error(
          `[gofish] time.transition({ exit }): with no time.sequence the ` +
            `marks enter once and never leave, so an exit has nothing to ` +
            `trigger it in this prototype.`
        );
      }
      return buildIn(
        { effects: effectList(o.enter, "time.transition({ enter })")! },
        children
      );
    }
    checkSequencePhases(o, "time.transition()");
    // Both halves of "which run, read where" can be written out instead of
    // inferred: `along` names the keyframes' time field and `at` supplies the
    // playhead. Explicit wins, and either one alone is enough to drop the
    // other's half of the sequence.
    const by = o.along ?? tier?.by;
    if (by === undefined) {
      throw new Error(
        `[gofish] time.transition(): this chart has no time.sequence(...) in ` +
          `its flow, so there are no keyframes to move between. Add one — ` +
          `\`.flow(time.sequence({ by: "year" }), ...)\` — or name the ` +
          `keyframes' time field yourself with ` +
          `\`time.transition({ along: "year", at: clock })\`. If you meant a ` +
          `static path through the marks, use line({ along: "year" }).`
      );
    }
    // The playhead is handed to the tween AS A THUNK, not read here: a
    // transition's run is a layout-time fact and its playhead a paint-time
    // one, so the clock is read once as the tween node is built (for a value
    // to lower, and to register the clock) and then per frame in paint
    // position, patching one mark's attributes instead of re-resolving. See
    // `tween.tsx` for why that is sound — the tween is the leaf case of
    // subtree containment (issue #674).
    const playhead = o.at ?? tier?.clock;
    if (playhead === undefined) {
      throw new Error(
        `[gofish] time.transition({ along: "${by}" }): nothing says where the ` +
          `playhead is. Give it a clock — \`at: timer({ domain, duration })\` ` +
          `— or put a time.sequence({ by: "${by}" }) in the flow and let the ` +
          `transition read the clock it owns.`
      );
    }
    const knots = children.map((child) => knotOf(child, by));
    // The keyframes the run's knots are drawn from, so the tween can tell a
    // gap in the run from a step between neighbors. Only the sequence's own
    // field has them; a transition along some other field, or with no
    // sequence at all, reads its run's knots as consecutive.
    const sequence =
      tier !== undefined && tier.by === by ? tier.knots() : undefined;
    return tween(
      {
        at: playhead,
        knots,
        sequence,
        method: resolveMethod(o.curve),
        ease: o.ease,
        fill: o.fill,
        stroke: o.stroke,
        strokeWidth: o.strokeWidth,
        opacity: o.opacity,
      },
      children
    );
  },
  { temporal: true }
);

/** `"auto"` on a time axis: the field is numeric (a sequence enforces that),
 *  so the run is a sample of a continuous variable and smooths — the same
 *  conclusion `connect`'s auto rule reaches for a continuous connection axis,
 *  and the reason a transition traces the curve its spatial twin draws. */
function resolveMethod(curve: TransitionOptions["curve"]): InterpolationMethod {
  if (curve === "step") return "step";
  return curve === "linear" ? "linear" : "catmullRom";
}

/**
 * Show the keyframe whose band the playhead is in, and hide the rest — as a
 * standing rule per keyframe, not a decision taken once.
 *
 * The band rule is the step rule: keyframe `i` owns `[t_i, t_{i+1})`, the last
 * keyframe owns everything after it, and a playhead before the run holds the
 * first — the same reading `interpolateStep` gives a run of values, which is
 * why a sequence alone and a `curve: "step"` transition draw the same picture.
 *
 * Each keyframe gets a THUNK that says whether it is the held one, and the
 * playhead is read inside it, at paint (`INTERNAL_visibleWhile`). A hidden
 * keyframe keeps its box, its datum and its anchoring role, exactly as before;
 * what changed is only when the question is asked. It is set on the keyframe
 * group alone: the marks INSIDE the group are what draw, and a visibility rule
 * covers its node's whole subtree, including the label `Text`s the label pass
 * adds to the group after this runs.
 */
function hold(
  children: GoFishAST[],
  playhead: () => number,
  bands: number[]
): void {
  // Each child is one group, and the operator stamped it with its group key —
  // the value of `by` this keyframe is, which is the knot. `bands` is the
  // sequence's keyframes, the same values sorted and distinct.
  const knots = children.map((child) => Number((child as GoFishNode).key));
  if (bands.length === 0) return;
  // The held band, computed at most once per distinct playhead value and
  // shared by every keyframe's thunk (the same caching `tween` does).
  // (`NaN` never equals a playhead, so the first read always computes.)
  let cache = { t: NaN, held: bands[0] };
  const held = (): number => {
    const t = playhead();
    if (t !== cache.t)
      cache = { t, held: bands[sourceIndex(bands, t, "step")] };
    return cache.held;
  };
  children.forEach((child, i) => {
    if (child instanceof GoFishNode) {
      child.INTERNAL_visibleWhile(() => knots[i] === held());
    }
  });
}

/** One keyframe's time value, read off the mark's own datum. */
function knotOf(child: GoFishAST, by: string): number {
  const raw = projectPath([child], by);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(
      `[gofish] time.transition(): a keyframe has no single numeric "${by}" ` +
        `(got ${JSON.stringify(raw)}). Each keyframe mark must belong to one ` +
        `value of the sequence's field.`
    );
  }
  return value;
}

export const time = { sequence, transition, stagger, parallel };

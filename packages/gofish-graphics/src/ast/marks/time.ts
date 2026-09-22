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
 * What this version does NOT do: sequence/parallel composition of clips,
 * staggering, easing across keyframes as a first-class clip, enter/exit
 * lifecycle, and segues between two different specs. Those are §§5-9 of the
 * note and are not built.
 */
import { createOperator } from "./createOperator";
import { createRelationalMark } from "./chart";
import { Frame } from "../graphicalOperators/frame";
import { tween } from "../graphicalOperators/tween";
import { GoFishAST } from "../_ast";
import { projectPath, splitEntries, type TimeTier } from "../datumProjection";
import { timer, type Timer } from "../../interaction/inputs";
import type { MaybeValue } from "../data";
import type { InterpolationMethod } from "../../interpolate";

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
};

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
 * The operator also owns the chart's clock, and builds it lazily: the domain
 * is the field's own range, which is not known until the data has been split,
 * so the first read of the playhead is what creates the timer. One `sequence`
 * call is one clock, so two charts on a page keep their own time.
 */
export function sequence(opts: SequenceOptions) {
  let domain: [number, number] | undefined;
  let clock: Timer<number> | undefined;

  /** Record the field's range as the flow splits, so the clock is built from
   *  the data rather than from a hand-written domain. */
  const observe = (values: unknown[]): void => {
    const numbers = values.map(Number).filter((v) => Number.isFinite(v));
    if (numbers.length === 0) return;
    domain = [Math.min(...numbers), Math.max(...numbers)];
  };

  // Built per call so the split hook can close over this sequence's own
  // `observe`; every other operator is a module-level factory because it has
  // no state to keep.
  const operator = createOperator<any, SequenceOptions>(
    (_o, children) => Frame({}, children),
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
    clock: () => {
      if (clock === undefined) {
        if (domain === undefined) {
          throw new Error(
            `[gofish] time.sequence({ by: "${opts.by}" }): "${opts.by}" has no ` +
              `numeric values to play through — a sequence's field is the ` +
              `playhead's own units, so it must be a number (a year, a day, a ` +
              `step index).`
          );
        }
        clock = timer<number>({
          domain,
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
  /** How the run is read between keyframes. `"auto"` smooths a numeric time
   *  field with a Catmull-Rom through the whole run — the temporal reading of
   *  `connect`'s auto rule, and the same curve the spatial twin's `line`
   *  draws through the same points. `"linear"` moves straight from each
   *  keyframe to the next. */
  curve?: "auto" | "linear" | "catmullRom";
  /** Time warp inside one keyframe interval, `u -> u'` on `[0, 1]`. */
  ease?: (u: number) => number;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
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
 */
export const transition = createRelationalMark<TransitionOptions>(
  "time.transition",
  (o, children, inferred) => {
    const tier = inferred.time;
    if (tier === undefined) {
      throw new Error(
        `[gofish] time.transition(): this chart has no time.sequence(...) in ` +
          `its flow, so there are no keyframes to move between. Add one — ` +
          `\`.flow(time.sequence({ by: "year" }), ...)\` — or, if you meant a ` +
          `static path through the marks, use line({ along: "year" }).`
      );
    }
    // READ DURING RESOLVE, not inside `live()`: the playhead is a pipeline
    // dependency, so every value the clock emits re-resolves the chart and
    // re-runs this interpolation against freshly placed keyframes. That is
    // the expensive reading (a whole re-resolve per tick) and the honest one
    // — incremental layout is issue #674.
    const t = tier.clock();
    const knots = children.map((child) => knotOf(child, tier.by));
    return tween(
      {
        t,
        knots,
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
  return curve === "linear" ? "linear" : "catmullRom";
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

export const time = { sequence, transition };

/**
 * `.transition({ enter, update, exit })` — the CHAINED form of an animation,
 * on marks and on operators.
 *
 *   mark.transition({ enter: <effect> })          how the MARK looks while it
 *                                                  enters (`animation.*`)
 *   operator.transition({ enter: <arrangement> }) how the operator's CHILDREN
 *                                                  are arranged in time
 *                                                  (`time.stagger` /
 *                                                  `time.parallel`)
 *
 * Both only RECORD what was written, on the nodes they produce. The build-in
 * (`install.ts`) reads the records back off the finished tree: nested
 * operators become nested time frames, and the marks with effects become the
 * leaves. The SELECTION form (`.layer(chart(selectAll(...)).flow(time.stagger
 * (...)).mark(time.transition({ enter })))`) writes the same records on the
 * nodes its own flow produces (`timeArrangements.ts`), so both forms are read
 * by one core and mean the same thing.
 *
 * Which clock plays them depends on the chart. With no `time.sequence` in the
 * flow, every mark enters once, on the first render, from the empty chart:
 * the build-in. Under a `time.sequence` the marks enter, move and exit with
 * the data, and that is `time.transition()`'s job, so the chart builder turns
 * a mark's `.transition()` into that tier (`tweenTierFor`).
 */
import type { SplitBy } from "../ast/datumProjection";
import type { GoFishNode } from "../ast/_node";
import { effectList, isTween, type Effect, type TweenEffect } from "./effects";
import type { Arrangement } from "./schedule";

/** An arrangement as written: `time.stagger(...)` / `time.parallel()`, with
 *  the stagger's own `by`, which splits the children into groups that start
 *  together. */
export type ArrangementSpec = Arrangement & { by?: SplitBy };

/** A value `time.stagger(...)` or `time.parallel()` returned. It is a flow
 *  operator too (the selection form), and carries its arrangement so the
 *  chained form can read it. */
export type TimeArrangement = { readonly __timeArrangement: ArrangementSpec };

export type MarkTransition = {
  /** How the mark enters: one effect, or several played together. */
  enter?: Effect | Effect[];
  /** How the mark moves between two keyframes of a `time.sequence`. */
  update?: TweenEffect;
  /** How the mark leaves. */
  exit?: Effect | Effect[];
};

export type OperatorTransition = {
  /** How the operator's children are arranged in time as they enter. */
  enter?: TimeArrangement;
  update?: TimeArrangement;
  exit?: TimeArrangement;
};

/** What a node records, per phase. A MARK records how it looks: its enter
 *  and exit effects, and under a sequence the tween it moves by; the
 *  selection form's leaf also names the marks it animates (`targets`), where
 *  a chained mark animates itself. An OPERATOR records how its children are
 *  arranged in time: as they enter (the build-in reads it), as they move
 *  between two keyframes of a sequence (`time.transition()` reads it), and as
 *  they leave. Which phases can play depends on the chart's clock, so they
 *  are checked where that is known (`checkPhases`). */
type NodeTransition =
  | {
      kind: "mark";
      enter?: Effect[];
      update?: TweenEffect;
      exit?: Effect[];
      targets?: GoFishNode[];
    }
  | {
      kind: "operator";
      enter?: ArrangementSpec;
      update?: ArrangementSpec;
      exit?: ArrangementSpec;
    };

const records = new WeakMap<GoFishNode, NodeTransition>();

export const nodeTransition = (node: GoFishNode): NodeTransition | undefined =>
  records.get(node);

export function setNodeTransition(
  node: GoFishNode,
  record: NodeTransition
): void {
  records.set(node, record);
}

/** A mark's `.transition(spec)`, recorded on one node it produced. */
export function recordMarkTransition(
  node: GoFishNode,
  spec: MarkTransition
): void {
  const where = "mark.transition()";
  if (spec.update !== undefined && !isTween(spec.update)) {
    throw new Error(
      `[gofish] ${where}: \`update\` takes animation.tween({ curve, ease }).`
    );
  }
  records.set(node, {
    kind: "mark",
    enter: effectList(spec.enter, `${where} enter`),
    update: spec.update,
    exit: effectList(spec.exit, `${where} exit`),
  });
}

function arrangementOf(
  value: unknown,
  where: string
): ArrangementSpec | undefined {
  if (value === undefined) return undefined;
  const spec = (value as Partial<TimeArrangement> | null)?.__timeArrangement;
  if (spec === undefined) {
    throw new Error(
      `[gofish] ${where}: an operator's phase takes an arrangement of its ` +
        `children in time, time.stagger({ ... }) or time.parallel(). ` +
        `Effects (animation.grow(), …) go on the mark.`
    );
  }
  return spec;
}

/** An operator's `.transition(spec)`, recorded on the node it produced. */
export function recordOperatorTransition(
  node: GoFishNode,
  spec: OperatorTransition
): void {
  const where = "operator.transition()";
  records.set(node, {
    kind: "operator",
    enter: arrangementOf(spec.enter, `${where} enter`),
    update: arrangementOf(spec.update, `${where} update`),
    exit: arrangementOf(spec.exit, `${where} exit`),
  });
}

/** Charts that play DATA time (a flow with a `time.sequence`) mark their
 *  node, and the build-in leaves them alone: their marks enter and leave
 *  with the data, through `time.transition()`. */
const dataTime = new WeakSet<GoFishNode>();
export const markDataTime = (node: GoFishNode): void => {
  dataTime.add(node);
};
export const playsDataTime = (node: GoFishNode): boolean => dataTime.has(node);

/**
 * Check a node's record against the clock that plays it. With no
 * `time.sequence` (the build-in) marks enter once, on the first render, and
 * nothing updates or leaves after that. Under one, marks enter, move and
 * leave with the data, one stretch at a time: an operator can arrange only
 * its children's moves (`update`), and a mark enters and leaves only by the
 * tween's fade in place (`checkSequencePhases`).
 */
export function checkPhases(
  record: NodeTransition,
  underSequence: boolean
): void {
  if (!underSequence) {
    const phases = (["update", "exit"] as const).filter(
      (phase) => record[phase] !== undefined
    );
    if (phases.length > 0) {
      throw new Error(
        `[gofish] .transition({ ${phases.join(", ")} }): in a chart with no ` +
          `time.sequence, marks enter once, on the first render, and nothing ` +
          `updates or leaves after that. Update and exit phases need a data ` +
          `change to trigger them, which this prototype does not have.`
      );
    }
  } else if (record.kind === "mark") {
    checkSequencePhases(record, "mark.transition() under a time.sequence");
  } else if (record.enter !== undefined || record.exit !== undefined) {
    throw new Error(
      `[gofish] operator.transition({ enter / exit }) under a ` +
        `time.sequence: marks enter and leave with the data there, one ` +
        `stretch at a time, so arranging them is not in this prototype. ` +
        `\`update: time.stagger(...)\` is.`
    );
  }
}

/**
 * Under a `time.sequence`, a mark's `.transition()` is the chained spelling
 * of today's `.layer(time.transition({ curve, ease }))`: `update` says how the
 * mark moves between years, and the tier that moves it is returned here for
 * the chart builder to layer. Entering and leaving marks fade in place over
 * the stretch between two keyframes (the #892 default), which is what
 * `enter: animation.fadeIn()` and `exit: animation.fadeOut()` say; other
 * enter and exit effects under a sequence are not in this prototype (the
 * build checks them, `checkPhases`).
 */
export function tweenTierFor(spec: MarkTransition): unknown {
  const where = "mark.transition() under a time.sequence";
  if (spec.update === undefined) {
    throw new Error(
      `[gofish] ${where}: give \`update: animation.tween({ curve })\`, how ` +
        `the mark moves between keyframes. Entering and leaving marks fade ` +
        `in place with it.`
    );
  }
  return spec.update.layer();
}

/** Under a sequence the enter / exit of a mark is the tween's fade in place,
 *  over the whole stretch between two keyframes. */
export function checkSequencePhases(
  spec: { enter?: Effect | Effect[]; exit?: Effect | Effect[] },
  where: string
): void {
  const check = (phase: "enter" | "exit", kind: "fadeIn" | "fadeOut") => {
    const list = effectList(spec[phase], `${where} ${phase}`) ?? [];
    for (const e of list) {
      if (e.kind !== kind || e.duration !== undefined || e.ease !== undefined) {
        throw new Error(
          `[gofish] ${where}: \`${phase}\` can only be animation.${kind}() ` +
            `(no duration or ease) in this prototype. A mark that ${phase}s during ` +
            `a sequence fades in place over the whole stretch between two ` +
            `keyframes (#892); other ${phase} effects are not built yet.`
        );
      }
    }
  };
  check("enter", "fadeIn");
  check("exit", "fadeOut");
}

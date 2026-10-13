/**
 * TEMPORAL CLAUSES in `.relate()`: a layer is a time container.
 *
 * PROTOTYPE (animation grammar proposal, approach A, "layer is the time
 * container"). Every child of a layer has a lifetime on t the way it has an
 * extent on x and y, and `.relate()` takes clauses that place lifetimes the
 * way `Constraint.distribute` and `Constraint.align` place boxes:
 *
 *   time.after(a, b, { gap })            b starts `gap` ms after a ends
 *   time.align({ t: "start" }, [a, b])    a and b start together ("end": end)
 *   time.transition(a, b, { duration })  a temporal RELATIONAL mark: a magic
 *                                        move from a into b
 *
 * With no temporal clause a layer is static: every child starts at t = 0 and
 * stays. The rules a lifetime follows:
 *
 *   - A child starts at 0 unless a clause places it. A static child has zero
 *     length, so it ends where it starts.
 *   - Before it starts a child is absent. After it ends it SUSTAINS (stays
 *     drawn), unless a transition consumes it: the source of a transition
 *     leaves when the transition starts, and the target arrives when it ends.
 *   - `time.after` is "at least": b starts no earlier than a's end plus the
 *     gap (DECLARED PROTOTYPE SHORTCUT: the clauses are solved by longest
 *     path, not as the equalities the spatial `distribute` solves; the right
 *     fix is to run them through the difference-graph solver the spatial
 *     clauses use, `constraints/differenceGraph.ts`).
 *   - `time.transition(a, b)` with no duration fills the gap between a's end
 *     and b's start. With `duration` it also asks for that gap (b starts at
 *     least `duration` after a ends) and plays in its LAST `duration` ms, so a
 *     longer gap holds a still first.
 *
 * A chain of transitions (a -> b -> c) is ONE morph over the chain's
 * keyframes (`morph.ts`), each keyframe held over its lifetime, which is the
 * same thing `time.sequence({...}, [a, b, c])` lowers to: the sequence is a
 * timeline whose keyframes are evenly spaced and never hold.
 *
 * The clock is the chart's: one `timer` over [0, total] ms per timeline,
 * built when the chart renders from the render options `playing`, `at` (ms)
 * and `loop` (`installTimelines`), like the build-in's clock.
 */
import { GoFishNode } from "../ast/_node";
import { RelateOperand } from "../ast/constraints/relate";
import { timer, type Timer } from "../interaction/inputs";
import { resolveMethod } from "../interpolate";
import type { Curve } from "../families/curve";
import { resolveEase, type Ease } from "./effects";
import { morph } from "./morph";
import { markDataTime } from "./transition";

export type AfterOptions = {
  /** Milliseconds between a's end and b's start. Default 0 ("meets"). */
  gap?: number;
};
export type AlignTimeOptions = { t: "start" | "end" };
export type TemporalTransitionOptions = {
  /** Milliseconds the move takes; default the whole gap between a and b. */
  duration?: number;
  curve?: Curve;
  ease?: Ease;
};

export type TemporalClause =
  | {
      readonly __temporal: "after";
      a: RelateOperand;
      b: RelateOperand;
      gap: number;
    }
  | {
      readonly __temporal: "align";
      t: "start" | "end";
      operands: RelateOperand[];
    }
  | {
      readonly __temporal: "transition";
      a: RelateOperand;
      b: RelateOperand;
      opts: TemporalTransitionOptions;
    };

export const isTemporalClause = (c: unknown): c is TemporalClause =>
  typeof c === "object" &&
  c !== null &&
  typeof (c as { __temporal?: unknown }).__temporal === "string";

const operand = (v: unknown, where: string): RelateOperand => {
  if (v instanceof RelateOperand) return v;
  throw new Error(
    `[gofish] ${where}: its operands are the names a .relate() callback ` +
      `receives, e.g. .relate(({ a, b }) => [${where.replace(/\(.*$/, "")}(a, b)]).`
  );
};

export function after(
  a: RelateOperand,
  b: RelateOperand,
  opts: AfterOptions = {}
): TemporalClause {
  return {
    __temporal: "after",
    a: operand(a, "time.after()"),
    b: operand(b, "time.after()"),
    gap: opts.gap ?? 0,
  };
}

export function align(
  opts: AlignTimeOptions,
  operands: RelateOperand[]
): TemporalClause {
  return {
    __temporal: "align",
    t: opts.t,
    operands: operands.map((o) => operand(o, "time.align()")),
  };
}

export function temporalTransition(
  a: RelateOperand,
  b: RelateOperand,
  opts: TemporalTransitionOptions = {}
): TemporalClause {
  return {
    __temporal: "transition",
    a: operand(a, "time.transition()"),
    b: operand(b, "time.transition()"),
    opts,
  };
}

/** A timeline's clock, which exists once the chart renders. Until then the
 *  playhead reads 0. */
type ClockHolder = { clock?: Timer<number>; total: number };

const timelines = new WeakMap<GoFishNode, ClockHolder>();

/** The node in `layer` a relate operand names. */
function nodeNamed(layer: GoFishNode, name: string): GoFishNode {
  const walk = (n: GoFishNode): GoFishNode | undefined => {
    if (n !== layer && n._name === name) return n;
    for (const c of n.children) {
      if (c instanceof GoFishNode) {
        const found = walk(c);
        if (found) return found;
      }
    }
    return undefined;
  };
  const found = walk(layer);
  if (found === undefined) {
    throw new Error(`[gofish] time.*: no node named "${name}" in this layer.`);
  }
  return found;
}

/**
 * Solve the temporal clauses of `layer` and lower them: each child's lifetime
 * becomes a paint-time visibility rule, and each chain of transitions a
 * morph, added to the layer as drawing clauses (laid out after the layer's
 * spatial solve, like an arrow). Returns the nodes to add.
 */
export async function installTimeline(
  layer: GoFishNode,
  clauses: TemporalClause[]
): Promise<GoFishNode[]> {
  const nodeOf = (o: RelateOperand) => nodeNamed(layer, o.name);
  const start = new Map<GoFishNode, number>();
  const s = (n: GoFishNode) => start.get(n) ?? 0;
  const transitions = clauses.filter(
    (c): c is Extract<TemporalClause, { __temporal: "transition" }> =>
      c.__temporal === "transition"
  );
  for (const c of clauses) {
    if (c.__temporal === "align")
      c.operands.forEach((o) => start.set(nodeOf(o), 0));
    else {
      start.set(nodeOf(c.a), 0);
      start.set(nodeOf(c.b), 0);
    }
  }
  // Longest path (see the header): raise each start to what the clauses ask,
  // until nothing moves. A static child has zero length, so its end is its
  // start.
  const limit = (clauses.length + 1) * (start.size + 1);
  let changed = true;
  for (let round = 0; changed; round++) {
    if (round > limit) {
      throw new Error(
        `[gofish] .relate(): the time clauses form a cycle (a is after b and ` +
          `b is after a), so no start satisfies them.`
      );
    }
    changed = false;
    const raise = (n: GoFishNode, v: number) => {
      if (v > s(n) + 1e-9) {
        start.set(n, v);
        changed = true;
      }
    };
    for (const c of clauses) {
      if (c.__temporal === "after") raise(nodeOf(c.b), s(nodeOf(c.a)) + c.gap);
      else if (c.__temporal === "transition") {
        raise(nodeOf(c.b), s(nodeOf(c.a)) + (c.opts.duration ?? 0));
      } else {
        const ns = c.operands.map(nodeOf);
        const top = Math.max(...ns.map(s));
        ns.forEach((n) => raise(n, top));
      }
    }
  }

  // Each transition's span, and the chains they form.
  const out = new Map<GoFishNode, (typeof transitions)[number]>();
  const into = new Map<GoFishNode, (typeof transitions)[number]>();
  for (const c of transitions) {
    const [a, b] = [nodeOf(c.a), nodeOf(c.b)];
    if (out.has(a) || into.has(b)) {
      throw new Error(
        `[gofish] time.transition(${c.a.name}, ${c.b.name}): a node can be ` +
          `the source of one transition and the target of one. Branching ` +
          `transitions are not in this prototype.`
      );
    }
    out.set(a, c);
    into.set(b, c);
  }
  const span = (c: (typeof transitions)[number]): [number, number] => {
    const end = s(nodeOf(c.b));
    const from = s(nodeOf(c.a));
    return [c.opts.duration === undefined ? from : end - c.opts.duration, end];
  };
  const total = Math.max(0, ...[...start.values()]);

  const holder: ClockHolder = { total };
  timelines.set(layer, holder);
  const playhead = () => holder.clock?.() ?? 0;
  markDataTime(layer);

  // Lifetimes: present from its start (the end of the transition that brings
  // it in), until the start of the transition that takes it away.
  for (const n of start.keys()) {
    const from = s(n);
    const leaving = out.get(n);
    const until = leaving === undefined ? Infinity : span(leaving)[0];
    n.INTERNAL_visibleWhile(holder, () => {
      const t = playhead();
      return t >= from && t < until;
    });
  }

  // One morph per chain, over its keyframes each HELD for its lifetime: a
  // keyframe stands at its start and again where it leaves, when those
  // differ, so the moving marks hold it still in between.
  const moving: GoFishNode[] = [];
  for (const head of transitions.map((c) => nodeOf(c.a))) {
    if (into.has(head)) continue;
    const keyframes: GoFishNode[] = [];
    const knots: number[] = [];
    const push = (n: GoFishNode, t: number) => {
      if (knots.length > 0 && t <= knots[knots.length - 1] + 1e-9) return;
      keyframes.push(n);
      knots.push(t);
    };
    let n: GoFishNode | undefined = head;
    let first: (typeof transitions)[number] | undefined;
    while (n !== undefined) {
      push(n, s(n));
      const c = out.get(n);
      if (c === undefined) {
        push(n, total);
        break;
      }
      first ??= c;
      push(n, span(c)[0]);
      n = nodeOf(c.b);
    }
    const opts = first!.opts;
    moving.push(
      ...(await morph(keyframes, {
        knots,
        at: playhead,
        method: resolveMethod(opts.curve, "time.transition({ curve })"),
        ease: opts.ease === undefined ? undefined : resolveEase(opts.ease),
        msPerUnit: () => 1,
      }))
    );
  }
  return moving;
}

export type TimelineClockOptions = {
  playing?: boolean;
  /** Where the playhead starts, in ms. */
  at?: number;
  /** Start over at the end. Default false. */
  loop?: boolean;
};

/** Build the clock of every timeline under `root` (see the header). Returns
 *  what stops them, when there are any. */
export function installTimelines(
  root: GoFishNode,
  options: TimelineClockOptions
): (() => void) | undefined {
  const stops: (() => void)[] = [];
  const walk = (n: GoFishNode): void => {
    const holder = timelines.get(n);
    if (holder !== undefined && holder.total > 0) {
      const clock = timer<number>({
        domain: [0, holder.total],
        duration: holder.total,
        loop: options.loop ?? false,
        playing: options.playing ?? true,
      });
      if (options.at !== undefined) clock.set(options.at);
      holder.clock = clock;
      stops.push(clock.pause);
    }
    for (const c of n.children) if (c instanceof GoFishNode) walk(c);
  };
  walk(root);
  return stops.length === 0 ? undefined : () => stops.forEach((f) => f());
}

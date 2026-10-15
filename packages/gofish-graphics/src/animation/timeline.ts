/**
 * `timeline([...]).relate(...)`: SCENES, different pictures over time.
 *
 * PROTOTYPE (animation grammar proposal). Two containers, two meanings:
 *
 *   layer([...])     the parts of ONE picture, all there together at rest
 *                    (a part may enter with a build-in, `.transition({ enter
 *                    })`, but parts never replace each other);
 *   timeline([...])  scenes: each child is a whole picture with an interval
 *                    of its own on the timeline's clock, and `.relate()`
 *                    places the intervals with temporal clauses only.
 *
 * The clauses:
 *
 *   time.after(a, b, { gap = 0 })        b starts `gap` ms after a ends
 *   time.align({ t: "start" | "end" }, [a, b, ...])
 *                                         they start (or end) together
 *   time.transition(a, b, { ease, curve, key })
 *                                         a temporal RELATIONAL mark: the
 *                                         move from a into b
 *
 * THE INTERVAL RULES.
 *
 *   - Every scene has an interval [start, start + length). Its LENGTH is its
 *     `.hold(ms)`, how long it is on screen, or, without one, its intrinsic
 *     length: the length of its own build-in (0 for a static scene). A hold
 *     shorter than the build-in is an error.
 *   - A scene is drawn during its own interval and at no other time. The
 *     timeline's last instant (the playhead held at the end) belongs to the
 *     scenes that end there, the way a band scale's last band holds its end.
 *   - `time.after` and `time.align` are equalities. Scenes joined by clauses
 *     are solved together and placed so the earliest of them starts at 0; a
 *     scene no clause places is a group of one, so it starts at 0. Clauses
 *     that disagree (over-constrained) or a cycle of `time.after` are errors.
 *   - `time.transition(a, b)` has no duration: it spans exactly the gap
 *     [a.end, b.start), and during it neither a nor b is drawn, only the
 *     morph between them. A zero gap is a cut. b starting before a ends is an
 *     error.
 *   - The morph goes from a as it stands at its end to b as it stands at its
 *     start: a mark of b that enters with a build-in is not there yet, so the
 *     morph leaves it out and b's own build-in brings it in.
 *   - A scene's build-in plays on the timeline's clock from the scene's
 *     start.
 *
 * Marks are matched across a transition by the rows they draw, compared by
 * `key` (`identity.ts`).
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
import type { Key } from "./identity";
import { morph } from "./morph";
import { holdOf } from "./scene";
import { sceneBuild, type SceneBuild } from "./install";

export type AfterOptions = {
  /** Milliseconds between a's end and b's start. Default 0 ("meets"). */
  gap?: number;
};
export type AlignTimeOptions = { t: "start" | "end" };
export type TemporalTransitionOptions = {
  curve?: Curve;
  ease?: Ease;
  /** What marks are matched by: a field name or a function of a row.
   *  Default: the row itself (the same row object in both scenes). */
  key?: Key;
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
      `receives, e.g. timeline([...]).relate(({ a, b }) => ` +
      `[${where.replace(/\(.*$/, "")}(a, b)]).`
  );
};

export function after(
  a: RelateOperand,
  b: RelateOperand,
  opts: AfterOptions = {}
): TemporalClause {
  const gap = opts.gap ?? 0;
  if (!(Number.isFinite(gap) && gap >= 0)) {
    throw new Error(
      `[gofish] time.after(a, b, { gap: ${gap} }): a gap is a number of ` +
        `milliseconds, 0 or more.`
    );
  }
  return {
    __temporal: "after",
    a: operand(a, "time.after()"),
    b: operand(b, "time.after()"),
    gap,
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
  if ((opts as { duration?: unknown }).duration !== undefined) {
    throw new Error(
      `[gofish] time.transition(a, b, { duration }): a transition has no ` +
        `duration of its own; it spans the gap between a's end and b's ` +
        `start. Set the gap with time.after(a, b, { gap }).`
    );
  }
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

const clocks = new WeakMap<GoFishNode, ClockHolder>();

/** One scene's solved interval. */
export type Interval = { start: number; end: number };

/**
 * Solve the intervals of `scenes` (each with its length) under `clauses`
 * (see the header). Pure arithmetic, so it is tested on its own
 * (`src/tests/timelineIntervals.test.ts`).
 */
export function solveIntervals(
  names: string[],
  lengths: number[],
  clauses: TemporalClause[]
): Interval[] {
  const index = (o: RelateOperand, where: string): number => {
    const i = names.indexOf(o.name);
    if (i < 0) {
      throw new Error(
        `[gofish] ${where}: "${o.name}" is not a scene of this timeline. A ` +
          `clause relates the timeline's own children, named with .name().`
      );
    }
    return i;
  };
  // Every equality as an edge: start[j] = start[i] + d.
  const edges: { i: number; j: number; d: number; what: string }[] = [];
  const afterEdges: [number, number][] = [];
  for (const c of clauses) {
    if (c.__temporal === "after") {
      const [i, j] = [index(c.a, "time.after()"), index(c.b, "time.after()")];
      const what = `time.after(${c.a.name}, ${c.b.name})`;
      edges.push({ i, j, d: lengths[i] + c.gap, what });
      afterEdges.push([i, j]);
    } else if (c.__temporal === "align") {
      const ids = c.operands.map((o) => index(o, "time.align()"));
      const what = `time.align({ t: "${c.t}" }, [${c.operands
        .map((o) => o.name)
        .join(", ")}])`;
      for (const j of ids.slice(1)) {
        const i = ids[0];
        // start: s_j = s_i; end: s_j + len_j = s_i + len_i.
        const d = c.t === "start" ? 0 : lengths[i] - lengths[j];
        edges.push({ i, j, d, what });
      }
    }
  }
  // A cycle of afters is an error, whatever the lengths.
  const next = names.map(() => [] as number[]);
  for (const [i, j] of afterEdges) next[i].push(j);
  const state = names.map(() => 0);
  const visit = (i: number, path: number[]): void => {
    if (state[i] === 1) {
      const cycle = [...path.slice(path.indexOf(i)), i].map((k) => names[k]);
      throw new Error(
        `[gofish] timeline.relate(): the time.after clauses form a cycle ` +
          `(${cycle.join(" -> ")}), so no start satisfies them.`
      );
    }
    if (state[i] === 2) return;
    state[i] = 1;
    for (const j of next[i]) visit(j, [...path, i]);
    state[i] = 2;
  };
  names.forEach((_, i) => visit(i, []));

  // Solve each group of joined scenes relative to its first scene, then
  // place it so its earliest scene starts at 0.
  const adj = names.map(() => [] as { to: number; d: number; what: string }[]);
  for (const e of edges) {
    adj[e.i].push({ to: e.j, d: e.d, what: e.what });
    adj[e.j].push({ to: e.i, d: -e.d, what: e.what });
  }
  const start: (number | undefined)[] = names.map(() => undefined);
  for (let root = 0; root < names.length; root++) {
    if (start[root] !== undefined) continue;
    start[root] = 0;
    const group = [root];
    for (let q = 0; q < group.length; q++) {
      const i = group[q];
      for (const { to, d, what } of adj[i]) {
        const want = start[i]! + d;
        if (start[to] === undefined) {
          start[to] = want;
          group.push(to);
        } else if (Math.abs(start[to]! - want) > 1e-6) {
          throw new Error(
            `[gofish] timeline.relate(): the clauses are over-constrained: ` +
              `${what} puts "${names[to]}" at ${want} ms, and the other ` +
              `clauses put it at ${start[to]} ms.`
          );
        }
      }
    }
    const lowest = Math.min(...group.map((i) => start[i]!));
    for (const i of group) start[i] = start[i]! - lowest;
  }
  return names.map((_, i) => ({
    start: start[i]!,
    end: start[i]! + lengths[i],
  }));
}

/**
 * Solve the clauses of `timeline` and lower them: each scene's interval
 * becomes a paint-time visibility rule and its build-in a set of rules on
 * the timeline's clock, and each transition a morph, which the caller adds
 * to the timeline as drawing clauses (laid out after the scenes, like an
 * arrow). Returns the morph's nodes.
 */
export async function installTimeline(
  timeline: GoFishNode,
  clauses: TemporalClause[]
): Promise<GoFishNode[]> {
  const scenes = timeline.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode && !c._relateClause
  );
  const names = scenes.map((s) => (typeof s._name === "string" ? s._name : ""));
  const builds: (SceneBuild | undefined)[] = scenes.map(sceneBuild);
  const lengths = scenes.map((scene, i) => {
    const intrinsic = builds[i]?.total ?? 0;
    const hold = holdOf(scene);
    if (hold !== undefined && hold < intrinsic - 1e-9) {
      throw new Error(
        `[gofish] .hold(${hold}) on scene "${names[i] || i}": the scene's ` +
          `own build-in lasts ${intrinsic} ms, so it cannot be on screen for ` +
          `less. Hold it for at least ${intrinsic} ms, or shorten the build-in.`
      );
    }
    return hold ?? intrinsic;
  });
  const intervals = solveIntervals(names, lengths, clauses);
  const total = Math.max(0, ...intervals.map((iv) => iv.end));

  const holder: ClockHolder = { total };
  clocks.set(timeline, holder);
  const playhead = () => holder.clock?.() ?? 0;
  /** Whether an interval is showing at `t` (see the header). */
  const showing = (t: number, { start, end }: Interval) =>
    (t >= start && t < end) || (end >= total - 1e-9 && t >= total - 1e-9);

  scenes.forEach((scene, i) => {
    // The timeline is the owner of its scenes' visibility, so relating it
    // again replaces these rules.
    scene.INTERNAL_visibleWhile(timeline, () =>
      showing(playhead(), intervals[i])
    );
    builds[i]?.install(playhead, intervals[i].start);
  });

  const moving: GoFishNode[] = [];
  for (const c of clauses) {
    if (c.__temporal !== "transition") continue;
    const [a, b] = [c.a, c.b].map((o) => scenes[names.indexOf(o.name)]);
    const [ia, ib] = [scenes.indexOf(a), scenes.indexOf(b)];
    const from = intervals[ia].end;
    const to = intervals[ib].start;
    if (to < from - 1e-9) {
      throw new Error(
        `[gofish] time.transition(${c.a.name}, ${c.b.name}): "${c.b.name}" ` +
          `starts at ${to} ms, before "${c.a.name}" ends at ${from} ms. A ` +
          `transition spans the gap from a's end to b's start, so b must ` +
          `start after a ends: add time.after(${c.a.name}, ${c.b.name}, ` +
          `{ gap }).`
      );
    }
    // A zero gap is a cut: nothing moves.
    if (to - from <= 1e-9) continue;
    const nodes = await morph([a, b], {
      knots: [from, to],
      at: playhead,
      method: resolveMethod(c.opts.curve, "time.transition({ curve })"),
      ease: c.opts.ease === undefined ? undefined : resolveEase(c.opts.ease),
      msPerUnit: () => 1,
      key: c.opts.key,
      // b as it stands at its start: what its build-in brings in is not
      // there yet.
      absent: [new Set(), builds[ib]?.entering ?? new Set()],
      keyframesDraw: true,
      where: `time.transition(${c.a.name}, ${c.b.name})`,
    });
    for (const node of nodes) {
      node.INTERNAL_visibleWhile(timeline, () => {
        const t = playhead();
        return t >= from && t < to;
      });
    }
    moving.push(...nodes);
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
    const holder = clocks.get(n);
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

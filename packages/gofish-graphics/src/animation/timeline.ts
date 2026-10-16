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
 *     `.duration(ms)`, how long it is on screen, or, without one, its
 *     intrinsic length: the length of its own build-in (0 for a static
 *     scene). A duration shorter than the build-in is an error. A
 *     data-valued `.duration(datum(v))` is scaled to fit the timeline's own
 *     `.duration(T)`, as a data-sized child fits a spread's `w`
 *     (`fitLengths`).
 *   - A scene is drawn during its own interval and at no other time. The
 *     timeline's last instant (the playhead held at the end) belongs to the
 *     scenes that end there, the way a band scale's last band holds its end.
 *   - `time.after` and `time.align` are equalities. Scenes joined by clauses
 *     are solved together and placed so the earliest of them starts at 0; a
 *     scene no clause places is a group of one, so it starts at 0. Clauses
 *     that disagree (over-constrained) or a cycle of `time.after` are errors,
 *     except on a CYCLIC timeline (`timeline({ cyclic: true }, [...])`),
 *     where exactly one `time.after` closes the loop (`solveIntervals`).
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
 * built when the chart renders from the timeline's own options `playing`,
 * `at` (ms) and `cyclic`, or else the render options `playing`, `at` and
 * `loop` (`installTimelines`), like the build-in's clock.
 */
import { GoFishNode } from "../ast/_node";
import { RelateOperand } from "../ast/constraints/relate";
import { timer, type Timer } from "../interaction/inputs";
import { resolveMethod } from "../interpolate";
import type { Curve } from "../families/curve";
import { resolveEase, type Ease } from "./effects";
import type { Key } from "./identity";
import { morph } from "./morph";
import {
  durationOf,
  durationParts,
  isTimeline,
  timelineOptions,
  type TimelineOptions,
} from "./scene";
import * as Monotonic from "../util/monotonic";
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
type ClockHolder = {
  clock?: Timer<number>;
  total: number;
  /** The timeline's own clock options (`timeline({ cyclic, playing, at })`),
   *  which win over the render options. */
  opts: TimelineOptions;
};

const clocks = new WeakMap<GoFishNode, ClockHolder>();

/** One scene's solved interval. */
export type Interval = { start: number; end: number };

/** The solved timeline: each scene's interval, and the total length, which
 *  is one turn of the loop when the timeline is cyclic. */
export type SolvedTimeline = { intervals: Interval[]; total: number };

/**
 * Solve the intervals of `scenes` (each with its length) under `clauses`
 * (see the header). Pure arithmetic, so it is tested on its own
 * (`src/tests/timeline.test.ts`).
 *
 * A CYCLIC timeline is time on a circle. Exactly one `time.after` clause
 * closes the loop (the edge a depth-first walk of the `time.after` clauses
 * finds going back to a scene it has not finished); the others are solved as
 * on a line. The loop-closing clause `time.after(a, b, { gap })` then fixes
 * the length of one turn, `a.end + gap - b.start`, and b starts at 0. Every
 * scene must fit in that one turn.
 *
 * PROTOTYPE SHORTCUT: one loop only. A timeline with two loops (two
 * loop-closing clauses) is an error rather than a check that both loops have
 * the same length.
 */
export function solveIntervals(
  names: string[],
  lengths: number[],
  clauses: TemporalClause[],
  cyclic = false
): SolvedTimeline {
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
  type Edge = { i: number; j: number; d: number; what: string };
  const afters: (Edge & { gap: number })[] = [];
  const aligns: Edge[] = [];
  for (const c of clauses) {
    if (c.__temporal === "after") {
      const [i, j] = [index(c.a, "time.after()"), index(c.b, "time.after()")];
      const what = `time.after(${c.a.name}, ${c.b.name})`;
      afters.push({ i, j, d: lengths[i] + c.gap, what, gap: c.gap });
    } else if (c.__temporal === "align") {
      const ids = c.operands.map((o) => index(o, "time.align()"));
      const what = `time.align({ t: "${c.t}" }, [${c.operands
        .map((o) => o.name)
        .join(", ")}])`;
      for (const j of ids.slice(1)) {
        const i = ids[0];
        // start: s_j = s_i; end: s_j + len_j = s_i + len_i.
        const d = c.t === "start" ? 0 : lengths[i] - lengths[j];
        aligns.push({ i, j, d, what });
      }
    }
  }
  // The `time.after` clauses that go back to a scene the walk has not
  // finished: on a line, a cycle (an error); on a circle, the loop.
  const next = names.map(() => [] as (typeof afters)[number][]);
  for (const e of afters) next[e.i].push(e);
  const state = names.map(() => 0);
  const back: { edge: (typeof afters)[number]; path: number[] }[] = [];
  const visit = (i: number, path: number[]): void => {
    if (state[i] === 2) return;
    state[i] = 1;
    for (const e of next[i]) {
      if (state[e.j] === 1) back.push({ edge: e, path: [...path, i] });
      else visit(e.j, [...path, i]);
    }
    state[i] = 2;
  };
  names.forEach((_, i) => visit(i, []));
  const cycleText = ({ edge, path }: (typeof back)[number]) =>
    [...path.slice(path.indexOf(edge.j)), edge.j]
      .map((k) => names[k])
      .join(" -> ");
  if (!cyclic && back.length > 0) {
    throw new Error(
      `[gofish] timeline.relate(): the time.after clauses form a cycle ` +
        `(${cycleText(back[0])}), so no start satisfies them. A timeline ` +
        `that loops back to its first scene is timeline({ cyclic: true }, ` +
        `[...]).`
    );
  }
  if (cyclic && back.length !== 1) {
    throw new Error(
      back.length === 0
        ? `[gofish] timeline({ cyclic: true }): a cyclic timeline loops, so ` +
          `one time.after clause must close the loop, from a later scene ` +
          `back to the first (e.g. time.after(last, first, { gap })).`
        : `[gofish] timeline({ cyclic: true }): the time.after clauses close ` +
          `${back.length} loops (${back.map(cycleText).join("; ")}). A ` +
          `cyclic timeline loops once.`
    );
  }
  const wrap = cyclic ? back[0].edge : undefined;
  const edges: Edge[] = [...afters.filter((e) => e !== wrap), ...aligns];

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
  if (wrap === undefined) {
    const intervals = names.map((_, i) => ({
      start: start[i]!,
      end: start[i]! + lengths[i],
    }));
    return { intervals, total: Math.max(0, ...intervals.map((iv) => iv.end)) };
  }
  // The loop: b starts at 0, and one turn ends where the clause puts b again.
  const origin = start[wrap.j]!;
  const intervals = names.map((_, i) => ({
    start: start[i]! - origin,
    end: start[i]! - origin + lengths[i],
  }));
  const total = intervals[wrap.i].end + wrap.gap;
  intervals.forEach((iv, i) => {
    if (iv.start < -1e-6 || iv.end > total + 1e-6) {
      throw new Error(
        `[gofish] timeline({ cyclic: true }): "${names[i]}" runs from ` +
          `${iv.start} to ${iv.end} ms, outside the loop, which ` +
          `${wrap.what} closes from 0 to ${total} ms. Every scene of a ` +
          `cyclic timeline is in one turn of the loop.`
      );
    }
  });
  return { intervals, total };
}

/**
 * The scene lengths of a timeline and the total, fitted to the timeline's
 * own `.duration(T)` the way a spread with a fixed `w` fits its children.
 *
 * Spatially (`constraints/distribute.ts` `chainClaim`, solved by
 * `solver/scopes.ts` `solveScope`): a spread's size claim is σ-affine,
 * `w(σ) = σ · (sum of its data-sized children) + (sum of its fixed-size
 * children) + (sum of its spacings)`, and a fixed `w` is the frame equation
 * `w(σ) = W`, solved by `Monotonic.inverse`. Only the data-sized children
 * flex; spacing and fixed sizes never do. On t the same: a scene's
 * `.duration(datum(v))` is data-sized (σ ms per data unit), a
 * `.duration(ms)` or a scene's own build-in length is fixed, and the gaps
 * are the spacing. With no `.duration(T)` there is nothing to solve σ from,
 * as at a spatial scope root with no size, so a data-valued duration is an
 * error there.
 *
 * Where spread is silent the timeline is loud (see the errors below):
 * spread with a fixed `w` and nothing data-sized keeps its children's
 * natural sizes and leaves slack, and a `w` smaller than its fixed part
 * draws the content overflowing. A timeline of a different length than its
 * scenes and gaps add up to has no picture to show in the slack.
 */
function fitLengths(
  timeline: GoFishNode,
  scenes: GoFishNode[],
  names: string[],
  intrinsic: number[],
  clauses: TemporalClause[],
  cyclic: boolean
): number[] {
  const label = (i: number) => names[i] || String(i);
  const written = scenes.map((s) => durationOf(s));
  const parts = written.map((d, i) =>
    d === undefined ? { fixed: intrinsic[i], data: 0 } : durationParts(d)
  );
  const dataScenes = written
    .map((d, i) => (d !== undefined && typeof d !== "number" ? i : -1))
    .filter((i) => i >= 0);
  const at = (sigma: number) => parts.map((p) => p.fixed + sigma * p.data);
  const total = durationOf(timeline);
  if (total !== undefined && typeof total !== "number") {
    throw new Error(
      `[gofish] timeline(...).duration(datum(...)): a timeline's duration ` +
        `is its total in ms; its scenes' data-valued durations are what fit it.`
    );
  }
  let sigma = 0;
  if (total === undefined) {
    if (dataScenes.length > 0) {
      throw new Error(
        `[gofish] .duration(datum(...)) on scene "${label(dataScenes[0])}": ` +
          `a data-valued duration is scaled to ms by the timeline's total, ` +
          `as a data-sized child of a spread is scaled by its \`w\`, and this ` +
          `timeline has none. Give the timeline a .duration(ms) (a sequence ` +
          `its \`duration\`), or give the scene a duration in ms.`
      );
    }
  } else {
    // The claim `total(σ)`, read at three scales: it is affine in σ when the
    // clauses chain the scenes (after, align start), as a spread's chain is.
    const [t0, t1, t2] = [0, 1, 2].map(
      (s) => solveIntervals(names, at(s), clauses, cyclic).total
    );
    if (Math.abs(t2 - 2 * t1 + t0) > 1e-6) {
      // PROTOTYPE SHORTCUT: `time.align({ t: "end" })` over data-valued
      // scenes can make the total piecewise in σ; the fit handles the affine
      // case only.
      throw new Error(
        `[gofish] timeline(...).duration(${total}): the clauses make the ` +
          `total depend on the data-valued durations in a way this prototype ` +
          `cannot fit (not affine).`
      );
    }
    const claim = Monotonic.linear(t1 - t0, t0);
    const solved = claim.inverse(total);
    const fixedPart = `${t0} ms of fixed durations and gaps`;
    if (solved === undefined) {
      if (Math.abs(total - t0) > 1e-6) {
        throw new Error(
          `[gofish] timeline(...).duration(${total}): nothing in it flexes. ` +
            `Its scenes and gaps add up to ${t0} ms, all fixed; only a ` +
            `data-valued scene duration, .duration(datum(v)), is scaled to ` +
            `fit a total, as only a data-sized child of a spread is scaled ` +
            `to fit its \`w\`. Drop the total, or make it ${t0}.`
        );
      }
    } else if (solved < 0) {
      throw new Error(
        `[gofish] timeline(...).duration(${total}): over-constrained. The ` +
          `timeline has ${fixedPart}, more than its total, so its ` +
          `data-valued scenes would need a negative length.`
      );
    } else {
      sigma = solved;
    }
  }
  const lengths = at(sigma);
  lengths.forEach((len, i) => {
    if (written[i] !== undefined && len < intrinsic[i] - 1e-9) {
      throw new Error(
        `[gofish] .duration(${typeof written[i] === "number" ? written[i] : `datum(${parts[i].data})`}) ` +
          `on scene "${label(i)}": the scene is ${len} ms long, but its own ` +
          `build-in lasts ${intrinsic[i]} ms, so it cannot be on screen for ` +
          `less. Make it at least ${intrinsic[i]} ms, or shorten the build-in.`
      );
    }
  });
  return lengths;
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
  const opts = timelineOptions(timeline);
  const cyclic = opts.cyclic ?? false;
  const scenes = timeline.children.filter(
    (c): c is GoFishNode => c instanceof GoFishNode && !c._relateClause
  );
  const names = scenes.map((s) => (typeof s._name === "string" ? s._name : ""));
  const builds: (SceneBuild | undefined)[] = scenes.map(sceneBuild);
  const intrinsic = builds.map((b) => b?.total ?? 0);
  const lengths = fitLengths(
    timeline,
    scenes,
    names,
    intrinsic,
    clauses,
    cyclic
  );
  const { intervals, total } = solveIntervals(names, lengths, clauses, cyclic);

  const holder: ClockHolder = { total, opts };
  clocks.set(timeline, holder);
  const request = clockRequests.get(timeline);
  if (request !== undefined)
    request.clock = buildClock(holder, request.options);
  /** The playhead, in [0, total]; on a cycle, `total` is 0 again. */
  const playhead = () => {
    const t = holder.clock?.() ?? 0;
    return cyclic && total > 0 && t >= total - 1e-9 ? 0 : t;
  };
  /** Whether an interval is showing at `t` (see the header). On a line, the
   *  last instant belongs to the scenes that end there; on a circle it is
   *  the first instant again. */
  const showing = (t: number, { start, end }: Interval) =>
    (t >= start && t < end) ||
    (!cyclic && end >= total - 1e-9 && t >= total - 1e-9);

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
    let to = intervals[ib].start;
    // On a circle, b after a's end may be on the next turn: the transition
    // into the first scene runs up to the end of the loop.
    if (cyclic && to < from - 1e-9) to += total;
    if (to < from - 1e-9) {
      throw new Error(
        `[gofish] time.transition(${c.a.name}, ${c.b.name}): "${c.b.name}" ` +
          `starts at ${to} ms, before "${c.a.name}" ends at ${from} ms. A ` +
          `transition spans the gap from a's end to b's start, so b must ` +
          `start after a ends: add time.after(${c.a.name}, ${c.b.name}, ` +
          `{ gap }).`
      );
    }
    if (to > total + 1e-9) {
      // PROTOTYPE SHORTCUT: a transition across the loop's seam must end at
      // the seam (into the scene the loop starts with); one that runs on past
      // it would need the morph split in two.
      throw new Error(
        `[gofish] time.transition(${c.a.name}, ${c.b.name}): it crosses the ` +
          `cyclic timeline's seam at ${total} ms and ends at ${to - total} ms ` +
          `of the next turn. The prototype only moves across the seam into ` +
          `the scene the loop starts with.`
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

/** The render options of each timeline being rendered, kept until the
 *  timeline knows its total and builds its clock (`installTimeline`, which
 *  runs in the layout pass, after the render terminal installs the clocks). */
const clockRequests = new WeakMap<
  GoFishNode,
  { options: TimelineClockOptions; clock?: Timer<number> }
>();

/** Build a timeline's clock from its own options, or else the render
 *  options: a cyclic timeline always loops. */
function buildClock(holder: ClockHolder, options: TimelineClockOptions) {
  if (holder.total <= 0) return undefined;
  const clock = timer<number>({
    domain: [0, holder.total],
    duration: holder.total,
    loop: holder.opts.cyclic === true || (options.loop ?? false),
    playing: holder.opts.playing ?? options.playing ?? true,
  });
  const at = holder.opts.at ?? options.at;
  if (at !== undefined) clock.set(at);
  holder.clock = clock;
  return clock;
}

/** Ask for the clock of every timeline under `root` (see the header). A
 *  timeline builds it once its clauses are solved; one solved already builds
 *  it now. Returns what stops them, when there are any. */
export function installTimelines(
  root: GoFishNode,
  options: TimelineClockOptions
): (() => void) | undefined {
  const stops: (() => void)[] = [];
  const walk = (n: GoFishNode): void => {
    if (isTimeline(n)) {
      const request: { options: TimelineClockOptions; clock?: Timer<number> } =
        { options };
      const holder = clocks.get(n);
      if (holder !== undefined) request.clock = buildClock(holder, options);
      clockRequests.set(n, request);
      stops.push(() => request.clock?.pause());
    }
    for (const c of n.children) if (c instanceof GoFishNode) walk(c);
  };
  walk(root);
  return stops.length === 0 ? undefined : () => stops.forEach((f) => f());
}

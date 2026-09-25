/**
 * The build-in TIME LAYOUT: a small solver that assigns every clip of a
 * timeline a start and a duration. It is `distribute` read on t (animation
 * design note, §5): `parallel` layers its children on t, `stagger` spreads them
 * along t, and a nested arrangement is a nested time frame whose children
 * start when its own slot starts (Canis's nested grouping, Keynote's "By
 * Element in Set").
 *
 * The solve is two passes, like a spatial layout:
 *
 *   1. BOTTOM UP, durations. A leaf lasts its own duration. A group lasts
 *      until its last child ends, given the offsets its arrangement assigns.
 *   2. TOP DOWN, starts. A child starts at its parent's start plus the offset
 *      the parent's arrangement gave it.
 *
 * The solver knows nothing about marks. A leaf carries an opaque payload (the
 * build-in passes its effects and target marks through here), so this file
 * has no imports and is unit-tested on its own
 * (`src/tests/buildSchedule.test.ts`).
 */

/** Which child a stagger starts from (the GSAP / Motion `from` vocabulary).
 *  `"first"` walks the groups in order, `"last"` in reverse, `"center"` from
 *  the middle outward, `"edges"` from both ends inward, and a number from that
 *  group index outward. Groups the same distance from the start start
 *  together. */
export type StaggerFrom = "first" | "last" | "center" | "edges" | number;

/** How a group's children are arranged in time. */
export type Arrangement =
  | { kind: "parallel" }
  | {
      kind: "stagger";
      /** Milliseconds between the starts of neighboring groups. */
      lag?: number;
      /** Milliseconds between one group's end and the next group's start.
       *  `spacing: 0` is "one after another" (Canis's "start after
       *  previous"). */
      spacing?: number;
      /** The share of the time spent between starts, 0 to 1 (Chevalier et
       *  al. 2014): 0 starts every group together, 1 plays them back to
       *  back. The lag is derived from it and from the children's duration. */
      dwell?: number;
      from?: StaggerFrom;
    };

/**
 * A timeline. A group's children come as GROUPS: the members of one group
 * start together (a `stagger`'s `by` puts children with equal keys in one
 * group), and the arrangement places the groups.
 */
export type Clip<T> =
  | { kind: "leaf"; duration: number; payload: T }
  | { kind: "group"; arrangement: Arrangement; groups: Clip<T>[][] };

/** One leaf, placed on t. */
export type Scheduled<T> = { start: number; duration: number; payload: T };

export type Schedule<T> = {
  /** When the last leaf ends: the length of the whole build. */
  total: number;
  /** Every leaf, in timeline order (depth first). */
  items: Scheduled<T>[];
};

/** Solve `clip`, starting at t = 0. */
export function solveSchedule<T>(clip: Clip<T>): Schedule<T> {
  const layouts = new Map<Clip<T>, GroupLayout>();
  const durationOf = (c: Clip<T>): number => {
    if (c.kind === "leaf") return c.duration;
    let layout = layouts.get(c);
    if (layout === undefined) {
      layout = layoutGroup(
        c.arrangement,
        c.groups.map((g) => Math.max(0, ...g.map(durationOf)))
      );
      layouts.set(c, layout);
    }
    return layout.duration;
  };

  const items: Scheduled<T>[] = [];
  const place = (c: Clip<T>, start: number): void => {
    if (c.kind === "leaf") {
      items.push({ start, duration: c.duration, payload: c.payload });
      return;
    }
    durationOf(c);
    const { offsets } = layouts.get(c)!;
    c.groups.forEach((members, g) => {
      for (const m of members) place(m, start + offsets[g]);
    });
  };

  const total = durationOf(clip);
  place(clip, 0);
  return { total, items };
}

type GroupLayout = { offsets: number[]; duration: number };

/** Place `durations.length` groups (each lasting `durations[g]`) on t. */
function layoutGroup(
  arrangement: Arrangement,
  durations: number[]
): GroupLayout {
  const n = durations.length;
  const end = (offsets: number[]) =>
    Math.max(0, ...offsets.map((o, g) => o + durations[g]));
  if (arrangement.kind === "parallel") {
    const offsets = durations.map(() => 0);
    return { offsets, duration: end(offsets) };
  }

  const { lag, spacing, dwell } = arrangement;
  const given = [lag, spacing, dwell].filter((v) => v !== undefined).length;
  if (given !== 1) {
    throw new Error(
      `[gofish] time.stagger(): give exactly one of \`lag\` (ms between ` +
        `starts), \`spacing\` (ms between one end and the next start) or ` +
        `\`dwell\` (the share of the time spent between starts, 0 to 1).`
    );
  }
  for (const [name, v] of [
    ["lag", lag],
    ["spacing", spacing],
  ] as const) {
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) {
      throw new Error(
        `[gofish] time.stagger({ ${name}: ${v} }): must be a number of ` +
          `milliseconds, 0 or more.`
      );
    }
  }
  if (dwell !== undefined && !(dwell >= 0 && dwell <= 1)) {
    throw new Error(
      `[gofish] time.stagger({ dwell: ${dwell} }): dwell is a share, from 0 ` +
        `(everything together) to 1 (back to back).`
    );
  }

  // The waves: groups the same distance from `from` start together, and the
  // waves play in order of that distance.
  const waves = wavesOf(n, arrangement.from ?? "first");
  const offsets = new Array<number>(n).fill(0);

  if (spacing !== undefined) {
    // Each wave starts `spacing` after the one before it ends.
    let t = 0;
    waves.forEach((wave, w) => {
      if (w > 0) t += spacing;
      for (const g of wave) offsets[g] = t;
      t += Math.max(0, ...wave.map((g) => durations[g]));
    });
    return { offsets, duration: end(offsets) };
  }

  // A fixed step between the starts of neighboring waves: the lag itself, or
  // the lag a dwell implies. With W waves of (longest) duration d and a lag δ,
  // the whole group lasts (W − 1)·δ + d, and the dwell is w = W·δ / that
  // total, so δ = w·d / (W − w·(W − 1)): 0 at w = 0 (together) and d at
  // w = 1 (each wave starts as the one before it ends).
  const W = waves.length;
  const d = Math.max(0, ...durations);
  const step = lag !== undefined ? lag : (dwell! * d) / (W - dwell! * (W - 1));
  waves.forEach((wave, w) => {
    for (const g of wave) offsets[g] = w * step;
  });
  return { offsets, duration: end(offsets) };
}

/** Group indices `0..n-1` into waves by their distance from `from`, nearest
 *  first. */
export function wavesOf(n: number, from: StaggerFrom): number[][] {
  const distance = (i: number): number => {
    switch (from) {
      case "first":
        return i;
      case "last":
        return n - 1 - i;
      case "center":
        return Math.abs(i - (n - 1) / 2);
      case "edges":
        return Math.min(i, n - 1 - i);
      default:
        if (!Number.isInteger(from) || from < 0 || from >= n) {
          throw new Error(
            `[gofish] time.stagger({ from: ${from} }): an index must be a ` +
              `whole number from 0 to ${n - 1}, the number of groups less one.`
          );
        }
        return Math.abs(i - from);
    }
  };
  const byDistance = Map.groupBy(
    Array.from({ length: n }, (_, i) => i),
    distance
  );
  return [...byDistance.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, wave]) => wave);
}

/**
 * The binding algebra core (M2 subset — scalars and ranges).
 *
 * `bind(src, dst)` infers the relation from the anchor-type pair
 * (notes/design/interaction.md):
 *
 *   scalar → scalar   Equate   (source drives target; one writer per anchor)
 *   range  → scalar   Limit    (clamp the target's setter into the interval;
 *                               additive — multiple limits intersect)
 *   range  → range    Limit    (interval intersection)      [M3+]
 *   set    → …        Match    (keyed join)                 [M4+]
 *   scalar → range/set          error unless offset          [M4+]
 *
 * Discrete-time semantics: Equate lowers to an event-edge write (the source
 * pushes on input events), not a continuous constraint — writes happen at
 * event boundaries, everything downstream is pure signal reads. Limit lowers
 * into the target's SETTER, so clamping composes with any writer and the
 * one-writer discipline stays intact.
 */

export type Unsubscribe = () => void;

/** A scalar anchor: a single numeric value in a declared space. */
export interface ScalarAnchor {
  kind: "scalar";
  /** Reactive read (signal-backed for state anchors). */
  get?: () => number;
  /** Present iff the anchor is writable (instrument/input state — never
   *  derived geometry). */
  set?: (v: number) => void;
  /** Input anchors push on events; state anchors may omit this. */
  subscribe?: (fn: (v: number) => void) => Unsubscribe;
}

/** A range anchor: a continuous interval [min, max]. */
export interface RangeAnchor {
  kind: "range";
  get: () => [number, number];
  /** Present iff the anchor is writable (instrument/input state). */
  set?: (v: [number, number]) => void;
}

/**
 * A set anchor: a KEYED collection of same-typed elements (band extents from
 * a spread, tick positions, brush instances). Keys make Match a relational
 * join, never a cardinality heuristic (Meros hole #4); `by: "nearest"` is an
 * explicit spatial-join policy.
 */
export interface SetAnchor {
  kind: "set";
  member: "scalar" | "range";
  /** Current elements, keyed. Scalar members are numbers; range members are
   *  [min, max] intervals. May read signals / current-frame state. */
  entries: () => Map<string, number | [number, number]>;
}

export type Anchor = ScalarAnchor | RangeAnchor | SetAnchor;

/** One writer per anchor: Equate registers; a second Equate is a spec error. */
const writers = new WeakMap<object, true>();

export interface BindOptions {
  /** Temporal gate: the write only lands while the gate holds (sample-and-hold). */
  when?: () => boolean;
  /** Match join policy. `"nearest"` is the only spatial policy so far; keyed
   *  joins land with keyed multi-instance targets. Required for set sources —
   *  never a silent fallback. */
  by?: "nearest";
}

/** Flatten a set anchor's elements to snap candidates: scalar members as-is,
 *  range members contribute both endpoints (a brush edge snaps to either side
 *  of a band). */
const snapCandidates = (src: SetAnchor): number[] => {
  const out: number[] = [];
  for (const el of src.entries().values()) {
    if (typeof el === "number") out.push(el);
    else out.push(el[0], el[1]);
  }
  return out;
};

const nearest = (candidates: number[], v: number): number => {
  let best = v;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c - v);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
};

/**
 * Bind `src` to `dst`, inferring the relation from the type pair. Returns an
 * unsubscribe/cleanup function.
 */
export function bind(
  src: Anchor,
  dst: Anchor,
  opts: BindOptions = {}
): Unsubscribe {
  if (src.kind === "range" && dst.kind === "scalar") {
    // Limit: wrap the target's setter with a clamp into the source interval.
    // Wrapping the setter (rather than filtering downstream) keeps the
    // one-writer discipline: every writer, present or future, is clamped.
    if (!dst.set) {
      throw new Error(
        "[gofish interaction] limit: target scalar anchor is not writable " +
          "(derived geometry is read-only; only instrument/input state, " +
          "params, and data are writable)"
      );
    }
    const innerSet = dst.set;
    dst.set = (v: number) => {
      const [lo, hi] = src.get();
      innerSet(Math.min(hi, Math.max(lo, v)));
    };
    return () => {
      dst.set = innerSet;
    };
  }

  if (src.kind === "range" && dst.kind === "range") {
    // Limit: interval intersection, in the target's setter. Additive — the
    // one relation with a well-defined meet, so limits stack freely.
    if (!dst.set) {
      throw new Error(
        "[gofish interaction] limit: target range anchor is not writable " +
          "(derived geometry is read-only)"
      );
    }
    const innerSet = dst.set;
    dst.set = (v: [number, number]) => {
      const [lo, hi] = src.get();
      innerSet([
        Math.min(hi, Math.max(lo, v[0])),
        Math.min(hi, Math.max(lo, v[1])),
      ]);
    };
    return () => {
      dst.set = innerSet;
    };
  }

  if (src.kind === "set" && (dst.kind === "scalar" || dst.kind === "range")) {
    // Match: pair the target's value(s) with elements of the source set. The
    // join policy must be explicit (`by: "nearest"`); with no keys on a
    // continuous target, nearest is the only valid spatial join. Lowered as a
    // setter-wrap (like Limit), so every write lands snapped — the Meros
    // "impossible to half-select a category" behavior. Gate with `when` for
    // an onEnd-commit snap instead of a continuous one.
    if (opts.by !== "nearest") {
      throw new Error(
        "[gofish interaction] match: a set source requires an explicit join " +
          'policy — pass { by: "nearest" } (keyed joins arrive with keyed ' +
          "targets)"
      );
    }
    if (!dst.set) {
      throw new Error(
        "[gofish interaction] match: target anchor is not writable " +
          "(derived geometry is read-only)"
      );
    }
    if (dst.kind === "scalar") {
      const innerSet = dst.set;
      dst.set = (v: number) => {
        if (opts.when && !opts.when()) return innerSet(v);
        const cands = snapCandidates(src);
        innerSet(cands.length ? nearest(cands, v) : v);
      };
      return () => {
        dst.set = innerSet;
      };
    }
    const innerSet = dst.set;
    dst.set = (v: [number, number]) => {
      if (opts.when && !opts.when()) return innerSet(v);
      const cands = snapCandidates(src);
      if (!cands.length) return innerSet(v);
      innerSet([nearest(cands, v[0]), nearest(cands, v[1])]);
    };
    return () => {
      dst.set = innerSet;
    };
  }

  if (src.kind === "scalar" && dst.kind === "scalar") {
    // Equate: the source drives the target on each source push.
    if (!dst.set) {
      throw new Error(
        "[gofish interaction] equate: target scalar anchor is not writable " +
          "(derived geometry is read-only)"
      );
    }
    if (!src.subscribe) {
      throw new Error(
        "[gofish interaction] equate: source scalar anchor has no event " +
          "stream to drive the target with"
      );
    }
    if (writers.has(dst)) {
      throw new Error(
        "[gofish interaction] equate: this anchor already has a writer — " +
          "at most one Equate may drive an anchor (limits are unlimited)"
      );
    }
    writers.set(dst, true);
    const unsub = src.subscribe((v) => {
      if (opts.when && !opts.when()) return;
      dst.set!(v);
    });
    return () => {
      writers.delete(dst);
      unsub();
    };
  }

  throw new Error(
    `[gofish interaction] no relation for ${src.kind} → ${dst.kind} yet ` +
      "(sets/offset land in a later milestone; scalar → range/set is invalid " +
      "without offset semantics)"
  );
}

/** Build an inverse of an affine function by sampling (all GoFish position
 *  scales and `toPixel` legs are affine; anchors invert the RECORDED forward
 *  maps, never re-derived ones). */
export function invertAffine(f: (t: number) => number): (y: number) => number {
  const a = f(0);
  const slope = f(1) - a;
  if (slope === 0) {
    throw new Error("[gofish interaction] cannot invert a degenerate scale");
  }
  return (y: number) => (y - a) / slope;
}

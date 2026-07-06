/**
 * DataRefs — lazy, reactive transform chains over data (the Meros construct,
 * lowered to Solid memos). `from(data).filter(pred).mean(of)` yields an
 * Accessor that recomputes when the predicates it reads (selectors backed by
 * interaction signals) change. The reactive sibling of the builder's
 * `derive()`: selectors answer "which data?", DataRefs answer "what
 * computation over that data?".
 */
import { createMemo, type Accessor } from "solid-js";

export interface DataRef<T> {
  /** Restrict to rows satisfying `pred` (may read signals — e.g. a brush
   *  selector). Chainable; each step is its own memo. */
  filter(pred: (d: T) => boolean): DataRef<T>;
  /** The current rows (reactive). */
  rows: Accessor<T[]>;
  /** Row count (reactive). */
  count: Accessor<number>;
  /** Mean of `of` over the rows; undefined when empty (reactive). */
  mean(of: (d: T) => number): Accessor<number | undefined>;
}

export function from<T>(data: T[] | Accessor<T[]>): DataRef<T> {
  const rows: Accessor<T[]> = typeof data === "function" ? data : () => data;
  return {
    rows,
    filter: (pred) => from(createMemo(() => rows().filter(pred))),
    count: createMemo(() => rows().length),
    mean: (of) =>
      createMemo(() => {
        const r = rows();
        if (r.length === 0) return undefined;
        let sum = 0;
        for (const d of r) sum += of(d);
        return sum / r.length;
      }),
  };
}

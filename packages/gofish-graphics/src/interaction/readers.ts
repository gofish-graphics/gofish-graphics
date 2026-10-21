// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The readable values of the sources that have several: a pointer and a drag.
 * Each one is an expression (`src/ast/expr.ts`), so it can be compared,
 * clamped and chosen on like any value, and crosses the frontend IR as a
 * source read, `{ type: "source", id, read, arg? }`.
 *
 *   const hover = pointer();
 *   fill: when(hover.over).then("#d62728").otherwise("#6b9bd1")
 *
 *   const dr = drag();
 *   const cut = dr.y.clip(0, 95).fillNull(60);
 *
 * This module is the whole of their spelling: the read names below are what
 * the IR carries and what the property names say. The closures' method
 * readers (`p.datum()`, `dr.currentData()`) stay on the inputs themselves.
 */
import { SOURCE, sourceRead, type Expr, type Source } from "../ast/expr";
import { projectPath } from "../ast/datumProjection";
import type { Drag, Pointer } from "./inputs";

/** The rows a datum stands for (a mark's datum is a bag of rows). */
const rowsOf = (datum: unknown): unknown[] =>
  Array.isArray(datum) ? datum : datum == null ? [] : [datum];

/** A read: the value at `datum`, given the read's argument. */
type Read<I> = (input: I, datum: unknown, arg: string | undefined) => unknown;

function dispatch<I>(
  kind: string,
  reads: Record<string, Read<I>>,
  input: I
): (
  read: string | undefined,
  arg: string | undefined,
  datum: unknown
) => unknown {
  return (read, arg, datum) => {
    const fn = read === undefined ? undefined : reads[read];
    if (fn === undefined)
      throw new Error(
        `[gofish] ${kind}(): no read ${JSON.stringify(read)}. A ${kind} reads ` +
          `${Object.keys(reads).join(", ")}.`
      );
    return fn(input, datum, arg);
  };
}

/* ------------------------------- pointer -------------------------------- */

export interface PointerReads {
  /** True on the mark under the pointer: the mark's rows are rows of the
   *  mark the pointer hit. False everywhere when the pointer is off the
   *  chart. */
  readonly over: Expr;
  /** That field of the mark under the pointer, collapsed over its rows as
   *  every field read on a group is (null when no mark is hit, or its rows
   *  disagree). */
  field(name: string): Expr;
}

const POINTER_READS: Record<string, Read<Pointer>> = {
  over: (p, datum) => {
    const hit = p.datum();
    if (hit === undefined) return false;
    if (datum === hit) return true;
    const rows = rowsOf(datum);
    const hitRows = new Set(rowsOf(hit));
    return rows.length > 0 && rows.every((r) => hitRows.has(r));
  },
  field: (p, _datum, arg) => projectPath(p.datum(), arg!) ?? null,
};

/** Give a pointer its source protocol and its reads. */
export function pointerReads(p: Omit<Pointer, keyof PointerReads>): Pointer {
  const source = Object.assign(p, {
    [SOURCE]: {
      kind: "pointer",
      declaration: {},
      read: dispatch("pointer", POINTER_READS, p as Pointer),
    },
  }) as unknown as Pointer & Source;
  return Object.assign(source, {
    over: sourceRead(source, "over"),
    field: (name: string) => sourceRead(source, "field", name),
  });
}

/* --------------------------------- drag --------------------------------- */

export interface DragReads {
  /** The drag's current position in data units, per axis (null before the
   *  first drag, or on an axis with no continuous scale). */
  readonly x: Expr;
  readonly y: Expr;
  /** Where the drag started, in data units. */
  readonly x0: Expr;
  readonly y0: Expr;
  /** How far the drag has moved, in data units. */
  readonly dx: Expr;
  readonly dy: Expr;
  /** True while a drag is in progress. */
  readonly active: Expr;
}

const delta = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? null : a - b;

const DRAG_READS: Record<string, Read<Drag>> = {
  x: (d) => d.currentData()?.x,
  y: (d) => d.currentData()?.y,
  x0: (d) => d.originData()?.x,
  y0: (d) => d.originData()?.y,
  dx: (d) => delta(d.currentData()?.x, d.originData()?.x),
  dy: (d) => delta(d.currentData()?.y, d.originData()?.y),
  active: (d) => d.isActive(),
};

/** Give a drag its source protocol and its reads. `declaration` is its IR
 *  declaration, or why it has none. */
export function dragReads(
  d: Omit<Drag, keyof DragReads>,
  declaration: Record<string, unknown> | { noWire: string }
): Drag {
  const source = Object.assign(d, {
    [SOURCE]: {
      kind: "drag",
      declaration,
      read: dispatch("drag", DRAG_READS, d as Drag),
    },
  }) as unknown as Drag & Source;
  const reads = Object.fromEntries(
    Object.keys(DRAG_READS).map((r) => [r, sourceRead(source, r)])
  ) as unknown as DragReads;
  return Object.assign(source, reads);
}

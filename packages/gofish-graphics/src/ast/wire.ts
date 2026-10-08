// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * A function that knows its wire form. A mark or operator factory returns a
 * function (the mark or the operator), and a field predicate is a function
 * too; each also carries the data the frontend IR writes for it. `withWire`
 * attaches that data under one symbol, and `wireOf` reads it back. The
 * frontend-IR emitter (`serialize/toJSON.ts`) and `filter` read it.
 */

const WIRE: unique symbol = Symbol.for("gofish.wire");

/** Attach `wire`, the IR form of `fn`, and return `fn`. */
export function withWire<F extends object, W>(fn: F, wire: W): F {
  (fn as { [WIRE]?: W })[WIRE] = wire;
  return fn;
}

/** The IR form `withWire` attached to `fn`, if any. */
export function wireOf<W = any>(fn: unknown): W | undefined {
  return fn !== null && (typeof fn === "function" || typeof fn === "object")
    ? (fn as { [WIRE]?: W })[WIRE]
    : undefined;
}

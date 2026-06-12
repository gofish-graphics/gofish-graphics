/**
 * A Token is a unique, externally-addressable handle for a node. Each
 * `createName(tag)` call produces a fresh Token that is distinct by JS
 * identity; the `__tag` string is used as the path segment when looking it
 * up inside a scope (see `_scopeMap` on GoFishNode). Two `createName("x")`
 * calls in different components produce distinct tokens even with the same
 * tag — hygiene by construction.
 */
export type Token = { readonly __tag: string; readonly __id: symbol };

export const createName = (tag: string): Token => ({
  __tag: tag,
  __id: Symbol(tag),
});

export const isToken = (v: unknown): v is Token =>
  typeof v === "object" &&
  v !== null &&
  "__tag" in v &&
  typeof (v as Token).__tag === "string" &&
  "__id" in v &&
  typeof (v as Token).__id === "symbol";

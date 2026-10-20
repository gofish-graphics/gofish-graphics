/**
 * The one rule for a value that names nodes inside an option (a blob's
 * `avoiding`, typed `Shape.Nodes`): a list of nodes or refs, or one
 * `selectAll(name)` as the whole value. A single ref and a `selectAll`
 * inside a list are errors. The wire's `NodeSelectionIR` has the same two
 * forms. enclose reads the value with it (`avoidedRefs`), and toJSON writes
 * it (`nodesToIR`); each then handles the items its own way.
 *
 * It lives here, not beside `Nodes` in `families/shape.ts`, because every
 * export of that module is a member of the public `Shape` namespace.
 */
import { GoFishRef } from "./_ref";

/** A node value, checked: every node of a layer, or a list of items. */
export type NodeSelection =
  | { all: GoFishRef & { readonly multiplicity: "all" } }
  | { items: unknown[] };

const isSelectAll = (
  v: unknown
): v is GoFishRef & { readonly multiplicity: "all" } =>
  v instanceof GoFishRef && v.multiplicity === "all";

/** Check `value` against the rule; `where` names the value in an error
 *  (`"enclose({ shape }): avoiding"`). */
export function nodeSelectionOf(value: unknown, where: string): NodeSelection {
  if (isSelectAll(value)) return { all: value };
  if (!Array.isArray(value))
    throw new Error(
      `[gofish] ${where} is a list of nodes or refs, or one selectAll(name); put a single ref in a list: [ref(...)].`
    );
  if (value.some(isSelectAll))
    throw new Error(
      `[gofish] ${where}: selectAll(name) names every node of a layer, so it is the whole value, not an item of a list.`
    );
  return { items: value };
}

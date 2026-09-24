/**
 * A stagger's `by`: split the children by a key and take the groups in the
 * key's order. It means what `by` means everywhere (`splitEntries`, which
 * spread / group / scatter split with): a plain field keeps the groups in the
 * order the data first shows them, and a `field(...)` expression orders them
 * (`field("letter").sort("frequency", "desc")`). Children with equal keys
 * land in one group and start together.
 *
 * The children here are not rows. In the chained form they are an operator's
 * child nodes, and in the selection form they are refs to marks; each stands
 * for the rows it was built from. So the ORDER of the keys comes from
 * splitting all of those rows (which is what lets a `sort` sum a field over
 * each group's rows), and each child's key is the value its own rows agree on.
 */
import { splitEntries, splitKeyFn, type SplitBy } from "../ast/datumProjection";

export function groupEntries<C>(
  children: C[],
  rowsOf: (child: C) => unknown[],
  by: SplitBy | undefined
): Map<string | number, C[]> {
  if (by === undefined) {
    return new Map(children.map((child, i) => [i, [child]]));
  }
  const allRows = children.flatMap(rowsOf) as Record<string, unknown>[];
  const groups = new Map<string | number, C[]>(
    [...splitEntries(by, allRows).keys()].map((k) => [k, []])
  );
  // A child's key is the value its rows agree on: for a field, the same
  // projection with homogeneity collapse `by` uses on a bag of rows; for a
  // key function, its one value over the rows.
  const rowKey = splitKeyFn(by);
  const keyOf = (rows: unknown[]): string | number | undefined => {
    if (typeof by !== "function") return rowKey(rows);
    const keys = new Set(rows.map(rowKey));
    return keys.size === 1 ? [...keys][0] : undefined;
  };
  for (const child of children) {
    const key = keyOf(rowsOf(child));
    const group = key === undefined ? undefined : groups.get(key);
    if (group === undefined) {
      throw new Error(
        `[gofish] time.stagger({ by }): a child of the stagger has no single ` +
          `value of \`by\` (its rows give ${JSON.stringify(key)}). A stagger ` +
          `orders whole children, so every child must belong to one group; ` +
          `stagger by a field the children are split on, or split them on it ` +
          `first.`
      );
    }
    group.push(child);
  }
  for (const [key, group] of groups) if (group.length === 0) groups.delete(key);
  return groups;
}

/** A node's or a ref's rows: its datum as a bag, or, for an operator node
 *  that carries none of its own, the rows of everything under it. */
export function rowsOf(child: unknown): unknown[] {
  const datum = (child as { datum?: unknown }).datum;
  if (datum !== undefined) return Array.isArray(datum) ? datum : [datum];
  const children = (child as { children?: unknown[] }).children;
  return Array.isArray(children) ? children.flatMap(rowsOf) : [];
}

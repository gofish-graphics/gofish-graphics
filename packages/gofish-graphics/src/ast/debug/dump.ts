// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── Debug dumps of the sharing plans and the keyed domains (#1114) ───────────
//
// Behind `GOFISH_DUMP_SHARING`, each layer's sharing sets; behind
// `GOFISH_DUMP_SCOPES`, one line per keyed domain (beside the σ-scope lines
// `ScopeRegistry.dump` prints). Off, and near zero cost, in production. They
// only read the tree. `tests/scripts/dump-scopes.ts` prints them for a story.

import type { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import type { ConstraintSpec } from "../constraints";
import type { SharingPlan } from "../constraints/compose";
import { childNameKey } from "../constraints/shared";
import type { KeyedDomains } from "../keyedDomains";
import { envFlag } from "../../util";

/** A short label for a child in the sharing dump. */
const childLabel = (child: GoFishAST, i: number): string => {
  const name = childNameKey(child);
  if (name !== undefined) return name;
  const node = child as { key?: unknown; type?: unknown };
  if (typeof node.key === "string" && node.key !== "") return node.key;
  return `${typeof node.type === "string" ? node.type : "child"}#${i}`;
};

/** One axis of a plan, printed: the own set, then the detached sets. A `*`
 *  marks a nested child. Long lists are cut, since a spread of 300 bars has
 *  300 sets. */
function printSharingAxis(
  plan: SharingPlan,
  axis: 0 | 1,
  childNodes: GoFishAST[]
): string {
  const MAX = 6;
  const groups = new Map<number, string[]>();
  plan.sets[axis].forEach((s, i) => {
    const label =
      childLabel(childNodes[i], i) + (plan.nested[axis].has(i) ? "*" : "");
    const g = groups.get(s);
    if (g) g.push(label);
    else groups.set(s, [label]);
  });
  const cut = (xs: string[], sep: string, unit = "") =>
    xs.length <= MAX
      ? xs.join(sep)
      : `${xs.slice(0, MAX - 2).join(sep)}${sep}…+${xs.length - (MAX - 2)}${unit}`;
  const own = cut(groups.get(0) ?? [], ",");
  const others = [...groups.entries()]
    .filter(([s]) => s !== 0)
    .map(([, g]) => `{${cut(g, ",")}}`);
  return others.length === 0
    ? `own{${own}}`
    : `own{${own}} detached ${cut(others, " ", " sets")}`;
}

/** Whether the sharing dump is on. */
const DUMP_SHARING = envFlag("GOFISH_DUMP_SHARING");

/** A layer's constraints, counted by type: `position×14,align`. */
const printConstraintTypes = (constraints: ConstraintSpec[]): string => {
  const counts = new Map<string, number>();
  for (const c of constraints)
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  return [...counts]
    .map(([type, k]) => (k === 1 ? type : `${type}×${k}`))
    .join(",");
};

/** Behind `GOFISH_DUMP_SHARING`, print the sharing plan of every node under
 *  `root` that has more than one child, any constraint, or a child that is
 *  detached or nested, one line per node, indented by depth. A node's chrome
 *  rings (axes, titles) are skipped, and only its content is walked, since
 *  chrome decides no domain. */
export function dumpSharing(root: GoFishAST): void {
  if (!DUMP_SHARING) return;
  const walk = (node: GoFishAST, depth: number) => {
    if (!(node instanceof GoFishNode)) return;
    if (node.chrome !== undefined && node.chrome.content !== node) {
      walk(node.chrome.content, depth);
      return;
    }
    const { children, constraints, type } = node;
    const plan = node.sharing();
    const moved = ([0, 1] as const).some(
      (axis) =>
        plan.nested[axis].size > 0 || plan.sets[axis].some((s) => s !== 0)
    );
    if (children.length > 1 || constraints.length > 0 || moved) {
      const name = childNameKey(node) ?? node.key ?? "";
      console.log(
        `[sharing] ${"  ".repeat(depth)}${type}${name ? ` ${name}` : ""}` +
          ` (${children.length}) [${printConstraintTypes(constraints)}]` +
          ` x: ${printSharingAxis(plan, 0, children)}` +
          ` | y: ${printSharingAxis(plan, 1, children)}`
      );
    }
    children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
}

/** Whether the keyed domain dump is on. */
const DUMP_SCOPES = envFlag("GOFISH_DUMP_SCOPES");

/** Behind `GOFISH_DUMP_SCOPES`, print one line per keyed domain: its space
 *  root, axis, key and domain, and whether an axis is drawn over it. */
export function dumpKeyedDomains(table: KeyedDomains | undefined): void {
  if (!DUMP_SCOPES || table === undefined) return;
  table.forEachDomain((root, axis, key, iv, drawn) =>
    console.log(
      `[scope] domain space=${root.type}:${root.uid} ` +
        `axis=${axis === 0 ? "x" : "y"} key=${key} [${iv.min},${iv.max}]` +
        (drawn ? " axis" : "")
    )
  );
}

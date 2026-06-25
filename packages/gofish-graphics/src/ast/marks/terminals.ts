// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Operator Factory — /internals/frontend/operator-factory
// </gofish-wiki>

/**
 * Terminal registry — the shared definition of the "export" methods a mark /
 * combinator surface exposes (`render`, `toSVG`, `toSVGElement`, `save`,
 * `toDisplayList`).
 *
 * A terminal is the dual of a {@link ModifierConfig}: where a modifier mutates
 * the produced node and returns a chainable mark, a terminal RESOLVES the
 * surface to a final `GoFishNode` and calls through to that node's method,
 * ending the chain. Every terminal has the same shape — "resolve me to a node,
 * then invoke `node.X(...)`" — differing only in which method and which args.
 *
 * Before this registry the terminals were hand-rolled and DUPLICATED across two
 * surfaces (`attachModifiers` in createOperator.ts and `addRenderMethod` in
 * withGoFish.ts), so adding one (e.g. `toDisplayList`) meant editing both — and
 * forgetting a surface silently dropped the method there. Now each surface
 * supplies only its own node-resolution strategy and calls
 * {@link attachTerminals}; the list of terminals lives here, once.
 */

import type { GoFishNode } from "../_node";

/** One export method: its name, and how to invoke it on a resolved node. */
export type TerminalConfig = {
  /** Method name exposed on the surface, e.g. "render" | "toDisplayList". */
  name: string;
  /** Call the corresponding `GoFishNode` method with the surface call args. */
  call: (node: GoFishNode, args: any[]) => unknown;
};

export const TERMINALS: TerminalConfig[] = [
  { name: "render", call: (n, a) => n.render(a[0], a[1]) },
  { name: "toSVG", call: (n, a) => n.toSVG(a[0]) },
  { name: "toSVGElement", call: (n, a) => n.toSVGElement(a[0]) },
  { name: "save", call: (n, a) => n.save(a[0], a[1]) },
  { name: "toDisplayList", call: (n, a) => n.toDisplayList(a[0]) },
];

/**
 * Attach every terminal in {@link TERMINALS} to `target`. `resolveNode` is the
 * surface-specific strategy for turning the surface into a final `GoFishNode`
 * (call a mark with `undefined`; await a promise; etc.) — it should throw if the
 * surface can't resolve to a node. Each terminal awaits it and calls through, so
 * every terminal returns a Promise.
 */
export function attachTerminals(
  target: object,
  resolveNode: () => Promise<GoFishNode>
): void {
  for (const t of TERMINALS) {
    Object.defineProperty(target, t.name, {
      value: (...args: any[]) =>
        Promise.resolve(resolveNode()).then((node) => t.call(node, args)),
      writable: true,
      configurable: true,
    });
  }
}

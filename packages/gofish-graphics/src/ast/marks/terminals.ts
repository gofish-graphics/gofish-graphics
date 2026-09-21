// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Operator Factory — /internals/frontend/operator-factory
// </gofish-wiki>

/**
 * Terminal registry — the shared definition of the "export" methods a mark /
 * combinator / chart-builder surface exposes (`render`, `toSVG`,
 * `toSVGElement`, `save`, `toDisplayList`).
 *
 * A terminal is the dual of a {@link ModifierConfig}: where a modifier mutates
 * the produced node and returns a chainable mark, a terminal RESOLVES the
 * surface to a final `GoFishNode` and calls through to that node's method,
 * ending the chain. Every terminal has the same shape — "resolve me to a node
 * plus the options to export it with, then invoke `node.X(...)`" — differing
 * only in which method and which argument carries the options.
 *
 * A surface supplies only its own resolution strategy (call a mark with
 * `undefined`; await a promise; run a builder's `resolve()` and merge the
 * chart-level `axes`/`color` config) and calls {@link attachTerminals} or
 * {@link attachBuilderTerminals}; the list of terminals lives here, once, so
 * adding one (e.g. `toDisplayList`) reaches every surface.
 */

import type { GoFishNode } from "../_node";

/** Options a terminal call carries through to the node method. */
export type RenderOptions = Record<string, unknown>;

/** A surface resolved to the node to export and the options to export it with. */
export type ResolvedSurface = { node: GoFishNode; options: RenderOptions };

/** A surface's resolution strategy. Called with `this` bound to the surface so
 *  a class can attach terminals to its prototype. */
export type ResolveForRender = (
  this: any,
  options: RenderOptions
) => Promise<ResolvedSurface>;

/** How `render` drives a resolve. The default resolves and renders directly;
 *  the chart builders pass `renderWithInteraction`, which runs the resolve
 *  under the ambient interactive context so reactive reads can register. */
export type RenderStrategy = (
  resolve: () => Promise<ResolvedSurface>,
  container: any
) => Promise<HTMLElement>;

/** One export method: its name, where its options argument sits, and how to
 *  invoke it on a resolved node. */
export type TerminalConfig = {
  /** Method name exposed on the surface, e.g. "render" | "toDisplayList". */
  name: string;
  /** Index of the render-options argument among the call args. */
  optionsArg: number;
  /** Call the corresponding `GoFishNode` method with the prepared options. */
  invoke: (node: GoFishNode, args: any[], options: RenderOptions) => unknown;
  /** `render` alone goes through the surface's {@link RenderStrategy}. */
  viaRenderStrategy?: true;
};

export const TERMINALS: TerminalConfig[] = [
  {
    name: "render",
    optionsArg: 1,
    viaRenderStrategy: true,
    invoke: (n, a, o) => n.render(a[0], o as any),
  },
  { name: "toSVG", optionsArg: 0, invoke: (n, _a, o) => n.toSVG(o) },
  {
    name: "toSVGElement",
    optionsArg: 0,
    invoke: (n, _a, o) => n.toSVGElement(o),
  },
  { name: "save", optionsArg: 1, invoke: (n, a, o) => n.save(a[0], o) },
  {
    name: "toDisplayList",
    optionsArg: 0,
    invoke: (n, _a, o) => n.toDisplayList(o),
  },
];

/** The terminal methods {@link attachTerminals} defines, for a class surface
 *  that merges them into its declared type. */
export interface TerminalMethods {
  render(
    container: Parameters<GoFishNode["render"]>[0],
    options?: Parameters<GoFishNode["render"]>[1]
  ): Promise<Awaited<ReturnType<GoFishNode["render"]>>>;
  toSVG(options?: Parameters<GoFishNode["toSVG"]>[0]): Promise<string>;
  toSVGElement(
    options?: Parameters<GoFishNode["toSVGElement"]>[0]
  ): Promise<SVGSVGElement>;
  save(
    filename: string,
    options?: Parameters<GoFishNode["save"]>[1]
  ): Promise<void>;
  toDisplayList(
    options?: Parameters<GoFishNode["toDisplayList"]>[0]
  ): ReturnType<GoFishNode["toDisplayList"]>;
}

const renderDirectly: RenderStrategy = async (resolve, container) => {
  const { node, options } = await resolve();
  return node.render(container, options as any) as Promise<HTMLElement>;
};

/**
 * Attach every terminal in {@link TERMINALS} to `target`, for a surface that
 * resolves straight to a node (a mark called with `undefined`; a promise of a
 * node). `resolveNode` should throw if the surface can't resolve to one.
 */
export function attachTerminals(
  target: object,
  resolveNode: () => Promise<GoFishNode>
): void {
  attachBuilderTerminals(target, async (options) => ({
    node: await resolveNode(),
    options,
  }));
}

/**
 * Attach every terminal in {@link TERMINALS} to `target`, for a surface that
 * also prepares the render options (e.g. merging chart-level `axes`/`color`)
 * and optionally drives `render` through its own strategy. Every terminal
 * returns a Promise.
 */
export function attachBuilderTerminals(
  target: object,
  resolve: ResolveForRender,
  render: RenderStrategy = renderDirectly
): void {
  for (const t of TERMINALS) {
    Object.defineProperty(target, t.name, {
      value: function (this: unknown, ...args: any[]) {
        const resolveHere = () => resolve.call(this, args[t.optionsArg] ?? {});
        return t.viaRenderStrategy
          ? render(resolveHere, args[0])
          : resolveHere().then(({ node, options }) =>
              t.invoke(node, args, options)
            );
      },
      writable: true,
      configurable: true,
    });
  }
}

// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The shared interactive render terminal — the single place a resolve is run
 * under the ambient interactive context so the reactive surface can register.
 *
 * It is regime-agnostic and pipeline-agnostic: it takes any `resolveForRender`
 * thunk that produces a `{ node, options }` pair and a container, and gives that
 * resolve the full two-regime treatment (see reactivity.md):
 *
 *   1. a fresh `InteractionRuntime` per rendered surface;
 *   2. `beginResolve()` then evaluate the thunk under `withInteractiveResolve`,
 *      so a `live()` channel or a library input read in the spec registers;
 *   3. thread `options.interaction = runtime` iff anything registered
 *      (`hasWork()`), so `data-gf-id` hooks + delegated events light up; a
 *      resolve where nothing registered renders down the static path untouched;
 *   4. wire the rerender thunk so a pipeline-dependency change re-invokes the
 *      whole resolve → render into the SAME container.
 *
 * Three callers share it: `ChartBuilder.render` and `LayerBuilder.render` (the
 * v3 chart pipeline) and the low-level `gofish()` terminal when handed a
 * COMPONENT THUNK (`() => node`) — a raw shape/operator composition with no
 * `chart()` builder. The thunk is what lets a component re-run its spec: a raw
 * node is built once and cannot re-evaluate, so component-level pipeline
 * reactivity needs a thunk the scheduler can re-invoke, exactly like the
 * builder's immutable rebuild.
 *
 * Lives in the interaction layer (not `marks/chartBuilder.ts`) so `gofish.tsx`
 * can reach it without importing the chart-builder module — the dependency runs
 * one-way (gofish.tsx → interaction), never into `marks/`. The only node
 * coupling is the `.render(container, options)` call, kept as a type-only import.
 */
import { InteractionRuntime } from "./runtime";
import { withInteractiveResolve } from "./resolveContext";
import type { GoFishNode } from "../ast/_node";

export async function renderWithInteraction<O extends Record<string, unknown>>(
  resolveForRender: () => Promise<{
    node: GoFishNode;
    options: O;
  }>,
  container: HTMLElement
): Promise<HTMLElement> {
  const runtime = new InteractionRuntime();
  const doRender = async (): Promise<HTMLElement> => {
    // Reset per-resolve dependency flags before reads re-register inputs.
    runtime.beginResolve();
    const { node, options } = await withInteractiveResolve(runtime, () =>
      resolveForRender()
    );
    if (runtime.hasWork()) {
      (options as Record<string, unknown>).interaction = runtime;
    }
    return node.render(container, options) as HTMLElement;
  };
  runtime.setRerender(doRender);
  return doRender();
}

/**
 * Ambient interactive-resolve context — the discovery mechanism behind the
 * fluent surface (notes/design/interaction.md, "Toward a fluent surface").
 *
 * The principle: interaction enters the spec wherever a value already goes,
 * so the builder cannot know a chart is interactive by inspecting the chain —
 * a `when(...)` channel, a live param read inside `derive()`, or an
 * interactive mark all surface only DURING resolve. The render terminal
 * therefore installs the chart's InteractionRuntime as an ambient context
 * around resolve; live values and tagged selectors register themselves on
 * read/unwrap (the same shape as Solid's tracked reads). If nothing
 * registered, the chart renders down the static path untouched.
 *
 * Caveat: the context is a module variable, so two charts resolving
 * CONCURRENTLY (interleaving at await points, e.g. a Python derive RPC) could
 * cross-register. Registration sites are synchronous spec-evaluation code in
 * practice; a scoped-storage mechanism can replace this if async marks make
 * the race real.
 */

/** The registration surface live values and tagged selectors see. */
export interface AmbientRegistrar {
  register(...instruments: object[]): void;
}

let current: AmbientRegistrar | undefined;

/** Install `registrar` as the ambient context for the duration of `fn`. */
export async function withInteractiveResolve<T>(
  registrar: AmbientRegistrar,
  fn: () => Promise<T>
): Promise<T> {
  const prev = current;
  current = registrar;
  try {
    return await fn();
  } finally {
    current = prev;
  }
}

/** The active registrar, if a resolve is in progress. */
export const ambientRegistrar = (): AmbientRegistrar | undefined => current;

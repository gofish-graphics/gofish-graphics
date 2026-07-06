/**
 * live() — a reactive channel value on a REGULAR mark (the third value kind:
 * aesthetic | data | live). Where `when(...)` is a conditional live channel,
 * `live(...)` is an unconditional one:
 *
 *   text({ x: 70, y: 24, text: live(() => `bins: ${bins()}`) })
 *
 * The pipeline renders (and measures) the accessor's resolve-time value; the
 * interaction runtime re-evaluates it inside the Tier-0 paint patch, so
 * signal changes update the DOM with zero pipeline re-runs. The layout
 * caveat is inherent: the mark's box is measured at resolve, so live text
 * should not grow past its measured room (same caveat as any overlay text).
 *
 * The accessor optionally receives the runtime's `refs` (the same object
 * `.interact()` callbacks get), so it can reach named instruments without
 * closing over them: `live((refs) => refs?.instrument("b") ? ... : "…")`.
 * At resolve time `refs` is undefined (no frame yet) — return the fallback.
 */
import type { InteractRefs } from "./runtime";

const LIVE_BRAND = Symbol.for("gofish.liveValue");

export interface LiveValue {
  (refs?: InteractRefs): unknown;
  [LIVE_BRAND]: true;
  /** Identity-stable marker instrument so the ambient registrar can activate
   *  the runtime (deduped across re-resolves). */
  __gfLiveMarker: object;
}

export function live(accessor: (refs?: InteractRefs) => unknown): LiveValue {
  const fn = accessor as LiveValue;
  fn[LIVE_BRAND] = true;
  fn.__gfLiveMarker ??= {};
  return fn;
}

export const isLive = (v: unknown): v is LiveValue =>
  typeof v === "function" &&
  (v as unknown as Record<symbol, unknown>)[LIVE_BRAND] === true;

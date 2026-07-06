/**
 * hover() — the simplest instrument: tracks the data mark under the pointer
 * and exposes an identity predicate for `when(...)` states. Pure Tier 0: no
 * overlay geometry, no re-layout; the hovered id is a signal and every
 * dependent style patch updates through Solid's fine-grained reactivity.
 */
import { createSignal } from "solid-js";
import type { Instrument, StatePredicate } from "../types";

export interface HoverInstrument extends Instrument {
  /** True for the display item currently under the pointer. */
  over: StatePredicate;
  /** The hovered mark's backing datum (reactive read), or undefined. */
  datum(): unknown;
}

export function hover(): HoverInstrument {
  const [hovered, setHovered] = createSignal<
    { id: string; datum: unknown } | undefined
  >(undefined);

  return {
    over: (_datum, item) => hovered()?.id === item.id,
    datum: () => hovered()?.datum,
    onEvent(type, _event, hit) {
      if (type === "pointermove") {
        // Only data marks (role "node") are hover targets; chrome is not.
        const next =
          hit && hit.item.role === "node"
            ? { id: hit.id, datum: hit.datum }
            : undefined;
        setHovered((prev) =>
          prev?.id === next?.id && prev?.datum === next?.datum ? prev : next
        );
      } else if (type === "pointerleave") {
        setHovered(undefined);
      }
    },
  };
}

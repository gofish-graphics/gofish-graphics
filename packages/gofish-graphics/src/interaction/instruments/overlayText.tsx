/**
 * overlayText() — a reactive text readout in the overlay layer.
 *
 * @deprecated Absorbed into the regular `text()` mark with a `live(...)`
 * content value: `text({ x, y, text: live((refs) => ...) })` — positioned by
 * the ordinary mark machinery and patched at Tier 0. This helper remains for
 * pixel-anchored overlay text that must not participate in layout at all.
 */
import type { Accessor } from "solid-js";
import type { Instrument } from "../types";

export interface OverlayTextOptions {
  x: number;
  y: number;
  text: Accessor<string>;
  fontSize?: number;
  fill?: string;
}

export function overlayText(options: OverlayTextOptions): Instrument {
  return {
    renderOverlay() {
      return (
        <text
          x={options.x}
          y={options.y}
          font-size={`${options.fontSize ?? 12}px`}
          font-family="sans-serif"
          fill={options.fill ?? "#333"}
        >
          {options.text()}
        </text>
      );
    },
  };
}

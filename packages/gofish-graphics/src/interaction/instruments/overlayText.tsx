/**
 * overlayText() — a reactive text readout in the overlay layer. The M3
 * stand-in for binding a text mark to an instrument anchor (e.g. a mean
 * readout attached to a brush, cf. Meros Fig. 4 D).
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

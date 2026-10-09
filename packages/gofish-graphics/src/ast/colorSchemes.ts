// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Color Scale Resolution — /internals/layout/color-scales
// </gofish-wiki>

import { formatHex, parse, toLab65, type Color } from "../colorModes";
import type {
  Color as ColorConfig,
  PaletteScale,
  GradientScale,
} from "../families/color";

// The color scale a chart's `color` option takes, made by the `Color` family
// (`families/color.ts`); internally it is called a color config.
export type { ColorConfig, PaletteScale, GradientScale };

type Scheme = { type: "palette" | "gradient"; colors: string[] };

const schemes: Record<string, Scheme> = {
  tableau10: {
    type: "palette",
    colors: [
      "#4e79a7",
      "#f28e2b",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc948",
      "#b07aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ac",
    ],
  },
  viridis: {
    type: "gradient",
    colors: ["#440154", "#31688e", "#35b779", "#fde725"],
  },
  blues: {
    type: "gradient",
    colors: ["#f7fbff", "#deebf7", "#9ecae1", "#3182bd", "#08306b"],
  },
  reds: {
    type: "gradient",
    colors: ["#fff5f0", "#fc9272", "#de2d26", "#67000d"],
  },
};

/** Assign a palette color by cycling through colors by index. */
export function assignPaletteColor(
  config: PaletteScale,
  key: string,
  index: number
): string {
  const values = config.values;
  if (typeof values === "string") {
    const scheme = schemes[values];
    if (scheme) return scheme.colors[index % scheme.colors.length];
    return values;
  }
  if (Array.isArray(values)) {
    return values[index % values.length];
  }
  return (values as Record<string, string>)[key] ?? "#ccc";
}

/** The color a gradient returns for a missing (`NaN`) position. */
const MISSING_COLOR = "#cccccc";

function parseStop(stop: string): Color {
  const color = parse(stop);
  if (color === undefined) throw new Error(`Invalid gradient color: ${stop}`);
  return color;
}

/**
 * Build the interpolator for a list of evenly spaced color stops. Between two
 * stops the color is mixed linearly in CIE Lab (D65 white point, CSS Color 4
 * conversions); at or beyond a stop it is that stop's color. `t` is clamped to
 * `[0, 1]`, and a `NaN` position gives `MISSING_COLOR`. The result is a
 * `#rrggbb` hex string, clipped to the sRGB gamut and rounded to 8 bits.
 */
function labGradient(stops: string[]): (t: number) => string {
  const colors = (stops.length === 1 ? [stops[0], stops[0]] : stops).map(
    parseStop
  );
  const labs = colors.map((c) => toLab65(c));
  const n = colors.length - 1;
  return (t: number) => {
    if (Number.isNaN(t)) return MISSING_COLOR;
    const tt = Math.max(0, Math.min(1, t));
    for (let i = 0; i < n; i++) {
      const p0 = i / n;
      const p1 = (i + 1) / n;
      if (tt <= p0) return formatHex(colors[i]);
      if (tt < p1) {
        const f = (tt - p0) / (p1 - p0);
        const a = labs[i];
        const b = labs[i + 1];
        return formatHex({
          mode: "lab65",
          l: a.l + f * (b.l - a.l),
          a: a.a + f * (b.a - a.a),
          b: a.b + f * (b.b - a.b),
        });
      }
    }
    return formatHex(colors[n]);
  };
}

/** Assign a gradient color by interpolating at position t in [0, 1]. */
export function assignGradientColor(config: GradientScale, t: number): string {
  const stops = config.stops;
  if (typeof stops === "string") {
    const scheme = schemes[stops];
    if (scheme) return labGradient(scheme.colors)(t);
    return stops;
  }
  return labGradient(stops)(t);
}

/**
 * Build a continuous color scale `(value: number) => string` for a gradient
 * config over `[min, max]`. The stops are parsed once; each lookup normalizes
 * the value into the domain, clamps it to `[0, 1]`, and interpolates afresh,
 * so the color for a value never depends on earlier lookups.
 * This is the source of truth for a gradient color encoding — shared by the
 * mark fills (`resolveColorChannel`) and the colorbar legend, so a value and
 * its swatch on the bar always agree.
 */
export function createGradientScale(
  config: GradientScale,
  domain: [number, number]
): (value: number) => string {
  const [min, max] = domain;
  const stops =
    typeof config.stops === "string"
      ? (schemes[config.stops]?.colors ?? [config.stops])
      : config.stops;
  const interpolate = labGradient(stops);
  return (value: number) =>
    interpolate(max === min ? 0 : (value - min) / (max - min));
}

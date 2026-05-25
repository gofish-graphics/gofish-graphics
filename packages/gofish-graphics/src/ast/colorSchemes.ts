// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Color Scale Resolution — /internals/layout/color-scales
// </gofish-wiki>

import chroma from "chroma-js";

export type PaletteScale = {
  _tag: "palette";
  values: string | string[] | Record<string, string>;
};
export type GradientScale = { _tag: "gradient"; stops: string | string[] };
export type ColorConfig = PaletteScale | GradientScale;

export const palette = (
  values: string | string[] | Record<string, string>
): PaletteScale => ({ _tag: "palette", values });

export const gradient = (stops: string | string[]): GradientScale => ({
  _tag: "gradient",
  stops,
});

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

/** Assign a gradient color by interpolating at position t in [0, 1]. */
export function assignGradientColor(config: GradientScale, t: number): string {
  const stops = config.stops;
  if (typeof stops === "string") {
    const scheme = schemes[stops];
    if (scheme) return chroma.scale(scheme.colors).mode("lab")(t).hex();
    return stops;
  }
  return chroma.scale(stops).mode("lab")(t).hex();
}

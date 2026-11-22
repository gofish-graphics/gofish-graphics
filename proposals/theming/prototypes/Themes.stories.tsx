import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import { chart, spread, stack, rect, Color } from "../../src/lib";
import {
  lines,
  cross,
  dots,
  solid,
  restyleChrome,
  lAxes,
  drawn,
  thinTicks,
  growSwatches,
} from "./defs";

const meta: Meta = { title: "Proposals Theming/Themes" };
export default meta;

type Theme = "default" | "dark" | "cogra" | "print";
const SPECIES = ["Bass", "Trout", "Catfish", "Perch", "Salmon"];

const PALETTES: Record<Exclude<Theme, "default">, string[]> = {
  // default hues (src/color.ts color6), brightened for a dark page
  dark: ["#5aa9e0", "#f7dc7a", "#b99ae0", "#ffab85", "#5fd09a"],
  cogra: SPECIES.map((s) => `url(#cg-${s})`),
  // muted earthy palette
  print: ["#5b7a8c", "#c9a35a", "#8c6d8a", "#c17a54", "#7d8f5a"],
};

const PAGE: Record<Theme, string> = {
  default: "white",
  dark: "#16161d",
  cogra: "white",
  print: "#f6f1e7",
};
const INK: Record<Theme, string> = {
  default: "#555",
  dark: "#c9c9d3",
  cogra: "black",
  print: "#3b2a1e",
};

const cograDefs = [
  solid("cg-Bass", "white"),
  lines("cg-Trout", { angle: 45, gap: 5, width: 1 }),
  lines("cg-Catfish", { angle: -45, gap: 5, width: 1 }),
  cross("cg-Perch", { gap: 6, width: 0.9 }),
  dots("cg-Salmon", { gap: 5, r: 0.9 }),
];

/** One themed chart, with its caption under it, in its own page-colored box. */
export async function themed(
  theme: Theme,
  size: { w: number; h: number } = { w: 300, h: 230 }
): Promise<HTMLElement> {
  const panel = document.createElement("div");
  panel.style.cssText = `background:${PAGE[theme]};padding:14px 16px 10px;display:inline-block;`;
  const host = document.createElement("div");
  panel.appendChild(host);
  document.body.appendChild(panel);

  const cogra = theme === "cogra";
  const print = theme === "print";
  await chart(seafood, {
    ...size,
    ...(theme === "default"
      ? {}
      : {
          color: Color.palette(
            Object.fromEntries(SPECIES.map((s, i) => [s, PALETTES[theme][i]]))
          ),
        }),
  })
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(
      rect({
        h: "count",
        fill: "species",
        ...(cogra ? { stroke: "black", strokeWidth: 0.8 } : {}),
        ...(print ? { stroke: PAGE.print, strokeWidth: 1 } : {}),
      })
    )
    .render(host, { defs: cogra ? cograDefs : [] });
  const [svg] = await drawn(host);

  if (theme === "dark") restyleChrome(svg, { ink: INK.dark });
  if (print)
    restyleChrome(svg, {
      ink: INK.print,
      font: "Georgia, 'Times New Roman', serif",
    });
  if (cogra) {
    restyleChrome(svg, {
      ink: "black",
      font: "Helvetica Neue, Helvetica, Arial, sans-serif",
    });
    thinTicks(svg, 20);
    lAxes(svg, "black");
    // legend swatches: bigger, and outlined so white reads as a swatch
    growSwatches(svg, 13, "black");
  }

  const cap = document.createElement("div");
  cap.textContent = `"${theme}"`;
  cap.style.cssText = `font:13px ${print ? "Georgia, serif" : "ui-monospace, Menlo, monospace"};color:${INK[theme]};text-align:center;margin-top:6px;`;
  panel.appendChild(cap);
  return panel;
}

const one = (theme: Theme): StoryObj => ({
  render: async () => {
    const container = initializeContainer();
    container.style.display = "inline-block";
    container.appendChild(await themed(theme));
    return container;
  },
});

// Proposed: chart(...).render(el, { theme: Theme.dark() }) etc.
export const ThemeDefault = one("default");
export const ThemeDark = one("dark");
export const ThemeCogra = one("cogra");
export const ThemePrint = one("print");

export const ThemesGrid: StoryObj = {
  render: async () => {
    const container = initializeContainer();
    container.style.cssText +=
      "display:inline-grid;grid-template-columns:auto auto;gap:12px;background:white;padding:8px;";
    for (const t of ["default", "dark", "cogra", "print"] as Theme[])
      container.appendChild(await themed(t));
    return container;
  },
};

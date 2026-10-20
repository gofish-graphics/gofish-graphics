// R5. Scatterplot matrix (SPLOM) of penguins, two spellings.
// See proposals/stacked-ribbons/NOTES.md, "R5. SPLOM".
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { penguins } from "../../../src/data/penguins";
import { chart, spread, scatter, circle } from "../../../src/lib";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Splom" };
export default meta;

/** Render, and print a thrown error above the (empty) picture. */
const show = (fn: (c: HTMLElement) => unknown) => {
  const container = initializeContainer();
  Promise.resolve()
    .then(() => fn(container))
    .catch((e) => {
      const pre = document.createElement("pre");
      pre.textContent = "ERROR: " + (e?.message ?? String(e));
      container.prepend(pre);
      console.error(e);
    });
  return container;
};

const DIMS = [
  "Beak Length (mm)",
  "Beak Depth (mm)",
  "Flipper Length (mm)",
  "Body Mass (g)",
] as const;
const pengs = penguins.filter((p: any) => DIMS.every((k) => p[k] != null));
// DECLARED SHORTCUT: per-dim min-max normalization, because sibling and
// child charts share one value scale (see NOTES "Direct style (round 2)").
const extent = Object.fromEntries(
  DIMS.map((k) => {
    const v = pengs.map((p: any) => p[k] as number);
    return [k, [Math.min(...v), Math.max(...v)]];
  })
);
const norm = (k: string, v: number) =>
  (v - extent[k][0]) / (extent[k][1] - extent[k][0]);
const pengsN = pengs.map((p: any) => {
  const row: any = { ...p };
  for (const k of DIMS) row[`n ${k}`] = norm(k, p[k]);
  return row;
});

const CELL = 90;
const GAP = 12;
const SIZE = DIMS.length * CELL + (DIMS.length - 1) * GAP;

// 1. Direct style: a RECORD of rows, each a RECORD of columns, each cell a
// chart over the parent's data (nested host map).
export const SplomProducts: StoryObj = {
  render: () =>
    show((c) =>
      chart(pengsN, { axes: false })
        .mark(
          spread(
            { dir: "y", spacing: GAP },
            DIMS.map((row) =>
              spread(
                { dir: "x", spacing: GAP },
                DIMS.map((col) => (d: any[]) =>
                  chart(d, { w: CELL, h: CELL, axes: false })
                    .flow(scatter({ x: `n ${col}`, y: `n ${row}` }))
                    .mark(circle({ r: 1.5, fill: "Species", opacity: 0.7 }))
                )
              )
            )
          )
        )
        .render(c, { w: SIZE, h: SIZE })
    ),
};

// 2. "Unpivot as a view", emulated: one row per penguin x (row dim, col dim).
const ends = pengs.flatMap((p: any) =>
  DIMS.flatMap((row) =>
    DIMS.map((col) => ({
      Species: p.Species,
      row,
      col,
      x: norm(col, p[col]),
      y: norm(row, p[row]),
    }))
  )
);

export const SplomViews: StoryObj = {
  render: () =>
    show((c) =>
      chart(ends, { axes: false })
        .flow(
          spread({ by: "row", dir: "y", spacing: GAP }),
          spread({ by: "col", dir: "x", spacing: GAP }),
          scatter({ x: "x", y: "y" })
        )
        .mark(circle({ r: 1.5, fill: "Species", opacity: 0.7 }))
        .render(c, { w: SIZE, h: SIZE })
    ),
};

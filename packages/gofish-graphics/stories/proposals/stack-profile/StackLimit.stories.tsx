import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, Color, derive, rect, ribbon, scatter, spread, stack } from "../../../src/lib";
import { jobs } from "./jobsData";
import { f, stackRows, type Offset, type Row } from "./stackingBaselines";

/**
 * THROWAWAY prototype stories for the focused stack-profile page: one real
 * stacked area with each baseline, and stacked bars whose width shrinks
 * toward the stacked area (a ribbon as the limit of thin boxes).
 */
const meta: Meta = { title: "Proposals/Stack Profile/Stack Limit" };
export default meta;

const show = (build: (container: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

// ---------------------------------------------------------------------------
// US unemployment by industry, 2000 to 2010, with each baseline.

const JW = 560;
// Tableau 20, so the 14 industries get 14 colors.
const JOBS_COLORS = Color.palette({
  Government: "#4e79a7",
  "Mining and Extraction": "#a0cbe8",
  Construction: "#f28e2b",
  Manufacturing: "#ffbe7d",
  "Wholesale and Retail Trade": "#59a14f",
  "Transportation and Utilities": "#8cd17d",
  Information: "#b6992d",
  Finance: "#f1ce63",
  "Business services": "#499894",
  "Education and Health": "#86bcb6",
  "Leisure and hospitality": "#e15759",
  Other: "#ff9d9a",
  Agriculture: "#79706e",
  "Self-employed": "#d37295",
});
const JH = 280;

// Baseline.start() today: the per-x spelling, real.
export const JobsStart = show((el) =>
  chart(jobs, {
    w: JW,
    h: JH,
    color: JOBS_COLORS,
    axes: { x: { title: "year" }, y: { title: "unemployed (thousands)" } },
  })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c" }))
    .render(el)
);

// Baseline.middle() and Baseline.wiggle(), emulated: the offsets are
// computed in derive (d3's silhouette and wiggle), then each band is placed
// by yMin / yMax.
const offset = (o: Offset) =>
  chart(jobs, { w: JW, h: JH, color: JOBS_COLORS, axes: { x: { title: "year" }, y: false } })
    .flow(
      derive((rows: Row[]) => stackRows(rows, { offset: o })),
      scatter({ by: "x", x: "x" }),
      scatter({ by: "c", yMin: "y0", yMax: "y1" })
    )
    .mark(ribbon({ fill: "c" }));
export const JobsMiddle = show((el) => offset("silhouette").render(el));
export const JobsWiggle = show((el) => offset("wiggle").render(el));

// ---------------------------------------------------------------------------
// The limit: four series as stacked bars of width dx, read at each bar's
// middle, then the stacked area. Real renders.

const SERIES = ["Maps", "Sports", "Film", "Games"];
const LW = 300;
const LH = 150;
const bars = (n: number) => {
  const dx = 30 / n;
  const rows = SERIES.flatMap((c) =>
    Array.from({ length: n }, (_, k) => ({ x: k, c, y: f(c, (k + 0.5) * dx) }))
  );
  return chart(rows, { w: LW, h: LH, axes: false, legend: false })
    .flow(spread({ by: "x", dir: "x", spacing: 0 }), stack({ by: "c", dir: "y" }))
    .mark(rect({ w: LW / n, h: "y", fill: "c" }));
};
export const Limit5 = show((el) => bars(5).render(el));
export const Limit10 = show((el) => bars(10).render(el));
export const Limit20 = show((el) => bars(20).render(el));
export const Limit60 = show((el) => bars(60).render(el));
export const LimitArea = show((el) => {
  const rows = SERIES.flatMap((c) =>
    Array.from({ length: 121 }, (_, k) => ({ x: k / 4, c, y: f(c, k / 4) }))
  );
  chart(rows, { w: LW, h: LH, axes: false, legend: false })
    .flow(scatter({ by: "x", x: "x" }), stack({ by: "c", dir: "y" }))
    .mark(ribbon({ h: "y", fill: "c" }))
    .render(el);
});

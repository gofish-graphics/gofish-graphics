import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import {
  blank,
  field,
  chart,
  Color,
  Domain,
  polygon,
  rect,
  ribbon,
  scatter,
  spread,
  stack,
  Trait,
  Unit,
} from "../../../src/lib";
import { glyphRows, ridgeRings, shapeRows, type Model } from "./spacingModels";

const meta: Meta = { title: "Proposals/Stack Profile/Spacing Alignment" };
export default meta;

const show = (build: (container: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

/** One data unit per pixel: two invisible points fix the scales. */
const pixels = (w: number, h: number) =>
  chart(
    [
      { x: 0, y: 0, k: "lo" },
      { x: w, y: h, k: "hi" },
    ],
    { w, h, axes: false, legend: false }
  )
    .flow(scatter({ by: "k", x: "x", y: "y" }))
    .mark(blank());

// ---------------------------------------------------------------------------
// Spacing models, emulated: the offsets are computed in spacingModels.ts.

const ridges = (model: Model) =>
  pixels(420, 400).layer(
    chart(ridgeRings(model).reverse()).mark(
      polygon({ points: "ring", fill: "c", stroke: "white", strokeWidth: 1.5 })
    )
  );
export const RidgeBox = show((el) => ridges("box").render(el));
export const RidgeContact = show((el) => ridges("contact").render(el));

/** Ink polygons, then the holes (counters) painted white on top. */
const inked = (w: number, h: number, rings: { c: string; ring: unknown }[]) =>
  pixels(w, h)
    .layer(chart(rings.filter((d) => d.c === "ink")).mark(polygon({ points: "ring", fill: "#333" })))
    .layer(chart(rings.filter((d) => d.c === "hole")).mark(polygon({ points: "ring", fill: "white" })));
const glyphs = (font: "serif" | "sans", model: Model) => inked(560, 230, glyphRows(font, model));
export const SerifBox = show((el) => glyphs("serif", "box").render(el));
export const SerifContact = show((el) => glyphs("serif", "contact").render(el));
export const SansBox = show((el) => glyphs("sans", "box").render(el));
export const SansContact = show((el) => glyphs("sans", "contact").render(el));
const shapes = (model: Model) => inked(330, 300, shapeRows(model));
export const ShapesBox = show((el) => shapes("box").render(el));
export const ShapesContact = show((el) => shapes("contact").render(el));

// ---------------------------------------------------------------------------
// Baseline (a node's own 0) against alignment (how a parent lines children up).

const LEVELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
const survey = [
  ["The docs are clear", [12, 22, 38, 86, 42]],
  ["Error messages are helpful", [58, 64, 36, 30, 12]],
  ["I would recommend it", [0, 9, 27, 78, 86]],
].flatMap(([question, counts]) =>
  (counts as number[]).flatMap((count, i) =>
    count === 0 ? [] : [{ question, response: LEVELS[i], count }]
  )
);
const likert = (alignment: string) =>
  chart(survey, {
    schema: {
      response: Unit({ domain: Domain.discrete(LEVELS), traits: [Trait.diverging()] }),
    },
    color: Color.palette({
      "Strongly disagree": "#ca0020",
      Disagree: "#f4a582",
      Neutral: "#d9d9d9",
      Agree: "#92c5de",
      "Strongly agree": "#0571b0",
    }),
    axes: { x: { title: "Respondents" }, y: true },
    w: 520,
    h: 170,
  })
    .flow(
      spread({ by: "question", dir: "y", alignment }),
      stack({ by: "response", dir: "x" })
    )
    .mark(rect({ w: "count", fill: "response" }));
export const LikertBaseline = show((el) => likert("baseline").render(el));
export const LikertMiddle = show((el) => likert("middle").render(el));

const bump = (x: number, m: number, s: number, a: number) =>
  a * Math.exp(-0.5 * ((x - m) / s) ** 2);
const areas = ["2023", "2024"].flatMap((panel, p) =>
  Array.from({ length: 13 }, (_, x) => [
    { panel, x, c: "Maps", v: (p ? 0.6 : 1.5) + bump(x, 4, 2, p ? 1 : 3) },
    { panel, x, c: "Games", v: (p ? 0.4 : 1) + bump(x, 8, 2, p ? 1.5 : 4) },
    { panel, x, c: "Music", v: (p ? 0.3 : 0.8) + bump(x, 6, 3, p ? 0.8 : 2) },
  ]).flat()
);
const sideBySide = (alignment: string) =>
  chart(areas, {
    w: 520,
    h: 220,
    axes: { x: { title: "month" }, y: { title: "hours" } },
  })
    .flow(
      spread({ by: "panel", dir: "x", spacing: 30, alignment }),
      scatter({ by: "x", x: "x" }),
      stack({ by: "c", dir: "y" })
    )
    .mark(ribbon({ h: "v", fill: "c" }));
export const AreasBaseline = show((el) => sideBySide("baseline").render(el));
export const AreasMiddle = show((el) => sideBySide("middle").render(el));

// ---------------------------------------------------------------------------
// Ribbon chart: one order per lake (the gallery spelling) against one order
// for all lakes (what a profile stack sorted by each series' total draws,
// emulated here with a per-species total column).

const totals: Record<string, number> = {};
for (const r of seafood as any[]) totals[r.species] = (totals[r.species] ?? 0) + r.count;
const withTotal = (seafood as any[]).map((r) => ({ ...r, total: totals[r.species] }));
const ribbonChart = (sortBy: string) =>
  chart(withTotal, { w: 460, h: 300, color: Color.palette({ Trout: "#4dbb78", Catfish: "#ff8c5a", Bass: "#a17fd0", Perch: "#f3cd57", Salmon: "#3d8bc9" }) })
    .flow(
      spread({ by: "lake", dir: "x", spacing: 64 }),
      stack({ by: field("species").sort(sortBy), dir: "y" })
    )
    .mark(rect({ h: "count", fill: "species" }))
    .layer(ribbon({ opacity: 0.8 }));
export const RibbonPerLake = show((el) => ribbonChart("count").render(el));
export const RibbonByTotal = show((el) => ribbonChart("total").render(el));

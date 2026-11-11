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
import { glyphRows, ridgeRings, shapeRows, testRows, type Model, type TestModel } from "./spacingModels";

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
    // the blurred outline, drawn over the ink: dark ink outside it was retracted
    .layer(chart(rings.filter((d) => d.c === "halo")).mark(polygon({ points: "ring", fill: "#6baed6", opacity: 0.85 })))
    .layer(chart(rings.filter((d) => d.c === "hole")).mark(polygon({ points: "ring", fill: "white" })));
const glyphs = (font: "serif" | "sans", model: Model) => inked(560, 230, glyphRows(font, model));
export const SerifBox = show((el) => glyphs("serif", "box").render(el));
export const SerifContact = show((el) => glyphs("serif", "contact").render(el));
export const SansBox = show((el) => glyphs("sans", "box").render(el));
export const SansContact = show((el) => glyphs("sans", "contact").render(el));
const shapes = (model: Model) => inked(330, 300, shapeRows(model));
export const ShapesBox = show((el) => shapes("box").render(el));
export const ShapesContact = show((el) => shapes("contact").render(el));
export const ShapesArea = show((el) => shapes("area").render(el));
export const SerifArea = show((el) => glyphs("serif", "area").render(el));

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

// Josh's test rows
// Josh's test rows at a tight target (10 px, floor 3) and a loose one (30 px, floor 3).
const test = (m: TestModel, T: number, w = 0) => inked(420, 230, testRows(m, T, 3, w));
export const TestBoxTight = show((el) => test("box", 10).render(el));
export const TestBoxLoose = show((el) => test("box", 30).render(el));
export const TestContactTight = show((el) => test("contact", 10).render(el));
export const TestContactLoose = show((el) => test("contact", 30).render(el));
export const TestEuclidTight = show((el) => test("euclid", 10).render(el));
export const TestEuclidLoose = show((el) => test("euclid", 30).render(el));
export const TestAreaSumTight = show((el) => test("areaSum", 10).render(el));
export const TestAreaSumLoose = show((el) => test("areaSum", 30).render(el));
export const TestAreaMaxTight = show((el) => test("areaMax", 10).render(el));
export const TestAreaMaxLoose = show((el) => test("areaMax", 30).render(el));
export const TestPairAreaTight = show((el) => test("pairArea", 10).render(el));
export const TestPairAreaLoose = show((el) => test("pairArea", 30).render(el));
// the tradeoff at the tight target: floor 0, so the base corners may touch
export const TestPairAreaTouch = show((el) => inked(420, 230, testRows("pairArea", 10, 0)).render(el));
// contact on an opened outline: parts thinner than w (8 or 16 px) are ignored
export const TestOpened8Tight = show((el) => test("opened", 10, 8).render(el));
export const TestOpened16Tight = show((el) => test("opened", 10, 16).render(el));
export const TestOpened8Loose = show((el) => test("opened", 30, 8).render(el));
export const TestOpened16Loose = show((el) => test("opened", 30, 16).render(el));
// contact on a blurred outline: Gaussian of width 3 or 6 px, cut at 0.5
export const TestBlur3Tight = show((el) => test("blur", 10, 3).render(el));
export const TestBlur6Tight = show((el) => test("blur", 10, 6).render(el));
export const TestBlur3Loose = show((el) => test("blur", 30, 3).render(el));
export const TestBlur6Loose = show((el) => test("blur", 30, 6).render(el));
export const TestBlur6Halo = show((el) => inked(420, 230, testRows("blur", 10, 3, 6, true)).render(el));

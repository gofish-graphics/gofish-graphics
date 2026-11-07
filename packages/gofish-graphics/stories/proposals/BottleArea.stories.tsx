/**
 * Throwaway prototypes for the bottle area-fill proposal
 * (proposals/bottle-area-fill/). Not a feature: every picture here is drawn
 * with today's primitives, and the fill levels are computed by hand in JS from
 * the bottle PNG's alpha profile (bottleProfile.ts). The proposal's approaches
 * would compute the same levels inside the library.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  rect,
  image,
  text,
  polygon,
  Constraint,
  layer,
  atop,
  Filter,
  v,
} from "../../src/lib";
import bottlePng from "../assets/wilsonblanco.png";
import {
  BOTTLE_PNG_H,
  BOTTLE_ROW_LEFT,
  BOTTLE_ROW_RIGHT,
} from "./bottleProfile";

const meta: Meta = { title: "Proposals/Bottle Area" };
export default meta;

// ---------------------------------------------------------------------------
// The profile and its inverse cumulative measure.
// ---------------------------------------------------------------------------

export type Measure = "length" | "area" | "volume";

const rowWidth = (row: number) => BOTTLE_ROW_RIGHT[row] - BOTTLE_ROW_LEFT[row];

/** Weight of one pixel row under each reading of "how full". */
const weight = (row: number, m: Measure) => {
  const w = rowWidth(row);
  if (m === "length") return 1;
  if (m === "area") return w;
  return w * w; // solid of revolution: π (w/2)² per row, constant dropped
};

/** Fraction of the image height (from the bottom) at which the fill must stop
 *  so that `p` (0..1) of the bottle's measure lies below it. */
export const levelFor = (p: number, m: Measure): number => {
  const H = BOTTLE_PNG_H;
  let total = 0;
  for (let r = 0; r < H; r++) total += weight(r, m);
  const target = p * total;
  let cum = 0;
  for (let k = 0; k < H; k++) {
    const row = H - 1 - k;
    const wgt = weight(row, m);
    if (cum + wgt >= target) {
      const frac = wgt > 0 ? (target - cum) / wgt : 0;
      return (k + frac) / H;
    }
    cum += wgt;
  }
  return 1;
};

// ---------------------------------------------------------------------------
// 1. Today's story, with the fill level as a derived column.
// ---------------------------------------------------------------------------

const data = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];

const bottleRow = (m: Measure) => {
  const rows = data.map((d) => ({
    ...d,
    level: 100 * levelFor(d.amount / 100, m),
  }));
  const container = initializeContainer();
  chart(rows, { axes: false })
    .flow(spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } }))
    .mark(
      layer([
        atop({ blendMode: "color" }, [
          image({ href: bottlePng, h: v(100), filter: Filter.grayscale }),
          rect({ h: "level", w: 175, fill: "#00ff00" }),
        ]).name("bottle"),
        rect({ h: 1, fill: "#666", w: 175, y: "level" }).name("line"),
        text({ fontSize: 35, fill: "#666", text: (d) => `${d.amount}%` }).name(
          "label"
        ),
      ]).relate(({ line, label, bottle }) => [
        Constraint.align({ x: "start" }, [bottle, line]),
        Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
        Constraint.align({ x: "end" }, [label, line]),
      ])
    )
    .render(container, {});
  return container;
};

export const HeightToday: StoryObj = { render: () => bottleRow("length") };
export const AreaFill: StoryObj = { render: () => bottleRow("area") };
export const VolumeFill: StoryObj = { render: () => bottleRow("volume") };

// ---------------------------------------------------------------------------
// 2. Stacked liquids: "What's in a bottle of wine" (the Cut story's data).
// ---------------------------------------------------------------------------

const wine = [
  { category: "Grape juice", amount: 42, fill: "#7b1f3a" },
  { category: "Water", amount: 40, fill: "#4a90c2" },
  { category: "Tannins", amount: 3, fill: "#8a5a2b" },
  { category: "Sulfites", amount: 2, fill: "#e0b43c" },
  { category: "Pretentiousness", amount: 7, fill: "#9b6cc4" },
  { category: "Marketing", amount: 6, fill: "#e0607e" },
];

const IMG_H = 520;
const IMG_W = (IMG_H * 157) / 650;

const stackedBottle = (m: Measure) => {
  const container = initializeContainer();
  let cum = 0;
  const bands = wine.map((d) => {
    const lo = levelFor(cum / 100, m);
    cum += d.amount;
    const hi = levelFor(cum / 100, m);
    return { ...d, lo, hi };
  });
  // Band middles (y down), pushed apart bottom-up so labels keep 17 px.
  const labelYs = bands.map((b) => IMG_H * (1 - (b.lo + b.hi) / 2));
  for (let i = 1; i < labelYs.length; i++)
    labelYs[i] = Math.min(labelYs[i], labelYs[i - 1] - 17);
  const children = [
    atop({ blendMode: "multiply" }, [
      image({ href: bottlePng, x: 0, y: 0, w: IMG_W, h: IMG_H, filter: Filter.grayscale }),
      layer(
        bands.map((b) =>
          rect({
            x: 0,
            y: IMG_H * (1 - b.hi),
            w: IMG_W,
            h: IMG_H * (b.hi - b.lo),
            fill: b.fill,
          })
        )
      ),
    ]),
    ...bands.map((b) =>
      rect({ x: IMG_W - 4, y: IMG_H * (1 - b.hi), w: 34, h: 1, fill: "#888" })
    ),
    ...bands.map((b, i) =>
      text({
        x: IMG_W + 34,
        y: labelYs[i] - 7,
        fontSize: 14,
        fill: "#555",
        text: `${b.category} ${b.amount}%`,
      })
    ),
  ];
  layer(children).render(container, { w: IMG_W + 200, h: IMG_H });
  return container;
};

export const StackedHeight: StoryObj = { render: () => stackedBottle("length") };
export const StackedArea: StoryObj = { render: () => stackedBottle("area") };

// ---------------------------------------------------------------------------
// 3. Hard example: martini glasses. The container (the cone) is not the
//    picture's silhouette (stem and foot are solid glass), and area grows with
//    the square of the level, so height encoding is far off.
// ---------------------------------------------------------------------------

const GLASS_W = 150;
const BOWL_H = 120;
const STEM_H = 90;

const martini = (p: number, m: "length" | "area", x0: number) => {
  // level from the apex as a fraction of the bowl depth
  const f = m === "length" ? p : Math.sqrt(p);
  const apexX = x0 + GLASS_W / 2;
  const apexY = BOWL_H;
  const half = (GLASS_W / 2) * f;
  const topY = BOWL_H * (1 - f);
  return [
    polygon({
      points: [
        [apexX - half, topY],
        [apexX + half, topY],
        [apexX, apexY],
      ],
      fill: "#c8d84a",
    }),
    polygon({
      points: [
        [x0, 0],
        [x0 + GLASS_W, 0],
        [apexX, apexY],
      ],
      fill: "none",
      stroke: "#555",
      strokeWidth: 2,
    }),
    rect({ x: apexX - 1.5, y: apexY, w: 3, h: STEM_H, fill: "#555" }),
    rect({ x: apexX - 40, y: apexY + STEM_H, w: 80, h: 4, fill: "#555" }),
    rect({ x: apexX + half + 2, y: topY, w: GLASS_W / 2 - half + 14, h: 1, fill: "#999" }),
    text({
      x: x0 + GLASS_W + 18,
      y: topY - 16,
      fontSize: 16,
      fill: "#555",
      text: `${Math.round(p * 100)}%`,
    }),
  ];
};

const martinis = (m: "length" | "area") => {
  const container = initializeContainer();
  const ps = [0.25, 0.5, 0.75];
  layer(ps.flatMap((p, i) => martini(p, m, i * (GLASS_W + 70)))).render(
    container,
    { w: 3 * (GLASS_W + 70), h: BOWL_H + STEM_H + 10 }
  );
  return container;
};

export const MartiniHeight: StoryObj = { render: () => martinis("length") };
export const MartiniArea: StoryObj = { render: () => martinis("area") };

// ---------------------------------------------------------------------------
// 4. The equal-area map as a 2D coordinate: a 10 x 10 waffle drawn in the
//    unit square and mapped into the bottle. Every cell has the same area.
// ---------------------------------------------------------------------------

const W_H = 520;
const S = W_H / 650;

/** Map (u, v) in the unit square (u = share of area from the bottom, v = share
 *  of the width at that level) to pixels in the scaled image box. */
const mapUV = (u: number, vv: number, m: Measure): [number, number] => {
  const lvl = levelFor(u, m); // fraction of height from the bottom
  const yImg = Math.min(649, Math.max(0, (1 - lvl) * 650));
  const row = Math.min(649, Math.floor(yImg));
  const l = BOTTLE_ROW_LEFT[row];
  const r = BOTTLE_ROW_RIGHT[row];
  return [S * (l + vv * (r - l)), S * yImg];
};

const cellRing = (u0: number, u1: number, v0: number, v1: number, m: Measure) => {
  const n = 8;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push(mapUV(u0 + ((u1 - u0) * i) / n, v0, m));
  for (let i = 0; i <= n; i++) pts.push(mapUV(u1 - ((u1 - u0) * i) / n, v1, m));
  return pts;
};

const waffle = (m: Measure, filled: number) => {
  const container = initializeContainer();
  const cells = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      const k = r * 10 + c;
      cells.push(
        polygon({
          points: cellRing(r / 10, (r + 1) / 10, c / 10, (c + 1) / 10, m),
          fill: k < filled ? "#2f9e44" : "#d9d9d9",
          stroke: "white",
          strokeWidth: 1,
        })
      );
    }
  layer([
    image({ href: bottlePng, x: 0, y: 0, w: 157 * S, h: W_H, filter: Filter.grayscale, opacity: 0.35 }),
    ...cells,
  ]).render(container, { w: 157 * S + 4, h: W_H });
  return container;
};

export const WaffleLength: StoryObj = { render: () => waffle("length", 60) };
export const WaffleArea: StoryObj = { render: () => waffle("area", 60) };

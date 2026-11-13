// Figure 1 of "How does a label find its place?": the label chooser on four
// labeled dots. Every number here was printed by a run of the library
// (tests/tmp/book/labels-run/run.mts in the chapter's report), in Node, on a
// 300 x 200 canvas, so text is measured by the fallback rule (0.6 em per
// character, a 1 em line). Pixels, y down.
//
//   chart(rows, { axes: false })
//     .flow(scatter({ by: "name", x: "x", y: "y" }))
//     .mark(circle({ r: 5 }).label("name"))

export type Box = { minX: number; maxX: number; minY: number; maxY: number };
export type Dot = { name: string; cx: number; cy: number };
/** A candidate spot: the center of the label's box there. */
export type Spot = [number, number];

export const W = 300;
export const H = 200;
export const R = 5;
export const FONT = 11;

export const dots: Dot[] = [
  { name: "Lima", cx: 121, cy: 100 },
  { name: "Quito", cx: 126.8, cy: 107.98 },
  { name: "Oslo", cx: 5, cy: 195 },
  { name: "Rome", cx: 295, cy: 5 },
];

/** Half the label's box: fallback width 0.6 em per character, 1 em tall. */
export const half = (name: string) => ({
  hx: (name.length * FONT * 0.6) / 2,
  hy: FONT / 2,
});

/** Place.around()'s default order, the order of every list below. */
export const directions = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
  "right",
  "left",
  "top",
  "bottom",
];

/** The candidates aroundCandidates() yields for each dot, in order. */
export const candidates: Record<string, Spot[]> = {
  Lima: [
    [139.12, 88.53],
    [102.88, 88.53],
    [139.12, 111.47],
    [102.88, 111.47],
    [142.2, 100],
    [99.8, 100],
    [121, 86.74],
    [121, 113.26],
  ],
  Quito: [
    [148.22, 96.51],
    [105.38, 96.51],
    [148.22, 119.45],
    [105.38, 119.45],
    [151.3, 107.98],
    [102.3, 107.98],
    [126.8, 94.72],
    [126.8, 121.24],
  ],
  Oslo: [
    [23.12, 183.53],
    [-13.12, 183.53],
    [23.12, 206.47],
    [-13.12, 206.47],
    [26.2, 195],
    [-16.2, 195],
    [5, 181.74],
    [5, 208.26],
  ],
  Rome: [
    [313.12, -6.47],
    [276.88, -6.47],
    [313.12, 16.47],
    [276.88, 16.47],
    [316.2, 5],
    [273.8, 5],
    [295, -8.26],
    [295, 18.26],
  ],
};

/** Which candidate (0-based) each label took, read from the drawn text. */
export const chosen: Record<string, number> = {
  Lima: 0,
  Quito: 2,
  Oslo: 0,
  Rome: 3,
};

export const boxAt = (name: string, [cx, cy]: Spot): Box => {
  const { hx, hy } = half(name);
  return { minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy };
};

export type Step = {
  label: string;
  note: string;
  /** Whose numbered candidates the zoomed panel shows. */
  marks?: string;
  /** Candidate boxes drawn as tried: refused, or taken. */
  tries: { name: string; k: number; ok: boolean; zoom: boolean }[];
  /** Labels drawn as placed. */
  placed: string[];
  /** The obstacle a refused try hits, outlined. */
  hit?: "limaLabel" | "limaDot" | "frame";
};

export const steps: Step[] = [
  {
    label: "Lima's spots",
    note: "Lima comes first in the data, so its label is placed first. Place.around() offers eight spots around the dot, in this order.",
    marks: "Lima",
    tries: [],
    placed: [],
  },
  {
    label: "Lima settles",
    note: "Spot 1, upper right, covers no dot and no label, and it is inside the frame. Lima takes it and the chooser files its box as an obstacle.",
    tries: [{ name: "Lima", k: 0, ok: true, zoom: true }],
    placed: ["Lima"],
  },
  {
    label: "Quito's spots",
    note: "Quito's dot is about 10 pixels from Lima's. Its eight spots follow the same order.",
    marks: "Quito",
    tries: [],
    placed: ["Lima"],
  },
  {
    label: "1 is taken",
    note: "Spot 1 covers the box Lima's label just filed, so it is refused.",
    marks: "Quito",
    tries: [{ name: "Quito", k: 0, ok: false, zoom: true }],
    placed: ["Lima"],
    hit: "limaLabel",
  },
  {
    label: "2 is taken",
    note: "Spot 2 covers Lima's dot. Every labeled mark is an obstacle to every label but its own, so it is refused too.",
    marks: "Quito",
    tries: [{ name: "Quito", k: 1, ok: false, zoom: true }],
    placed: ["Lima"],
    hit: "limaDot",
  },
  {
    label: "Quito settles",
    note: "Spot 3, lower right, is clear. Quito takes it. Spots 4 to 8 are never made, because the candidates are produced one at a time.",
    tries: [{ name: "Quito", k: 2, ok: true, zoom: true }],
    placed: ["Lima", "Quito"],
  },
  {
    label: "The rest",
    note: "Oslo takes its spot 1. Rome sits in the corner: spots 1 and 2 leave the frame at the top and spot 3 at the right, so Rome takes spot 4, lower left.",
    tries: [
      { name: "Rome", k: 0, ok: false, zoom: false },
      { name: "Rome", k: 1, ok: false, zoom: false },
      { name: "Rome", k: 2, ok: false, zoom: false },
    ],
    placed: ["Lima", "Quito", "Oslo", "Rome"],
    hit: "frame",
  },
];

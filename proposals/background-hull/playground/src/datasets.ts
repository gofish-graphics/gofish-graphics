// The six datasets of the proposal's dataset explorer, with the exact members, positions and
// paint of the stories (BackgroundHull.stories.tsx, sections (a), (b1), (b3), (b4), (e), (f)).
import { discPoly, dist, type Member, type Pt } from "./blob";
import PENGUINS from "./penguins.json";

type Circle = Extract<Member, { kind: "circle" }>;
type Rect = Extract<Member, { kind: "rect" }>;
const C = (cx: number, cy: number, r = 7): Circle => ({
  kind: "circle",
  cx,
  cy,
  r,
});

/** One enclosed set: what goes into smoothBlob, and how its outline is painted. */
export type BlobSet = {
  name: string;
  members: Member[];
  avoiding: Member[];
  via?: [Pt, Pt][];
  color: string;
  fillOpacity: number;
  strokeWidth: number;
  /** Munkres draws the {a, c} outline as a black line with no fill. */
  stroke?: string;
};
export type Dataset = {
  id: string;
  label: string;
  /** padding and clearance as the stories spell them for this dataset */
  padding: number;
  clearance: number;
  /** viewBox: x, y, w, h */
  view: [number, number, number, number];
  sets: BlobSet[];
  /** SVG markup painted under the outlines, and over them */
  under?: string;
  over: string;
  /** what the members argument reads as in the code line */
  call: string;
  /** the shape options that name the avoided nodes and via edges */
  shapeArgs: string;
  note: string;
  /** an alternative reading of the same data, behind a checkbox (hyperedges: edges as members) */
  variant?: { label: string } & Pick<
    Dataset,
    "sets" | "call" | "shapeArgs" | "note"
  >;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const dot = (m: Circle, fill: string, extra = "") =>
  `<circle cx="${m.cx}" cy="${m.cy}" r="${m.r}" fill="${fill}"${extra}/>`;
const text = (
  x: number,
  y: number,
  s: string,
  o: {
    size?: number;
    fill?: string;
    bold?: boolean;
    italic?: boolean;
    anchor?: string;
  } = {}
) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 12}" fill="${o.fill ?? "#333"}"${o.bold ? ' font-weight="bold"' : ""}${o.italic ? ' font-style="italic"' : ""}${o.anchor ? ` text-anchor="${o.anchor}"` : ""}>${esc(s)}</text>`;
const pts = (p: Pt[]) =>
  p.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ");

// ── (a) and (f): Munkres' three points ───────────────────────────────────────
const MA = C(60, 70, 5),
  MB = C(160, 70, 5),
  MC = C(260, 70, 5);
const ring = (m: Circle) => C(m.cx, m.cy, 14);
const ringInk = (m: Circle) =>
  `<polygon points="${pts(discPoly([m.cx, m.cy], 14, 48))}" fill="none" stroke="#111" stroke-width="2.5"/>`;
const topoPoints = () => [MA, MB, MC].map((m) => dot(m, "#111")).join("");
const abcLabels = () =>
  [
    [MA, "a"],
    [MB, "b"],
    [MC, "c"],
  ]
    .map(([m, s]) =>
      text((m as Circle).cx - 4, (m as Circle).cy + 30, s as string, {
        size: 15,
        italic: true,
        fill: "#111",
      })
    )
    .join("");

const topology: Dataset = {
  id: "topology",
  label: "a, c avoiding b",
  padding: 22,
  clearance: 6,
  view: [0, 0, 320, 150],
  sets: [
    {
      name: "{a, c}",
      members: [MA, MC],
      avoiding: [ring(MB)],
      color: "#ff2400",
      fillOpacity: 0.3,
      strokeWidth: 2,
    },
  ],
  over: ringInk(MB) + topoPoints(),
  call: "[a, c]",
  shapeArgs: "avoiding: [b]",
  note: "Two members, so there is no triangle to fill: convexity does nothing here. Try neck and smoothing.",
};

const oval = (cx: number, w: number, h: number) =>
  `<ellipse cx="${cx}" cy="70" rx="${w / 2 - 1.25}" ry="${h / 2 - 1.25}" fill="none" stroke="#111" stroke-width="2.5"/>`;
const munkres: Dataset = {
  id: "munkres",
  label: "Munkres",
  padding: 22,
  clearance: 6,
  view: [-30, -24, 380, 190],
  sets: [
    {
      name: "{a, c}",
      members: [MA, MC],
      avoiding: [ring(MB)],
      color: "#111",
      fillOpacity: 0,
      strokeWidth: 2.5,
      stroke: "#111",
    },
  ],
  over:
    oval(160, 372, 184) +
    oval(110, 176, 104) +
    oval(210, 176, 104) +
    [MA, MB, MC].map(ringInk).join("") +
    topoPoints(),
  call: "[a, c]",
  shapeArgs: "avoiding: [b]",
  note: "Munkres' ninth panel. The ovals are the custom-shape escape hatch; only {a, c} is a blob. The proposal's spelling is neck 0.85, smoothing 40.",
};

// ── (b) the U-shaped cloud ───────────────────────────────────────────────────
const U: Circle[] = (() => {
  const path: Pt[] = [
    [35, 22],
    [35, 150],
    [190, 150],
    [190, 22],
  ];
  const out: Circle[] = [];
  for (let s = 0; s < 3; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const L = dist(a, b),
      nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
    const k = Math.round(L / 26);
    for (let i = s === 0 ? 0 : 1; i <= k; i++) {
      const t = i / k,
        jit = ((i * 7 + s * 3) % 5) - 2;
      for (const side of [-1, 1])
        out.push(
          C(
            a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit,
            a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit,
            5
          )
        );
    }
  }
  return out;
})();
const NON = [C(112, 50, 5), C(112, 100, 5)];
const BLUE = "#3366aa",
  GRAY = "#9aa0a6";
const uCloud: Dataset = {
  id: "u",
  label: "U cloud",
  padding: 8,
  clearance: 4,
  view: [0, 0, 226, 180],
  sets: [
    {
      name: "members",
      members: U,
      avoiding: NON,
      color: BLUE,
      fillOpacity: 0.22,
      strokeWidth: 1.5,
    },
  ],
  over:
    U.map((m) => dot(m, BLUE)).join("") + NON.map((m) => dot(m, GRAY)).join(""),
  call: "members",
  shapeArgs: "avoiding: others",
  note: "Blue dots are members; the two gray dots in the opening are avoided.",
};

// ── (c) penguins: one blob per species, the other species avoided ───────────
const SPECIES = ["Adelie", "Chinstrap", "Gentoo"];
const SPECIES_COLORS = ["#4c78a8", "#f58518", "#54a24b"];
const PW = 360,
  PH = 260,
  PL = 44;
const xs = (v: number) => PL + ((v - 32) / (60 - 32)) * PW;
const ys = (v: number) => PH - ((v - 13) / (22 - 13)) * PH;
const PEN = (PENGUINS as [number, number, number][]).map(([x, y, s]) => ({
  m: C(xs(x), ys(y), 2.5),
  s,
}));
const penAxes =
  `<rect x="${PL}" y="${PH}" width="${PW}" height="1" fill="#666"/><rect x="${PL - 1}" y="0" width="1" height="${PH}" fill="#666"/>` +
  [35, 40, 45, 50, 55]
    .map((v) => text(xs(v), PH + 16, String(v), { size: 10, anchor: "middle" }))
    .join("") +
  [14, 16, 18, 20, 22]
    .map((v) => text(PL - 6, ys(v) + 4, String(v), { size: 10, anchor: "end" }))
    .join("") +
  text(PL + PW / 2, PH + 32, "Beak Length (mm)", {
    size: 11,
    anchor: "middle",
  }) +
  text(PL + 6, 14, "Beak Depth (mm)", { size: 11 }) +
  SPECIES.map((s, i) =>
    text(PL + 130 + i * 80, -12, s, { fill: SPECIES_COLORS[i], bold: true })
  ).join("");
const penguins: Dataset = {
  id: "penguins",
  label: "Penguins",
  padding: 4,
  clearance: 4,
  view: [6, -28, 410, 330],
  sets: SPECIES.map((name, i) => ({
    name,
    members: PEN.filter((d) => d.s === i).map((d) => d.m),
    avoiding: PEN.filter((d) => d.s !== i).map((d) => d.m),
    color: SPECIES_COLORS[i],
    fillOpacity: 0.18,
    strokeWidth: 1.5,
  })),
  under: penAxes,
  over: PEN.map((d) => dot(d.m, SPECIES_COLORS[d.s])).join(""),
  call: "species",
  shapeArgs: "avoiding: otherSpecies",
  note: "One blob per species; each avoids the other two species' points. The heaviest dataset: three sets, 342 points.",
};

// ── (d) hyperedges over a node-link graph ────────────────────────────────────
const NODES: Record<string, Pt> = {
  n1: [40, 50],
  n2: [110, 30],
  n3: [100, 110],
  n4: [170, 90],
  n5: [240, 50],
  n6: [250, 130],
  n7: [180, 170],
  n8: [60, 180],
  n9: [310, 190],
  n10: [320, 80],
};
const EDGES: [string, string][] = [
  ["n1", "n2"],
  ["n1", "n3"],
  ["n2", "n4"],
  ["n3", "n4"],
  ["n4", "n5"],
  ["n4", "n6"],
  ["n6", "n7"],
  ["n3", "n8"],
  ["n7", "n9"],
  ["n5", "n10"],
  ["n6", "n9"],
  ["n8", "n7"],
];
const SETS = [
  { name: "A", nodes: ["n1", "n2", "n3"], color: "#e45756" },
  { name: "B", nodes: ["n4", "n5", "n6", "n10"], color: "#4c78a8" },
  { name: "C", nodes: ["n3", "n8", "n7", "n9"], color: "#54a24b" },
];
const hyperNode = (id: string) => C(NODES[id][0], NODES[id][1], 9);
const hyperedges: Dataset = {
  id: "hyperedges",
  label: "Hyperedges",
  padding: 6,
  clearance: 3,
  view: [8, 4, 345, 225],
  sets: SETS.map((s) => ({
    name: `set ${s.name}`,
    members: s.nodes.map(hyperNode),
    avoiding: Object.keys(NODES)
      .filter((id) => !s.nodes.includes(id))
      .map(hyperNode),
    via: EDGES.filter(
      ([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)
    ).map(([p, q]) => [NODES[p], NODES[q]] as [Pt, Pt]),
    color: s.color,
    fillOpacity: 0.25,
    strokeWidth: 2,
  })),
  over:
    EDGES.map(
      ([p, q]) =>
        `<line x1="${NODES[p][0]}" y1="${NODES[p][1]}" x2="${NODES[q][0]}" y2="${NODES[q][1]}" stroke="#555" stroke-width="1.5"/>`
    ).join("") +
    Object.keys(NODES)
      .map((id) =>
        dot(hyperNode(id), "white", ' stroke="#333" stroke-width="1.5"')
      )
      .join("") +
    Object.keys(NODES)
      .map((id) =>
        text(NODES[id][0], NODES[id][1] + 3.5, id.slice(1), {
          size: 10,
          anchor: "middle",
        })
      )
      .join("") +
    SETS.map((s, i) =>
      text(20 + i * 50, 222, `set ${s.name}`, { fill: s.color, bold: true })
    ).join(""),
  call: "set",
  shapeArgs: 'via: selectAll("edges"), avoiding: selectAll("nodes")',
  note: "Each set's graph edges between its members are `via` links; every other node is avoided.",
  // Section (g) of the stories: each set's members are its nodes plus the graph edges whose two
  // ends are both in the set, as segment members (stroke width 1.5); no `via`.
  variant: {
    label: "Edges as members",
    sets: SETS.map((s) => ({
      name: `set ${s.name}`,
      members: [
        ...s.nodes.map(hyperNode),
        ...EDGES.filter(
          ([p, q]) => s.nodes.includes(p) && s.nodes.includes(q)
        ).map(
          ([p, q]) =>
            ({ kind: "segment", a: NODES[p], b: NODES[q], w: 1.5 }) as Member
        ),
      ],
      avoiding: Object.keys(NODES)
        .filter((id) => !s.nodes.includes(id))
        .map(hyperNode),
      color: s.color,
      fillOpacity: 0.25,
      strokeWidth: 2,
    })),
    call: "[...setNodes, ...setEdges]",
    shapeArgs: 'avoiding: selectAll("nodes")',
    note: "Each set's members are its nodes and the graph edges between them (segment members, as in the stories' section (g)); every other node is avoided.",
  },
};

// ── (e) trout across lakes ───────────────────────────────────────────────────
const LAKES = ["Erie", "Huron", "Michigan", "Ontario"];
const FISH = ["bass", "trout", "perch"];
const SP_COLORS = ["#9ecae9", "#f58518", "#bab0ac"];
const COUNTS = [
  [40, 95, 60],
  [70, 55, 85],
  [30, 110, 45],
  [80, 70, 50],
];
const BW = 20,
  GAP = 9,
  GROUP = 3 * BW + 2 * GAP,
  GG = 34,
  BASE = 170,
  X0 = 20;
const BARS: { m: Rect; sp: number }[] = LAKES.flatMap((_, li) =>
  FISH.map((_, si) => {
    const h = COUNTS[li][si] * 1.3;
    return {
      m: {
        kind: "rect",
        x: X0 + li * (GROUP + GG) + si * (BW + GAP),
        y: BASE - h,
        w: BW,
        h,
      } as Rect,
      sp: si,
    };
  })
);
const AXIS_BAND: Rect = {
  kind: "rect",
  x: X0 - 6,
  y: BASE,
  w: 4 * GROUP + 3 * GG + 12,
  h: 24,
};
const trout: Dataset = {
  id: "trout",
  label: "Trout",
  padding: 4,
  clearance: 4,
  view: [0, -46, 450, 246],
  sets: [
    {
      name: "trout",
      members: BARS.filter((b) => b.sp === 1).map((b) => b.m),
      avoiding: [...BARS.filter((b) => b.sp !== 1).map((b) => b.m), AXIS_BAND],
      color: "#d6580c",
      fillOpacity: 0.18,
      strokeWidth: 2,
    },
  ],
  over:
    BARS.map(
      (b) =>
        `<rect x="${b.m.x}" y="${b.m.y}" width="${b.m.w}" height="${b.m.h}" fill="${SP_COLORS[b.sp]}"/>`
    ).join("") +
    `<rect x="${X0 - 6}" y="${BASE}" width="${4 * GROUP + 3 * GG + 12}" height="1" fill="#666"/>` +
    LAKES.map((l, li) =>
      text(X0 + li * (GROUP + GG) + GROUP / 2, BASE + 18, l, {
        anchor: "middle",
      })
    ).join("") +
    FISH.map((s, si) =>
      text(X0 + si * 70, -20, s, {
        fill: si === 1 ? "#d6580c" : "#666",
        bold: true,
      })
    ).join(""),
  call: "trout",
  shapeArgs: 'avoiding: selectAll("bars")',
  note: "Trout bars are members; the other bars and the axis band are avoided. Every triangle holds another bar, so convexity does little.",
};

export const DATASETS: Dataset[] = [
  topology,
  uCloud,
  penguins,
  hyperedges,
  trout,
  munkres,
];

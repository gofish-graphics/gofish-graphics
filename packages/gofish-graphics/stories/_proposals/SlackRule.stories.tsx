import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { circle, layer, line, polygon, position, rect, text } from "../../src/lib";

// Throwaway prototypes for the slack-rule proposal (the "The slack rule" tab
// of proposals/user-space-layouts). Every story computes positions in story
// code, as a PROTOTYPE OF THE SEMANTICS of one candidate rule, and draws them
// through the public API at literal positions. Nothing here is the engine's
// minimum gap. The lowercase exports are the rules, which
// proposals/user-space-layouts/scratch/slack/check.mjs.txt evaluates against
// d3; Storybook skips them. Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/Slack Rule",
  excludeStories: /^[a-z]/,
};
export default meta;

// ─────────────────────────────────────────────────────────────────────────
// The rules, on a system of minimum gaps: x[to] >= x[from] + w
// ─────────────────────────────────────────────────────────────────────────

/** A minimum gap. `grow` is a glue weight (approach B): how much of the
 *  slack it takes. */
export type MinGap = { from: string; to: string; w: number; grow?: number };
/** Items in chain order (used only by the chain rules), gaps, exact pins,
 *  and each item's size (for where the span ends). */
export type Sys = {
  items: string[];
  gaps: MinGap[];
  pins?: Record<string, number>;
  size?: Record<string, number>;
};
type Pos = Record<string, number>;

const topo = (s: Sys): string[] => {
  const ins = new Map(s.items.map((id) => [id, 0]));
  for (const g of s.gaps) ins.set(g.to, ins.get(g.to)! + 1);
  const order = s.items.filter((id) => ins.get(id) === 0);
  for (let k = 0; k < order.length; k++)
    for (const g of s.gaps)
      if (g.from === order[k]) {
        ins.set(g.to, ins.get(g.to)! - 1);
        if (ins.get(g.to) === 0) order.push(g.to);
      }
  if (order.length < s.items.length) throw new Error("a cycle of gaps");
  return order;
};

/** The least solution: each item as near the start as its gaps allow. */
export const least = (s: Sys): Pos => {
  const x: Pos = {};
  for (const id of topo(s)) {
    const from = s.gaps.filter((g) => g.to === id).map((g) => x[g.from] + g.w);
    x[id] = s.pins?.[id] ?? (from.length ? Math.max(...from) : 0);
  }
  return x;
};

/** Where the least solution's span ends. */
export const spanEnd = (s: Sys, l = least(s)) =>
  Math.max(...s.items.map((id) => l[id] + (s.size?.[id] ?? 0)));

/** The greatest solution inside the least solution's span. */
export const greatest = (s: Sys, end = spanEnd(s)): Pos => {
  const x: Pos = {};
  for (const id of topo(s).reverse()) {
    const to = s.gaps.filter((g) => g.from === id).map((g) => x[g.to] - g.w);
    x[id] =
      s.pins?.[id] ??
      (to.length ? Math.min(...to) : end - (s.size?.[id] ?? 0));
  }
  return x;
};

/** Approach A's start / center / end: a fraction t of each item's slack.
 *  t = 0 is the least solution, 1 the greatest, 0.5 their mean. */
export const lerp =
  (t: number) =>
  (s: Sys): Pos => {
    const [l, g] = [least(s), greatest(s)];
    return Object.fromEntries(s.items.map((id) => [id, l[id] + t * (g[id] - l[id])]));
  };

const EPS = 1e-9;

/** Approach A's even, and approach B's glue on a chain: between two tight
 *  items a and b (least = greatest; walls are pinned items), each item k
 *  takes the share of its slack that the gaps before it hold of the run's
 *  glue weight. With every weight 1 that is (k - a) / (b - a), "space
 *  between" over the run. `grow` is read off the gap from item k-1 to k. */
export const runs = (s: Sys): Pos => {
  const [l, g] = [least(s), greatest(s)];
  const n = s.items.length;
  const tight = s.items.map((id) => g[id] - l[id] < EPS);
  const weight = (k: number) =>
    s.gaps.find((e) => e.from === s.items[k - 1] && e.to === s.items[k])
      ?.grow ?? 1;
  const x: Pos = {};
  let a = 0;
  for (let b = 1; b < n; b++) {
    if (!tight[b] && b < n - 1) continue;
    let total = 0;
    for (let k = a + 1; k <= b; k++) total += weight(k);
    let acc = 0;
    for (let k = a + 1; k < b; k++) {
      acc += weight(k);
      const id = s.items[k];
      x[id] = l[id] + (total ? acc / total : 0) * (g[id] - l[id]);
    }
    a = b;
  }
  for (let k = 0; k < n; k++) if (tight[k] || x[s.items[k]] === undefined) x[s.items[k]] ??= l[s.items[k]];
  return x;
};

/**
 * Approach B on any system, and approach D: least squares on the stretch of
 * the glue gaps, `min Σ (x_to − x_from − w)² / grow`, subject to every gap
 * and pin, and (`boxed`) to staying inside the least solution's span. A gap
 * with grow 0 is rigid; a gap with no grow is only a bound. Solved by
 * Hildreth's method (dual coordinate ascent), with a 1e-4 ridge so the
 * answer is unique. About 80 lines; a prototype, accurate to about 0.02 px.
 */
export const glue = (s: Sys, { boxed = true } = {}): Pos => {
  const l = least(s);
  const end = spanEnd(s, l);
  const lo = Math.min(...s.items.map((id) => l[id]));
  const free = s.items.filter((id) => s.pins?.[id] === undefined);
  const ix = new Map(free.map((id, i) => [id, i]));
  const n = free.length;
  // Objective 1/2 x'Hx + q'x.
  const H = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1e-4 : 0))
  );
  const q = new Array(n).fill(0);
  const val = (id: string) => s.pins?.[id];
  for (const e of s.gaps) {
    // A gap stretches in proportion to its weight, as TeX's glue does, so
    // its cost is 1 / grow. No grow: not glue, only a bound. grow 0: rigid.
    if (!e.grow) continue;
    const c = 2 / e.grow;
    // c/2 (x_to - x_from - w)^2
    const terms: [number | undefined, number][] = [
      [ix.get(e.to), 1],
      [ix.get(e.from), -1],
    ];
    let k0 = -e.w;
    if (val(e.to) !== undefined) k0 += val(e.to)!;
    if (val(e.from) !== undefined) k0 -= val(e.from)!;
    for (const [i, a] of terms)
      if (i !== undefined) {
        q[i] += c * a * k0;
        for (const [j, b] of terms) if (j !== undefined) H[i][j] += c * a * b;
      }
  }
  // Constraints A x <= b.
  const A: number[][] = [];
  const b: number[] = [];
  const row = (coef: [string, number][], rhs: number) => {
    const r = new Array(n).fill(0);
    let k = rhs;
    for (const [id, a] of coef)
      if (ix.has(id)) r[ix.get(id)!] += a;
      else k -= a * val(id)!;
    if (r.some((v) => v !== 0)) {
      A.push(r);
      b.push(k);
    }
  };
  for (const e of s.gaps) {
    row([[e.from, 1], [e.to, -1]], -e.w);
    if (e.grow === 0) row([[e.to, 1], [e.from, -1]], e.w);
  }
  if (boxed)
    for (const id of free) {
      row([[id, -1]], -lo);
      row([[id, 1]], end - (s.size?.[id] ?? 0));
    }
  const Hi = invert(H);
  const HiAt = A.map((r) => Hi.map((hr) => hr.reduce((t, h, j) => t + h * r[j], 0)));
  const P = A.map((r) => HiAt.map((c) => r.reduce((t, a, j) => t + a * c[j], 0)));
  const Hiq = Hi.map((hr) => hr.reduce((t, h, j) => t + h * q[j], 0));
  const d = A.map((r, i) => b[i] + r.reduce((t, a, j) => t + a * Hiq[j], 0));
  const lam = new Array(A.length).fill(0);
  for (let it = 0; it < 200000; it++) {
    let change = 0;
    for (let i = 0; i < A.length; i++) {
      let t = d[i];
      for (let j = 0; j < A.length; j++) if (j !== i) t += P[i][j] * lam[j];
      const next = Math.max(0, -t / P[i][i]);
      change = Math.max(change, Math.abs(next - lam[i]));
      lam[i] = next;
    }
    if (change < 1e-12) break;
  }
  const x: Pos = { ...(s.pins ?? {}) };
  free.forEach((id, i) => {
    let v = -Hiq[i];
    A.forEach((_, k) => (v -= HiAt[k][i] * lam[k]));
    x[id] = v;
  });
  return x;
};

const invert = (M: number[][]): number[][] => {
  const n = M.length;
  const a = M.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const pv = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= pv;
    for (let r = 0; r < n; r++)
      if (r !== c) {
        const f = a[r][c];
        if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
      }
  }
  return a.map((r) => r.slice(n));
};

// ─────────────────────────────────────────────────────────────────────────
// (a) The row: p and r fixed by exact relations, q and s float between
// ─────────────────────────────────────────────────────────────────────────

const ROW_W = 320;
export const rowSys = (grow?: number[]): Sys => ({
  items: ["p", "q", "s", "r"],
  pins: { p: 0, r: ROW_W - 30 },
  size: { p: 30, q: 40, s: 40, r: 30 },
  gaps: [
    { from: "p", to: "q", w: 30 + 8, grow: grow?.[0] },
    { from: "q", to: "s", w: 40 + 8, grow: grow?.[1] },
    { from: "s", to: "r", w: 40 + 8, grow: grow?.[2] },
  ],
});

const rowPicture = (x: Pos) =>
  layer([
    rect({ x: 0, y: 0, w: ROW_W, h: 30, fill: "#f4f1ea" }),
    ...["p", "q", "s", "r"].map((id) =>
      rect({
        x: x[id],
        y: 3,
        w: rowSys().size![id],
        h: 24,
        rx: 3,
        fill: id === "p" || id === "r" ? "#cfcfcf" : "#e63946",
        stroke: "#1d3557",
        strokeWidth: 1,
      })
    ),
    ...["p", "q", "s", "r"].map((id) =>
      text({
        x: x[id] + rowSys().size![id] / 2 - 3,
        y: 9,
        text: id,
        fontSize: 11,
        fill: id === "p" || id === "r" ? "#1d3557" : "white",
      })
    ),
  ]);

const story = (draw: () => any, size: { w: number; h: number }): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    draw().render(container, { ...size, axes: false });
    return container;
  },
});

/** The slack itself: q and s at their least places (solid outline) and
 *  their greatest (dashed), with a bar for the range each can take. */
const slackPicture = () => {
  const s = rowSys();
  const [l, g] = [least(s), greatest(s)];
  return layer([
    rect({ x: 0, y: 0, w: ROW_W, h: 56, fill: "#f4f1ea" }),
    ...["p", "r"].map((id) =>
      rect({ x: l[id], y: 3, w: 30, h: 24, rx: 3, fill: "#cfcfcf", stroke: "#1d3557", strokeWidth: 1 })
    ),
    ...["q", "s"].flatMap((id, k) => [
      rect({ x: l[id], y: 3, w: 40, h: 24, rx: 3, fill: "none", stroke: "#e63946", strokeWidth: 1.5 }),
      rect({ x: g[id], y: 3, w: 40, h: 24, rx: 3, fill: "none", stroke: "#e63946", strokeWidth: 1, strokeDasharray: "3 2" }),
      rect({ x: l[id], y: 34 + k * 10, w: g[id] - l[id], h: 4, fill: "#e63946", opacity: 0.6 }),
      text({ x: l[id] + 15, y: 9, text: id, fontSize: 11, fill: "#e63946" }),
    ]),
  ]);
};
export const RowSlack = story(slackPicture, { w: ROW_W, h: 56 });

const ROW = { w: ROW_W, h: 30 };
export const RowStart = story(() => rowPicture(lerp(0)(rowSys())), ROW);
export const RowCenter = story(() => rowPicture(lerp(0.5)(rowSys())), ROW);
export const RowEnd = story(() => rowPicture(lerp(1)(rowSys())), ROW);
export const RowEven = story(() => rowPicture(runs(rowSys())), ROW);
/** B with weights 2, 1, 0: q takes 2/3 of its slack, s all of it. */
export const RowGlue210 = story(() => rowPicture(runs(rowSys([2, 1, 0]))), ROW);

// ─────────────────────────────────────────────────────────────────────────
// (b) Sankey: the energy balance of "User Space D3 Flow", columns and tops
// ─────────────────────────────────────────────────────────────────────────

export const energyLinks = (
  [
    ["Coal", "Power", 30],
    ["Coal", "Heat", 10],
    ["Gas", "Power", 25],
    ["Gas", "Heat", 15],
    ["Gas", "Homes", 12],
    ["Oil", "Refinery", 50],
    ["Renewables", "Grid", 18],
    ["Power", "Grid", 35],
    ["Power", "Losses", 20],
    ["Refinery", "Fuels", 38],
    ["Refinery", "Exports", 7],
    ["Refinery", "Losses", 5],
    ["Heat", "Homes", 17],
    ["Heat", "Industry", 8],
    ["Grid", "Homes", 24],
    ["Grid", "Industry", 22],
    ["Grid", "Losses", 7],
    ["Fuels", "Transport", 30],
    ["Fuels", "Industry", 8],
  ] as const
).map(([source, target, value]) => ({ source, target, value }));
export const energyNodes = [
  ...new Set(energyLinks.flatMap((l) => [l.source, l.target])),
];
const SW = 420;
const SH = 300;
const NODE_W = 12;
const PAD = 10;

/** Columns: every link's target at least one column after its source. */
export const columnSys = (grow?: number): Sys => ({
  items: energyNodes,
  gaps: energyLinks.map((l) => ({ from: l.source, to: l.target, w: 1, grow })),
});

/** d3's justify: the least solution once every sink is pinned to the last
 *  column (an explicit pin, not a slack rule). */
export const justifyColumns = (): Pos => {
  const s = columnSys();
  const last = spanEnd(s);
  const sinks = energyNodes.filter((n) => !energyLinks.some((l) => l.source === n));
  return least({ ...s, pins: Object.fromEntries(sinks.map((n) => [n, last])) });
};

/** d3's center: the least solution, then each source as late as its
 *  targets' least columns allow (a second step, so a decision). */
export const d3CenterColumns = (): Pos => {
  const l = least(columnSys());
  return Object.fromEntries(
    energyNodes.map((n) => {
      const outs = energyLinks.filter((k) => k.source === n).map((k) => l[k.target]);
      const isSource = !energyLinks.some((k) => k.target === n);
      return [n, isSource ? Math.min(...outs) - 1 : l[n]];
    })
  );
};

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const valueOf = (n: string) =>
  Math.max(
    sumOf(energyLinks.filter((l) => l.target === n).map((l) => l.value)),
    sumOf(energyLinks.filter((l) => l.source === n).map((l) => l.value))
  );

/** One column as a chain between two walls: top (0) and bottom (SH). */
export const columnChain = (nodes: string[], ky: number, grow = 1): Sys => ({
  items: ["top", ...nodes, "bottom"],
  pins: { top: 0, bottom: SH },
  size: Object.fromEntries(nodes.map((n) => [n, valueOf(n) * ky])),
  gaps: ["top", ...nodes].map((a, i) => {
    const b = [...nodes, "bottom"][i];
    return {
      from: a,
      to: b,
      w: a === "top" ? 0 : valueOf(a) * ky + (b === "bottom" ? 0 : PAD),
      grow,
    };
  }),
});

/** Every node's top under a rule for the slack inside each column. Columns
 *  are rounded so a fractional rule can still be drawn. */
export const sankeyTops = (col: Pos, rule: (s: Sys) => Pos) => {
  const k = Math.max(...Object.values(col).map(Math.round)) + 1;
  const columns = Array.from({ length: k }, (_, i) =>
    energyNodes.filter((n) => Math.round(col[n]) === i)
  );
  const ky = Math.min(
    ...columns.map((c) => (SH - (c.length - 1) * PAD) / sumOf(c.map(valueOf)))
  );
  const y: Pos = {};
  for (const c of columns) Object.assign(y, rule(columnChain(c, ky)));
  return { y, ky, k };
};

const sankeyPicture = (col: Pos, rule: (s: Sys) => Pos = runs) => {
  const { y, ky } = sankeyTops(col, rule);
  const k = Math.max(...Object.values(col)) || 1;
  const x = (n: string) => (col[n] / k) * (SW - NODE_W);
  // Each link a straight band, stacked on its source and its target in the
  // order of the other end, as d3-sankey does.
  const top = (n: string) => y[n];
  const outOff: Record<string, number> = {};
  const inOff: Record<string, number> = {};
  const bands = [...energyLinks]
    .sort((a, b) => top(a.target) - top(b.target))
    .map((l) => {
      const w = l.value * ky;
      const s0 = top(l.source) + (outOff[l.source] ?? 0);
      outOff[l.source] = (outOff[l.source] ?? 0) + w;
      return { l, w, s0 };
    })
    .sort((a, b) => top(a.l.source) - top(b.l.source))
    .map(({ l, w, s0 }) => {
      const t0 = top(l.target) + (inOff[l.target] ?? 0);
      inOff[l.target] = (inOff[l.target] ?? 0) + w;
      const x0 = x(l.source) + NODE_W;
      const x1 = x(l.target);
      const y0 = Math.min(s0, t0);
      return position({ x: x0, y: y0 }, [
        polygon({
          points: [
            [0, s0 - y0],
            [x1 - x0, t0 - y0],
            [x1 - x0, t0 + w - y0],
            [0, s0 + w - y0],
          ],
          fill: "#9aa7b1",
          opacity: 0.45,
        }),
      ]);
    });
  return layer([
    ...bands,
    ...energyNodes.map((n) =>
      rect({ x: x(n), y: y[n], w: NODE_W, h: valueOf(n) * ky, fill: "#2f3e46" })
    ),
  ]);
};

const SANKEY = { w: SW, h: SH };
export const SankeyLeft = story(() => sankeyPicture(least(columnSys())), SANKEY);
export const SankeyRight = story(() => sankeyPicture(greatest(columnSys())), SANKEY);
export const SankeyMean = story(() => sankeyPicture(lerp(0.5)(columnSys())), SANKEY);
export const SankeyD3Center = story(() => sankeyPicture(d3CenterColumns()), SANKEY);
export const SankeyJustify = story(() => sankeyPicture(justifyColumns()), SANKEY);
export const SankeyGlueColumns = story(
  () => sankeyPicture(glue(columnSys(1))),
  SANKEY
);
/** Justify columns, every column's nodes packed to the top (no rule). */
export const SankeyTopsStart = story(
  () => sankeyPicture(justifyColumns(), least),
  SANKEY
);

// ─────────────────────────────────────────────────────────────────────────
// (c) Tidy trees: sibling subtrees at least their contour gap apart
// ─────────────────────────────────────────────────────────────────────────

export type Tree = { name: string; children?: Tree[] };
const leaf = (name: string): Tree => ({ name });
const leaves = (...ns: string[]) => ns.map(leaf);

export const wedge: Tree = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "a1", children: leaves("1", "2", "3", "4", "5") },
        { name: "a2", children: leaves("6", "7", "8", "9", "10") },
      ],
    },
    ...leaves("m1", "m2", "m3"),
    {
      name: "B",
      children: [
        { name: "b1", children: [{ name: "b11", children: leaves("x", "y", "z") }] },
        { name: "b2", children: leaves("u", "v", "w") },
      ],
    },
  ],
};

/** The smallest tree found where "even" and d3.tree disagree (18 nodes, by
 *  the random search in scratch/slack/check.mjs.txt). Two pushes from c0
 *  are nested: onto c2, spread over c1, and onto c3, spread over c1 and c2. */
const fromShape = (x: any): Tree =>
  x === 0 ? { name: "l" } : { name: "n", children: x.map(fromShape) };
export const counter: Tree = fromShape([[0, [0, 0], [0, 0, 0, 0]], 0, [0], [[0, 0]]]);

export const SEP = 24; // closest two node centers at one depth (d3 nodeSize[0])
export const LEVEL = 40;
type Extent = [number, number][];
const moveE = (e: Extent, dx: number): Extent => e.map(([l, r]) => [l + dx, r + dx]);
const mergeE = (p: Extent, q: Extent): Extent =>
  Array.from({ length: Math.max(p.length, q.length) }, (_, d) =>
    !p[d] ? q[d] : !q[d] ? p[d] : [Math.min(p[d][0], q[d][0]), Math.max(p[d][1], q[d][1])]
  );
/** How far right q's root must be from p's so no depth overlaps. */
const fit = (p: Extent, q: Extent) =>
  Math.max(0, ...p.slice(0, q.length).map(([, r], d) => r - q[d][0] + SEP));

/** A rule: sibling extents in, each sibling's x out (any origin). */
export type TreeRule = (es: Extent[]) => number[];

/** The siblings as a chain with a minimum gap between every pair. */
export const siblingSys = (es: Extent[], grow = 1): Sys => ({
  items: es.map((_, i) => `${i}`),
  gaps: es.flatMap((e, i) =>
    es.slice(i + 1).map((f, j) => ({
      from: `${i}`,
      to: `${i + 1 + j}`,
      w: fit(e, f),
      grow: j === 0 ? grow : undefined,
    }))
  ),
});
export const sysRule =
  (rule: (s: Sys) => Pos): TreeRule =>
  (es) => {
    const x = rule(siblingSys(es));
    return es.map((_, i) => x[`${i}`]);
  };

/** Walker's rule as d3.tree runs it (spreadRule of "User Space Trees"):
 *  pack from the left; when subtree j is pushed right by d because of
 *  sibling i, each sibling z between them moves right by d (z - i)/(j - i). */
export const walkerRule: TreeRule = (es) => {
  const x: number[] = [];
  es.forEach((e, j) => {
    x[j] = j ? x[j - 1] : 0;
    e.forEach(([l], d) => {
      let i = -1;
      for (let k = 0; k < j; k++)
        if (es[k][d] && (i < 0 || x[k] + es[k][d][1] >= x[i] + es[i][d][1])) i = k;
      const push = i < 0 ? 0 : x[i] + es[i][d][1] - (x[j] + l) + SEP;
      if (push <= 0) return;
      x[j] += push;
      for (let z = i + 1; z < j; z++) x[z] += (push * (z - i)) / (j - i);
    });
  });
  return x;
};

/** A declarative reading of Walker on the least solution of a chain: item
 *  j's excess over its neighbor, d = least_j − (least_{j−1} + w(j−1, j)),
 *  comes from the gap that binds it, from item i (the nearest one, if
 *  several bind). Each item z between i and j takes d (z − i) / (j − i).
 *  The ramps add up. Tested against d3.tree in check.mjs.txt. */
export const ramps = (s: Sys): Pos => {
  const l = least(s);
  const x: Pos = { ...l };
  const at = (k: number) => s.items[k];
  for (let j = 1; j < s.items.length; j++) {
    const into = s.gaps.filter((g) => g.to === at(j));
    const bind = into
      .filter((g) => Math.abs(l[g.from] + g.w - l[at(j)]) < EPS)
      .map((g) => s.items.indexOf(g.from));
    const nb = into.find((g) => g.from === at(j - 1));
    const d = l[at(j)] - (l[at(j - 1)] + (nb?.w ?? 0));
    if (!bind.length || d < EPS) continue;
    const i = Math.max(...bind);
    for (let z = i + 1; z < j; z++) x[at(z)] += (d * (z - i)) / (j - i);
  }
  return x;
};

/** Each node's x, the root at 0, a parent midway over its first and last
 *  child (as d3.tree). */
export const layoutTree = (t: Tree, rule: TreeRule) => {
  const go = (t: Tree): { extent: Extent; off: number[]; kids: any[] } => {
    const kids = (t.children ?? []).map(go);
    if (!kids.length) return { extent: [[0, 0]], off: [], kids };
    const raw = rule(kids.map((k) => k.extent));
    const mid = (raw[0] + raw[raw.length - 1]) / 2;
    const off = raw.map((v) => v - mid);
    const ext = kids.reduce<Extent>((acc, k, i) => mergeE(acc, moveE(k.extent, off[i])), []);
    return { extent: [[0, 0], ...ext], off, kids };
  };
  const pos = new Map<string, { x: number; depth: number }>();
  const place = (d: any, x: number, path: string, depth: number) => {
    pos.set(path, { x, depth });
    d.kids.forEach((k: any, i: number) => place(k, x + d.off[i], `${path}.${i}`, depth + 1));
  };
  place(go(t), 0, "n", 0);
  return pos;
};

const edgesOf = (t: Tree, path = "n"): [string, string][] =>
  (t.children ?? []).flatMap((c, i) => [
    [path, `${path}.${i}`] as [string, string],
    ...edgesOf(c, `${path}.${i}`),
  ]);

const treePicture = (t: Tree, pos: Map<string, { x: number; depth: number }>, level = LEVEL, fill = "#457b9d") => {
  const xs = [...pos.values()].map((p) => p.x);
  const x0 = Math.min(...xs) - 10;
  return layer(
    [...pos].map(([path, p]) =>
      circle({ cx: p.x - x0, cy: 10 + p.depth * level, r: 7, fill, stroke: "white", strokeWidth: 1.5 }).name(path)
    )
  ).relate((c: any) =>
    edgesOf(t).map(([a, b]) => line({ stroke: "#9aa7b1" }, [c[a], c[b]]).zOrder(-1))
  );
};

const leftRule = sysRule(least);
const meanRule = sysRule(lerp(0.5));
const runsRule = sysRule(runs);
const glueRule = sysRule((s) => glue(s, { boxed: false }));

const TREE = { w: 340, h: 200 };
export const WedgeStart = story(() => treePicture(wedge, layoutTree(wedge, leftRule)), TREE);
export const WedgeCenter = story(() => treePicture(wedge, layoutTree(wedge, meanRule)), TREE);
export const WedgeWalker = story(() => treePicture(wedge, layoutTree(wedge, walkerRule)), TREE);
export const WedgeEven = story(() => treePicture(wedge, layoutTree(wedge, runsRule)), TREE);
export const WedgeGlue = story(() => treePicture(wedge, layoutTree(wedge, glueRule)), TREE);
const CT = { w: 200, h: 150 };
export const CounterWalker = story(() => treePicture(counter, layoutTree(counter, walkerRule)), CT);
export const CounterEven = story(() => treePicture(counter, layoutTree(counter, runsRule)), CT);
export const CounterGlue = story(() => treePicture(counter, layoutTree(counter, glueRule)), CT);

// ─────────────────────────────────────────────────────────────────────────
// (d) Dendrogram: levels from minimum gaps, x as d3.cluster
// ─────────────────────────────────────────────────────────────────────────

export const budget: Tree = {
  name: "Budget",
  children: [
    { name: "Safety", children: leaves("Police", "Fire", "Courts") },
    {
      name: "Transport",
      children: [
        { name: "Roads", children: leaves("Repair", "New") },
        { name: "Transit", children: leaves("Bus", "Rail") },
        leaf("Parking"),
      ],
    },
    { name: "Parks", children: leaves("Upkeep", "Programs") },
    { name: "Health", children: leaves("Clinics", "Outreach", "Labs") },
    leaf("Admin"),
    { name: "Libraries", children: leaves("Branches", "Digital") },
  ],
};

const pathsOf = (t: Tree, path = "n"): [string, Tree][] => [
  [path, t],
  ...(t.children ?? []).flatMap((c, i) => pathsOf(c, `${path}.${i}`)),
];

/** Levels: each child at least one level below its parent. `wall` adds a
 *  bottom wall that every leaf sits on exactly (approach C's explicit
 *  align). */
export const levelSys = (t: Tree, grow?: number, wall = false): Sys => {
  const ps = pathsOf(t);
  const height = (u: Tree): number =>
    u.children ? 1 + Math.max(...u.children.map(height)) : 0;
  const H = height(t);
  return {
    items: [...ps.map(([p]) => p), ...(wall ? ["wall"] : [])],
    pins: wall ? { wall: H } : undefined,
    gaps: [
      ...edgesOf(t).map(([a, b]) => ({ from: a, to: b, w: 1, grow })),
      ...(wall
        ? ps.filter(([, u]) => !u.children).map(([p]) => ({ from: p, to: "wall", w: 0 }))
        : []),
    ],
  };
};
/** A leaf on the wall is an exact relation: pin it. */
export const leavesOnWall = (t: Tree): Pos => {
  const s = levelSys(t);
  const H = spanEnd(s);
  const ps = pathsOf(t);
  return least({ ...s, pins: Object.fromEntries(ps.filter(([, u]) => !u.children).map(([p]) => [p, H])) });
};

/** x as d3.cluster: leaves one pitch apart, a parent at its children's mean. */
export const clusterX = (t: Tree, dx = 20) => {
  const x: Pos = {};
  let next = 0;
  const go = (u: Tree, p: string): number => {
    if (!u.children) return (x[p] = (next++) * dx);
    const xs = u.children.map((c, i) => go(c, `${p}.${i}`));
    return (x[p] = sumOf(xs) / xs.length);
  };
  go(t, "n");
  return x;
};

const dendroPicture = (levels: Pos) => {
  const x = clusterX(budget);
  const pos = new Map(
    pathsOf(budget).map(([p]) => [p, { x: x[p], depth: levels[p] }])
  );
  return treePicture(budget, pos, 60, "#1d3557");
};
const DENDRO = { w: 340, h: 210 };
export const DendroEnd = story(() => dendroPicture(greatest(levelSys(budget))), DENDRO);
export const DendroStart = story(() => dendroPicture(least(levelSys(budget))), DENDRO);
export const DendroWallPins = story(() => dendroPicture(leavesOnWall(budget)), DENDRO);
/** B: the root and every leaf pinned, and every level gap glue of weight 1,
 *  so each inner node sits where the squared stretches are least. */
export const dendroGlue = (t: Tree): Pos => {
  const s = levelSys(t, 1);
  const H = spanEnd(s);
  const pins: Record<string, number> = { n: 0 };
  for (const [p, u] of pathsOf(t)) if (!u.children) pins[p] = H;
  return glue({ ...s, pins });
};
export const DendroGlue = story(() => dendroPicture(dendroGlue(budget)), DENDRO);

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Baseline,
  Constraint,
  Curve,
  blank,
  chart,
  createMark,
  field,
  group,
  layer,
  line,
  rect,
  ref,
  ribbon,
  selectAll,
  spread,
  stack,
  text,
  v,
} from "../../src/lib";
// d3-force is not a dependency of the library; this throwaway story reaches
// the copy pnpm installed for another package. Not for anything that ships.
// @ts-ignore
import * as d3 from "../../../../node_modules/.pnpm/d3-force@3.0.0/node_modules/d3-force/src/index.js";

// Throwaway prototypes for the user-space layouts proposal: three d3 layouts
// (d3-sankey, d3-shape's stack, d3-force) written as a plan plus relations,
// and compared against d3's own numbers in scratch scripts. Not
// gallery-tagged. The lowercase exports are the plans, for those checks;
// Storybook skips them.
const meta: Meta = {
  title: "Proposals/User Space D3 Flow",
  excludeStories: /^[a-z]/,
};
export default meta;

// ─────────────────────────────────────────────────────────────────────────
// The minimum-gap solver of "Proposals/User Space Separation"
// ─────────────────────────────────────────────────────────────────────────

/** pos[before] - pos[after] >= gap. */
export type Sep = { after: string; before: string; gap: number };
export type Policy = "start" | "end" | "center";

const topoOrder = (items: string[], seps: Sep[]): string[] => {
  const ins = new Map(items.map((id) => [id, 0]));
  for (const s of seps) ins.set(s.before, ins.get(s.before)! + 1);
  const ready = items.filter((id) => ins.get(id) === 0);
  for (let k = 0; k < ready.length; k++)
    for (const s of seps)
      if (s.after === ready[k]) {
        ins.set(s.before, ins.get(s.before)! - 1);
        if (ins.get(s.before) === 0) ready.push(s.before);
      }
  if (ready.length < items.length)
    throw new Error("solveSeparations: the separations have a cycle");
  return ready;
};

const nearest = (
  order: string[],
  into: (id: string) => [string, number][],
  base: number
): Map<string, number> => {
  const pos = new Map<string, number>();
  for (const id of order) {
    const from = into(id).map(([u, gap]) => pos.get(u)! + gap);
    pos.set(id, from.length ? Math.max(...from) : base);
  }
  return pos;
};

/** "start": the least solution. "end": the greatest, with every item no
 *  separation leads out of at `upper` (default: the least solution's
 *  largest position). "center": the mean of the two. */
export function solveSeparations(
  items: string[],
  seps: Sep[],
  { policy = "start", upper }: { policy?: Policy; upper?: number } = {}
): Map<string, number> {
  const order = topoOrder(items, seps);
  const least = nearest(
    order,
    (id) => seps.filter((s) => s.before === id).map((s) => [s.after, s.gap]),
    0
  );
  if (policy === "start") return least;
  const top = upper ?? Math.max(...least.values());
  const mirrored = nearest(
    [...order].reverse(),
    (id) => seps.filter((s) => s.after === id).map((s) => [s.before, s.gap]),
    -top
  );
  return new Map(
    items.map((id) => {
      const greatest = -mirrored.get(id)!;
      return [
        id,
        policy === "end" ? greatest : (least.get(id)! + greatest) / 2,
      ];
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Sankey (d3-sankey)
// ─────────────────────────────────────────────────────────────────────────

// An energy balance in four columns. Gas → Homes skips two columns; Power →
// Losses, Refinery → Losses and Heat → Homes / Industry skip one.
export const energyNodes = [
  "Coal",
  "Gas",
  "Oil",
  "Renewables",
  "Power",
  "Refinery",
  "Heat",
  "Grid",
  "Fuels",
  "Exports",
  "Homes",
  "Industry",
  "Transport",
  "Losses",
];

export type Flow = { source: string; target: string; value: number };

export const energyLinks: Flow[] = (
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

const W = 420;
const H = 300;
const NODE_W = 12; // d3's nodeWidth
const PAD = 10; // d3's nodePadding

// <plan: sankey columns>
export type Align = "left" | "right" | "justify" | "center";

/** Each node's column. Every link's target is at least one column after its
 *  source. */
export const columnsOf = (nodes: string[], links: Flow[], align: Align) => {
  const seps = links.map((l) => ({
    after: l.source,
    before: l.target,
    gap: 1,
  }));
  const left = solveSeparations(nodes, seps); // d3's depth
  const last = Math.max(...left.values());
  if (align === "left") return left;
  // the greatest solution, sinks in the last column: n - 1 - d3's height
  if (align === "right")
    return solveSeparations(nodes, seps, { policy: "end" });
  const sinks = nodes.filter((n) => !links.some((l) => l.source === n));
  if (align === "justify")
    // the least solution once every sink is at least in the last column
    return solveSeparations(
      ["zero", ...nodes],
      [...seps, ...sinks.map((n) => ({ after: "zero", before: n, gap: last }))]
    );
  // d3's sankeyCenter: the least solution, then each source as late as its
  // targets' least columns allow
  return new Map(
    nodes.map((n) => {
      const outs = links
        .filter((l) => l.source === n)
        .map((l) => left.get(l.target)!);
      const isSource = !links.some((l) => l.target === n);
      return [
        n,
        isSource && outs.length ? Math.min(...outs) - 1 : left.get(n)!,
      ];
    })
  );
};
// </plan: sankey columns>

// <plan: sankey sizes>
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A node's value: the larger of what flows in and what flows out. */
export const valueOf = (links: Flow[]) => (n: string) =>
  Math.max(
    sum(links.filter((l) => l.target === n).map((l) => l.value)),
    sum(links.filter((l) => l.source === n).map((l) => l.value))
  );

/** Nodes by column, in input order; and d3's one scale, the largest that
 *  fits every column with its gaps. */
export const sankeySizes = (nodes: string[], links: Flow[], align: Align) => {
  const col = columnsOf(nodes, links, align);
  const k = Math.max(...nodes.map((n) => col.get(n)!)) + 1;
  const columns = Array.from({ length: k }, (_, i) =>
    nodes.filter((n) => col.get(n) === i)
  );
  const value = valueOf(links);
  const pad = Math.min(
    PAD,
    H / (Math.max(...columns.map((c) => c.length)) - 1)
  );
  const ky = Math.min(
    ...columns.map((c) => (H - (c.length - 1) * pad) / sum(c.map(value)))
  );
  return { col, columns, value, pad, ky };
};
// </plan: sankey sizes>

// <plan: sankey stacked>
/** d3's iterations(0): each column stacked in order, gaps at least `pad`,
 *  and the slack shared evenly by the n + 1 gaps (above, between, below).
 *  Returns each column's gaps, the first one above its first node. */
export const stackedGaps = (s: ReturnType<typeof sankeySizes>) =>
  s.columns.map((c) => {
    const slack = H - s.ky * sum(c.map(s.value)) - (c.length - 1) * s.pad;
    const e = slack / (c.length + 1);
    return c.map((_, i) => (i ? s.pad + e : e));
  });
// </plan: sankey stacked>

/** Each node's top, from its column's gaps. */
const topsOf = (s: ReturnType<typeof sankeySizes>, gaps: number[][]) => {
  const y0 = new Map<string, number>();
  s.columns.forEach((c, k) => {
    let y = 0;
    c.forEach((n, i) => {
      y += gaps[k][i];
      y0.set(n, y);
      y += s.value(n) * s.ky;
    });
  });
  return y0;
};

/** Gaps from tops: what the drawing takes. */
const gapsOf = (s: ReturnType<typeof sankeySizes>, y0: Map<string, number>) =>
  s.columns.map((c) =>
    c.map((n, i) =>
      i ? y0.get(n)! - y0.get(c[i - 1])! - s.value(c[i - 1]) * s.ky : y0.get(n)!
    )
  );

// <plan: sankey relaxed>
/** Starting from the stacked tops, one pass per direction in `passes`. In a
 *  pass, a node wants the top that makes its links to the column it looks
 *  at level, weighted by value ("right": its incoming links, columns left
 *  to right; "left": its outgoing links, right to left). In a column the
 *  nodes keep their order, are at least `pad` apart and inside [0, H]; each
 *  is at least and at most its wanted top, and takes the mean ("center") of
 *  the two, kept inside the column's own least and greatest packing. */
export const relaxedTops = (
  s: ReturnType<typeof sankeySizes>,
  links: Flow[],
  passes: ("right" | "left")[] = ["right"]
) => {
  const y0 = topsOf(s, stackedGaps(s));
  const h = (n: string) => s.value(n) * s.ky;
  for (const pass of passes) {
    const cols =
      pass === "right" ? s.columns.slice(1) : s.columns.slice(0, -1).reverse();
    for (const c of cols) {
      const ports = portOrder(s, links, y0);
      // how far down `list` link l starts
      const above = (list: Flow[], l: Flow) =>
        sum(list.slice(0, list.indexOf(l)).map((m) => m.value)) * s.ky;
      const want = (n: string) => {
        const [mine, other] =
          pass === "right" ? [ports.in, ports.out] : [ports.out, ports.in];
        const ls = mine.get(n)!;
        const end = pass === "right" ? "source" : "target";
        const tops = ls.map(
          (l) => y0.get(l[end])! + above(other.get(l[end])!, l) - above(ls, l)
        );
        return ls.length
          ? sum(tops.map((y, i) => y * ls[i].value)) /
              sum(ls.map((l) => l.value))
          : y0.get(n)!;
      };
      // "zero" is the top edge (0 in the least solution) and "end" the
      // bottom edge (H in the greatest).
      const hard: Sep[] = [
        { after: "zero", before: c[0], gap: 0 },
        { after: c.at(-1)!, before: "end", gap: h(c.at(-1)!) },
        ...c
          .slice(1)
          .map((n, i) => ({ after: c[i], before: n, gap: h(c[i]) + s.pad })),
      ];
      const soft: Sep[] = c.flatMap((n) => [
        { after: "zero", before: n, gap: want(n) }, // y0 >= want
        { after: n, before: "end", gap: H - want(n) }, // y0 <= want
      ]);
      const items = ["zero", ...c, "end"];
      const lo = solveSeparations(items, hard, { policy: "start" });
      const hi = solveSeparations(items, hard, { policy: "end", upper: H });
      const mid = solveSeparations(items, [...hard, ...soft], {
        policy: "center",
        upper: H,
      });
      for (const n of c)
        y0.set(n, Math.min(hi.get(n)!, Math.max(lo.get(n)!, mid.get(n)!)));
    }
  }
  return y0;
};
// </plan: sankey relaxed>

/** Each node's outgoing and incoming links, top to bottom. d3's
 *  iterations(0) leaves outgoing links in input order (it sorts them by
 *  their targets' tops before the targets have tops); every other list is
 *  sorted by the other end's top, ties by input order. */
export const portOrder = (
  s: ReturnType<typeof sankeySizes>,
  links: Flow[],
  y0: Map<string, number>,
  sortOutgoing = true
) => {
  const by = (end: "source" | "target") => (a: Flow, b: Flow) =>
    y0.get(a[end])! - y0.get(b[end])! || links.indexOf(a) - links.indexOf(b);
  const out = new Map<string, Flow[]>();
  const inn = new Map<string, Flow[]>();
  for (const n of s.columns.flat()) {
    const o = links.filter((l) => l.source === n);
    out.set(n, sortOutgoing ? o.sort(by("target")) : o);
    inn.set(n, links.filter((l) => l.target === n).sort(by("source")));
  }
  return { out, in: inn };
};

const COLUMN_FILL: Record<string, string> = {
  Coal: "#6b6b6b",
  Gas: "#e07a5f",
  Oil: "#3d405b",
  Renewables: "#81b29a",
};
const fillOf = (n: string, links: Flow[]): string =>
  COLUMN_FILL[n] ??
  fillOf(
    links.filter((l) => l.target === n).sort((a, b) => b.value - a.value)[0]
      .source,
    links
  );

type PortOp = (marks: any[]) => any;
/** Ports end to end, top down: a spread with no spacing. (`stack` is the
 *  natural word, but see WallStackPorts.) */
const spreadPorts: PortOp = (marks) =>
  spread({ dir: "y", spacing: 0, alignment: "start" }, marks);
const stackPorts: PortOp = (marks) => stack({ dir: "y" }, marks);

// <draw: sankey>
/** A node: its data-sized rect, with its outgoing links stacked down its
 *  right edge and its incoming links down its left edge. */
const sankeyNode = (
  n: string,
  value: number,
  outs: Flow[],
  ins: Flow[],
  links: Flow[],
  ports: PortOp
) => {
  const port = (l: Flow, side: "o" | "i") =>
    blank({ w: 0, h: v(l.value) }).name(`${side}:${links.indexOf(l)}`);
  return layer([
    rect({ w: NODE_W, h: v(value), fill: "#2f3e46" }).name(n),
    ...(outs.length
      ? [ports(outs.map((l) => port(l, "o"))).name(`${n}/out`)]
      : []),
    ...(ins.length
      ? [ports(ins.map((l) => port(l, "i"))).name(`${n}/in`)]
      : []),
  ]).relate((c) => [
    ...(outs.length
      ? [Constraint.align({ x: "end", y: "start" }, [c[n], c[`${n}/out`]])]
      : []),
    ...(ins.length
      ? [Constraint.align({ x: "start", y: "start" }, [c[n], c[`${n}/in`]])]
      : []),
  ]);
};

/** Columns spread on x; in each, the gaps the plan chose, then the nodes;
 *  one ribbon per link between its two ports. */
const sankeyDrawing = (
  s: ReturnType<typeof sankeySizes>,
  gaps: number[][],
  order: ReturnType<typeof portOrder>,
  links: Flow[],
  ports: PortOp = spreadPorts
) =>
  layer([
    spread(
      {
        dir: "x",
        spacing: (W - NODE_W) / (s.columns.length - 1) - NODE_W,
        alignment: "start",
      },
      s.columns.map((c, k) =>
        spread(
          { dir: "y", spacing: 0, alignment: "start" },
          c.flatMap((n, i) => [
            blank({ w: NODE_W, h: gaps[k][i] }),
            sankeyNode(
              n,
              s.value(n),
              order.out.get(n)!,
              order.in.get(n)!,
              links,
              ports
            ),
          ])
        )
      )
    ),
    ...s.columns
      .flat()
      .map((n) =>
        text({ text: n, fontSize: 9, fill: "#1d3557" }).name(`${n}/label`)
      ),
  ]).relate((c) => [
    ...links.map((l, i) =>
      ribbon(
        {
          dir: "x",
          fill: fillOf(l.source, links),
          opacity: 0.45,
          curve: Curve.bezier(),
        },
        [ref(`o:${i}`), ref(`i:${i}`)]
      ).zOrder(-1)
    ),
    ...s.columns.flatMap((col, k) =>
      col.flatMap((n) => {
        const last = k === s.columns.length - 1;
        return [
          Constraint.align({ y: "middle" }, [c[n], c[`${n}/label`]]),
          Constraint.distribute(
            { dir: "x", spacing: 3 },
            last ? [c[`${n}/label`], c[n]] : [c[n], c[`${n}/label`]]
          ),
        ];
      })
    ),
  ]);
// </draw: sankey>

const sankeyStory = (
  align: Align,
  relaxed: boolean,
  ports: PortOp = spreadPorts
): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    const s = sankeySizes(energyNodes, energyLinks, align);
    const y0 = relaxed
      ? relaxedTops(s, energyLinks)
      : topsOf(s, stackedGaps(s));
    const gaps = relaxed ? gapsOf(s, y0) : stackedGaps(s);
    const order = portOrder(s, energyLinks, y0, relaxed);
    sankeyDrawing(s, gaps, order, energyLinks, ports).render(container, {
      w: W,
      h: H,
    });
    return container;
  },
});

export const SankeyStacked = sankeyStory("justify", false);
export const SankeyAlignRight = sankeyStory("right", false);
export const SankeyAlignLeft = sankeyStory("left", false);
export const SankeyAlignCenter = sankeyStory("center", false);
export const SankeyRelaxed = sankeyStory("justify", true);
// Step (b) alone, with nothing from the plan but the columns: each column a
// spread with spacing `pad`, every rect sized by the one `value` field.
// GoFish picks the one scale that fits the fullest column: d3's ky.
export const SankeyScale: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const s = sankeySizes(energyNodes, energyLinks, "justify");
    // <draw: sankey scale>
    const rows = energyNodes.map((name) => ({
      name,
      column: s.col.get(name)!,
      value: s.value(name),
    }));
    chart(rows, { w: W, h: H })
      .flow(
        spread({ by: "column", dir: "x", spacing: 124, alignment: "start" }),
        spread({ by: "name", dir: "y", spacing: PAD, alignment: "start" })
      )
      .mark(rect({ w: NODE_W, h: "value", fill: "#2f3e46" }))
      .render(container, { axes: false });
    // </draw: sankey scale>
    return container;
  },
};

// The wall: SankeyStacked with each node's ports in a `stack`. Every node in
// a column comes out the same height, and no warning is given.
export const WallStackPorts = sankeyStory("justify", false, stackPorts);

// The wall, small: three rects sized by data (40, 20, 10) spread on y. In
// the right column each also holds a stack of two red parts sized by data
// (3 and 4).
export const WallStackBesideRect: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const column = (withStack: boolean) =>
      spread(
        { dir: "y", spacing: 10, alignment: "start" },
        [40, 20, 10].map((value) =>
          layer([
            rect({ w: 12, h: v(value), fill: "#2f3e46" }),
            ...(withStack
              ? [
                  stack(
                    { dir: "y" },
                    [3, 4].map((p) => rect({ w: 4, h: v(p), fill: "red" }))
                  ),
                ]
              : []),
          ])
        )
      );
    layer([
      spread({ dir: "x", spacing: 40, alignment: "start" }, [
        column(false),
        column(true),
      ]),
    ]).render(container, { w: 120, h: 150 });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 2. Stack (d3-shape)
// ─────────────────────────────────────────────────────────────────────────

export const SERIES = ["A", "B", "C", "D", "E", "F"];
export const XS = Array.from({ length: 24 }, (_, j) => j);
const PEAK = [4, 9, 13, 17, 7, 20];
const SPREAD = [3, 4, 2.5, 5, 6, 3];
const AMP = [18, 25, 30, 14, 10, 22];
/** Series i at x j: a bump around its peak, a ripple, at least 2. */
export const amount = (i: number, j: number) =>
  Math.round(
    2 +
      AMP[i] * Math.exp(-(((j - PEAK[i]) / SPREAD[i]) ** 2)) +
      2 * (1 + Math.sin(j * 0.9 + i))
  );
const at = (s: string, x: number) => amount(SERIES.indexOf(s), x);

// <plan: stack order>
/** d3's stackOrderInsideOut: series by the x of their peak, each laid on
 *  whichever side (bottom or top) has less so far; the bottoms reversed. */
export const insideOut = (series: string[]) => {
  const total = (s: string) => sum(XS.map((x) => at(s, x)));
  const peak = (s: string) =>
    XS.reduce((best, x) => (at(s, x) > at(s, best) ? x : best), 0);
  const byPeak = [...series].sort((a, b) => peak(a) - peak(b));
  const tops: string[] = [];
  const bottoms: string[] = [];
  let top = 0;
  let bottom = 0;
  for (const s of byPeak)
    if (top < bottom) ((top += total(s)), tops.push(s));
    else ((bottom += total(s)), bottoms.push(s));
  return [...bottoms.reverse(), ...tops];
};
// </plan: stack order>

// <plan: wiggle>
/** d3's stackOffsetWiggle: the baseline g, g(0) = 0, and from x - 1 to x it
 *  moves by minus the value-weighted mean slope of the bands' middles. No
 *  story draws it any more (StackWiggle uses `Baseline.wiggle()`); it stays
 *  as the reference to check that against. */
export const wiggle = (order: string[]) => {
  const g = [0];
  for (const x of XS.slice(1)) {
    let below = 0; // how much the bands under band i grew
    let weighted = 0;
    let total = 0;
    for (const s of order) {
      const grow = at(s, x) - at(s, x - 1);
      weighted += (below + grow / 2) * at(s, x);
      total += at(s, x);
      below += grow;
    }
    g.push(g.at(-1)! - (total ? weighted / total : 0));
  }
  return g;
};
// </plan: wiggle>

type Offset = "none" | "expand" | "silhouette" | "wiggle";

/** Rows in stacking order, bottom first. */
export const stackRows = (order: string[]) =>
  XS.flatMap((x) =>
    order.map((series) => ({ x, series, amount: at(series, x) }))
  );

// <draw: stack>
/** One bar per x, the series stacked in it, and a ribbon per series through
 *  its bars. */
const stackChart = (offset: Exclude<Offset, "wiggle">, order: string[]) =>
  layer([
    chart(stackRows(order), { w: W, h: H })
      .flow(
        spread({
          by: "x",
          dir: "x",
          spacing: 14,
          alignment: offset === "silhouette" ? "middle" : "start",
        }),
        stack({
          by: "series",
          dir: "y",
          ...(offset === "expand" ? { size: field("amount").normalize() } : {}),
        })
      )
      .mark(
        rect({
          w: 4,
          ...(offset === "expand" ? {} : { h: "amount" }),
          fill: "series",
        }).name("bands")
      ),
    chart(selectAll("bands"))
      .flow(group({ by: "series" }))
      .mark(ribbon({ opacity: 0.75 })),
  ]);

/** Wiggle: one band per series over x, stacked on a baseline that moves
 *  (d3's stackOffsetWiggle). Each x's stack depends on its neighbors, so
 *  this is one stack of bands, not a stack per x: there are no bars. */
const wiggleChart = (order: string[]) =>
  chart(stackRows(order), { w: W, h: H })
    .flow(
      stack({
        by: "series",
        dir: "y",
        baseline: Baseline.wiggle(),
      })
    )
    .mark(
      ribbon({
        x: "x",
        h: "amount",
        fill: "series",
        opacity: 0.75,
        curve: Curve.linear(),
      })
    );
// </draw: stack>

const stackStory = (offset: Offset, ordered: boolean): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    const order = ordered ? insideOut(SERIES) : SERIES;
    (offset === "wiggle"
      ? wiggleChart(order)
      : stackChart(offset, order)
    ).render(container, { w: W, h: H, axes: false, legend: false });
    return container;
  },
});

export const StackNone = stackStory("none", false);
export const StackExpand = stackStory("expand", false);
export const StackSilhouette = stackStory("silhouette", false);
export const StackWiggle = stackStory("wiggle", false);
export const StackSilhouetteInsideOut = stackStory("silhouette", true);
export const StackWiggleInsideOut = stackStory("wiggle", true);

// ─────────────────────────────────────────────────────────────────────────
// 3. Force (d3-force): d3 places, GoFish draws
// ─────────────────────────────────────────────────────────────────────────

// The 16-course prerequisite graph of "Proposals/User Space Trees".
export const courses = [
  "Algorithms",
  "Calc I",
  "Calc II",
  "Compilers",
  "Crypto",
  "Data Str",
  "Discrete",
  "Distributed",
  "Graphics",
  "Intro CS",
  "Lin Alg",
  "ML",
  "OS",
  "Prob",
  "Systems",
  "Vision",
];

export const prereqs = [
  ["Calc I", "Calc II"],
  ["Calc I", "Lin Alg"],
  ["Intro CS", "Data Str"],
  ["Intro CS", "Systems"],
  ["Data Str", "Algorithms"],
  ["Discrete", "Algorithms"],
  ["Data Str", "Systems"],
  ["Calc II", "Prob"],
  ["Discrete", "Prob"],
  ["Prob", "ML"],
  ["Lin Alg", "ML"],
  ["Algorithms", "ML"],
  ["Systems", "OS"],
  ["Algorithms", "Compilers"],
  ["Systems", "Compilers"],
  ["Lin Alg", "Graphics"],
  ["Data Str", "Graphics"],
  ["ML", "Vision"],
  ["Graphics", "Vision"],
  ["OS", "Distributed"],
  ["Algorithms", "Distributed"],
  ["Prob", "Crypto"],
  ["Algorithms", "Crypto"],
].map(([source, target]) => ({ source, target }));

/** d3's own LCG, seeded. */
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
};

// <plan: force>
/** 300 ticks of link + many-body + collide + center, from d3's start. */
export const forcePositions = () => {
  const nodes = courses.map((id) => ({ id })) as any[];
  d3.forceSimulation(nodes)
    .randomSource(lcg(42))
    .force(
      "link",
      d3
        .forceLink(prereqs.map((l) => ({ ...l })))
        .id((d: any) => d.id)
        .distance(40)
    )
    .force("charge", d3.forceManyBody().strength(-100))
    .force("collide", d3.forceCollide(30))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .stop()
    .tick(300);
  return new Map<string, [number, number]>(
    nodes.map((n) => [n.id, [n.x, n.y]])
  );
};
// </plan: force>

const Course = createMark(({ id }: { id: string }) =>
  layer([
    rect({
      w: 58,
      h: 18,
      rx: 4,
      fill: "#e2ebf6",
      stroke: "#457b9d",
      strokeWidth: 1,
    }).name("box"),
    text({ text: id, fontSize: 9.5, fill: "#1d3557" }).name("label"),
  ]).relate(({ box, label }) => [
    Constraint.align({ x: "middle", y: "middle" }, [box, label]),
  ])
);

export const ForceGraph: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const xy = forcePositions();
    // <draw: force>
    layer([
      layer(courses.map((id) => Course({ id }).name(id))).relate((c) =>
        courses.map((id) =>
          Constraint.position({ x: xy.get(id)![0], y: xy.get(id)![1] }, [c[id]])
        )
      ),
    ])
      .relate(() =>
        prereqs.map(({ source, target }) =>
          line({ stroke: "#9aa7b1" }, [ref(source), ref(target)]).zOrder(-1)
        )
      )
      .render(container, { w: W, h: H });
    // </draw: force>
    return container;
  },
};

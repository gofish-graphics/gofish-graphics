// THROWAWAY prototype helpers for the sankey-layout proposal. Nothing here is
// library code. Each export stands in for a proposed construct, named in its
// doc comment. The graph algorithms follow d3-sankey 0.12 so the renders can
// be compared with d3's own output.

export type Link = { source: string; target: string; value: number };
export type Align = "left" | "right" | "center" | "justify";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Node value = max(Σ in, Σ out) (d3-sankey computeNodeValues). */
export function nodeValues(names: string[], links: Link[]) {
  return new Map(
    names.map((n) => [
      n,
      Math.max(
        sum(links.filter((l) => l.source === n).map((l) => l.value)),
        sum(links.filter((l) => l.target === n).map((l) => l.value))
      ),
    ])
  );
}

/** Longest path to each node from a source (depth) and to a sink (height). */
function depthsAndHeights(names: string[], links: Link[]) {
  const longest = (from: "source" | "target") => {
    const to = from === "source" ? "target" : "source";
    const d = new Map(names.map((n) => [n, 0]));
    for (let pass = 0; pass <= names.length; pass++) {
      let changed = false;
      for (const l of links) {
        if (d.get(l[from])! + 1 > d.get(l[to])!) {
          d.set(l[to], d.get(l[from])! + 1);
          changed = true;
        }
      }
      if (!changed) return d;
    }
    throw new Error("layers: the graph has a cycle");
  };
  return { depth: longest("source"), height: longest("target") };
}

/** STAND-IN for the proposed `layers({ from, to, align })` data helper:
 *  the column of each node (Sugiyama layer assignment, d3 nodeAlign). */
export function layers(names: string[], links: Link[], align: Align = "justify") {
  const { depth, height } = depthsAndHeights(names, links);
  const n = Math.max(...depth.values()) + 1;
  const hasOut = new Set(links.map((l) => l.source));
  const hasIn = new Set(links.map((l) => l.target));
  return new Map(
    names.map((name) => {
      const d = depth.get(name)!;
      const h = height.get(name)!;
      const layer =
        align === "left"
          ? d
          : align === "right"
            ? n - 1 - h
            : align === "center"
              ? hasIn.has(name)
                ? d
                : hasOut.has(name)
                  ? Math.min(
                      ...links.filter((l) => l.source === name).map((l) => depth.get(l.target)!)
                    ) - 1
                  : 0
              : hasOut.has(name)
                ? d
                : n - 1;
      return [name, layer];
    })
  );
}

function columnsOf(names: string[], layer: Map<string, number>) {
  const n = Math.max(...layer.values()) + 1;
  const cols: string[][] = Array.from({ length: n }, () => []);
  for (const name of names) cols[layer.get(name)!].push(name);
  return cols;
}

/** STAND-IN for the proposed `order({ from, to, by: "layer" })` data helper:
 *  the rank of each node inside its column after a few up-and-down
 *  barycenter sweeps (Sugiyama crossing reduction). Returns name → rank. */
export function barycenterOrder(
  names: string[],
  links: Link[],
  layer: Map<string, number>,
  sweeps = 4
) {
  const cols = columnsOf(names, layer);
  const pos = new Map<string, number>();
  const setPos = () => cols.forEach((c) => c.forEach((n, i) => pos.set(n, (i + 0.5) / c.length)));
  setPos();
  const bary = (n: string, side: "in" | "out") => {
    const ls = links.filter((l) => (side === "in" ? l.target : l.source) === n);
    if (!ls.length) return pos.get(n)!;
    return (
      sum(ls.map((l) => l.value * pos.get(side === "in" ? l.source : l.target)!)) /
      sum(ls.map((l) => l.value))
    );
  };
  for (let s = 0; s < sweeps; s++) {
    for (const side of ["in", "out"] as const) {
      const idx = cols.map((_, i) => i);
      for (const d of side === "in" ? idx.slice(1) : idx.reverse().slice(1)) {
        const b = new Map(cols[d].map((n) => [n, bary(n, side)]));
        cols[d].sort((a, z) => b.get(a)! - b.get(z)!);
        setPos();
      }
    }
  }
  const rank = new Map<string, number>();
  cols.forEach((c) => c.forEach((n, i) => rank.set(n, i)));
  return rank;
}

export type Box = { y0: number; y1: number };

/** STAND-IN for relaxed coordinate assignment (d3-sankey computeNodeBreadths:
 *  shared ky, initial stack, `iterations` rounds of relaxLeftToRight /
 *  relaxRightToLeft + resolveCollisions). Pixel y0/y1 per node in [0, height]. */
export function relax(
  names: string[],
  links: Link[],
  layer: Map<string, number>,
  { height, padding, iterations = 6, interleave = true }: { height: number; padding: number; iterations?: number; interleave?: boolean }
) {
  const value = nodeValues(names, links);
  const cols = columnsOf(names, layer);
  const ky = Math.min(
    ...cols.map((c) => (height - (c.length - 1) * padding) / sum(c.map((n) => value.get(n)!)))
  );
  const box = new Map<string, Box>();
  const width = (l: Link) => l.value * ky;
  // d3 keeps each node's link lists sorted by the far end's y0, but only
  // re-sorts them at set times (after init and after a node moves in a
  // sweep, NOT after collision resolution). Mirror that exactly.
  const idx = (l: Link) => links.indexOf(l);
  const y0 = (n: string) => box.get(n)?.y0 ?? NaN;
  const outL = new Map(names.map((n) => [n, links.filter((l) => l.source === n)]));
  const inL = new Map(names.map((n) => [n, links.filter((l) => l.target === n)]));
  const sortOut = (n: string) => outL.get(n)!.sort((a, b) => y0(a.target) - y0(b.target) || idx(a) - idx(b));
  const sortIn = (n: string) => inL.get(n)!.sort((a, b) => y0(a.source) - y0(b.source) || idx(a) - idx(b));
  const out = (n: string) => outL.get(n)!;
  const inn = (n: string) => inL.get(n)!;
  const sortedOut = out;
  const sortedIn = inn;
  const reorderNodeLinks = (n: string) => {
    for (const l of inn(n)) sortOut(l.source);
    for (const l of out(n)) sortIn(l.target);
  };
  for (const c of cols) {
    let y = 0;
    for (const n of c) {
      box.set(n, { y0: y, y1: y + value.get(n)! * ky });
      y = box.get(n)!.y1 + padding;
    }
    const slack = (height - y + padding) / (c.length + 1);
    c.forEach((n, i) => {
      box.get(n)!.y0 += slack * (i + 1);
      box.get(n)!.y1 += slack * (i + 1);
    });
    for (const n of c) (sortOut(n), sortIn(n));
  }
  const targetTop = (s: string, t: string) => {
    let y = box.get(s)!.y0 - ((out(s).length - 1) * padding) / 2;
    for (const l of sortedOut(s)) {
      if (l.target === t) break;
      y += width(l) + padding;
    }
    for (const l of sortedIn(t)) {
      if (l.source === s) break;
      y -= width(l);
    }
    return y;
  };
  const sourceTop = (s: string, t: string) => {
    let y = box.get(t)!.y0 - ((inn(t).length - 1) * padding) / 2;
    for (const l of sortedIn(t)) {
      if (l.source === s) break;
      y += width(l) + padding;
    }
    for (const l of sortedOut(s)) {
      if (l.target === t) break;
      y -= width(l);
    }
    return y;
  };
  const move = (n: string, dy: number) => {
    box.get(n)!.y0 += dy;
    box.get(n)!.y1 += dy;
  };
  const resolveCollisions = (c: string[], alpha: number) => {
    const down = (y: number, i: number) => {
      for (; i < c.length; i++) {
        const dy = (y - box.get(c[i])!.y0) * alpha;
        if (dy > 1e-6) move(c[i], dy);
        y = box.get(c[i])!.y1 + padding;
      }
    };
    const up = (y: number, i: number) => {
      for (; i >= 0; i--) {
        const dy = (box.get(c[i])!.y1 - y) * alpha;
        if (dy > 1e-6) move(c[i], -dy);
        y = box.get(c[i])!.y0 - padding;
      }
    };
    const i = c.length >> 1;
    up(box.get(c[i])!.y0 - padding, i - 1);
    down(box.get(c[i])!.y1 + padding, i + 1);
    up(height, c.length - 1);
    down(0, 0);
  };
  const relaxColumn = (c: string[], side: "in" | "out", alpha: number, beta: number) => {
    for (const n of c) {
      let y = 0;
      let w = 0;
      for (const l of side === "in" ? inn(n) : out(n)) {
        const v = l.value * Math.abs(layer.get(l.target)! - layer.get(l.source)!);
        y += (side === "in" ? targetTop(l.source, n) : sourceTop(n, l.target)) * v;
        w += v;
      }
      if (w > 0) {
        move(n, (y / w - box.get(n)!.y0) * alpha);
        reorderNodeLinks(n);
      }
    }
    c.sort((a, b) => box.get(a)!.y0 - box.get(b)!.y0);
    // d3 resolves collisions inside every sweep, so the next sweep's targets
    // read resolved positions. `interleave: false` skips that and resolves
    // once at the end: relaxation as a pure data transform, then a local
    // per-column 1D overlap removal.
    if (interleave) resolveCollisions(c, beta);
  };
  for (let i = 0; i < iterations; i++) {
    const alpha = Math.pow(0.99, i);
    const beta = Math.max(1 - alpha, (i + 1) / iterations);
    for (let d = cols.length - 2; d >= 0; d--) relaxColumn(cols[d], "out", alpha, beta);
    for (let d = 1; d < cols.length; d++) relaxColumn(cols[d], "in", alpha, beta);
  }
  if (!interleave) for (const c of cols) resolveCollisions(c, 1);
  return { box, ky };
}

/** The ends table of the stacked-ribbons proposal: one row per END of every
 *  link. `key` orders the ends inside one side of a node by the far node's
 *  position `pos` (a rank or a y), so ribbons leave in the order of the
 *  nodes they go to. */
export function linkEnds(
  links: Link[],
  layer: Map<string, number>,
  pos: Map<string, number>
) {
  return links.flatMap((l, link) => [
    { link, src: l.source, node: l.source, layer: layer.get(l.source)!, side: "out", value: l.value, far: pos.get(l.target)! * 1000 + link },
    { link, src: l.source, node: l.target, layer: layer.get(l.target)!, side: "in", value: l.value, far: pos.get(l.source)! * 1000 + link },
  ]);
}

/** Names of the nodes sorted column by column, then by `pos` inside a column
 *  (for `field("node").sort(...)`). */
export function sortedNames(names: string[], layer: Map<string, number>, pos: Map<string, number>) {
  return [...names].sort((a, b) => layer.get(a)! - layer.get(b)! || pos.get(a)! - pos.get(b)!);
}

// ---------------------------------------------------------------------------
// Approach C stand-in: one operator that owns nodes AND edges and runs the
// Sugiyama phases as strategies. Everything is computed here; the story
// turns the geometry into a plain `layer` of absolutely placed marks.

export type LayeredOptions = {
  w: number;
  h: number;
  /** layer assignment (d3 nodeAlign; Sugiyama phase 1) */
  layering: Align;
  /** crossing reduction (Sugiyama phase 2) */
  ordering: "input" | "barycenter";
  /** coordinate assignment (Sugiyama phase 3) */
  coordinates: "stack" | "relax";
  spacing: number;
  /** node size along the layer axis: by value (sankey) or fixed px (graph) */
  nodeSize: "value" | number;
  nodeWidth: number;
  /** Sugiyama long-edge normalization: an edge that spans k > 1 layers gets
   *  k - 1 virtual nodes, which take part in ordering and placement. */
  virtualNodes?: boolean;
  /** left edge of each column in px (Round 2: link-driven column gaps).
   *  Omitted: columns evenly spaced, d3's kx. */
  colX?: number[];
  /** "stack" only: where a short column sits. Default "center". */
  columnAlign?: "center" | "top" | "evenly";
};

export type LayeredGeometry = {
  /** per link index: the virtual nodes its route bends through */
  routes: Map<number, { name: string; x: number; y: number }[]>;
  nodes: { name: string; layer: number; x: number; y0: number; y1: number }[];
  /** per link, its band at the source (out) and at the target (in) */
  links: (Link & { i: number; out: Box; in: Box })[];
};

export function layeredGeometry(names: string[], links: Link[], o: LayeredOptions): LayeredGeometry {
  const col = layers(names, links, o.layering);
  const nCols = Math.max(...col.values()) + 1;
  const kx = (o.w - o.nodeWidth) / (nCols - 1);
  const xOf = (layer: number) => (o.colX ? o.colX[layer] : layer * kx);
  let box: Map<string, Box>;
  let ky = 1;
  const virt: Map<number, string[]> = new Map();
  let allNames = names;
  let allLinks = links;
  if (o.virtualNodes) {
    allNames = [...names];
    allLinks = [];
    links.forEach((l, i) => {
      const chain = [l.source];
      for (let k = col.get(l.source)! + 1; k < col.get(l.target)!; k++) {
        const v = `~${i}_${k}`;
        col.set(v, k);
        allNames.push(v);
        chain.push(v);
      }
      chain.push(l.target);
      virt.set(i, chain.slice(1, -1));
      for (let k = 0; k + 1 < chain.length; k++) allLinks.push({ source: chain[k], target: chain[k + 1], value: l.value });
    });
  }
  if (o.nodeSize === "value" && o.coordinates === "relax") {
    ({ box, ky } = relax(names, links, col, { height: o.h, padding: o.spacing }));
  } else {
    const rank =
      o.ordering === "barycenter" ? barycenterOrder(allNames, allLinks, col) : new Map(allNames.map((n, i) => [n, i]));
    const cols = columnsOf(sortedNames(allNames, col, rank), col);
    const value = nodeValues(allNames, allLinks);
    const size = (n: string) => (n.startsWith("~") ? 0 : o.nodeSize === "value" ? value.get(n)! : 1);
    // the shared scale: the tallest column with its gaps fits (d3's ky)
    ky =
      o.nodeSize === "value"
        ? Math.min(...cols.map((c) => (o.h - (c.length - 1) * o.spacing) / sum(c.map(size))))
        : o.nodeSize;
    box = new Map();
    for (const c of cols) {
      const total = sum(c.map(size)) * ky + (c.length - 1) * o.spacing;
      // centered column (default), top-aligned (A's renders), or leftover
      // height split evenly around the nodes (d3 with iterations(0))
      const slack = o.h - total;
      const even = o.columnAlign === "evenly" ? slack / (c.length + 1) : 0;
      let y = o.columnAlign === "top" ? 0 : o.columnAlign === "evenly" ? even : slack / 2;
      for (const n of c) {
        box.set(n, { y0: y, y1: y + size(n) * ky });
        y += size(n) * ky + o.spacing + even;
      }
    }
  }
  // link bands: stacked inside each node, ordered by the far node's y
  const mid = (b: Box) => (b.y0 + b.y1) / 2;
  const band = new Map<number, { out: Box; in: Box }>();
  for (const n of names) {
    for (const side of ["out", "in"] as const) {
      const far = (l: Link) => box.get(side === "out" ? l.target : l.source)!;
      const ls = links
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => (side === "out" ? l.source : l.target) === n)
        .sort((a, b) => mid(far(a.l)) - mid(far(b.l)));
      const b = box.get(n)!;
      let y = b.y0;
      for (const { l, i } of ls) {
        const t = o.nodeSize === "value" ? l.value * ky : 0; // graphs: edges meet at a point
        const y0 = o.nodeSize === "value" ? y : mid(b);
        const e = band.get(i) ?? ({} as { out: Box; in: Box });
        e[side] = { y0, y1: y0 + t };
        band.set(i, e);
        y += t;
      }
    }
  }
  const routes = new Map(
    [...virt].map(([i, vs]) => [i, vs.map((name) => ({ name, x: xOf(col.get(name)!) + o.nodeWidth / 2, y: box.get(name)!.y0 }))])
  );
  return {
    routes,
    nodes: names.map((name) => ({ name, layer: col.get(name)!, x: xOf(col.get(name)!), ...box.get(name)! })),
    links: links.map((l, i) => ({ ...l, i, ...band.get(i)! })),
  };
}

// ===========================================================================
// Round 2
// ===========================================================================

// ---------------------------------------------------------------------------
// Column gaps from the links.
//
// GoFish's `Curve.bezier()` puts both control points at the main-axis
// midpoint (d3.linkHorizontal), so a ribbon leaves and enters level. With
// u = t, x(t) = g·(1.5·t(1−t) + t³) and y(t) = Δy·(3t² − 2t³); the steepest
// point is t = 1/2, where dy/dx = 1.5Δy / 0.75g = 2Δy/g. (Not 1.5Δy/g: that
// is the slope of smoothstep over a LINEAR x, which this curve is not.)
// So capping the slope at s needs g ≥ 2Δy/s.

/** STAND-IN for a "gaps from links" column-spacing strategy. Given y
 *  placement (a geometry), returns the left x of each column so that each
 *  gap's width is proportional to its need, the steepest link crossing it:
 *  need_i = max over links crossing gap i of 2·Δy / span (a link that spans
 *  k gaps charges Δy/k to each). Proportional gaps make every gap's
 *  steepest slope equal, which minimizes the largest slope for a fixed total
 *  width. `minGap` keeps a floor for gaps with only level links.
 *  `rule: "sum"` instead weighs every link (least total thinning, below). */
export function gapsFromLinks(
  g: LayeredGeometry,
  o: { w: number; nodeWidth: number; minGap: number; rule?: "steepest" | "sum" }
) {
  const nCols = Math.max(...g.nodes.map((n) => n.layer)) + 1;
  const layerOf = new Map(g.nodes.map((n) => [n.name, n.layer]));
  const need = Array.from({ length: nCols - 1 }, () => 0);
  for (const l of g.links) {
    const a = layerOf.get(l.source)!;
    const b = layerOf.get(l.target)!;
    const dy = Math.abs(l.in.y0 - l.out.y0) / (b - a);
    const t = l.out.y1 - l.out.y0;
    for (let i = a; i < b; i++)
      need[i] = o.rule === "sum" ? need[i] + t * dy * dy : Math.max(need[i], 2 * dy);
  }
  // "sum": thinning of a band ≈ m²/2 for small slopes m = 2Δy/g, so the total
  // Σ_i Σ_links t·(2Δy/g_i)² for a fixed Σ g_i is least when g_i ∝ (Σ t·Δy²)^(1/3).
  if (o.rule === "sum") need.forEach((n, i) => (need[i] = Math.cbrt(n)));
  const free = o.w - nCols * o.nodeWidth - need.length * o.minGap;
  const total = sum(need) || 1;
  const colX = [0];
  need.forEach((n, i) => colX.push(colX[i] + o.nodeWidth + o.minGap + (free * n) / total));
  return { colX, need };
}

/** The ribbon of a link as GoFish draws it: the band's top edge at x. */
function bandTopAt(x0: number, x1: number, a: number, b: number, x: number) {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const t = (lo + hi) / 2;
    const xt = x0 + (x1 - x0) * (1.5 * t * (1 - t) + t * t * t);
    if (xt < x) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return a + (b - a) * (3 * t * t - 2 * t * t * t);
}

const unionLength = (iv: [number, number][]) => {
  iv.sort((p, q) => p[0] - q[0]);
  let total = 0;
  let end = -Infinity;
  for (const [s, e] of iv) {
    if (e <= end) continue;
    total += e - Math.max(s, end);
    end = e;
  }
  return total;
};

/** Overlap metrics of a sankey geometry, sampled every px along x.
 *  - overplot: area where ribbons lie on top of each other, Σ_x (Σ band
 *    heights − union of band heights). A pair crossing at a shallow angle
 *    overlaps over a long run; at a steep angle, briefly. So this measures
 *    how much a crossing hurts, not just whether it happens.
 *  - behind: area of ribbons passing behind (through) other nodes.
 *  - maxSlope: steepest ribbon slope (2Δy / horizontal run).
 *  - thinning: how much thinner bands look at their steepest point.
 *  - ribbonArea: total ribbon area, to normalize overplot. */
export function ribbonMetrics(g: LayeredGeometry, nodeWidth: number) {
  const node = new Map(g.nodes.map((n) => [n.name, n]));
  const bands = g.links.map((l) => {
    const x0 = node.get(l.source)!.x + nodeWidth;
    const x1 = node.get(l.target)!.x;
    return { x0, x1, a: l.out.y0, b: l.in.y0, t: l.out.y1 - l.out.y0 };
  });
  const xMax = Math.max(...g.nodes.map((n) => n.x + nodeWidth));
  let overplot = 0;
  let behind = 0;
  let ribbonArea = 0;
  for (let x = 0.5; x < xMax; x += 1) {
    const iv: [number, number][] = [];
    for (const b of bands) {
      if (x <= b.x0 || x >= b.x1 || b.t <= 0) continue;
      const y = bandTopAt(b.x0, b.x1, b.a, b.b, x);
      iv.push([y, y + b.t]);
      ribbonArea += b.t;
    }
    overplot += sum(iv.map(([s, e]) => e - s)) - unionLength(iv.map((p) => [...p] as [number, number]));
    for (const n of g.nodes) {
      if (x <= n.x || x >= n.x + nodeWidth) continue;
      for (const [s, e] of iv) behind += Math.max(0, Math.min(e, n.y1) - Math.max(s, n.y0));
    }
  }
  const slope = (b: (typeof bands)[number]) => (2 * Math.abs(b.b - b.a)) / Math.max(1e-9, b.x1 - b.x0);
  const maxSlope = Math.max(...bands.map(slope));
  // thinning: at its steepest point a band of vertical thickness t is only
  // t/√(1+m²) thick across. Thickness-weighted mean loss, 0 = all level.
  const thinning = sum(bands.map((b) => b.t * (1 - 1 / Math.sqrt(1 + slope(b) ** 2)))) / sum(bands.map((b) => b.t));
  return { overplot, behind, ribbonArea, maxSlope, thinning };
}

// ---------------------------------------------------------------------------
// Trees as layered graphs.

export type TreeNode = { name: string; children?: TreeNode[] };

/** A tree as the nodes + links tables approach A takes, plus the facts the
 *  tree layouts below need. `depth` is exactly `layers(..., "left")`
 *  (longest path from the source), and leaf order is DFS order. */
export function flatTree(root: TreeNode) {
  const names: string[] = [];
  const links: Link[] = [];
  const depth = new Map<string, number>();
  const kids = new Map<string, string[]>();
  const walk = (n: TreeNode, d: number) => {
    names.push(n.name);
    depth.set(n.name, d);
    kids.set(n.name, (n.children ?? []).map((c) => c.name));
    for (const c of n.children ?? []) {
      links.push({ source: n.name, target: c.name, value: 1 });
      walk(c, d + 1);
    }
  };
  walk(root, 0);
  // DFS rank: the order approach A would sort each column by
  const order = new Map(names.map((n, i) => [n, i]));
  return { names, links, depth, kids, order, root: root.name };
}

type Contour = Map<number, [number, number]>; // depth offset → [top, bottom]

/** STAND-IN for a "contour" spacing strategy (Reingold–Tilford): siblings are
 *  placed as close as their per-depth outlines allow, the parent centered on
 *  its first and last child. Returns each node's center y (px). Simplified:
 *  siblings are packed left to right (d3/Walker also spreads small middle
 *  subtrees evenly between big ones). `size` is a node's extent on y and
 *  `gap` the minimum gap between any two nodes in one layer. */
export function contourTree(t: ReturnType<typeof flatTree>, size: number, gap: number, center: "roots" | "box" = "roots") {
  const rel = new Map<string, number>(); // y relative to parent
  const lay = (n: string): Contour => {
    const cs = t.kids.get(n)!;
    const own: Contour = new Map([[0, [-size / 2, size / 2]]]);
    if (!cs.length) return own;
    const acc: Contour = new Map();
    const offs: number[] = [];
    for (const c of cs) {
      const cc = lay(c);
      let off = offs.length ? -Infinity : 0;
      if (offs.length)
        for (const [d, [top]] of cc) {
          const prev = acc.get(d);
          if (prev) off = Math.max(off, prev[1] - top + gap);
        }
      offs.push(off);
      for (const [d, [top, bot]] of cc) {
        const prev = acc.get(d);
        acc.set(d, prev ? [Math.min(prev[0], top + off), Math.max(prev[1], bot + off)] : [top + off, bot + off]);
      }
    }
    // RT centers the parent on its first and last child ROOTS; "box" centers
    // it on the children group's whole outline (what spread alignment "middle" does)
    const all = [...acc.values()];
    const mid = center === "roots" ? (offs[0] + offs[offs.length - 1]) / 2 : (Math.min(...all.map((v) => v[0])) + Math.max(...all.map((v) => v[1]))) / 2;
    cs.forEach((c, i) => rel.set(c, offs[i] - mid));
    for (const [d, [top, bot]] of acc) own.set(d + 1, [top - mid, bot - mid]);
    return own;
  };
  lay(t.root);
  const y = new Map<string, number>([[t.root, 0]]);
  const place = (n: string) => t.kids.get(n)!.forEach((c) => (y.set(c, y.get(n)! + rel.get(c)!), place(c)));
  place(t.root);
  const min = Math.min(...y.values()) - size / 2;
  for (const [k, v] of y) y.set(k, v - min);
  return y;
}

/** Nested boxes (what gotree's distribute and nested spreads do): each
 *  subtree is a box, siblings' boxes are stacked with `gap`, a parent is
 *  centered on its children's box. Center y per node, px. */
export function boxTree(t: ReturnType<typeof flatTree>, size: number, gap: number) {
  const y = new Map<string, number>();
  let cursor = 0;
  const lay = (n: string): [number, number] => {
    const cs = t.kids.get(n)!;
    if (!cs.length) {
      const top = cursor;
      cursor += size + gap;
      y.set(n, top + size / 2);
      return [top, top + size];
    }
    const spans = cs.map(lay);
    const top = spans[0][0];
    const bot = spans[spans.length - 1][1];
    y.set(n, (top + bot) / 2);
    return [top, bot];
  };
  lay(t.root);
  return y;
}

/** d3.cluster's rule: leaves evenly spaced in DFS order, a parent at the MEAN
 *  of its children. Layer: tree height − node height (all leaves last). */
export function clusterTree(t: ReturnType<typeof flatTree>, size: number, gap: number) {
  const y = new Map<string, number>();
  const height = new Map<string, number>();
  let k = 0;
  const lay = (n: string) => {
    const cs = t.kids.get(n)!;
    if (!cs.length) {
      y.set(n, k++ * (size + gap) + size / 2);
      height.set(n, 0);
      return;
    }
    cs.forEach(lay);
    y.set(n, sum(cs.map((c) => y.get(c)!)) / cs.length);
    height.set(n, 1 + Math.max(...cs.map((c) => height.get(c)!)));
  };
  lay(t.root);
  const H = height.get(t.root)!;
  return { y, layer: new Map([...height].map(([n, h]) => [n, H - h])) };
}

export const extent = (y: Map<string, number>, size: number) =>
  Math.max(...y.values()) - Math.min(...y.values()) + size;

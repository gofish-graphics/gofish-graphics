// Plain-JS preprocessing shared by the stacked-ribbons proposal stories.
// Everything here is what a user must precompute TODAY; NOTES.md records
// which parts a data helper or the layout should own instead.

export type Link = { source: string; target: string; value: number };

/** Node depth = longest path from a source (d3-sankey `sankeyLeft`), then
 *  sinks pushed to the last column (`sankeyJustify`). Assumes a DAG. */
export function sankeyDepths(names: string[], links: Link[]) {
  const depth = new Map(names.map((n) => [n, 0]));
  // Bellman-Ford style relaxation; fine for a few hundred links.
  for (let pass = 0; pass < names.length; pass++) {
    let changed = false;
    for (const l of links) {
      const d = depth.get(l.source)! + 1;
      if (d > depth.get(l.target)!) {
        depth.set(l.target, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const max = Math.max(...depth.values());
  const hasOut = new Set(links.map((l) => l.source));
  for (const n of names) if (!hasOut.has(n)) depth.set(n, max);
  return depth;
}

/** Order the nodes inside each column to reduce crossings: a few
 *  barycenter sweeps (each node moves to the value-weighted mean rank of its
 *  neighbors in the previous column, then the next). A cheap stand-in for
 *  d3-sankey's relaxation. Returns all names, column by column. */
export function orderColumns(
  names: string[],
  links: Link[],
  depth: Map<string, number>,
  sweeps = 4
) {
  const max = Math.max(...depth.values());
  const cols: string[][] = Array.from({ length: max + 1 }, () => []);
  for (const n of names) cols[depth.get(n)!].push(n);
  const rank = new Map<string, number>();
  const setRanks = () =>
    cols.forEach((c) =>
      c.forEach((n, i) => rank.set(n, c.length > 1 ? i / (c.length - 1) : 0.5))
    );
  setRanks();
  const bary = (n: string, dir: "in" | "out") => {
    const ls = links.filter((l) => (dir === "in" ? l.target : l.source) === n);
    if (ls.length === 0) return rank.get(n)!;
    const w = ls.reduce((s, l) => s + l.value, 0);
    return (
      ls.reduce(
        (s, l) => s + l.value * rank.get(dir === "in" ? l.source : l.target)!,
        0
      ) / w
    );
  };
  for (let s = 0; s < sweeps; s++) {
    for (let d = 1; d <= max; d++) {
      const b = new Map(cols[d].map((n) => [n, bary(n, "in")]));
      cols[d].sort((a, z) => b.get(a)! - b.get(z)!);
      setRanks();
    }
    for (let d = max - 1; d >= 0; d--) {
      const b = new Map(cols[d].map((n) => [n, bary(n, "out")]));
      cols[d].sort((a, z) => b.get(a)! - b.get(z)!);
      setRanks();
    }
  }
  return cols.flat();
}

/** The ends table: one row per END of every link (two rows per link).
 *  `side` is "out" at the source node and "in" at the target node. `key`
 *  orders the ends inside one side of one node by the FAR node's position
 *  (its rank within its column, as a fraction), so ribbons leave a node in
 *  the order of the nodes they go to; ties broken by link index so every
 *  end is its own group. */
export function unpivotLinkEnds(
  names: string[],
  links: Link[],
  depth: Map<string, number>
) {
  const columnRank = new Map<string, number>();
  const byDepth = new Map<number, string[]>();
  for (const n of names) {
    const d = depth.get(n)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n);
  }
  for (const col of byDepth.values())
    col.forEach((n, i) => columnRank.set(n, col.length > 1 ? i / (col.length - 1) : 0.5));
  const key = (far: string, link: number) =>
    Math.round(columnRank.get(far)! * 1000) * 1000 + link;
  return links.flatMap((l, link) => [
    {
      link,
      src: l.source,
      node: l.source,
      depth: depth.get(l.source)!,
      side: "out",
      value: l.value,
      key: key(l.target, link),
    },
    {
      link,
      src: l.source,
      node: l.target,
      depth: depth.get(l.target)!,
      side: "in",
      value: l.value,
      key: key(l.source, link),
    },
  ]);
}

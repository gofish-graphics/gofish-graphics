// The "node-link" approach, EMULATED: nodes are placed by any chart; links
// are a table resolved against the named nodes; the ribbon (or line) takes
// `from` / `to` ref columns and a `size`, and at each node edge the ribbon
// ends STACK along the node's facing edge, ordered by the far end's placed
// position, with optional overrides.
//
// Today's API cannot allocate ends after the nodes are placed, so this helper
// rewrites the links into an ENDS table: one row per ribbon end, carrying the
// fields of the node it sits on (so the user's node flow can lay the ends out
// where the node would go), plus a SLACK row per node side that pads the side
// up to the node's own value. A story then renders the node flow with two
// extra tiers where the node mark was (side, then end order), and a ribbon
// layer over the ends grouped by link. See proposals/stacked-ribbons/NOTES-nodelink.md.

export type EndRow = Record<string, any> & {
  link: number;
  /** "from" = the source end of the link, "to" = the target end. */
  side: "from" | "to";
  value: number;
  /** The end's rank inside its (node, side); slack sorts last. */
  key: number;
  port: boolean;
};

export type NodeLinkOpts<N, L> = {
  nodes: N[];
  nodeKey: (n: N) => string;
  /** The node's own value (e.g. its `h`). Omitted = the larger side sum. */
  nodeValue?: (n: N) => number | undefined;
  links: L[];
  from: (l: L) => string;
  to: (l: L) => string;
  /** Per-end size. Equal-size ends: return a constant. */
  size: { from: (l: L) => number; to: (l: L) => number };
  /** Proxy for the far end's placed position, as seen from `here`. A real
   *  implementation reads the far node's actual position after layout. */
  far: (here: string, far: string) => number;
  /** End-order override per side: a sort-key prefix; the far position (then
   *  the link's row order) breaks ties. */
  order?: { from?: (l: L) => (string | number)[]; to?: (l: L) => (string | number)[] };
  /** Pad each node side up to the node value with a slack row. */
  slack?: boolean;
  /** The node part each side attaches to. Ends on the SAME part of a node
   *  are ranked together (a chord: both sides on the inner arc). Default:
   *  from = "out" face, to = "in" face (a left-to-right sankey). */
  at?: { from: string; to: string };
  /** Link fields copied onto both ends (e.g. a fill). */
  linkFields?: (l: L) => Record<string, any>;
};

const cmp = (a: (string | number)[], b: (string | number)[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

export function nodeLinkEnds<N extends Record<string, any>, L>(o: NodeLinkOpts<N, L>) {
  const byKey = new Map(o.nodes.map((n) => [o.nodeKey(n), n]));
  type Pending = EndRow & { _sort: (string | number)[] };
  const ends: Pending[] = [];
  o.links.forEach((l, link) => {
    const s = o.from(l);
    const t = o.to(l);
    const extra = o.linkFields?.(l) ?? {};
    const mk = (side: "from" | "to", here: string, far: string, value: number): Pending => ({
      ...byKey.get(here)!,
      ...extra,
      node: here,
      link,
      side,
      value,
      key: 0,
      port: true,
      _sort: [...(o.order?.[side]?.(l) ?? []), o.far(here, far), link],
    });
    ends.push(mk("from", s, t, o.size.from(l)));
    // A self link (s === t, a chord's diagonal cell) has ONE end.
    if (s !== t) ends.push(mk("to", t, s, o.size.to(l)));
  });

  const report: string[] = [];
  const rows: EndRow[] = [];
  for (const n of o.nodes) {
    const k = o.nodeKey(n);
    const at = o.at ?? { from: "out", to: "in" };
    const parts = [...new Set([at.from, at.to])];
    const faces = parts.map((part) =>
      ends
        .filter((e) => e.node === k && at[e.side] === part)
        .sort((a, b) => cmp(a._sort, b._sort))
    );
    const sums = faces.map((es) => es.reduce((a, e) => a + e.value, 0));
    const declared = o.nodeValue?.(n);
    if (declared !== undefined && declared < Math.max(...sums) - 1e-9)
      report.push(`${k}: value ${declared} < ribbon sizes (${parts.map((p, i) => `${p} ${sums[i]}`).join(", ")})`);
    const target = declared ?? Math.max(...sums);
    faces.forEach((es, fi) => {
      es.forEach((e, i) => {
        const { _sort, ...row } = e;
        rows.push({ ...row, part: parts[fi], key: i });
      });
      if (o.slack && target - sums[fi] > 1e-9)
        rows.push({
          ...n,
          node: k,
          link: -1,
          side: at.from === parts[fi] ? "from" : "to",
          part: parts[fi],
          value: target - sums[fi],
          key: 1e6,
          port: false,
        });
    });
  }
  return { ends: rows, report };
}

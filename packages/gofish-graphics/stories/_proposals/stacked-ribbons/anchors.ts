// "Anchors on a mark's boundary", EMULATED. The hypothetical spelling is
//
//   rect({ w: 12, h: "value" })
//     .anchor("out", { at: "right" }, chart().flow(stack()).mark(blank({ h: "value" })))
//
// The anchor chart is an ordinary flow laid out in the 1D coordinate along a
// named part of the mark (`right` here). Its marks are SLOTS: intervals (or
// points) on that part, named by the anchor, that ribbons, lines and labels
// attach to. A ribbon is a 1-1 band between two slots; its width at each end
// is the slot's size.
//
// Today's API has no `.anchor`, so this helper evaluates the anchor flows by
// hand into a SLOTS table: one row per slot (plus GAP rows for a spread's
// spacing and a SLACK row that pads the part up to the node's own size). A
// story then renders the user's node flow with two extra tiers where the node
// mark was (anchor, then slot rank), and joins slots that share a `pair` key.
// See proposals/stacked-ribbons/NOTES-anchors.md.

export type SlotRow = Record<string, any> & {
  node: string;
  anchor: string;
  /** Rank along the part; gaps and slack interleave. */
  slot: number;
  value: number;
  kind: "slot" | "gap" | "slack";
  /** Slots with equal `pair` are joined by one ribbon (S1: same rows). */
  pair: string;
  /** Which end of the ribbon this slot is (0 = from, drawn first). */
  end: number;
};

export type AnchorSpec<N> = {
  name: string;
  /** The anchor chart's rows for node `n`: S1 = the node's own rows; S2 =
   *  the rows that reference the node through a resolved column. */
  rows: (n: N) => any[];
  /** The anchor flow's `by` (one slot per group); omitted = one per row. */
  slotBy?: (r: any, n: N) => string;
  /** The slot mark's extent along the part, from the slot's rows. */
  size: (rows: any[]) => number;
  /** Sort key of a slot (the `field().sort()` or the far-position default,
   *  given as a proxy because the far node is not placed yet). */
  order?: (n: N, rows: any[]) => (string | number)[];
  /** A spread's spacing, in data units, inserted BETWEEN slots. */
  gap?: number;
  /** The ribbon pairing key of a slot (S1 default: the slot's row ids). */
  pair: (rows: any[], n: N) => string;
  end?: number;
  /** Extra fields copied onto the slot row (e.g. a fill). */
  fields?: (rows: any[], n: N) => Record<string, any>;
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

export function anchorSlots<N extends Record<string, any>>(o: {
  nodes: N[];
  nodeKey: (n: N) => string;
  /** The node's own extent along the part; the rest of the part is slack.
   *  Omitted = the longest anchor (d3-sankey's rule). */
  nodeValue?: (n: N) => number | undefined;
  anchors: AnchorSpec<N>[];
}) {
  const out: SlotRow[] = [];
  const report: string[] = [];
  for (const n of o.nodes) {
    const node = o.nodeKey(n);
    const per = o.anchors.map((a) => {
      const rows = a.rows(n);
      const groups = new Map<string, any[]>();
      rows.forEach((r, i) => {
        const k = a.slotBy ? a.slotBy(r, n) : String(i);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      });
      const slots = [...groups.values()].sort((x, y) =>
        cmp(a.order?.(n, x) ?? [], a.order?.(n, y) ?? [])
      );
      const len =
        slots.reduce((s, rs) => s + a.size(rs), 0) +
        Math.max(0, slots.length - 1) * (a.gap ?? 0);
      return { a, slots, len };
    });
    const declared = o.nodeValue?.(n);
    const target = declared ?? Math.max(0, ...per.map((p) => p.len));
    for (const { a, slots, len } of per) {
      if (len - target > 1e-9)
        report.push(`${node}.${a.name}: slots ${len} overflow the part (${target})`);
      let rank = 0;
      slots.forEach((rs, i) => {
        if (i > 0 && a.gap)
          out.push({ ...n, node, anchor: a.name, slot: rank++, value: a.gap, kind: "gap", pair: "", end: 0 });
        out.push({
          ...n,
          ...(a.fields?.(rs, n) ?? {}),
          node,
          anchor: a.name,
          slot: rank++,
          value: a.size(rs),
          kind: "slot",
          pair: a.pair(rs, n),
          end: a.end ?? 0,
        });
      });
      if (target - len > 1e-9)
        out.push({ ...n, node, anchor: a.name, slot: 1e6, value: target - len, kind: "slack", pair: "", end: 0 });
    }
  }
  return { slots: out, report };
}

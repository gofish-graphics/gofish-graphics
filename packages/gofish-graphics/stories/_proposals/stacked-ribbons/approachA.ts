// Approach A, "the ribbon allocates its own ends", DEFINED BY REWRITE into
// Approach B ("ends are rows"). The proposed user-facing spelling is
//
//   layer([
//     chart(nodes)
//       .flow(spread({ by: "depth", dir: "x", spacing: 100 }),
//             spread({ by: "name", dir: "y", spacing: 10 }))
//       .mark(rect({ w: 12, h: "value" }).name("nodes")),
//     chart(links)
//       .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
//       .mark(ribbon({ from: "source", to: "target", size: "value" })),
//   ])
//
// `size` makes each ribbon end a sub-interval of the node's facing edge. This
// helper takes the same information as plain arguments and emits the B
// spec: the node rect is replaced by its ports (one rect per ribbon end, in
// per side, out per side) plus a SLACK port per side that pads the side up
// to the node's own `value`. The rewrite needs, and therefore asks for:
//   - each node's column (`depth`) and order inside the column (`order`),
//     because the B flow must lay the ports out where the nodes would go;
//   - the far end's position, to order the ends at a node edge. In B this is
//     only available BEFORE layout, so it is approximated by the far node's
//     rank in its column. A real A runs after the nodes are placed and can
//     sort by the far end's actual y.
//   - the node `value` and the ribbon `size` in ONE scale: in B they are the
//     same rects, so this holds by construction; a real A must give the
//     ribbon's `size` the y scale of the node's `h`.
import {
  chart,
  spread,
  rect,
  ribbon,
  selectAll,
  group,
  layer,
  field,
  Curve,
  filter,
  project,
} from "../../../src/lib";

export type ANode = { name: string; depth: number; value?: number; fill?: string };
export type ALink = { source: string; target: string; value: number; fill?: string };

export function rewriteToEnds(nodes: ANode[], links: ALink[]) {
  // Column rank of every node, for the end-ordering proxy.
  const cols = new Map<number, ANode[]>();
  for (const n of nodes) {
    if (!cols.has(n.depth)) cols.set(n.depth, []);
    cols.get(n.depth)!.push(n);
  }
  const rank = new Map<string, number>();
  for (const c of cols.values())
    c.forEach((n, i) => rank.set(n.name, c.length > 1 ? i / (c.length - 1) : 0.5));
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const key = (far: string, link: number) =>
    Math.round(rank.get(far)! * 1000) * 1000 + link;

  const ends: any[] = [];
  links.forEach((l, link) => {
    const s = byName.get(l.source)!;
    const t = byName.get(l.target)!;
    const common = { link, value: l.value, port: true, fill: l.fill ?? l.source };
    ends.push({ ...common, node: s.name, depth: s.depth, side: "out", key: key(t.name, link), nodeFill: s.fill ?? "#555" });
    ends.push({ ...common, node: t.name, depth: t.depth, side: "in", key: key(s.name, link), nodeFill: t.fill ?? "#555" });
  });

  // Slack ports: pad each side of each node up to the node's value (or to the
  // larger side when the node has no value, d3-sankey's rule).
  const report: string[] = [];
  for (const n of nodes) {
    const sum = (side: string) =>
      ends.filter((e) => e.node === n.name && e.side === side).reduce((a, e) => a + e.value, 0);
    const sin = sum("in");
    const sout = sum("out");
    const target = n.value ?? Math.max(sin, sout);
    if (n.value !== undefined && n.value < Math.max(sin, sout))
      report.push(`${n.name}: value ${n.value} < ribbon sizes (in ${sin}, out ${sout})`);
    for (const [side, s] of [["in", sin], ["out", sout]] as const) {
      if (target - s > 1e-9)
        ends.push({
          link: -1,
          value: target - s,
          port: false,
          node: n.name,
          depth: n.depth,
          side,
          key: Number.MAX_SAFE_INTEGER,
          nodeFill: n.fill ?? "#555",
        });
    }
  }
  return { ends, report };
}

/** Render the A spelling through its B rewrite. */
export function renderA(
  container: HTMLElement,
  nodes: ANode[],
  links: ALink[],
  o: { nodeW?: number; colSpacing?: number; nodeSpacing?: number; w?: number; h?: number; opacity?: number } = {}
) {
  const { ends, report } = rewriteToEnds(nodes, links);
  const order = nodes.map((n) => n.name);
  const halfW = (o.nodeW ?? 12) / 2;
  layer([
    chart(ends)
      .flow(
        spread({ by: field("depth").sort(), dir: "x", spacing: o.colSpacing ?? 100, alignment: "start", axes: false }),
        spread({ by: field("node").sort(order), dir: "y", spacing: o.nodeSpacing ?? 10, axes: false }),
        spread({ by: field("side").sort(["in", "out"]), dir: "x", spacing: 0, alignment: "start", axes: false }),
        spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
      )
      .mark(rect({ w: halfW, h: "value", fill: "#555" }).name("ports")),
    chart(selectAll("ports"))
      .flow(
        filter((r: any) => project(r, "port") === true),
        group({ by: "link" })
      )
      .mark(ribbon({ opacity: o.opacity ?? 0.45, fill: "fill", curve: Curve.bezier() })),
  ]).render(container, { w: o.w ?? 960, h: o.h ?? 600, legend: false } as any);
  return report;
}

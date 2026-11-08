// Anchors on a mark's boundary, EMULATED (anchors.ts). Every story's header
// gives the hypothetical target spelling; the code renders the same picture
// with today's API by evaluating the anchor flows into a slots table. See
// proposals/stacked-ribbons/NOTES-anchors.md.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { energy } from "../../../src/data/energy";
import { titanic } from "../../../src/data/titanic";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  line,
  text,
  selectAll,
  group,
  layer,
  field,
  filter,
  derive,
  project,
  Curve,
  Color,
  Shape,
  enclose,
  scatter,
} from "../../../src/lib";
import { penguins } from "../../../src/data/penguins";
import { clock } from "../../../src/ast/coordinateTransforms/clock";
import { anchorSlots } from "./anchors";
import { sankeyDepths, orderColumns } from "./sankeyPrep";

const meta: Meta = { title: "Proposals/Stack Profile/Anchors" };
export default meta;

const show = (fn: (c: HTMLElement) => unknown) => {
  const container = initializeContainer();
  Promise.resolve()
    .then(() => fn(container))
    .catch((e) => {
      const pre = document.createElement("pre");
      pre.textContent = "ERROR: " + (e?.message ?? String(e));
      container.prepend(pre);
      console.error(e);
    });
  return container;
};

const sortRefs = (key: (r: any) => number | string) =>
  derive((refs: any[]) =>
    [...refs].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
  );
/** Ribbon layer over a slots table: real slots only, from-end first, one
 *  group per pairing key. */
const pairSlots = () => [
  filter((r: any) => project(r, "kind") === "slot"),
  sortRefs((r) => project(r, "end") as number),
  group({ by: "pair" }),
];
const sum = (rs: any[], k: string) => rs.reduce((a, r) => a + r[k], 0);
// ===========================================================================
// 1. Energy sankey (S2: separate nodes and links tables)
// ===========================================================================
// Target, reused names:
//   layer([
//     chart(nodes)                                   // { name, depth } in column order
//       .flow(spread({ by: "depth", dir: "x", spacing: 100 }),
//             spread({ by: "name", dir: "y", spacing: 10 }))
//       .mark(rect({ w: 12, h: "value" })
//         .anchor("in",  { at: "left" },  chart().flow(stack()).mark(blank({ h: "value" })))
//         .anchor("out", { at: "right" }, chart().flow(stack()).mark(blank({ h: "value" })))
//         .name("nodes")),
//     chart(links)                                   // { source, target, value }
//       .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
//       .mark(ribbon({ from: "source.out", to: "target.in", fill: "source", opacity: 0.45 })),
//   ])
// Target, dedicated names:
//       .mark(rect({ w: 12, h: "value" })
//         .anchor("in",  { at: "left" },  slots().flow(stack()).mark(slot({ size: "value" })))
//         .anchor("out", { at: "right" }, slots().flow(stack()).mark(slot({ size: "value" })))
//         .name("nodes")),
// The node's `h: "value"` with no value column: the node is as tall as its
// longer anchor (d3-sankey's rule).
const eNames = energy.nodes.map((n) => n.name);
const eLinks = energy.links.map((l, i) => ({ i, source: eNames[l.source], target: eNames[l.target], value: l.value }));
const eDepth = sankeyDepths(eNames, eLinks);
const eOrder = orderColumns(eNames, eLinks, eDepth);
const eMaxDepth = Math.max(...eDepth.values());
// Far-position proxy: the far node's rank inside its column.
const eRank = new Map<string, number>();
{
  const cols = new Map<number, string[]>();
  for (const n of eOrder) {
    const d = eDepth.get(n)!;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n);
  }
  for (const c of cols.values()) c.forEach((n, i) => eRank.set(n, i / Math.max(1, c.length - 1)));
}
const eNodes = eOrder.map((name) => ({ name, depth: eDepth.get(name)! }));
const eValue = new Map(
  eNodes.map((n) => [
    n.name,
    Math.max(
      sum(eLinks.filter((l) => l.target === n.name), "value"),
      sum(eLinks.filter((l) => l.source === n.name), "value")
    ),
  ])
);
const energyAnchors = (labels: boolean) => [
  ...(labels
    ? [
        // .anchor("label", { at: "left" }, chart().mark(blank())) on the last column
        {
          name: "labelL",
          rows: (n: any) => (n.depth === eMaxDepth ? [n] : []),
          size: () => 0,
          pair: (_: any, n: any) => "label:" + n.name,
        },
      ]
    : []),
  {
    name: "in",
    rows: (n: any) => eLinks.filter((l) => l.target === n.name),
    size: (rs: any[]) => rs[0].value,
    order: (_n: any, rs: any[]) => [eRank.get(rs[0].source)!, rs[0].i],
    pair: (rs: any[]) => "L" + rs[0].i,
    end: 1,
    fields: (rs: any[]) => ({ fill: rs[0].source }),
  },
  {
    name: "out",
    rows: (n: any) => eLinks.filter((l) => l.source === n.name),
    size: (rs: any[]) => rs[0].value,
    order: (_n: any, rs: any[]) => [eRank.get(rs[0].target)!, rs[0].i],
    pair: (rs: any[]) => "L" + rs[0].i,
    end: 0,
    fields: (rs: any[]) => ({ fill: rs[0].source }),
  },
  ...(labels
    ? [
        // .anchor("label", { at: "right" }, chart().mark(blank())) elsewhere
        {
          name: "labelR",
          rows: (n: any) => (n.depth === eMaxDepth ? [] : [n]),
          size: () => 0,
          pair: (_: any, n: any) => "label:" + n.name,
        },
      ]
    : []),
];

const energyChart = (labels: boolean) => {
  const { slots } = anchorSlots({
    nodes: eNodes,
    nodeKey: (n) => n.name,
    nodeValue: (n) => eValue.get(n.name),
    anchors: energyAnchors(labels),
  });
  // A point slot centered on its part: emulated as a zero-width blank as
  // tall as the node, which a label centers against.
  const rows = slots
    .filter((s) => !(s.anchor.startsWith("label") && s.kind === "slack"))
    .map((s) => (s.anchor.startsWith("label") ? { ...s, value: eValue.get(s.node)! } : s));
  const parts = labels ? ["labelL", "in", "out", "labelR"] : ["in", "out"];
  const children: any[] = [
    chart(rows)
      .flow(
        spread({ by: field("depth").sort(), dir: "x", spacing: labels ? 125 : 100, alignment: "middle", axes: false }),
        spread({ by: field("node").sort(eOrder), dir: "y", spacing: 10, axes: false }),
        // the node mark's place: its anchors along its parts
        spread({ by: field("anchor").sort(parts), dir: "x", spacing: 0, alignment: "start", axes: false }),
        spread({ by: field("slot").sort(), dir: "y", spacing: 0, axes: false })
      )
      .mark(
        rect({ w: (d: any) => (d.anchor.startsWith("label") ? 0 : 6), h: "value", fill: "#555" } as any).name("slots")
      ),
    chart(selectAll("slots"))
      .flow(filter((r: any) => !String(project(r, "anchor")).startsWith("label")), ...pairSlots())
      .mark(ribbon({ fill: "fill", opacity: 0.45, curve: Curve.bezier() })),
  ];
  if (labels)
    for (const side of ["labelL", "labelR"])
      children.push(
        chart(selectAll("slots"))
          .flow(filter((r: any) => project(r, "anchor") === side))
          .mark(((refs: any[]) =>
            layer(
              refs.map((r: any) => {
                const t = text({ text: r.datum[0].node, fontSize: 10, fill: "#222" });
                return spread({ dir: "x", spacing: 4, alignment: "middle" }, side === "labelL" ? [t, r] : [r, t]);
              })
            )) as any)
      );
  return layer(children);
};

export const EnergySankey: StoryObj = {
  render: () => show((c) => energyChart(false).render(c, { w: 960, h: 600, axes: false, legend: false } as any)),
};

// ===========================================================================
// 6. Labels on anchors: the same sankey, each node with a point label anchor
// ===========================================================================
// Target (reused names):
//       .mark(rect({ w: 12, h: "value" })
//         .anchor("in",    { at: "left" },  chart().flow(stack()).mark(blank({ h: "value" })))
//         .anchor("out",   { at: "right" }, chart().flow(stack()).mark(blank({ h: "value" })))
//         .anchor("label", { at: (n) => (n.depth === last ? "left" : "right") }, chart().mark(blank()))
//         .label("name", { position: Place.along({ at: "label", side: "outset" }) })   // a slot is a named part
//         .name("nodes")),
export const Labels: StoryObj = {
  render: () => show((c) => energyChart(true).render(c, { w: 1120, h: 600, axes: false, legend: false } as any)),
};

// ===========================================================================
// 2. School days (S1: both node rows are drawn from the links table)
// ===========================================================================
// Target:
//   layer([
//     spread({ dir: "y", spacing: 200 }, [
//       chart(links)                                 // { day, emotion, count }
//         .flow(spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60 }))
//         .mark(rect({ w: "count", h: 4 })
//           .anchor("emotions", { at: "bottom" }, chart().flow(stack({ by: "emotion" })).mark(blank({ w: "count" })))),
//       chart(links)
//         .flow(spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50 }))
//         .mark(rect({ w: "count", h: 90, fill: "emotion" })
//           .anchor("days", { at: "top" }, chart().flow(stack({ by: "day" })).mark(blank({ w: "count" })))),
//     ]),
//     chart(selectAll(["emotions", "days"])).mark(ribbon({ fill: "emotion", opacity: 0.6 })),  // joins slots holding the same rows
//   ])
// ===========================================================================
// Penguin body mass (g), the 342 penguins with a mass. The violin's flat side
// is PARTITIONED by mass: a slot is a cell of the bin, at the cell's place on
// the violin's own mass axis, as long as the cell is wide. The bar is
// STACKED by count: a slot is as long as the cell's share of the penguins.
// So a ribbon goes from a span of mass to a share of the penguins.
// Target:
//   // penguins: { mass, ... }    kde(field, bandwidth): a user derive -> { mass, density }
//   const massBins = field("mass").bin(Bin.thresholds([3000, 4000, 5000, 6000]));
//   layer([
//     spread({ dir: "x", spacing: 160 }, [
//       chart(penguins)
//         .flow(derive(kde("mass", 200)), scatter({ by: "mass", y: "mass" }))
//         .mark(
//           ribbon({ w: "density", dir: "y", align: "end", fill: "#c4c4c4" })
//             .anchor({ name: "out", position: "x-max",
//                       slots: data(penguins).flow(partition({ by: massBins })) })
//             .name("violin")
//         ),
//       chart(penguins).mark(
//         rect({ w: 14, h: field("mass").count() })
//           .anchor({ name: "in", position: "x-min",
//                     slots: data().flow(stack({ by: massBins, size: field("mass").count() })) })
//           .name("bar")
//       ),
//     ]),
//     chart(penguins)
//       .flow(group({ by: massBins }))
//       .mark(ribbon({ from: "violin.out", to: "bar.in", fill: massBins, opacity: 0.55 })),
//   ])
// EMULATION (anchors.ts is not used: these slots are not a stack):
// - The violin and its `out` slots are ONE chart of rects (density samples
//   with h 0, slots with w 0) so they share the mass scale; the violin is a
//   ribbon through the samples. Two charts in one layer did not share it.
// - The y scale includes 0, so positions are mass above the minimum.
// - scatter centers a mark on its y, so a slot's y is its cell's middle.
// - The violin grows left by a negative `w` (no `align` on ribbon today).
// - The bar's sizes are written in mass units (share x the violin's span),
//   because the bar's chart shares the violin's y scale in the spread.
// - The bar's segments double as its `in` slots (as the FrankenSankey
//   countries do); the KDE is computed by hand, with cells and edges too.
const MASS = "Body Mass (g)";
const massRows = penguins.filter((p) => p[MASS] !== null).map((p) => ({ mass: p[MASS] as number }));
// Bin.thresholds([3000, 4000, 5000, 6000]) over the domain [2700, 6300]: the
// domain's ends are the outer edges. (Bin.thresholds(5) would give round
// outer edges 2000 and 7000, past the violin's ends.)
const MASS_EDGES = [2700, 3000, 4000, 5000, 6000, 6300];
const bucketOf = (m: number) => {
  for (let i = 0; i < MASS_EDGES.length - 2; i++) if (m < MASS_EDGES[i + 1]) return i;
  return MASS_EDGES.length - 2;
};
const BUCKETS = MASS_EDGES.slice(0, -1).map((lo, i) => `${lo}–${MASS_EDGES[i + 1]}`);
const gaussianKde = (xs: number[], bw: number) => (x: number) =>
  xs.reduce((s, v) => s + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0) / (xs.length * bw * Math.sqrt(2 * Math.PI));
export const HalfViolin: StoryObj = {
  name: "Half Violin",
  render: () =>
    show((c) => {
      const f = gaussianKde(
        massRows.map((r) => r.mass),
        200
      );
      const lo0 = MASS_EDGES[0];
      // The violin's density samples, cut at the bin edges so each cell is
      // its own band. `y` is mass above the minimum (EMULATION: the y scale
      // starts at 0). `w` is negative so the violin grows to the left of its
      // flat side.
      const samples = BUCKETS.flatMap((bucket, i) => {
        const lo = MASS_EDGES[i];
        const hi = MASS_EDGES[i + 1];
        const n = Math.max(4, Math.round((hi - lo) / 50));
        return Array.from({ length: n + 1 }, (_, k) => {
          const mass = lo + ((hi - lo) * k) / n;
          return { kind: "sample", key: `${bucket}/${k}`, bucket, y: mass - lo0, w: -f(mass) * 1e6, h: 0 };
        });
      });
      // The violin's `out` slots: one per cell of the bin, laid at the cell's
      // own place on the mass axis, with the cell's extent as its length.
      const out = BUCKETS.map((bucket, i) => ({
        kind: "slot",
        key: bucket,
        bucket,
        y: (MASS_EDGES[i] + MASS_EDGES[i + 1]) / 2 - lo0, // scatter centers a mark on y
        w: 0,
        h: MASS_EDGES[i + 1] - MASS_EDGES[i],
        pair: bucket,
        end: 0,
      }));
      // The bar's `in` slots: stacked by cell, sized by the cell's share of
      // the penguins. EMULATION: the share is written in mass units (share x
      // the violin's extent) because both charts share one y scale.
      const span = MASS_EDGES[MASS_EDGES.length - 1] - lo0;
      const bar = BUCKETS.map((bucket, i) => {
        const n = massRows.filter((r) => bucketOf(r.mass) === i).length;
        return { kind: "slot", bucket, share: n / massRows.length, size: (n / massRows.length) * span, pair: bucket, end: 1 };
      });
      return layer([
        spread({ dir: "x", spacing: 160, alignment: "start" }, [
          // The violin and its slots are ONE chart, so they share the y scale.
          chart([...samples, ...out], { axes: false })
            .flow(scatter({ by: "key", y: "y", h: 300 }))
            .mark(rect({ w: "w", h: "h", fill: "bucket" }).name("slots")),
          chart(bar, { axes: false })
            .flow(stack({ by: field("bucket").sort(BUCKETS), dir: "y", h: 300 }))
            .mark(rect({ w: 14, h: "size", fill: "bucket" }).name("slots")),
        ]),
        chart(selectAll("slots"))
          .flow(filter((r: any) => project(r, "kind") === "sample"))
          .mark(ribbon({ dir: "y", fill: "#c4c4c4", opacity: 1 } as any)),
        chart(selectAll("slots"))
          .flow(...pairSlots())
          .mark(ribbon({ fill: "bucket", opacity: 0.55, curve: Curve.bezier() })),
        // Labels to the right of the bar: the cell and its share.
        chart(selectAll("slots"))
          .flow(filter((r: any) => project(r, "end") === 1))
          .mark(((refs: any[]) =>
            layer(
              refs.map((r: any) => {
                const d = r.datum[0];
                const t = text({ text: `${d.bucket} g   ${Math.round(d.share * 100)}%`, fontSize: 10, fill: "#333" });
                return spread({ dir: "x", spacing: 6, alignment: "middle" }, [r, t]);
              })
            )) as any),
      ]).render(c, { w: 420, h: 320, axes: false, legend: false } as any);
    }),
};

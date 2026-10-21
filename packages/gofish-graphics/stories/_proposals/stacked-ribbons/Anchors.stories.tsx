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
} from "../../../src/lib";
import { clock } from "../../../src/ast/coordinateTransforms/clock";
// THROWAWAY prototype; not part of the public API.
import { chordRibbon } from "../../../src/ast/graphicalOperators/_proposalChordRibbon";
import { anchorSlots } from "./anchors";
import { sankeyDepths, orderColumns } from "./sankeyPrep";
import { asylumLinks, asylumCountries, frankenEnds, schoolLinks, beatlesLinks, beatlesSongs } from "./HardRefs.stories";
import { names as hairNames, matrix as hairMatrix } from "./Chord.stories";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Anchors" };
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
const DAYS = ["TUE", "WED", "THU", "FRI", "SAT", "SUN", "MON"];
const EMOTIONS = ["peaceful", "stressed", "funny", "diffident", "trusted"];
const SCHOOL = Color.palette({ peaceful: "#e9c95b", stressed: "#b98bc9", funny: "#ee9f85", diffident: "#8fcf86", trusted: "#9fcbd8" });
export const SchoolDays: StoryObj = {
  render: () =>
    show((c) => {
      const rowId = (r: any) => `${r.day}/${r.emotion}`;
      const days = anchorSlots({
        nodes: DAYS.map((day) => ({ day })),
        nodeKey: (n) => n.day,
        anchors: [
          {
            name: "emotions",
            rows: (n) => schoolLinks.filter((l) => l.day === n.day),
            slotBy: (r) => r.emotion,
            size: (rs) => sum(rs, "count"),
            // far position of the emotion node (= its index in the row)
            order: (_n, rs) => [EMOTIONS.indexOf(rs[0].emotion)],
            pair: (rs) => rs.map(rowId).join(","),
            end: 0,
            fields: (rs) => ({ color: rs[0].emotion }),
          },
        ],
      }).slots;
      const emos = anchorSlots({
        nodes: EMOTIONS.map((emotion) => ({ emotion })),
        nodeKey: (n) => n.emotion,
        anchors: [
          {
            name: "days",
            rows: (n) => schoolLinks.filter((l) => l.emotion === n.emotion),
            slotBy: (r) => r.day,
            size: (rs) => sum(rs, "count"),
            order: (_n, rs) => [DAYS.indexOf(rs[0].day)],
            pair: (rs) => rs.map(rowId).join(","),
            end: 1,
            fields: (rs) => ({ color: rs[0].emotion }),
          },
        ],
      }).slots;
      return layer([
        spread({ dir: "y", spacing: 200, alignment: "middle" }, [
          chart(days, { axes: false })
            .flow(
              spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60, alignment: "start", axes: false }),
              spread({ by: field("slot").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: "value", h: 4, fill: "#555" }).name("slots")),
          chart(emos, { color: SCHOOL, axes: false })
            .flow(
              spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50, alignment: "start", axes: false }),
              spread({ by: field("slot").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: "value", h: 90, fill: "color", opacity: 0.85 } as any).name("slots")),
        ]),
        chart(selectAll("slots"))
          .flow(...pairSlots())
          .mark(ribbon({ fill: "color", opacity: 0.6, dir: "y", curve: Curve.bezier() } as any)),
      ]).render(c, { w: 760, h: 420, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 3. FrankenSankey (S1: the bar and the countries are drawn from the links)
// ===========================================================================
// Target:
//   layer([
//     spread({ dir: "x", spacing: 150, alignment: "end" }, [
//       spread({ dir: "x", spacing: 0, alignment: "end" }, [
//         chart(years)                               // { year, decision, value }
//           .flow(spread({ by: "year", dir: "x", spacing: 22 }), stack({ by: "decision", dir: "y" }))
//           .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
//         chart(links)                               // { country, decision, value }: ONE bar
//           .mark(rect({ w: 14, h: "value" })
//             .anchor("out", { at: "right" },
//               chart().flow(stack({ by: field("decision").sort(DECISIONS) }), stack({ by: "country" }))
//                      .mark(blank({ h: "value" })))),
//       ]),
//       chart(links)
//         .flow(spread({ by: "country", dir: "y", spacing: 6 }))
//         .mark(rect({ w: 14, h: "value" })
//           .anchor("in", { at: "left" },
//             chart().flow(stack({ by: field("decision").sort(DECISIONS) })).mark(blank({ h: "value" })))),
//     ]),
//     chart(selectAll("area")).flow(group({ by: "decision" })).mark(ribbon({ fill: "decision" })),
//     chart(selectAll(["out", "in"])).mark(ribbon({ fill: "decision", opacity: 0.55 })),
//   ])
const DECISIONS = ["Accepted", "Rejected"];
const COUNTRIES = asylumCountries.map((c) => c.country);
const FT = Color.palette({ Accepted: "#f27fae", Rejected: "#1f4f87" });
export const FrankenSankey: StoryObj = {
  render: () =>
    show((c) => {
      const rowId = (r: any) => `${r.country}/${r.decision}`;
      const bar = anchorSlots({
        nodes: [{ nk: "2017" }],
        nodeKey: (n) => n.nk,
        anchors: [
          {
            name: "out",
            rows: () => asylumLinks,
            slotBy: (r) => `${r.decision}|${r.country}`,
            size: (rs) => sum(rs, "value"),
            order: (_n, rs) => [rs[0].di, rs[0].ci], // the anchor flow's own stack order
            pair: (rs) => rs.map(rowId).join(","),
            end: 0,
            fields: (rs) => ({ decision: rs[0].decision }),
          },
        ],
      }).slots;
      const countries = anchorSlots({
        nodes: COUNTRIES.map((country) => ({ country })),
        nodeKey: (n) => n.country,
        anchors: [
          {
            name: "in",
            rows: (n) => asylumLinks.filter((l) => l.country === n.country),
            slotBy: (r) => r.decision,
            size: (rs) => sum(rs, "value"),
            order: (_n, rs) => [rs[0].di],
            pair: (rs) => rs.map(rowId).join(","),
            end: 1,
            fields: (rs) => ({ decision: rs[0].decision }),
          },
        ],
      }).slots;
      const areaRows = frankenEnds.filter((e) => e.kind === "area");
      return layer([
        spread({ dir: "x", spacing: 150, alignment: "end" }, [
          spread({ dir: "x", spacing: 0, alignment: "end" }, [
            chart(areaRows, { color: FT, axes: false })
              .flow(
                spread({ by: field("col").sort(), dir: "x", spacing: 22, alignment: "end" }),
                spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
              )
              .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
            chart(bar, { axes: false })
              .flow(spread({ by: field("slot").sort(), dir: "y", spacing: 0 }))
              .mark(rect({ w: 14, h: "value", fill: "decision" }).name("slots")),
          ]),
          chart(countries, { axes: false })
            .flow(
              spread({ by: field("country").sort(COUNTRIES), dir: "y", spacing: 6, axes: false }),
              spread({ by: field("slot").sort(), dir: "y", spacing: 0, axes: false })
            )
            .mark(rect({ w: 14, h: "value", fill: "decision" }).name("slots")),
        ]),
        chart(selectAll("area"))
          .flow(sortRefs((r) => project(r, "col") as number), group({ by: "decision" }))
          .mark(ribbon({ fill: "decision", opacity: 1 })),
        chart(selectAll("slots"))
          .flow(...pairSlots())
          .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 320, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 3b. FrankenSankey without the bar: the area's own 2017 cells carry `out`
// ===========================================================================
// Target:
//   // years: { year, decision, value }   links (2017): { year, country, decision, value }
//   layer([
//     spread({ dir: "x", spacing: 150, alignment: "end" }, [
//       chart(years)
//         .flow(spread({ by: "year", dir: "x", spacing: 22 }), stack({ by: "decision", dir: "y" }))
//         .mark(rect({ w: 0, h: "value", fill: "decision" })
//           .anchor({ name: "out", position: "x-max",
//                     slots: data(links, { on: ["year", "decision"] }).flow(stack({ size: "value" })) })
//           .name("area")),
//       chart(links)
//         .flow(spread({ by: "country", dir: "y", spacing: 6 }))
//         .mark(rect({ w: 14, h: "value" })
//           .anchor({ name: "in", position: "x-min", slots: data().flow(stack({ by: "decision", size: "value" })) })
//           .name("countries")),
//     ]),
//     chart(selectAll("area")).flow(group({ by: "decision" })).mark(ribbon({ fill: "decision" })),
//     chart(links).mark(ribbon({ from: "area.out", to: "countries.in", fill: "decision", opacity: 0.55 })),
//   ])
// Only the two 2017 cells match link rows, so only they get slots. The
// `stack` in `out` has no `by`, so its order is the default: the far end's
// placed position (emulated by the country's rank `ci`).
// EMULATION: the slots of the two 2017 cells are drawn as a second chart of
// zero-width rects laid at the area's right end (spread spacing 0), so they
// sit exactly on the 2017 column. The 2017 cells use the exact link sums so
// the slots fill them with no slack.
export const FrankenSankeyNoBar: StoryObj = {
  name: "FrankenSankey No Bar",
  render: () =>
    show((c) => {
      const rowId = (r: any) => `${r.country}/${r.decision}`;
      const cellValue = (d: string) => sum(asylumLinks.filter((l) => l.decision === d), "value");
      const areaRows = frankenEnds
        .filter((e) => e.kind === "area")
        .map((e) => (e.col === 2017 ? { ...e, value: cellValue(e.decision) } : e));
      // The area cells that match link rows on (year, decision): the 2017 ones.
      const cells2017 = areaRows.filter((e) => e.col === 2017);
      const out = anchorSlots({
        nodes: cells2017,
        nodeKey: (n) => `${n.col}/${n.decision}`,
        nodeValue: (n) => n.value,
        anchors: [
          {
            name: "out",
            rows: (n) => asylumLinks.filter((l) => l.decision === n.decision),
            size: (rs) => sum(rs, "value"),
            order: (_n, rs) => [rs[0].ci], // far-position default, by proxy rank
            pair: (rs) => rs.map(rowId).join(","),
            end: 0,
          },
        ],
      });
      const countries = anchorSlots({
        nodes: COUNTRIES.map((country) => ({ country })),
        nodeKey: (n) => n.country,
        anchors: [
          {
            name: "in",
            rows: (n) => asylumLinks.filter((l) => l.country === n.country),
            slotBy: (r) => r.decision,
            size: (rs) => sum(rs, "value"),
            order: (_n, rs) => [rs[0].di],
            pair: (rs) => rs.map(rowId).join(","),
            end: 1,
            fields: (rs) => ({ decision: rs[0].decision }),
          },
        ],
      });
      [...out.report, ...countries.report].forEach((m) => console.warn(m));
      return layer([
        spread({ dir: "x", spacing: 150, alignment: "end" }, [
          spread({ dir: "x", spacing: 0, alignment: "end" }, [
            chart(areaRows, { color: FT, axes: false })
              .flow(
                spread({ by: field("col").sort(), dir: "x", spacing: 22, alignment: "end" }),
                spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
              )
              .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
            // The `out` slots of the 2017 cells, stacked in the cells' order.
            chart(out.slots, { axes: false })
              .flow(
                spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false }),
                spread({ by: field("slot").sort(), dir: "y", spacing: 0, axes: false })
              )
              .mark(rect({ w: 0, h: "value", fill: "decision" }).name("slots")),
          ]),
          chart(countries.slots, { axes: false })
            .flow(
              spread({ by: field("country").sort(COUNTRIES), dir: "y", spacing: 6, axes: false }),
              spread({ by: field("slot").sort(), dir: "y", spacing: 0, axes: false })
            )
            .mark(rect({ w: 14, h: "value", fill: "decision" }).name("slots")),
        ]),
        chart(selectAll("area"))
          .flow(sortRefs((r) => project(r, "col") as number), group({ by: "decision" }))
          .mark(ribbon({ fill: "decision", opacity: 1 })),
        chart(selectAll("slots"))
          .flow(...pairSlots())
          .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 320, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 4. Chord with gaps between the ends of a group (S1: groups from cells)
// ===========================================================================
// Target, reused names:
//   chart(cells, { coord: Coord.clock() })            // { from, to, value }: the N x N matrix
//     .flow(spread({ by: field("from").sort(NAMES), dir: "x", spacing: 0.04, y: 160, h: 16 }))
//     .mark(rect({ w: "value", fill: "from" })
//       .anchor("ends", { at: "bottom" },
//         chart().flow(spread({ by: "to", spacing: 0.01 })).mark(blank({ w: "value" }))))
//     .layer(ribbon({ by: chordPair, curve: Curve.chord(), fill: "lead", opacity: 0.67 }))
//   // chordPair = (r) => [r.from, r.to].sort().join("-"): cell (i, j) and cell (j, i)
//   // are different rows, so the shared-row rule cannot pair them.
// Target, dedicated names:
//     .mark(rect({ w: "value", fill: "from" })
//       .anchor("ends", { at: "bottom" },
//         slots().flow(spread({ by: "to", spacing: 0.01 })).mark(slot({ size: "value" }))))
export const Chord: StoryObj = {
  render: () =>
    show((c) => {
      const N = hairNames.length;
      const cells = hairNames.flatMap((from, i) =>
        hairNames.map((to, j) => ({ from, to, i, j, value: hairMatrix[i][j] }))
      );
      const total = cells.reduce((a, r) => a + r.value, 0);
      const { slots } = anchorSlots({
        nodes: hairNames.map((name, i) => ({ name, i })),
        nodeKey: (n) => n.name,
        anchors: [
          {
            name: "ends",
            rows: (n) => cells.filter((r) => r.i === n.i),
            slotBy: (r) => r.to,
            size: (rs) => rs[0].value,
            // cyclic far position, measured clockwise from this group
            order: (n, rs) => [-((rs[0].j - n.i + N) % N)],
            gap: total * 0.01, // the in-group spacing (d3 ribbon.padAngle)
            pair: (rs) => [rs[0].i, rs[0].j].sort().join("-"), // chordPair
            fields: (rs) => {
              const { i, j } = rs[0];
              return { lead: hairMatrix[i][j] >= hairMatrix[j][i] ? hairNames[i] : hairNames[j] };
            },
          },
        ],
      });
      const rows = [
        ...slots,
        // the between-group spacing (a polar spread does not close; gap rows)
        ...hairNames.map((name) => ({ name, node: name, slot: 2e6, value: total * 0.03, kind: "between", lead: name })),
      ];
      return layer({ coord: clock() }, [
        chart(rows)
          .flow(
            stack({ by: field("node").sort(hairNames), dir: "x", y: 160, h: 16, axes: false }),
            stack({ by: field("slot").sort(), dir: "x", axes: false })
          )
          .mark(
            rect({
              w: "value",
              h: (d: any) => (d.kind === "between" ? 0 : 16),
              fill: "name",
              opacity: (d: any) => (d.kind === "gap" ? 0.45 : 1),
            } as any).name("slots")
          ),
        chart(selectAll("slots"))
          .flow(filter((r: any) => project(r, "kind") === "slot"), group({ by: "pair" }))
          .mark(chordRibbon({ fill: "lead", opacity: 0.67 } as any)),
      ]).render(c, { w: 420, h: 420, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 5. Beatles (S2: writers table + credits table; point slots)
// ===========================================================================
// Target:
//   layer([
//     spread({ dir: "y", spacing: 260 }, [
//       chart(songs)                                 // { song }
//         .flow(spread({ by: "song", dir: "x", spacing: 18 }))
//         .mark(circle({ r: 2 }).name("songs")),
//       chart(writers)                               // { writer }
//         .flow(spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90 }))
//         .mark(ellipse({ w: 70, h: 44, fill: "writer", opacity: 0.35 })
//           .anchor("credits", { at: "top" }, chart().flow(spread({ spacing: 3 })).mark(blank()))
//           .name("writers")),
//     ]),
//     chart(credits)                                 // { song, writer }
//       .flow(resolve(["song"], { from: selectAll("songs") }), resolve(["writer"], { from: selectAll("writers") }))
//       .mark(line({ from: "song", to: "writer.credits", stroke: "writer" })),
//   ])
const WRITERS = ["Lennon", "McCartney", "Harrison", "Starr"];
const BEATLES = Color.palette({ Lennon: "#ff7f0e", McCartney: "#2ca02c", Harrison: "#1f77b4", Starr: "#d62728" });
export const Beatles: StoryObj = {
  render: () =>
    show((c) => {
      const songIdx = new Map(beatlesSongs.map((s, i) => [s.song, i]));
      const rowId = (r: any) => r.link;
      // A song has no anchor: every line ends at the circle's center (a
      // point slot per row, size 0).
      const songs = anchorSlots({
        nodes: beatlesSongs.map((s, si) => ({ song: s.song, si })),
        nodeKey: (n) => n.song,
        anchors: [
          {
            name: "center",
            rows: (n) => beatlesLinks.filter((l) => l.song === n.song),
            size: () => 0,
            order: (_n, rs) => [WRITERS.indexOf(rs[0].writer)],
            pair: (rs) => rowId(rs[0]),
            end: 0,
            fields: (rs) => ({ color: rs[0].writer }),
          },
        ],
      }).slots;
      const heads = anchorSlots({
        nodes: WRITERS.map((writer) => ({ writer })),
        nodeKey: (n) => n.writer,
        anchors: [
          {
            // the rows that reference this writer through `writer` (S2)
            name: "credits",
            rows: (n) => beatlesLinks.filter((l) => l.writer === n.writer),
            size: () => 1, // blank(): a point; emulated as a 1 px slot
            order: (_n, rs) => [songIdx.get(rs[0].song)!], // far position
            pair: (rs) => rowId(rs[0]),
            end: 1,
            fields: (rs) => ({ color: rs[0].writer }),
          },
        ],
      }).slots;
      return layer([
        spread({ dir: "y", spacing: 260, alignment: "middle" }, [
          chart(songs, { color: BEATLES, axes: false })
            .flow(
              spread({ by: field("si").sort(), dir: "x", spacing: 18, alignment: "start", axes: false }),
              spread({ by: field("slot").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: 0, h: 3, fill: "color" }).name("slots")),
          chart(heads, { axes: false })
            .flow(
              spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90, alignment: "start", axes: false }),
              spread({ by: field("slot").sort(), dir: "x", spacing: 3, axes: false }) // spread({ spacing: 3 })
            )
            .mark(rect({ w: 1, h: 3, fill: "color" }).name("slots")),
        ]),
        chart(selectAll("slots"))
          .flow(...pairSlots())
          .mark(line({ stroke: "color", strokeWidth: 1.5, dir: "y", curve: Curve.bezier() } as any)),
        // the head: in the emulation it encloses its slots (grows to fit)
        chart(selectAll("slots"))
          .flow(filter((r: any) => project(r, "anchor") === "credits"), group({ by: "writer" }))
          .mark(enclose({ shape: Shape.oval(), padding: 16, fill: "writer", stroke: "writer", fillOpacity: 0.35 } as any)),
      ]).render(c, { w: 820, h: 420, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 7. Sankey tree (S1: tree nodes drawn from the leaf rows)
// ===========================================================================
// Target:
//   chart(titanic)                                   // leaf rows { class, sex, survived, count }
//     .flow(
//       spread({ by: "class", dir: "y", spacing: 8 }),
//       derive(levels(["sex", "survived"])),          // one copy of the rows per depth, with `child`
//       spread({ by: "depth", dir: "x", spacing: 64, alignment: "middle" }),
//       spread({ by: "sex", dir: "y", spacing: 4 }),  // "" above its depth
//       spread({ by: "survived", dir: "y", spacing: 2 })
//     )
//     .mark(rect({ w: 40, h: "count", fill: "class" })
//       .anchor("in",  { at: "left" },  chart().mark(blank({ h: "count" })))
//       .anchor("out", { at: "right" }, chart().flow(stack({ by: "child" })).mark(blank({ h: "count" }))))
//     .layer(ribbon({ from: "out", to: "in", fill: "child", opacity: 0.6 }))  // slots holding the same rows
const CLASSES = ["First", "Second", "Third", "Crew"];
const SEXES = ["Female", "Male"];
const SURV = ["Yes", "No"];
const TREE = Color.palette({ First: "#3f8fc8", Second: "#f2cf59", Third: "#a184c8", Crew: "#ff9666", Yes: "#4cbf87", No: "#d9628a", Female: "#bbb", Male: "#bbb" });
export const SankeyTree: StoryObj = {
  render: () =>
    show((c) => {
      // levels(): node = (depth, key path); its rows are the leaf rows under it.
      const keys = ["class", "sex", "survived"];
      const tNodes: any[] = [];
      for (let depth = 0; depth < 3; depth++) {
        const seen = new Map<string, any>();
        for (const r of titanic as any[]) {
          const path = keys.slice(0, depth + 1).map((k) => r[k]);
          const key = path.join("/");
          if (!seen.has(key))
            seen.set(key, { key, depth, class: r.class, sub: depth >= 1 ? r.sex : "", leaf: depth >= 2 ? r.survived : "", path });
        }
        tNodes.push(...seen.values());
      }
      const under = (n: any) => (titanic as any[]).filter((r) => n.path.every((v: string, i: number) => r[keys[i]] === v));
      // Far-position proxy: tree order (class, sex, survived in sort order).
      const ORD = [CLASSES, SEXES, SURV];
      const rank = new Map(
        tNodes.map((n) => [n.key, n.path.reduce((a: number, v: string, i: number) => a * 10 + ORD[i].indexOf(v) + 1, 0) * 10 ** (2 - n.depth)])
      );
      // S1 pairing: two slots holding the same rows are one ribbon.
      const rowsKey = (rs: any[]) => rs.map((r) => (titanic as any[]).indexOf(r)).join(",");
      const { slots } = anchorSlots({
        nodes: tNodes,
        nodeKey: (n) => n.key,
        nodeValue: (n) => sum(under(n), "count"),
        anchors: [
          {
            name: "in",
            rows: (n) => under(n),
            slotBy: () => "", // chart().mark(blank(...)) with no flow: ONE slot over all rows
            size: (rs) => sum(rs, "count"),
            pair: (rs, n) => (n.depth === 0 ? "root:" + n.key : rowsKey(rs)), // a root has no partner
            end: 1,
          },
          {
            name: "out",
            rows: (n) => (n.depth === 2 ? [] : under(n)), // a leaf has no child key
            slotBy: (r, n) => r[keys[n.depth + 1]], // stack({ by: "child" })
            size: (rs) => sum(rs, "count"),
            // far position: the child node's placed order
            order: (n, rs) => [rank.get([...n.path, rs[0][keys[n.depth + 1]]].join("/"))!],
            pair: (rs) => rowsKey(rs),
            end: 0,
            fields: (rs, n) => ({ color: n.depth === 0 ? rs[0].class : rs[0].survived }),
          },
        ],
      });
      return layer([
        chart(slots, { color: TREE })
          .flow(
            spread({ by: field("class").sort(CLASSES), dir: "y", spacing: 8, axes: false }),
            spread({ by: field("depth").sort(), dir: "x", spacing: 64, alignment: "middle", axes: false }),
            spread({ by: field("sub").sort(["", ...SEXES]), dir: "y", spacing: 4, axes: false }),
            spread({ by: field("leaf").sort(["", ...SURV]), dir: "y", spacing: 2, axes: false }),
            spread({ by: field("anchor").sort(["in", "out"]), dir: "x", spacing: 0, alignment: "start", axes: false }),
            spread({ by: field("slot").sort(), dir: "y", spacing: 0, axes: false })
          )
          .mark(rect({ w: 20, h: "value", fill: "class" }).name("slots")),
        chart(selectAll("slots"))
          .flow(
            filter((r: any) => !String(project(r, "pair")).startsWith("root:")),
            ...pairSlots()
          )
          .mark(ribbon({ fill: "color", opacity: 0.6, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 520, axes: false, legend: false } as any);
    }),
};

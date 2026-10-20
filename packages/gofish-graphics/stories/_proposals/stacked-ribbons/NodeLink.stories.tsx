// The "node-link" approach (the ribbon allocates its own ends), EMULATED by
// rewriting the links into an ends table (nodeLink.ts). Every story's header
// comment gives the hypothetical target spelling; the code renders the same
// picture with today's API. See proposals/stacked-ribbons/NOTES-nodelink.md.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { titanic } from "../../../src/data/titanic";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  line,
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
// THROWAWAY prototype (see the file header); not part of the public API.
import { chordRibbon } from "../../../src/ast/graphicalOperators/_proposalChordRibbon";
import { nodeLinkEnds } from "./nodeLink";
import {
  asylumLinks,
  asylumCountries,
  frankenEnds,
  schoolLinks,
  beatlesLinks,
  beatlesSongs,
} from "./HardRefs.stories";
import { names as hairNames, matrix as hairMatrix } from "./Chord.stories";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Node Link" };
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
/** The ribbon layer over an ends table: ports only, from-end first. */
const linkRefs = () => [
  filter((r: any) => project(r, "port") === true),
  sortRefs((r) => (project(r, "side") === "from" ? 0 : 1)),
  group({ by: "link" }),
];

// ===========================================================================
// 2. Sankey tree with nested gaps (8 / 4 / 2)
// ===========================================================================
// Target:
//   layer([
//     chart(treeNodes)            // { key, depth, class, sub, leaf, count }
//       .flow(spread({ by: "class", dir: "y", spacing: 8 }),     // a class band holds its subtree
//             spread({ by: "depth", dir: "x", spacing: 64, alignment: "middle" }),
//             spread({ by: "sub", dir: "y", spacing: 4 }),
//             spread({ by: "leaf", dir: "y", spacing: 2 }))
//       .mark(rect({ w: 40, h: "count", fill: "class" }).name("nodes")),
//     chart(treeLinks)            // { source, target, value, color }
//       .flow(resolve(["source", "target"], { from: selectAll("nodes"), key: "key" }))
//       .mark(ribbon({ from: "source", to: "target", size: "value", fill: "color", opacity: 0.6 })),
//   ])
const CLASSES = ["First", "Second", "Third", "Crew"];
const SEXES = ["Female", "Male"];
const SURV = ["Yes", "No"];
type TNode = { key: string; depth: number; class: string; sub: string; leaf: string; count: number };
const treeNodes: TNode[] = [];
const treeLinks: { source: string; target: string; value: number; color: string }[] = [];
const total = (f: (r: any) => boolean) => titanic.filter(f).reduce((a, r) => a + r.count, 0);
for (const c of CLASSES) {
  treeNodes.push({ key: c, depth: 0, class: c, sub: "", leaf: "", count: total((r) => r.class === c) });
  for (const s of SEXES) {
    const k1 = `${c}/${s}`;
    const n1 = total((r) => r.class === c && r.sex === s);
    treeNodes.push({ key: k1, depth: 1, class: c, sub: s, leaf: "", count: n1 });
    treeLinks.push({ source: c, target: k1, value: n1, color: c });
    for (const v of SURV) {
      const k2 = `${k1}/${v}`;
      const n2 = total((r) => r.class === c && r.sex === s && r.survived === v);
      if (n2 === 0) continue;
      treeNodes.push({ key: k2, depth: 2, class: c, sub: s, leaf: v, count: n2 });
      treeLinks.push({ source: k1, target: k2, value: n2, color: v });
    }
  }
}
// Far-position proxy: the far node's rank in tree order (= its placed y).
const treeRank = new Map(treeNodes.map((n, i) => [n.key, i]));
const TREE = Color.palette({
  First: "#3f8fc8",
  Second: "#f2cf59",
  Third: "#a184c8",
  Crew: "#ff9666",
  Yes: "#4cbf87",
  No: "#d9628a",
});

export const SankeyTree: StoryObj = {
  render: () =>
    show((c) => {
      const { ends } = nodeLinkEnds({
        nodes: treeNodes,
        nodeKey: (n) => n.key,
        nodeValue: (n) => n.count,
        links: treeLinks,
        from: (l) => l.source,
        to: (l) => l.target,
        size: { from: (l) => l.value, to: (l) => l.value },
        far: (_h, f) => treeRank.get(f)!,
        slack: true,
        linkFields: (l) => ({ color: l.color }),
      });
      return layer([
        chart(ends, { color: TREE })
          .flow(
            spread({ by: field("class").sort(CLASSES), dir: "y", spacing: 8, axes: false }),
            spread({ by: field("depth").sort(), dir: "x", spacing: 64, alignment: "middle", axes: false }),
            spread({ by: field("sub").sort(["", ...SEXES]), dir: "y", spacing: 4, axes: false }),
            spread({ by: field("leaf").sort(["", ...SURV]), dir: "y", spacing: 2, axes: false }),
            // the node mark's place: the ends along each face
            spread({ by: field("part").sort(["in", "out"]), dir: "x", spacing: 0, alignment: "start", axes: false }),
            spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
          )
          .mark(rect({ w: 20, h: "value", fill: "class" }).name("ports")),
        chart(selectAll("ports"))
          .flow(...linkRefs())
          .mark(ribbon({ fill: "color", opacity: 0.6, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 520, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 3. School days: two node rows, each its own chart
// ===========================================================================
// Target:
//   layer([
//     spread({ dir: "y", spacing: 200 }, [
//       chart(links)
//         .flow(spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60 }))
//         .mark(rect({ w: "count", h: 4 }).name("nodes")),          // w sums the day's links
//       chart(links)
//         .flow(spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50 }))
//         .mark(rect({ w: "count", h: 90, fill: "emotion" }).name("nodes")),
//     ]),
//     chart(links)                 // { day, emotion, count }
//       .flow(resolve(["day", "emotion"], { from: selectAll("nodes") }))
//       .mark(ribbon({ from: "day", to: "emotion", size: "count", dir: "y", fill: "emotion", opacity: 0.6 })),
//   ])
const DAYS = ["TUE", "WED", "THU", "FRI", "SAT", "SUN", "MON"];
const EMOTIONS = ["peaceful", "stressed", "funny", "diffident", "trusted"];
const SCHOOL = Color.palette({
  peaceful: "#e9c95b",
  stressed: "#b98bc9",
  funny: "#ee9f85",
  diffident: "#8fcf86",
  trusted: "#9fcbd8",
});
export const SchoolDays: StoryObj = {
  render: () =>
    show((c) => {
      const nodes = [
        ...DAYS.map((d, i) => ({ nk: "d:" + d, day: d, rank: i })),
        ...EMOTIONS.map((e, i) => ({ nk: "e:" + e, emotion: e, rank: i })),
      ];
      const rank = new Map(nodes.map((n) => [n.nk, n.rank]));
      const { ends } = nodeLinkEnds({
        nodes,
        nodeKey: (n) => n.nk,
        links: schoolLinks,
        from: (l) => "d:" + l.day,
        to: (l) => "e:" + l.emotion,
        size: { from: (l) => l.count, to: (l) => l.count },
        far: (_h, f) => rank.get(f)!,
        linkFields: (l) => ({ color: l.emotion }),
      });
      const row = (side: string) => ends.filter((e) => e.side === side);
      return layer([
        spread({ dir: "y", spacing: 200, alignment: "middle" }, [
          chart(row("from"), { axes: false })
            .flow(
              spread({ by: field("day").sort(DAYS), dir: "x", spacing: 60, alignment: "start", axes: false }),
              spread({ by: field("key").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: "value", h: 4, fill: "#555" }).name("ports")),
          chart(row("to"), { color: SCHOOL, axes: false })
            .flow(
              spread({ by: field("emotion").sort(EMOTIONS), dir: "x", spacing: 50, alignment: "start", axes: false }),
              spread({ by: field("key").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: "value", h: 90, fill: "color", opacity: 0.85 } as any).name("ports")),
        ]),
        chart(selectAll("ports"))
          .flow(...linkRefs())
          .mark(ribbon({ fill: "color", opacity: 0.6, dir: "y", curve: Curve.bezier() } as any)),
      ]).render(c, { w: 760, h: 420, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 4. Beatles: lines, equal-size ends spread along each head
// ===========================================================================
// Target:
//   layer([
//     spread({ dir: "y", spacing: 260 }, [
//       chart(credits)
//         .flow(spread({ by: "song", dir: "x", spacing: 18 }))
//         .mark(circle({ r: 2 }).name("nodes")),
//       chart(credits)
//         .flow(spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90 }))
//         .mark(ellipse({ w: 70, h: 44, fill: "writer", opacity: 0.35 }).name("nodes")),
//     ]),
//     chart(credits)               // { song, writer }
//       .flow(resolve(["song", "writer"], { from: selectAll("nodes") }))
//       .mark(line({ from: "song", to: "writer", ends: { to: spread() }, stroke: "writer", dir: "y" })),
//   ])
const WRITERS = ["Lennon", "McCartney", "Harrison", "Starr"];
const BEATLES = Color.palette({ Lennon: "#ff7f0e", McCartney: "#2ca02c", Harrison: "#1f77b4", Starr: "#d62728" });
export const Beatles: StoryObj = {
  render: () =>
    show((c) => {
      const nodes = [
        ...beatlesSongs.map((s, i) => ({ nk: "s:" + s.song, si: i, rank: i })),
        ...WRITERS.map((w, i) => ({ nk: "w:" + w, writer: w, rank: i })),
      ];
      const rank = new Map(nodes.map((n) => [n.nk, n.rank]));
      const { ends } = nodeLinkEnds({
        nodes,
        nodeKey: (n) => n.nk,
        links: beatlesLinks,
        from: (l) => "s:" + l.song,
        to: (l) => "w:" + l.writer,
        // equal-size ends: a point at the song, one equal slot at the head
        size: { from: () => 0, to: () => 1 },
        far: (_h, f) => rank.get(f)!,
        linkFields: (l) => ({ color: l.writer }),
      });
      const row = (side: string) => ends.filter((e) => e.side === side);
      return layer([
        spread({ dir: "y", spacing: 260, alignment: "middle" }, [
          chart(row("from"), { color: BEATLES, axes: false })
            .flow(
              spread({ by: field("si").sort(), dir: "x", spacing: 18, alignment: "start", axes: false }),
              spread({ by: field("key").sort(), dir: "x", spacing: 0, axes: false })
            )
            .mark(rect({ w: 0, h: 3, fill: "color" }).name("ports")),
          chart(row("to"), { axes: false })
            .flow(
              spread({ by: field("writer").sort(WRITERS), dir: "x", spacing: 90, alignment: "start", axes: false }),
              // `spread()` of equal slots: constant px width + spacing
              spread({ by: field("key").sort(), dir: "x", spacing: 3, axes: false })
            )
            .mark(rect({ w: 1, h: 3, fill: "color" }).name("ports")),
        ]),
        chart(selectAll("ports"))
          .flow(...linkRefs())
          .mark(line({ stroke: "color", strokeWidth: 1.5, dir: "y", curve: Curve.bezier() } as any)),
        chart(selectAll("ports"))
          .flow(filter((r: any) => project(r, "side") === "to"), group({ by: "writer" }))
          .mark(enclose({ shape: Shape.oval(), padding: 16, fill: "writer", stroke: "writer", fillOpacity: 0.35 } as any)),
      ]).render(c, { w: 820, h: 420, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 5. FrankenSankey: the 2017 bar is ONE node; its ends are decision-first
// ===========================================================================
// Target:
//   layer([
//     spread({ dir: "x", spacing: 150, alignment: "end" }, [
//       spread({ dir: "x", spacing: 0, alignment: "end" }, [
//         chart(years)             // { year, decision, value }
//           .flow(spread({ by: "year", dir: "x", spacing: 22 }), stack({ by: "decision", dir: "y" }))
//           .mark(rect({ w: 0, h: "value", fill: "decision" }).name("area")),
//         chart([{ name: "2017", total: total2017 }])
//           .mark(rect({ w: 14, h: "total" }).name("nodes")),
//       ]),
//       chart(countries)           // { name, total }
//         .flow(spread({ by: "name", dir: "y", spacing: 6 }))
//         .mark(rect({ w: 14, h: "total" }).name("nodes")),
//     ]),
//     chart(selectAll("area")).flow(group({ by: "decision" })).mark(ribbon({ fill: "decision" })),
//     chart(links)                 // { source: "2017", target: country, decision, value }
//       .flow(resolve(["source", "target"], { from: selectAll("nodes"), key: "name" }))
//       .mark(ribbon({
//         from: "source", to: "target", size: "value", fill: "decision", opacity: 0.55,
//         ends: {
//           from: stack({ by: field("decision").sort(DECISIONS) }), // then far end
//           to: stack({ by: field("decision").sort(DECISIONS) }),   // both ends share a far node
//         },
//       })),
//   ])
const DECISIONS = ["Accepted", "Rejected"];
const COUNTRIES = asylumCountries.map((c) => c.country);
const FT = Color.palette({ Accepted: "#f27fae", Rejected: "#1f4f87" });
export const FrankenSankey: StoryObj = {
  render: () =>
    show((c) => {
      const links = asylumLinks.map((l) => ({ source: "2017", target: l.country, decision: l.decision, value: l.value }));
      const nodes = [{ nk: "2017", rank: 0 }, ...COUNTRIES.map((k, i) => ({ nk: k, country: k, rank: i }))];
      const rank = new Map(nodes.map((n) => [n.nk, n.rank]));
      const { ends } = nodeLinkEnds({
        nodes,
        nodeKey: (n) => n.nk,
        links,
        from: (l) => l.source,
        to: (l) => l.target,
        size: { from: (l) => l.value, to: (l) => l.value },
        far: (_h, f) => rank.get(f)!,
        // the override: at the bar, decision first, then the far country
        order: { from: (l) => [DECISIONS.indexOf(l.decision)] },
        linkFields: (l) => ({ decision: l.decision }),
      });
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
            chart(ends.filter((e) => e.side === "from"), { axes: false })
              .flow(spread({ by: field("key").sort(), dir: "y", spacing: 0 }))
              .mark(rect({ w: 14, h: "value", fill: "decision" }).name("ports")),
          ]),
          chart(ends.filter((e) => e.side === "to"), { axes: false })
            .flow(
              spread({ by: field("country").sort(COUNTRIES), dir: "y", spacing: 6, axes: false }),
              spread({ by: field("key").sort(), dir: "y", spacing: 0, axes: false })
            )
            .mark(rect({ w: 14, h: "value", fill: "decision" }).name("ports")),
        ]),
        chart(selectAll("area"))
          .flow(sortRefs((r) => project(r, "col") as number), group({ by: "decision" }))
          .mark(ribbon({ fill: "decision", opacity: 1 })),
        chart(selectAll("ports"))
          .flow(...linkRefs())
          .mark(ribbon({ fill: "decision", opacity: 0.55, curve: Curve.bezier() })),
      ]).render(c, { w: 420, h: 320, axes: false, legend: false } as any);
    }),
};

// ===========================================================================
// 6. Chord: asymmetric end sizes, both ends on the inner arc
// ===========================================================================
// Target:
//   layer({ coord: Coord.clock() }, [
//     chart(groups)                // { name, total }  (total = row sum)
//       .flow(spread({ by: field("name").sort(NAMES), dir: "x", spacing: 0.04, y: 160, h: 16 }))
//       .mark(rect({ w: "total", fill: "name" }).name("nodes")),
//     chart(pairs)                 // { a, b, ab, ba, lead }, a <= b, one row per pair
//       .flow(resolve(["a", "b"], { from: selectAll("nodes") }))
//       .mark(ribbon({ from: "a", to: "b", size: { from: "ab", to: "ba" }, at: "bottom",
//                      curve: Curve.chord(), fill: "lead", opacity: 0.67 })),
//   ])
export const Chord: StoryObj = {
  render: () =>
    show((c) => {
      const N = hairNames.length;
      const pairs: { a: string; b: string; ab: number; ba: number; lead: string }[] = [];
      for (let i = 0; i < N; i++)
        for (let j = i; j < N; j++)
          pairs.push({
            a: hairNames[i],
            b: hairNames[j],
            ab: hairMatrix[i][j],
            ba: hairMatrix[j][i],
            lead: hairMatrix[i][j] >= hairMatrix[j][i] ? hairNames[i] : hairNames[j],
          });
      const idx = new Map(hairNames.map((n, i) => [n, i]));
      const { ends } = nodeLinkEnds({
        nodes: hairNames.map((name) => ({ name })),
        nodeKey: (n) => n.name,
        links: pairs,
        from: (l) => l.a,
        to: (l) => l.b,
        size: { from: (l) => l.ab, to: (l) => l.ba },
        // cyclic far position: going clockwise along my arc, the partner
        // just counter-clockwise of me comes first, my clockwise neighbor
        // last, the self chord after it.
        far: (h, f) => -((idx.get(f)! - idx.get(h)! + N) % N),
        at: { from: "bottom", to: "bottom" },
        linkFields: (l) => ({ lead: l.lead }),
      });
      const gapSize = hairMatrix.flat().reduce((a, b) => a + b, 0) * 0.012;
      const rows = [
        ...ends.map((e) => ({ ...e, gap: false })),
        ...hairNames.map((name) => ({ name, key: 1e6, value: gapSize, gap: true, port: false, lead: name })),
      ];
      return layer({ coord: clock() }, [
        chart(rows)
          .flow(
            stack({ by: field("name").sort(hairNames), dir: "x", y: 160, h: 16, axes: false }),
            stack({ by: field("key").sort(), dir: "x", axes: false })
          )
          .mark(rect({ w: "value", h: (d: any) => (d.gap ? 0 : 16), fill: "name" } as any).name("ports")),
        chart(selectAll("ports"))
          .flow(filter((r: any) => project(r, "port") === true), group({ by: "link" }))
          .mark(chordRibbon({ fill: "lead", opacity: 0.67 } as any)),
      ]).render(c, { w: 420, h: 420, axes: false, legend: false } as any);
    }),
};

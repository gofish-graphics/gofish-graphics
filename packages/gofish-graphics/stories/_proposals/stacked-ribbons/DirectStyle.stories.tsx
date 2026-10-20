// Direct style (round 2): the syntax follows the data structure.
//   LIST (rows, groups)        -> a flow tier with `by`
//   RECORD (a fixed set of fields) -> the combinator form, one child per field
// See proposals/stacked-ribbons/NOTES.md, "Direct style (round 2)".
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { titanic } from "../../../src/data/titanic";
import { penguins } from "../../../src/data/penguins";
import { energy } from "../../../src/data/energy";
import {
  chart,
  spread,
  stack,
  rect,
  ribbon,
  selectAll,
  group,
  layer,
  field,
  scatter,
  circle,
  line,
  filter,
  derive,
  Curve,
} from "../../../src/lib";
import { ChartBuilder } from "../../../src/ast/marks/chartBuilder";
import { sankeyDepths, orderColumns } from "./sankeyPrep";

const meta: Meta = { title: "Proposals/Stacked Ribbons/Direct Style" };
export default meta;

/** Render, and print a thrown error above the (empty) picture. */
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

// ---------------------------------------------------------------------------
// Story-local helpers (EMULATION, not library API)
// ---------------------------------------------------------------------------

/** What `spread`'s combinator form would do if it passed its scope to an
 *  empty-scope `chart()` child, the way `layer([...])` already does
 *  (chart.ts `layer`: `m.usesPreviousLayerMarks() ? m.withData(d) : m`). */
const inherit = (children: any[]) =>
  children.map((m) =>
    m instanceof ChartBuilder && m.usesPreviousLayerMarks()
      ? (d: any) => m.withData(d)
      : m
  );

/** "Same datum = same ribbon": the key of a ref is the row it was drawn
 *  from. A `by` function receives the REF (not the row), and the ref's
 *  `.datum` is a bag, so the row is `datum[0]`. */
const sameRow = (r: any) => r.datum[0];

/** Polars-style multi-column expression, emulated: `cols([...])` stands for
 *  one column per name; `expand(cols, tmpl)` makes one child per column. */
type Cols = { __cols: string[] };
const cols = (names: string[]): Cols => ({ __cols: names });
const expand = (c: Cols, tmpl: (col: string) => any) =>
  inherit(c.__cols.map(tmpl));

/** `unnest(f)`: a node's list field as the child's data (emulates
 *  `chart(field("in"))`). Keeps the link objects themselves, so ribbon
 *  identity survives. */
const unnest = (f: string) =>
  derive((rows: any[]) => rows.flatMap((r) => r[f]));

/** dplyr `nest_join` / polars `group_by().agg(pl.all())`, emulated: give
 *  each node a list field holding the SAME link objects whose `key` is the
 *  node's name, in the order `sortBy` gives. */
const nestJoin = <N extends { name: string }, L>(
  nodes: N[],
  links: L[],
  fields: Record<string, { key: keyof L; sortBy?: (l: L) => number }>
) =>
  nodes.map((n) => {
    const out: any = { ...n };
    for (const [f, { key, sortBy }] of Object.entries(fields)) {
      const ls = links.filter((l) => (l[key] as unknown) === n.name);
      out[f] = sortBy ? ls.sort((a, b) => sortBy(a) - sortBy(b)) : ls;
    }
    return out;
  });

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const AXES = ["class", "sex", "survived"] as const;
// Ends inside a category ordered by the row's categories on the neighbor
// axes, nearest first (same crossing-reducer as Parallel Sets/Ranked).
// Stored on the row itself so every child reads the SAME row objects. The
// rank uses each axis's level index (first-appearance order, the order the
// category tier draws), so it agrees with the categories on the far axis.
const levels = Object.fromEntries(
  AXES.map((a) => [a, [...new Set(titanic.map((r) => r[a]))]])
) as Record<string, string[]>;
const titanicR = titanic.map((r) => {
  const row: any = { ...r };
  AXES.forEach((a, k) => {
    const order = [...AXES.slice(0, k).reverse(), ...AXES.slice(k + 1)];
    row[`rank_${a}`] = order.map((o) => levels[o].indexOf(r[o])).join("|");
  });
  return row;
});

const DIMS = [
  "Beak Length (mm)",
  "Beak Depth (mm)",
  "Flipper Length (mm)",
  "Body Mass (g)",
] as const;
const pengs = penguins.filter((p: any) => DIMS.every((k) => p[k] != null));
// Per-axis min-max normalization, on the row itself (see ParallelCoordinates).
const extent = Object.fromEntries(
  DIMS.map((k) => {
    const v = pengs.map((p: any) => p[k] as number);
    return [k, [Math.min(...v), Math.max(...v)]];
  })
);
const pengsN = pengs.map((p: any) => {
  const row: any = { ...p };
  for (const k of DIMS) {
    const [lo, hi] = extent[k];
    row[`n ${k}`] = (p[k] - lo) / (hi - lo);
  }
  return row;
});

const eNames = energy.nodes.map((n) => n.name);
const eLinks = energy.links.map((l) => ({
  source: eNames[l.source],
  target: eNames[l.target],
  value: l.value,
}));
const eDepth = sankeyDepths(eNames, eLinks);
const eOrder = orderColumns(eNames, eLinks, eDepth);
const eRank = new Map(eOrder.map((n, i) => [n, i]));
const eNodes = eOrder.map((name) => ({ name, depth: eDepth.get(name)! }));
// Links in far-end order, so a node's ends leave in the order of the nodes
// they go to (in-links by source rank, out-links by target rank).
const bySourceRank = [...eLinks].sort(
  (a, b) => eRank.get(a.source)! - eRank.get(b.source)!
);
const byTargetRank = [...eLinks].sort(
  (a, b) => eRank.get(a.target)! - eRank.get(b.target)!
);
// Nested-field nodes: node.in / node.out hold the SAME link objects
// (d3-sankey's node.targetLinks / node.sourceLinks).
const eNested = nestJoin(eNodes, eLinks, {
  in: { key: "target", sortBy: (l) => eRank.get(l.source)! },
  out: { key: "source", sortBy: (l) => eRank.get(l.target)! },
});

// ===========================================================================
// Task 1a. Parallel sets
// ===========================================================================

// Target spelling, verbatim. FAILS: the spread combinator does not hand its
// scope to an empty-scope chart() child (TypeError: symbol is not iterable).
export const ProbeParallelSetsVerbatim: StoryObj = {
  render: () =>
    show((c) =>
      chart(titanic)
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            AXES.map((axis) =>
              chart()
                .flow(spread({ by: axis, dir: "y", spacing: 12 }), stack({ dir: "y" }))
                .mark(rect({ w: 12, h: "count", fill: "class" }))
            )
          )
        )
        .layer(ribbon({ opacity: 0.6 }))
        .render(c, { w: 500, h: 400 })
    ),
};

// Scope passed by hand ((d) => chart(d)); fused `.layer(ribbon())` draws
// NOTHING (the outer chart has no flow, so the ribbon gets one node).
// Also shows the stack scale bug: the class column is drawn shorter.
export const ProbeParallelSetsFusedRibbon: StoryObj = {
  render: () =>
    show((c) =>
      chart(titanic)
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            AXES.map((axis) => (d: any[]) =>
              chart(d)
                .flow(spread({ by: axis, dir: "y", spacing: 12 }), stack({ dir: "y" }))
                .mark(rect({ w: 12, h: "count", fill: "class" }))
            )
          )
        )
        .layer(ribbon({ opacity: 0.6 }))
        .render(c, { w: 500, h: 400 })
    ),
};

// `group({ by: (r) => r })` draws NOTHING: the key function gets the ref,
// and every ref is distinct, so each group holds one end.
export const ProbeIdentityByRef: StoryObj = {
  render: () =>
    show((c) =>
      layer([
        chart(titanicR).mark(
          spread(
            { dir: "x", spacing: 120 },
            AXES.map((axis) => (d: any[]) =>
              chart(d)
                .flow(
                  spread({ by: axis, dir: "y", spacing: 12 }),
                  spread({ by: field(`rank_${axis}`).sort(), dir: "y", spacing: 0, axes: false })
                )
                .mark(rect({ w: 12, h: "count", fill: "class" }).name("ends"))
            )
          )
        ),
        chart(selectAll("ends"))
          .flow(group({ by: (r: any) => r }))
          .mark(ribbon({ opacity: 0.6, fill: "class" })),
      ]).render(c, { w: 500, h: 400 })
    ),
};

// Closest working spelling with today's API.
export const ParallelSetsDirect: StoryObj = {
  render: () =>
    show((c) =>
      chart(titanicR)
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            AXES.map((axis) => (d: any[]) =>
              chart(d)
                .flow(
                  spread({ by: axis, dir: "y", spacing: 12 }),
                  spread({ by: field(`rank_${axis}`).sort(), dir: "y", spacing: 0, axes: false })
                )
                .mark(rect({ w: 12, h: "count", fill: "class" }).name("ends"))
            )
          )
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: (r: any) => r.datum[0] }))
            .mark(ribbon({ opacity: 0.6, fill: "class" }))
        )
        .render(c, { w: 500, h: 400 })
    ),
};

// Same picture, written as the target spelling with `chart()` children; the
// story-local `inherit` stands in for the one missing core behavior.
export const ParallelSetsDirectInherit: StoryObj = {
  render: () =>
    show((c) =>
      chart(titanicR)
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            inherit(
              AXES.map((axis) =>
                chart()
                  .flow(
                    spread({ by: axis, dir: "y", spacing: 12 }),
                    spread({ by: field(`rank_${axis}`).sort(), dir: "y", spacing: 0, axes: false })
                  )
                  .mark(rect({ w: 12, h: "count", fill: "class" }).name("ends"))
              )
            )
          )
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: sameRow }))
            .mark(ribbon({ opacity: 0.6, fill: "class" }))
        )
        .render(c, { w: 500, h: 400 })
    ),
};

// ===========================================================================
// Task 1b. Parallel coordinates
// ===========================================================================

// Raw columns: every axis shares ONE y scale (body mass in g flattens the
// three mm axes). Each child is its own chart(d, { h }), which does not help.
export const ProbeParallelCoordinatesSharedScale: StoryObj = {
  render: () =>
    show((c) =>
      chart(pengs)
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            DIMS.map((dim) => (d: any[]) =>
              chart(d, { h: 250 })
                .flow(scatter({ y: dim }))
                .mark(circle({ r: 1.5, fill: "Species" }).name("pts"))
            )
          )
        )
        .layer(
          chart(selectAll("pts"))
            .flow(group({ by: sameRow }))
            .mark(line({ stroke: "Species", opacity: 0.3 }))
        )
        .render(c, { w: 500, h: 300 })
    ),
};

// Two SEPARATE charts (own data) side by side: still one y domain, and the
// child charts draw no axes.
export const ProbeSeparateChartsShareScale: StoryObj = {
  render: () =>
    show((c) =>
      spread({ dir: "x", spacing: 60 }, [
        chart(pengs, { h: 250 })
          .flow(scatter({ y: "Beak Length (mm)" }))
          .mark(circle({ r: 1.5, fill: "Species" })),
        chart(pengs, { h: 250 })
          .flow(scatter({ y: "Body Mass (g)" }))
          .mark(circle({ r: 1.5, fill: "Species" })),
      ]).render(c, { w: 300, h: 300 })
    ),
};

// Working version: each axis reads a per-axis normalized column (0..1).
// DECLARED SHORTCUT: no per-axis ticks (the axis would read 0..1).
export const ParallelCoordinatesDirect: StoryObj = {
  render: () =>
    show((c) =>
      chart(pengsN, { axes: false })
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            DIMS.map((dim) => (d: any[]) =>
              chart(d)
                .flow(scatter({ y: `n ${dim}`, axes: false } as any))
                .mark(circle({ r: 1.5, fill: "Species" }).name("pts"))
            )
          )
        )
        .layer(
          chart(selectAll("pts"))
            .flow(group({ by: sameRow }))
            .mark(line({ stroke: "Species", opacity: 0.25 }))
        )
        .render(c, { w: 500, h: 300 })
    ),
};

// ===========================================================================
// Task 1c. Energy sankey
// ===========================================================================

// Target shape: a LIST of nodes, each a PAIR (in, out) of LISTS of links.
// The child reads its parent row through a function in `.mark()`.
export const SankeyDirect: StoryObj = {
  render: () =>
    show((c) =>
      chart(eNodes, { axes: false })
        .flow(
          spread({ by: field("depth").sort(), dir: "x", spacing: 100, alignment: "start", axes: false }),
          spread({ by: field("name").sort(eOrder), dir: "y", spacing: 10, axes: false })
        )
        .mark((node: any[]) =>
          spread({ dir: "x", spacing: 0, alignment: "start" }, [
            chart(bySourceRank)
              .flow(filter((l: any) => l.target === node[0].name), spread({ dir: "y", spacing: 0 }))
              .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
            chart(byTargetRank)
              .flow(filter((l: any) => l.source === node[0].name), spread({ dir: "y", spacing: 0 }))
              .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
          ])
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: sameRow }))
            .mark(ribbon({ opacity: 0.4, fill: "source", curve: Curve.bezier() }))
        )
        .render(c, { w: 960, h: 600, legend: false } as any)
    ),
};

// With `stack` as in the target spelling: per-column scales (stack scale
// bug), so ribbon ends do not match.
export const ProbeSankeyDirectStack: StoryObj = {
  render: () =>
    show((c) =>
      chart(eNodes, { axes: false })
        .flow(
          spread({ by: field("depth").sort(), dir: "x", spacing: 100, alignment: "start", axes: false }),
          spread({ by: field("name").sort(eOrder), dir: "y", spacing: 10, axes: false })
        )
        .mark((node: any[]) =>
          spread({ dir: "x", spacing: 0, alignment: "start" }, [
            chart(eLinks)
              .flow(filter((l: any) => l.target === node[0].name), stack({ dir: "y" }))
              .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
            chart(eLinks)
              .flow(filter((l: any) => l.source === node[0].name), stack({ dir: "y" }))
              .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
          ])
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: sameRow }))
            .mark(ribbon({ opacity: 0.4, fill: "source", curve: Curve.bezier() }))
        )
        .render(c, { w: 960, h: 600, legend: false } as any)
    ),
};

// Nested-field variant, today: the child's data is the parent row's list.
export const SankeyNested: StoryObj = {
  render: () =>
    show((c) =>
      chart(eNested, { axes: false })
        .flow(
          spread({ by: field("depth").sort(), dir: "x", spacing: 100, alignment: "start", axes: false }),
          spread({ by: field("name").sort(eOrder), dir: "y", spacing: 10, axes: false })
        )
        .mark((node: any[]) =>
          spread({ dir: "x", spacing: 0, alignment: "start" }, [
            chart(node[0].in)
              .flow(spread({ dir: "y", spacing: 0 }))
              .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
            chart(node[0].out)
              .flow(spread({ dir: "y", spacing: 0 }))
              .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
          ])
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: sameRow }))
            .mark(ribbon({ opacity: 0.4, fill: "source", curve: Curve.bezier() }))
        )
        .render(c, { w: 960, h: 600, legend: false } as any)
    ),
};

// ===========================================================================
// Task 2. Callback-free spellings (EMULATED with the helpers above)
// ===========================================================================

// Expression expansion: one child template over a multi-column `cols(...)`.
export const ParallelSetsExpand: StoryObj = {
  render: () =>
    show((c) => {
      const axes = cols(["class", "sex", "survived"]);
      return chart(titanicR)
        .mark(
          spread(
            { dir: "x", spacing: 120 },
            expand(axes, (axis) =>
              chart()
                .flow(
                  spread({ by: axis, dir: "y", spacing: 12 }),
                  spread({ by: field(`rank_${axis}`).sort(), dir: "y", spacing: 0, axes: false })
                )
                .mark(rect({ w: 12, h: "count", fill: "class" }).name("ends"))
            )
          )
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: sameRow }))
            .mark(ribbon({ opacity: 0.6, fill: "class" }))
        )
        .render(c, { w: 500, h: 400 });
    }),
};

// Nested list fields as child data: `chart()` children + `unnest("in")`
// (emulates `chart(field("in"))`). No callback reads the parent row.
export const SankeyNestedUnnest: StoryObj = {
  render: () =>
    show((c) =>
      chart(eNested, { axes: false })
        .flow(
          spread({ by: field("depth").sort(), dir: "x", spacing: 100, alignment: "start", axes: false }),
          spread({ by: field("name").sort(eOrder), dir: "y", spacing: 10, axes: false })
        )
        .mark(
          spread(
            { dir: "x", spacing: 0, alignment: "start" },
            inherit([
              chart()
                .flow(unnest("in"), spread({ dir: "y", spacing: 0 }))
                .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
              chart()
                .flow(unnest("out"), spread({ dir: "y", spacing: 0 }))
                .mark(rect({ w: 6, h: "value", fill: "#555" }).name("ends")),
            ])
          )
        )
        .layer(
          chart(selectAll("ends"))
            .flow(group({ by: sameRow }))
            .mark(ribbon({ opacity: 0.4, fill: "source", curve: Curve.bezier() }))
        )
        .render(c, { w: 960, h: 600, legend: false } as any)
    ),
};

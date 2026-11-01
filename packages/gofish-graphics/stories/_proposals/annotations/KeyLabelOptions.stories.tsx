// Where the key of a key label goes. The same GOOG chart and the same two
// notes (A on the 2007 peak, B on the 2009 low) with the key in four places,
// then two harder cases: two panels sharing one key, and a formula with
// numbered terms and a footnote list. All built with today's primitives; the
// proposed spellings are in proposals/annotations/proposal.md ("Where the key
// goes").
import type { Meta, StoryObj } from "@storybook/html";
import { maxBy, minBy } from "lodash";
import data from "vega-datasets";
import { initializeContainer } from "../../helper";
import {
  blank,
  chart,
  circle,
  Constraint,
  derive,
  enclose,
  filter,
  layer,
  line,
  project,
  scatter,
  selectAll,
  Shape,
  spread,
  text,
  Unit,
} from "../../../src/lib";
import { partStandIn, type TextOpts } from "./textParts";

const meta: Meta = { title: "Proposals/Annotations/Key Options" };
export default meta;

const RED = "#c0392b";
const BLUE = "#467DA8";

// Data prep (not part of any spec): one stock's monthly closing price.
const monthly = async (symbol: string) =>
  ((await data["stocks.csv"]()) as any[])
    .filter((d) => d.symbol === symbol)
    .map((d) => {
      const t = new Date(d.date);
      const mm = String(t.getMonth() + 1).padStart(2, "0");
      return { date: `${t.getFullYear()}-${mm}-01`, price: +d.price };
    });
const loaders = [
  async () => ({
    goog: await monthly("GOOG"),
    // the same span as GOOG's (AAPL's rows start in 2000)
    aapl: (await monthly("AAPL")).filter((d) => d.date >= "2004-08-01"),
  }),
];

// ─── Shared helpers (the same as AnnotationStyles) ───────────────────────────
// The base chart: invisible points named `${p}months`, the line `${p}price`.
const base = (rows: any[], p = "", w = 360, h = 200) =>
  chart(rows, { schema: { date: Unit.time() }, w, h })
    .flow(scatter({ by: "date", x: "date", y: "price" }))
    .mark(blank().name(`${p}months`))
    .layer(line({ stroke: BLUE, strokeWidth: 2 }).name(`${p}price`));

const ms = (m: any) => {
  const v = project(m, "date");
  return typeof v === "number" ? v : Date.parse(String(v));
};
// Today's stand-ins for `topK(1, { by: "price" })`, its opposite after 2008,
// and one month.
const peak = (p = "") =>
  chart(selectAll(`${p}months`)).flow(
    derive((xs) => [maxBy(xs, (m) => project(m, "price"))])
  );
const trough = (p = "") =>
  chart(selectAll(`${p}months`)).flow(
    derive((xs) => [
      minBy(
        xs.filter((m) => ms(m) >= Date.parse("2008-01-01")),
        (m) => project(m, "price")
      ),
    ])
  );
const month = (p: string, iso: string) =>
  chart(selectAll(`${p}months`)).flow(
    filter((m) => Math.abs(ms(m) - Date.parse(iso)) < 10 * 864e5)
  );

const oval = () =>
  enclose({
    shape: Shape.oval(),
    padding: 6,
    fill: "none",
    stroke: RED,
    strokeWidth: 1.5,
  });

// A marker: a letter in a filled circle (proposed: a label with
// `background: { shape: Shape.oval() }`).
const badge = (m: string) =>
  layer([
    circle({ r: 8, fill: RED }).name("dot"),
    text({ text: m, fontSize: 11, fontWeight: 700, fill: "white" }).name("ch"),
  ]).relate(({ dot, ch }) => [
    Constraint.align({ x: "middle", y: "middle" }, [dot, ch]),
  ]);
// One key entry: the marker, then the note.
const entry = ([m, t]: [string, string]) =>
  spread({ dir: "x", spacing: 6, alignment: "middle" }, [
    badge(m),
    text({ text: t, fontSize: 11, fill: "#333" }),
  ]);
// The key: one entry per note, top to bottom.
const key = (rows: [string, string][]) =>
  spread({ dir: "y", spacing: 8, alignment: "start" }, rows.map(entry));

const NOTES: [string, string][] = [
  ["A", "Peak before the 2008 crash"],
  ["B", "Low after the crash"],
];

// The annotated chart all of a to d share: ovals on the two targets, a badge
// by each. Returns the children; each story adds its key and its placement.
const annotated = (goog: any[]) => [
  base(goog)
    .layer(peak().mark(oval().name("tA")))
    .layer(trough().mark(oval().name("tB"))),
  badge("A").name("a"),
  badge("B").name("b"),
];
const badgesBy = ({ tA, tB, a, b }: any) => [
  Constraint.distribute({ dir: "x", spacing: 2 }, [a, tA]),
  Constraint.align({ y: "end" }, [tA, a]),
  Constraint.distribute({ dir: "x", spacing: 2 }, [tB, b]),
  Constraint.align({ y: "start" }, [tB, b]),
];

// ─── a. Key to the right, top-aligned (legend-like) ──────────────────────────
export const Right: StoryObj = {
  name: "a Right",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    // ── spec ──
    layer([...annotated(ctx.loaded.goog), key(NOTES).name("key")])
      .relate((g) => [
        ...badgesBy(g),
        Constraint.distribute({ dir: "x", spacing: 24 }, [g.price, g.key]),
        Constraint.align({ y: "end" }, [g.price, g.key]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── b. Key below, as a footnote list ────────────────────────────────────────
export const Below: StoryObj = {
  name: "b Below",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    // ── spec ──
    layer([...annotated(ctx.loaded.goog), key(NOTES).name("key")])
      .relate((g) => [
        ...badgesBy(g),
        // The key clears the axis by spacing: the line is the nearest name.
        // A chart after .layer() cannot be named (#1203).
        Constraint.distribute({ dir: "y", spacing: 64 }, [g.key, g.price]),
        Constraint.align({ x: "start" }, [g.price, g.key]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── c. Key inside the plot, in empty space ──────────────────────────────────
export const Inside: StoryObj = {
  name: "c Inside",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    // ── spec ──
    layer([...annotated(ctx.loaded.goog), key(NOTES).name("key")])
      .relate((g) => [
        ...badgesBy(g),
        // The empty space is under the line, bottom center. (Top-left is
        // too narrow: the A row runs into the peak.)
        Constraint.align({ x: "middle", y: "start" }, [g.price, g.key]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── d. Each entry at its badge's height, past the plot (relation form) ──────
export const Aligned: StoryObj = {
  name: "d Aligned",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    // ── spec ──
    layer([
      ...annotated(ctx.loaded.goog),
      entry(NOTES[0]).name("kA"),
      entry(NOTES[1]).name("kB"),
    ])
      .relate((g) => [
        ...badgesBy(g),
        Constraint.distribute({ dir: "x", spacing: 24 }, [g.price, g.kA]),
        Constraint.align({ x: "start" }, [g.kA, g.kB]),
        Constraint.align({ y: "middle" }, [g.a, g.kA]),
        Constraint.align({ y: "middle" }, [g.b, g.kB]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── e. Two panels, one key ──────────────────────────────────────────────────
// A is on GOOG's peak, B on AAPL's peak, and C (the Lehman collapse,
// September 2008) is in both panels. The key lists C once.
export const SharedKey: StoryObj = {
  name: "e Shared key",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const { goog, aapl } = ctx.loaded;
    // A panel: a title over the base chart, with C's oval and one more.
    const panel = (rows: any[], p: string, title: string, tier: any) =>
      spread({ dir: "y", spacing: 6, alignment: "middle" }, [
        text({ text: title, fontSize: 12, fontWeight: 700 }),
        base(rows, p, 230, 150)
          .layer(month(p, "2008-09-01").mark(oval().name(`${p}C`)))
          .layer(tier),
      ]);
    // ── spec ──
    layer([
      spread({ dir: "x", spacing: 40 }, [
        panel(goog, "g", "GOOG", peak("g").mark(oval().name("tA"))),
        panel(aapl, "p", "AAPL", peak("p").mark(oval().name("tB"))),
      ]).name("panels"),
      badge("A").name("a"),
      badge("B").name("b"),
      badge("C").name("c1"),
      badge("C").name("c2"),
      key([
        ["A", "GOOG's 2007 high"],
        ["B", "AAPL's 2007 high"],
        ["C", "Lehman Brothers fails, September 2008"],
      ]).name("key"),
    ])
      .relate((g) => [
        // A and B to the left of their peaks, each C below-left of its oval
        ...[
          [g.a, g.tA],
          [g.b, g.tB],
          [g.c1, g.gC],
          [g.c2, g.pC],
        ].map(([m, t]) =>
          Constraint.distribute({ dir: "x", spacing: 2 }, [m, t])
        ),
        Constraint.align({ y: "end" }, [g.tA, g.a]),
        Constraint.align({ y: "end" }, [g.tB, g.b]),
        Constraint.align({ y: "start" }, [g.gC, g.c1]),
        Constraint.align({ y: "start" }, [g.pC, g.c2]),
        Constraint.distribute({ dir: "y", spacing: 16 }, [g.panels, g.key]),
        Constraint.align({ x: "start" }, [g.panels, g.key]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── f. A formula with numbered terms and a footnote list ────────────────────
const EQ: TextOpts = {
  text: "Var(X) = E[(X − μ)²]",
  fontSize: 32,
  fill: "#222",
  fontFamily: "Georgia, serif",
};
export const Formula: StoryObj = {
  name: "f Formula",
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    const terms: [string, RegExp | string, string][] = [
      ["1", "Var(X)", "variance: how far X spreads"],
      ["2", /E(?=\[)/, "expected value: the average over X"],
      ["3", /\(X − μ\)²/, "squared distance from the mean μ"],
    ];
    layer([
      text({ ...EQ, x: 0, y: 0 }).name("eq"),
      // Today: one stand-in per part. Proposed: ref("eq").part(sel).
      ...terms.map(([m, sel]) => partStandIn(EQ, sel).name(`t${m}`)),
      ...terms.map(([m]) => badge(m).name(`b${m}`)),
      key(terms.map(([m, , t]) => [m, t])).name("key"),
    ])
      .relate((g) => [
        ...terms.flatMap(([m]) => [
          Constraint.align({ x: "middle" }, [g[`t${m}`], g[`b${m}`]]),
          Constraint.distribute({ dir: "y", spacing: 4 }, [
            g[`b${m}`],
            g[`t${m}`],
          ]),
        ]),
        Constraint.distribute({ dir: "y", spacing: 20 }, [g.eq, g.key]),
        Constraint.align({ x: "start" }, [g.eq, g.key]),
      ])
      .render(container, { w: 440, h: 200 });
    // ── end spec ──
    return container;
  },
};

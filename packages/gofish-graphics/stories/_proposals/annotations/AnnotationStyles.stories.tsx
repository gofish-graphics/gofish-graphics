// Annotation styles: one small chart per way of linking a note to its
// target, all on the same base chart (GOOG's monthly price, as in example 1),
// each built with today's primitives. Rows 4 and 5 are key labels: a marker
// by the target, and the note in a key outside the plot.
import type { Meta, StoryObj } from "@storybook/html";
import { maxBy, meanBy, minBy } from "lodash";
import { initializeContainer } from "../../helper";
import {
  arrow,
  blank,
  chart,
  circle,
  Constraint,
  datum,
  derive,
  enclose,
  filter,
  layer,
  line,
  Place,
  project,
  rect,
  scatter,
  selectAll,
  Shape,
  spread,
  text,
  Unit,
} from "../../../src/lib";
import { googMonthly, monthYear } from "./data";

const meta: Meta = { title: "Proposals/Annotations/Styles" };
export default meta;

const RED = "#c0392b";
const BLUE = "#467DA8";
const GRAY = "#9aa5ae";
const W = 360;
const H = 200;

const loaders = [async () => ({ goog: await googMonthly() })];

// The shared base: invisible points named "months" and the line through them.
const base = (goog: any[], stroke = BLUE) =>
  chart(goog, { schema: { date: Unit.time() }, w: W, h: H })
    .flow(scatter({ by: "date", x: "date", y: "price" }))
    .mark(blank().name("months"))
    .layer(line({ stroke, strokeWidth: 2 }).name("price"));

// Today's stand-ins for `topK(1, { by: "price" })` and its opposite.
const peak = () =>
  chart(selectAll("months")).flow(
    derive((ms) => [maxBy(ms, (m) => project(m, "price"))])
  );
// A month's date as epoch ms, whether the ref reads it as a string or a number.
const ms = (m: any) => {
  const v = project(m, "date");
  return typeof v === "number" ? v : Date.parse(String(v));
};
// the low after the crash: the minimum from 2008 on
const trough = () =>
  chart(selectAll("months")).flow(
    derive((xs) => [
      minBy(
        xs.filter((m) => ms(m) >= Date.parse("2008-01-01")),
        (m) => project(m, "price")
      ),
    ])
  );

// An invisible box around the target, for a note or a connector to name.
const hidden = (padding = 3) =>
  enclose({ padding, fill: "none", stroke: "none" });
const oval = () =>
  enclose({
    shape: Shape.oval(),
    padding: 6,
    fill: "none",
    stroke: RED,
    strokeWidth: 1.5,
  });
const leaderArrow = {
  bow: 0,
  stretch: 0,
  strokeWidth: 1,
  padStart: 3,
  padEnd: 2,
  stroke: RED,
};

// A key marker: a letter in a filled circle. Proposed: a label whose text is
// the marker, with `background: { shape: Shape.oval() }`.
const badge = (letter: string) =>
  layer([
    circle({ r: 8, fill: RED }).name("dot"),
    text({ text: letter, fontSize: 11, fontWeight: 700, fill: "white" }).name(
      "ch"
    ),
  ]).relate(({ dot, ch }) => [
    Constraint.align({ x: "middle", y: "middle" }, [dot, ch]),
  ]);

// The key: one row per note, the marker then the text.
const key = (rows: [string, string][]) =>
  spread(
    { dir: "y", spacing: 8, alignment: "start" },
    rows.map(([m, t]) =>
      spread({ dir: "x", spacing: 6, alignment: "middle" }, [
        badge(m),
        text({ text: t, fontSize: 11, fill: "#333" }),
      ])
    )
  );

const inRange = (from: string, to: string) => (m: any) =>
  ms(m) >= Date.parse(from) && ms(m) <= Date.parse(to);
const FALL = inRange("2007-11-01", "2009-03-01");

// ─── 1. Proximity label ──────────────────────────────────────────────────────
export const Proximity: StoryObj = {
  name: "1 Proximity label",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    base(goog)
      .layer(
        peak().mark(
          hidden().label((d) => `Peak $${Math.round(project(d, "price"))}`, {
            position: Place.around({ directions: ["left"] }),
            color: RED,
            fontSize: 11,
          })
        )
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 2. Leader label ─────────────────────────────────────────────────────────
export const Leader: StoryObj = {
  name: "2 Leader label",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    const top = maxBy(goog, "price") as any;
    // ── spec ──
    layer([
      base(goog).layer(peak().mark(hidden(2).name("t"))),
      text({
        text: `Peak $${Math.round(top.price)}`,
        fontSize: 11,
        fill: RED,
      }).name("n"),
    ])
      .relate(({ t, n }) => [
        Constraint.distribute({ dir: "x", spacing: 36 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 20 }, [t, n]),
        arrow(leaderArrow, [n, t]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 3. Subject + leader (callout) ───────────────────────────────────────────
export const Callout: StoryObj = {
  name: "3 Subject and leader",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    const top = maxBy(goog, "price") as any;
    // ── spec ──
    layer([
      base(goog).layer(peak().mark(oval().name("t"))),
      spread({ dir: "y", spacing: 2, alignment: "start" }, [
        text({ text: "Peak", fontSize: 12, fontWeight: 700 }),
        text({
          text: `$${Math.round(top.price)} in ${monthYear(top.date)}`,
          fontSize: 11,
        }),
      ]).name("n"),
    ])
      .relate(({ t, n }) => [
        Constraint.distribute({ dir: "x", spacing: 30 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 14 }, [t, n]),
        arrow(leaderArrow, [n, t]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 4. Key label ────────────────────────────────────────────────────────────
// Two notes, A on the 2007 peak and B on the 2009 trough. Each target gets a
// circle and a marker by it; the notes sit in a key to the right of the plot.
export const Key: StoryObj = {
  name: "4 Key label",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    layer([
      base(goog)
        .layer(peak().mark(oval().name("tA")))
        .layer(trough().mark(oval().name("tB"))),
      badge("A").name("a"),
      badge("B").name("b"),
      key([
        ["A", "Peak before the 2008 crash"],
        ["B", "Low after the crash"],
      ]).name("key"),
    ])
      .relate(({ tA, tB, a, b, price, key }) => [
        Constraint.distribute({ dir: "x", spacing: 2 }, [a, tA]),
        Constraint.align({ y: "end" }, [tA, a]),
        Constraint.distribute({ dir: "x", spacing: 2 }, [tB, b]),
        Constraint.align({ y: "start" }, [tB, b]),
        Constraint.distribute({ dir: "x", spacing: 24 }, [price, key]),
        Constraint.align({ y: "end" }, [price, key]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 5. Key + leader ─────────────────────────────────────────────────────────
// The same, with each marker a little way off and a line to its circle.
export const KeyLeader: StoryObj = {
  name: "5 Key and leader",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    layer([
      base(goog)
        .layer(peak().mark(oval().name("tA")))
        .layer(trough().mark(oval().name("tB"))),
      badge("A").name("a"),
      badge("B").name("b"),
      key([
        ["A", "Peak before the 2008 crash"],
        ["B", "Low after the crash"],
      ]).name("key"),
    ])
      .relate(({ tA, tB, a, b, price, key }) => [
        Constraint.distribute({ dir: "x", spacing: 26 }, [a, tA]),
        Constraint.distribute({ dir: "y", spacing: 6 }, [tA, a]),
        Constraint.distribute({ dir: "x", spacing: 26 }, [tB, b]),
        Constraint.distribute({ dir: "y", spacing: 18 }, [b, tB]),
        arrow(leaderArrow, [a, tA]),
        arrow(leaderArrow, [b, tB]),
        Constraint.distribute({ dir: "x", spacing: 24 }, [price, key]),
        Constraint.align({ y: "end" }, [price, key]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 6. Region enclosure + label ─────────────────────────────────────────────
export const Region: StoryObj = {
  name: "6 Region enclosure",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    base(goog)
      .layer(
        chart(selectAll("months"))
          .flow(filter(FALL))
          .mark(
            enclose({
              shape: Shape.box(),
              padding: 6,
              fill: "none",
              stroke: RED,
            }).label(() => "the 2008 fall", {
              position: "outset-top",
              color: RED,
              fontSize: 11,
            })
          )
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 7. Reference rule ───────────────────────────────────────────────────────
export const Rule: StoryObj = {
  name: "7 Reference rule",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    const mean = Math.round(meanBy(goog, "price"));
    // ── spec ──
    base(goog)
      .layer(
        rect({ y: datum(mean), h: 1, fill: "#555" }).label(
          () => `mean $${mean}`,
          { position: "outset-right", fontSize: 11 }
        )
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 8. Band ─────────────────────────────────────────────────────────────────
export const Band: StoryObj = {
  name: "8 Band",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    base(goog)
      .layer(
        rect({
          // epoch ms: datum("2007-11-01") does not read through the time column
          x: datum(Date.parse("2007-11-01")),
          x2: datum(Date.parse("2009-03-01")),
          fill: "#f2b45c",
          opacity: 0.3,
        })
          .label(() => "recession", { position: "outset-top", fontSize: 11 })
          .zOrder(-1)
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 9. Emphasis of a stretch ────────────────────────────────────────────────
export const Emphasis: StoryObj = {
  name: "9 Emphasis",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    base(goog, GRAY)
      .layer(
        chart(selectAll("months"))
          .flow(filter(FALL))
          .mark(line({ stroke: RED, strokeWidth: 3 }))
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

// ─── 10. Badge only ──────────────────────────────────────────────────────────
export const Badge: StoryObj = {
  name: "10 Badge only",
  loaders,
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    // ── spec ──
    layer([
      base(goog).layer(peak().mark(hidden(2).name("t"))),
      badge("A").name("a"),
    ])
      .relate(({ t, a }) => [
        Constraint.distribute({ dir: "x", spacing: 0 }, [a, t]),
        Constraint.distribute({ dir: "y", spacing: 0 }, [t, a]),
      ])
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

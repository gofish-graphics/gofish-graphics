// Example 5 again, with the formula as ONE text mark. Its terms are picked out
// by selecting parts of the string (a substring, a regex, or a character
// range) instead of by tokenizing it into separately placed texts. The part
// refs are prototyped by `textParts.ts` (invisible stand-ins measured over
// each match); see proposals/annotations/research/span-selection.md for the
// proposed spelling, `ref("eq").part("E")`.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  arrow,
  blank,
  chart,
  Constraint,
  enclose,
  filter,
  layer,
  line,
  mask,
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
import {
  partOverlay,
  partStandIn,
  type PartSelector,
  type TextOpts,
} from "./textParts";
import { googMonthly } from "./data";

const meta: Meta = { title: "Proposals/Annotations/Ex5 Math Spans" };
export default meta;

const EQ: TextOpts = {
  text: "Var(X) = E[(X − μ)²]",
  fontSize: 32,
  fill: "#222",
  fontFamily: "Georgia, serif",
};

const terms: {
  name: string;
  part: PartSelector;
  color: string;
  depth: number;
  note: string[];
}[] = [
  // a substring that occurs once
  {
    name: "v",
    part: "Var(X)",
    color: "#c0392b",
    depth: 18,
    note: ["variance:", "how far X spreads"],
  },
  // a regex: the E that opens a bracket
  {
    name: "e",
    part: /E(?=\[)/,
    color: "#2e86c1",
    depth: 54,
    note: ["expected value:", "the average over X"],
  },
  // a regex: the parenthesized group and its exponent
  {
    name: "d",
    part: /\(X − μ\)²/,
    color: "#1e8449",
    depth: 18,
    note: ["squared distance", "from the mean μ"],
  },
];

const note = (lines: string[], fill: string) =>
  spread(
    { dir: "y", spacing: 1, alignment: "middle" },
    lines.map((t) => text({ text: t, fontSize: 12, fill }))
  );

/** Each term's underline, note and leader, aimed at the term's part. */
const annotate = (names: Record<string, any>) =>
  terms.flatMap((t) => {
    const [term, bar, n] = [
      names[t.name],
      names[`${t.name}Bar`],
      names[`${t.name}Note`],
    ];
    return [
      Constraint.align({ x: "span" }, [term, bar]),
      Constraint.distribute({ dir: "y", spacing: 2 }, [term, bar]),
      Constraint.align({ x: "middle" }, [bar, n]),
      Constraint.distribute({ dir: "y", spacing: t.depth }, [bar, n]),
      arrow(
        {
          bow: 0,
          stretch: 0,
          strokeWidth: 1,
          padStart: 2,
          padEnd: 2,
          stroke: t.color,
        },
        [n, bar]
      ),
    ];
  });

// ─── Overlay: color drawn as a second text of the part's characters ─────────
export const Overlay: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    layer([
      text({ ...EQ, x: 0, y: 0 }).name("eq"),
      // Today: one stand-in per part. Proposed: ref("eq").part(t.part).
      ...terms.map((t) => partStandIn(EQ, t.part).name(t.name)),
      ...terms.map((t) => partOverlay(EQ, t.part, t.color)),
      ...terms.map((t) => rect({ h: 2, fill: t.color }).name(`${t.name}Bar`)),
      ...terms.map((t) => note(t.note, t.color).name(`${t.name}Note`)),
    ])
      .relate(annotate)
      .render(container, { w: 440, h: 190 });
    // ── end spec ──
    return container;
  },
};

// ─── Mask: color as a region composite, the text's glyphs as the stencil ────
// `mask([A, B])` draws B only inside A's region, without drawing A. With A
// the formula and B a colored box over each part, B lands exactly on the
// part's glyphs. No second text, no tspans, and the same spelling recolors a
// part of a line or of any other mark. (`paint` would keep A, but its blend
// is `color`, which keeps A's lightness, so dark glyphs stay dark.)
export const Mask: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    layer([
      text({ ...EQ, x: 0, y: 0 }),
      mask([
        // The stencil is white: `mask` reads luminance, not alpha, so a dark
        // stencil lets only a little of B through (a library wart, see notes).
        text({ ...EQ, x: 0, y: 0, fill: "white" }),
        layer(
          terms.map((t) => partStandIn(EQ, t.part, t.color).name(t.name))
        ),
      ]),
      ...terms.map((t) => rect({ h: 2, fill: t.color }).name(`${t.name}Bar`)),
      ...terms.map((t) => note(t.note, t.color).name(`${t.name}Note`)),
    ])
      .relate(annotate)
      .render(container, { w: 440, h: 190 });
    // ── end spec ──
    return container;
  },
};

// ─── Plural: every X, boxed (the plural `parts(/X/)`) ───────────────────────
// "X" occurs twice, so the singular part("X") is an error; the plural form
// gives one part per match.
export const PluralX: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    const xs = [0, 1].map((nth) =>
      partStandIn(EQ, { match: "X", nth }).name(`x${nth}`)
    );
    layer([text({ ...EQ, x: 0, y: 0 }), ...xs])
      .relate(({ x0, x1 }) =>
        [x0, x1].map((x) =>
          enclose(
            {
              shape: Shape.box(),
              padding: 1,
              fill: "none",
              stroke: "#8e44ad",
              strokeWidth: 1.5,
            },
            [x]
          )
        )
      )
      .render(container, { w: 440, h: 80 });
    // ── end spec ──
    return container;
  },
};

// ─── Line part: the same selection on a non-text mark ───────────────────────
// A part of a line between two dates. In data space a line's part is the
// line through a filtered selection of its points, which works today; the
// proposed `ref("price").part({ x: [a, b] })` would also cut the line exactly
// at a and b instead of at the nearest points.
export const LinePart: StoryObj = {
  loaders: [async () => ({ goog: await googMonthly() })],
  render: (_a: unknown, ctx: any) => {
    const container = initializeContainer();
    const goog = ctx.loaded.goog;
    const [from, to] = ["2007-11-01", "2009-03-01"];
    const ms = (v: unknown) =>
      typeof v === "number" ? v : Date.parse(String(v));
    const inPart = (m: any) => {
      const d = ms(project(m, "date"));
      return d >= ms(from) && d <= ms(to);
    };
    // ── spec ──
    chart(goog, { schema: { date: Unit.time() }, w: 560, h: 260 })
      .flow(scatter({ by: "date", x: "date", y: "price" }))
      .mark(blank().name("months"))
      .layer(line({ stroke: "#9aa5ae", strokeWidth: 1.5 }))
      // the part, recolored
      .layer(
        chart(selectAll("months"))
          .flow(filter(inPart))
          .mark(line({ stroke: "#c0392b", strokeWidth: 3 }))
      )
      // the part, boxed and labeled (a label on the part's line itself
      // fails today: "Place.end needs an open path; connect has none")
      .layer(
        chart(selectAll("months"))
          .flow(filter(inPart))
          .mark(
            enclose({
              shape: Shape.box(),
              padding: 6,
              fill: "none",
              stroke: "#c0392b",
              strokeWidth: 1,
            }).label(() => "the 2008 fall", {
              position: "outset-top",
              fill: "#c0392b",
            })
          )
      )
      .render(container, { axes: true });
    // ── end spec ──
    return container;
  },
};

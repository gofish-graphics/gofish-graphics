import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Coord,
  Spacing,
  chart,
  fr,
  percent,
  layer,
  line,
  rect,
  spread,
  stack,
  v,
} from "../../src/lib";
// The same data and pad as PieSpaced, so the default pie equals it.
import { browsers, PAD } from "./UserSpaceD3Hierarchy.stories";

// The room a spread keeps at its two ends, `Spacing.box(gap, { ends })`, a
// multiple of the gap: 0 between, 0.5 around, 1 evenly, or [start, end].
// The default is 0, except for a chain that fills the whole of a periodic
// axis, such as the angle of a full-turn polar space. Its last part
// neighbors its first, so its default is half a gap at each end, and it
// leaves n gaps. Not gallery-tagged.
const meta: Meta = {
  title: "Proposals/End Spacing",
  excludeStories: /^[a-z]/,
};
export default meta;

const W = 360;
const H = 320;

const draw = (render: (c: HTMLElement) => unknown): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    render(container);
    return container;
  },
});

const pie = (coord: any, spacing: any) => (container: HTMLElement) =>
  chart(browsers, { coord, w: W, h: H })
    .flow(spread({ by: "name", dir: "x", spacing }))
    .mark(rect({ w: "value", fill: "name" }))
    .render(container);

// (1) A full turn, default ends: every slice inset by half a gap on each
// side. Equal to d3.arc drawing d3.pie().padAngle(PAD).
export const Pie = draw(pie(Coord.clock(), PAD));

// (2) The same with `ends: [0, 1]`: the first slice at 12 o'clock, a whole
// gap after the last. Equal to d3.pie's own start and end angles.
export const PieFromNoon = draw(
  pie(Coord.clock(), Spacing.box(PAD, { ends: [0, 1] }))
);

// (3) A seam: no room at the ends, so Opera's end touches Chrome's start.
export const PieSeam = draw(
  pie(Coord.clock(), Spacing.box(PAD, { ends: 0 }))
);

// (4) A half turn is an interval with two ends: default 0, five gaps.
export const HalfTurn = draw(pie(Coord.clock({ centralAngle: Math.PI }), PAD));

// (4b) The half turn with half a gap at each end, as on a line.
export const HalfTurnAround = draw(
  pie(Coord.clock({ centralAngle: Math.PI }), Spacing.box(PAD, { ends: 0.5 }))
);

// (5) Chord: the groups' chain fills the turn, the sub-arcs of a group are
// a stack. With `ends: [0, 1]` it equals d3.chord's groups.
export const districts = ["North", "East", "South", "West", "Center"];
export const trips = [
  [11, 58, 23, 37, 89],
  [42, 9, 31, 18, 77],
  [19, 35, 14, 52, 61],
  [44, 12, 47, 8, 70],
  [63, 81, 39, 55, 21],
];
const rowTotal = (row: number[]) => row.reduce((a, b) => a + b, 0);
export const Chord = draw((container) =>
  layer({ coord: Coord.clock(), w: W, h: H }, [
    spread(
      { dir: "x", spacing: Spacing.box(0.05, { ends: [0, 1] }), y: 120 },
      trips.map((row, i) =>
        stack(
          { dir: "x", w: v(rowTotal(row)) },
          row.map((m) => rect({ w: v(m), h: 18, fill: v(districts[i]) }))
        )
      )
    ),
  ]).render(container, { axes: false })
);

// (6) A spread of spreads around a full turn: the outer chain fills the
// turn (half a gap of 0.12 at each end); each inner chain fills a share,
// so its default ends are 0 (gaps of 0.03 between its own parts).
export const sales = ["Q1", "Q2", "Q3"].flatMap((q, i) =>
  ["a", "b", "c", "d"].map((p, j) => ({
    quarter: q,
    product: p,
    value: 2 + ((i * 4 + j) % 5),
  }))
);
export const Nested = draw((container) =>
  chart(sales, { coord: Coord.clock(), w: W, h: H })
    .flow(
      spread({ by: "quarter", dir: "x", spacing: 0.12 }),
      spread({ by: "product", dir: "x", spacing: 0.03 })
    )
    .mark(rect({ w: "value", fill: "quarter" }))
    .render(container)
);

// (7) Rings: a spread along r of spreads along the angle. Each ring's
// chain fills the turn, so each has half a gap at each end.
export const Rings = draw((container) =>
  chart(sales, { coord: Coord.clock({ innerRadius: 0.3 }), w: W, h: H })
    .flow(
      spread({ by: "quarter", dir: "y", spacing: 4 }),
      spread({ by: "product", dir: "x", spacing: 0.08 })
    )
    .mark(rect({ w: "value", fill: "product" }))
    .render(container, { axes: false })
);

// (8) Radar spokes: a pitch of one share, from each spoke's start, with
// `ends: [0, 1]` so the first spoke is at 12 o'clock and the step back to
// it is the sixth. The line does not close here (that is the line's
// business).
export const skills = [
  { metric: "speed", value: 7 },
  { metric: "power", value: 4 },
  { metric: "range", value: 9 },
  { metric: "armor", value: 5 },
  { metric: "agility", value: 8 },
  { metric: "stealth", value: 3 },
];
export const Radar = draw((container) =>
  chart(skills, { coord: Coord.clock(), w: W, h: H })
    .flow(
      spread({
        by: "metric",
        dir: "x",
        spacing: Spacing.pitch(fr(1), { at: "start", ends: [0, 1] }),
      })
    )
    .mark(rect({ w: 0, h: "value", stroke: "#bbb", strokeWidth: 1 }))
    .layer(line({ stroke: "#555", strokeWidth: 2 }))
    .render(container, { axes: false })
);

// (9) Cartesian bars: the same option on a line, where the default is 0.
// Ends 0 (between), 0.5 (around) and 1 (evenly).
const fruit = [
  { name: "apples", count: 12 },
  { name: "pears", count: 7 },
  { name: "plums", count: 9 },
  { name: "figs", count: 4 },
  { name: "kiwis", count: 10 },
];
const barsWith = (spacing: any) => (container: HTMLElement) =>
  chart(fruit, { w: 320, h: 160 })
    .flow(spread({ by: "name", dir: "x", spacing }))
    .mark(rect({ h: "count", fill: "#4e79a7" }))
    .render(container);
export const BarsBetween = draw(barsWith(Spacing.box(fr(1))));
export const BarsAround = draw(barsWith(Spacing.box(fr(1), { ends: 0.5 })));
export const BarsEvenly = draw(barsWith(Spacing.box(fr(1), { ends: 1 })));

// (10) A spread of fixed width with explicit ends: three boxes of 1, 2 and
// 1 shares, a 12 px gap, and 24 px (two gaps) at each end. The shares fit
// 360 px less two gaps and the ends (the grey box is 360 px wide).
export const FixedWidthLayer = draw((container) =>
  layer([
    rect({ x: 0, y: 0, w: 360, h: 60, fill: "#eeeeee" }),
    spread(
      {
        dir: "x",
        spacing: Spacing.box(12, { ends: 2 }),
        w: 360,
        x: 0,
        y: 10,
      },
      [1, 2, 1].map((k) => rect({ w: fr(k), h: 40, fill: "#f28e2b" }))
    ),
  ]).render(container, { w: 400, h: 100 })
);

// (11) A minimum gap with ends: at least 10 px between, and ends of 1, 10
// px past where the gaps place the first and last part, in a spread 300 px
// wide (the grey box). The ends are a minimum too: the room the 300 px
// leaves over goes after the last part.
export const AtLeastEnds = draw((container) =>
  layer([
    rect({ x: 0, y: 0, w: 300, h: 60, fill: "#eeeeee" }),
    spread(
      {
        dir: "x",
        spacing: Spacing.atLeast(10, { ends: 1 }),
        w: 300,
        x: 0,
        y: 10,
      },
      [40, 70, 55].map((w) => rect({ w, h: 40, fill: "#59a14f" }))
    ),
  ]).render(container, { w: 340, h: 100 })
);

// (12) What a bar chart wrote before `ends` for room at its ends: no gap,
// and each bar drawn in by a quarter of its band. Paint only: the bars'
// boxes still touch.
export const BarsInset = draw((container) =>
  chart(fruit, { w: 320, h: 160 })
    .flow(spread({ by: "name", dir: "x", spacing: 0 }))
    .mark(rect({ h: "count", fill: "#4e79a7", inset: percent(25) }))
    .render(container)
);

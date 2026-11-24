import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Color,
  Coord,
  Slack,
  Spacing,
  chart,
  rect,
  spread,
  text,
  layer,
  v,
} from "../../src/lib";

// Renders for the review tab of the user-space layouts proposal (not
// gallery-tagged): `slack` on a lone spread, the start and direction of the
// polar presets, a lone bar with a literal width along the angle, and
// slack in a spread of a stated size.
const meta: Meta = {
  title: "Proposals/Review Examples",
  excludeStories: /^[a-z]/,
};
export default meta;

// ─────────────────────────────────────────────────────────────────────────
// 1. `slack` on a spread: a lone chain of minimum gaps has no room to spare
// ─────────────────────────────────────────────────────────────────────────

const boxes = [60, 40, 50, 70];

const spreadSlack = (slack: Slack.Slack): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    spread(
      { dir: "x", spacing: Spacing.atLeast(8, { slack }) },
      boxes.map((w) =>
        rect({ w, h: 24, rx: 3, fill: "#a8dadc", stroke: "#1d3557" })
      )
    ).render(container, { w: 340, h: 40 });
    return container;
  },
});

export const SpreadSlackStart = spreadSlack(Slack.start());
export const SpreadSlackCenter = spreadSlack(Slack.center());
export const SpreadSlackEnd = spreadSlack(Slack.end());

// ─────────────────────────────────────────────────────────────────────────
// 2. Where a polar space starts, and which way it turns
// ─────────────────────────────────────────────────────────────────────────

const slices = [
  { name: "first", value: 1 },
  { name: "b", value: 2 },
  { name: "c", value: 2 },
  { name: "d", value: 2 },
  { name: "e", value: 2 },
];
// The first slice red, the rest in blues, so the start and the direction
// show.
const palette = Color.palette(["#e63946", "#1d3557", "#457b9d", "#7aa6c2", "#a8c8dc"]);

const pie = (coord: any): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    chart(slices, { coord, w: 200, h: 200, color: palette })
      .flow(spread({ by: "name", dir: "x", spacing: 0.06 }))
      .mark(rect({ w: "value", fill: "name" }))
      .render(container, { axes: false });
    return container;
  },
});

/** Data 0 at 3 o'clock, counter-clockwise. */
export const PiePolar = pie(Coord.polar());
/** Data 0 at 12 o'clock, clockwise. */
export const PieClock = pie(Coord.clock());
/** Data 0 at 3 o'clock, clockwise. `Coord.clock` fixes its start, so this
 *  is spelled on `polar`. */
export const PiePolarClockwise = pie(
  Coord.polar({ baselineAngle: 0, direction: -1 })
);

// ─────────────────────────────────────────────────────────────────────────
// 3. A lone bar with a literal width along the angle
// ─────────────────────────────────────────────────────────────────────────

/** A bar 0.6 wide along the angle, touching nothing. Read as radians, a
 *  wedge of 0.6 rad; read as pixels, a line 0.6 px wide. */
export const LoneAngularBar: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer({ coord: Coord.clock(), w: 200, h: 200 }, [
      rect({ w: 0.6, h: v(5), fill: "steelblue" }),
    ]).render(container, { axes: false });
    return container;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 4. Slack in a spread of a stated size
// ─────────────────────────────────────────────────────────────────────────

const SIZED_W = 400;
const SIZED_GAP = 10;
const SIZED_BOX = 30;
const SIZED_LEFT = 150; // where the 400 px frame starts, past the labels
const SIZED_ROW = 30;
const SIZED_RULES = [
  ["start", Slack.start(), 0],
  ["center", Slack.center(), 0.5],
  ["end", Slack.end(), 1],
] as const;

/** One row: its label, the faint 400 px frame, and the three boxes. */
const sizedRow = (label: string, y: number, boxes: any) => [
  text({ x: 0, y: y + 8, text: label, fontSize: 11, fill: "#1d3557" }),
  rect({
    x: SIZED_LEFT,
    y,
    w: SIZED_W,
    h: 24,
    fill: "none",
    stroke: "#ccc",
    strokeWidth: 1,
  }),
  boxes,
];

/** PROTOTYPE, computed here and not by the library: where the three boxes
 *  would go if the spread's own 400 px bounded the latest solution. The
 *  chain is 3 × 30 + 2 × 10 = 110 px. The ends keep `ends` gaps inside
 *  each side of the frame, and the slack rule takes a fraction t of what
 *  is left. */
const sizedPrototype = (t: number, ends: number, y: number) => {
  const lo = ends * SIZED_GAP;
  const hi = SIZED_W - ends * SIZED_GAP;
  const chain = 3 * SIZED_BOX + 2 * SIZED_GAP;
  const first = lo + t * (hi - lo - chain);
  return layer(
    [0, 1, 2].map((i) =>
      rect({
        x: SIZED_LEFT + first + i * (SIZED_BOX + SIZED_GAP),
        y,
        w: SIZED_BOX,
        h: 24,
        fill: "#f4a261",
      })
    )
  );
};

/** What the library draws: a spread 400 px wide whose minimum gaps state
 *  the slack rule. */
const sizedToday = (slack: Slack.Slack, ends: number, y: number) =>
  spread(
    {
      dir: "x",
      w: SIZED_W,
      x: SIZED_LEFT,
      y,
      spacing: Spacing.atLeast(SIZED_GAP, { slack, ends }),
    },
    [0, 1, 2].map(() => rect({ w: SIZED_BOX, h: 24, fill: "#457b9d" }))
  );

/** A spread with `w: 400` and `Spacing.atLeast(10, { slack })` under each
 *  rule (blue, what the library draws), each above a prototype of what it
 *  would draw if the spread's size bounded the latest solution (orange,
 *  computed in this file, not by the library). The second half adds
 *  `ends: 0.5`. */
export const SizedSpreadSlack: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const rows: any[] = [];
    let y = 0;
    for (const ends of [0, 0.5]) {
      for (const [name, slack, t] of SIZED_RULES) {
        rows.push(
          ...sizedRow(`${name}, ends ${ends}: today`, y, sizedToday(slack, ends, y)),
          ...sizedRow(
            `${name}, ends ${ends}: proposed`,
            y + SIZED_ROW,
            sizedPrototype(t, ends, y + SIZED_ROW)
          )
        );
        y += 2 * SIZED_ROW + 8;
      }
      y += 12;
    }
    layer(rows).render(container, { w: SIZED_LEFT + SIZED_W + 10, h: y });
    return container;
  },
};

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
  layer,
  v,
} from "../../src/lib";

// Renders for the review tab of the user-space layouts proposal (not
// gallery-tagged): `slack` on a lone spread, the start and direction of the
// polar presets, and a lone bar with a literal width along the angle.
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
      { dir: "x", spacing: Spacing.atLeast(8), slack },
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

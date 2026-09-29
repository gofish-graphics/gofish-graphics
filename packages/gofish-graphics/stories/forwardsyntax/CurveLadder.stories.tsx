import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { drivingShifts } from "../../src/data/drivingShifts";
import {
  chart,
  circle,
  gofish,
  line,
  live,
  scatter,
  text,
  time,
  timer,
} from "../../src/lib";
import { pausedClock } from "../animated-vega-lite/pausedClock";

/**
 * The data-space curve ladder, from the least to the most smooth: the same
 * data drawn with each of `step`, `linear`, `monotone`, `smooth` and
 * `smoother`. Each row is one curve: gas price by year on the left, and the
 * connected scatter plot of miles driven against gas price on the right.
 *
 * `step` holds every value that depends on the year until the next year,
 * then jumps. In the chart over years the year is the x axis, so the line
 * moves along x while gas holds: a staircase. In the connected scatter plot
 * both miles and gas depend on the year, so both hold and the jump is a
 * straight diagonal: the same shape as `linear`, with all the time spent at
 * the points.
 *
 * What to look for: `monotone` turns exactly on the points and never goes
 * past them; `smooth` rounds a peak a little past its point but keeps a run
 * of equal prices flat; `smoother` has no visible corners in its curvature,
 * with small dips next to a jump.
 */
const meta: Meta = {
  title: "Forward Syntax/Curve Ladder",
};
export default meta;

const CURVES = ["step", "linear", "monotone", "smooth", "smoother"] as const;

export const Ladder: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "90px 620px 380px";
    container.style.alignItems = "center";
    container.style.gap = "8px 16px";
    container.style.fontFamily = "sans-serif";

    for (const curve of CURVES) {
      const label = document.createElement("div");
      label.textContent = curve;
      label.style.fontWeight = "bold";
      container.appendChild(label);

      const byYear = document.createElement("div");
      const connected = document.createElement("div");
      container.appendChild(byYear);
      container.appendChild(connected);

      const panel = (x: string, into: HTMLElement, w: number) =>
        chart(drivingShifts, { axes: true })
          .flow(scatter({ by: "year", x, y: "gas" }))
          .mark(
            circle({ r: 2.5, fill: "white", stroke: "black", strokeWidth: 1 })
          )
          .layer(line({ along: "year", curve, stroke: "steelblue" }))
          .render(into, { w, h: 240 });
      panel("year", byYear, 600);
      panel("miles", connected, 360);
    }

    return container;
  },
};

/** The years the driving data covers, which the shared clock plays. */
const YEARS: [number, number] = [1956, 2010];

/**
 * One panel of the animated ladder: the static `Ladder` panel, with a moving
 * dot layered over it. The dot is a second chart of the same rows, played by
 * `time.sequence` over year on the shared clock and moved by
 * `time.transition` with the panel's curve. The line and the transition read
 * the same curve over the same knots (the years), so the dot rides exactly on
 * the line. The layered chart places its marks by the same fields as the
 * panel, so it shares the panel's scales.
 */
const animatedPanel = (
  x: string,
  curve: (typeof CURVES)[number],
  clock: any
) =>
  chart(drivingShifts, { axes: true })
    .flow(scatter({ by: "year", x, y: "gas" }))
    .mark(circle({ r: 2.5, fill: "white", stroke: "black", strokeWidth: 1 }))
    .layer(line({ along: "year", curve, stroke: "steelblue" }))
    .layer(
      chart(drivingShifts)
        .flow(
          time.sequence({ by: "year", on: clock }),
          scatter({ x, y: "gas" })
        )
        .mark(
          circle({ r: 5, fill: "#e4572e", stroke: "black", strokeWidth: 1.5 })
        )
        .layer(time.transition({ curve }))
    );

/**
 * The ladder as a grid with one column per curve, so the curves sit side by
 * side: gas price by year on top, the connected scatter plot of miles against
 * gas price below. Every panel's dot moves on one clock, and the year is
 * written once above the grid.
 */
const animatedLadder = (clock: any) => {
  const container = initializeContainer();
  container.style.fontFamily = "sans-serif";

  const readout = document.createElement("div");
  container.appendChild(readout);
  gofish(readout, { w: 200, h: 50 } as any, () =>
    text({
      text: live(() => clock().toFixed(1)),
      fontSize: 36,
      fill: "#bbb",
    })
  );

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${CURVES.length}, 230px)`;
  grid.style.gap = "4px 12px";
  container.appendChild(grid);
  for (const curve of CURVES) {
    const label = document.createElement("div");
    label.textContent = curve;
    label.style.fontWeight = "bold";
    label.style.textAlign = "center";
    grid.appendChild(label);
  }
  for (const x of ["year", "miles"]) {
    for (const curve of CURVES) {
      const cell = document.createElement("div");
      grid.appendChild(cell);
      animatedPanel(x, curve, clock).render(cell, { w: 175, h: 280 });
    }
  }
  return container;
};

/** The animated ladder: every dot moves through the years on one clock, so
 *  the curves can be compared at the same year. */
export const LadderAnimated: StoryObj = {
  render: () => animatedLadder(timer({ domain: YEARS, duration: 20000 })),
};

/** The animated ladder held at 1980.5, between the 1980 and 1981 gas peaks of
 *  3.30: `monotone` stays flat at 3.30, while `smooth` and `smoother` pass
 *  above it. */
export const LadderAnimatedPaused1980: StoryObj = {
  render: () => animatedLadder(pausedClock(YEARS, 20000, 1980.5)),
};

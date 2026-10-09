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
import {
  type Gap,
  type LadderCurve,
  type PixelMap,
  largestGaps,
  samplePath,
  toPixels,
} from "./curveGaps";

/**
 * The data-space curve ladder, from the least to the most smooth: the same
 * data drawn with each of `step`, `linear`, `monotone` and `smooth`. Each
 * row is one curve: gas price by year on the left, and the
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
 * of equal prices flat.
 */
const meta: Meta = {
  title: "Forward Syntax/Curve Ladder",
};
export default meta;

const CURVES = ["step", "linear", "monotone", "smooth"] as const;

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
        chart(drivingShifts)
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

/** A panel's plot size, and its pixel map. Every gap below is measured
 *  through this map, so a gap's "px" is a distance on this 560 × 420 plot.
 *
 *  The map is the one the chart resolves: its axes run over the data's
 *  extents rounded out to their ticks, 3,500 to 10,500 miles and $1.20 to
 *  $3.40, spread over the plot (read off a render). Every panel resolves the
 *  same domain because everything layered into one stays inside it: the
 *  curves pass the data by at most a few cents, and the rings and their
 *  labels are placed inside the plot. */
const PANEL = { w: 560, h: 420 };
const knots = drivingShifts.map((d) => d.year);
const milesOf = drivingShifts.map((d) => d.miles);
const gasOf = drivingShifts.map((d) => d.gas);
const PIXELS: PixelMap = { x: [3500, 10500], y: [1.2, 3.4], ...PANEL };
/** A point on the panel, in pixels, back in data: where a ring is placed. */
const toData = (p: { x: number; y: number }) => ({
  miles: PIXELS.x[0] + (p.x / PIXELS.w) * (PIXELS.x[1] - PIXELS.x[0]),
  gas: PIXELS.y[1] - (p.y / PIXELS.h) * (PIXELS.y[1] - PIXELS.y[0]),
});

/** Each curve's path on the panel, in pixels, sampled densely over year. */
const pathOf = (curve: LadderCurve) =>
  samplePath(curve, knots, milesOf, gasOf).map((p) => toPixels(PIXELS, p));

/** Where each curve parts company from the rung below it: the three largest
 *  gaps, from distinct places. */
const GAPS = new Map(
  CURVES.slice(1).map((curve, k) => [
    curve,
    { below: CURVES[k], gaps: largestGaps(pathOf(curve), pathOf(CURVES[k]), knots) },
  ])
);

const RING = "#d62728";

/** The rings around one panel's gaps, each with its rank and size written
 *  just above it. Ordinary marks in a chart of their own, placed by the same
 *  fields as the panel, so they share its scales. */
const rings = (gaps: Gap[]) => {
  if (gaps.length === 0) return [];
  const rows = gaps.map((g, i) => ({
    id: i,
    ...toData(g.at),
    label: `${i + 1} · ${g.px.toFixed(1)} px`,
  }));
  const labels = gaps.map((g, i) => ({
    id: i,
    // Above the ring in the lower half of the plot, below it in the upper
    // half, so a label never leaves the plot.
    ...toData({ x: g.at.x, y: g.at.y + (g.at.y < PANEL.h / 2 ? 30 : -30) }),
    label: rows[i].label,
  }));
  return [
    chart(rows)
      .flow(scatter({ by: "id", x: "miles", y: "gas" }))
      .mark(circle({ r: 16, fill: "none", stroke: RING, strokeWidth: 2 })),
    chart(labels)
      .flow(scatter({ by: "id", x: "miles", y: "gas" }))
      .mark((group: any[]) =>
        text({ text: group[0].label, fontSize: 12, fill: RING })
      ),
  ];
};

/**
 * One panel of the animated ladder: the driving connected scatter plot drawn
 * with the panel's curve, thick, over a faint dashed ghost of the rung below
 * it, with red rings around the three places the two part company most, and
 * a moving dot. The dot is a chart of the same rows, played by
 * `time.sequence` over year on the shared clock and moved by
 * `time.transition` with the panel's curve, so it rides exactly on the line.
 * The layered charts place their marks by the same fields as the panel, so
 * they share its scales.
 */
const animatedPanel = (curve: LadderCurve, clock: any) => {
  const below = GAPS.get(curve);
  /** The years as points, placed on the panel. The ghost and the panel's own
   *  curve are each a line threaded along year through their own copy. */
  const points = () =>
    chart(drivingShifts).flow(scatter({ by: "year", x: "miles", y: "gas" }));
  // The panel's frame and axes, with the ghost of the rung below, if any,
  // drawn first so everything else sits over it.
  let panel = chart(drivingShifts)
    .flow(scatter({ by: "year", x: "miles", y: "gas" }))
    .mark(circle({ r: 3.5, opacity: 0 }));
  if (below !== undefined) {
    panel = panel.layer(
      line({
        along: "year",
        curve: below.below,
        stroke: "#999",
        strokeWidth: 1.5,
        strokeDasharray: "6,4",
      })
    );
  }
  panel = panel
    .layer(
      points()
        .mark(
          circle({ r: 3.5, fill: "white", stroke: "black", strokeWidth: 1 })
        )
        .layer(
          line({ along: "year", curve, stroke: "steelblue", strokeWidth: 2.5 })
        )
    )
    .layer(
      chart(drivingShifts)
        .flow(
          time.sequence({ by: "year", on: clock }),
          scatter({ x: "miles", y: "gas" })
        )
        .mark(circle({ r: 7, fill: "#e4572e", stroke: "black", strokeWidth: 1.5 }))
        .layer(time.transition({ curve }))
    );
  for (const ringChart of below === undefined ? [] : rings(below.gaps)) {
    panel = panel.layer(ringChart);
  }
  return panel;
};

/** The caption under a panel: what it is compared with, and the largest gap. */
const caption = (curve: LadderCurve): string => {
  const below = GAPS.get(curve);
  if (below === undefined) {
    return "step: holds each point until the next year, then jumps";
  }
  const [top] = below.gaps;
  if (top === undefined) {
    return `vs ${below.below} (dashed): the same path. On a connected scatter plot step holds both values and jumps diagonally, so it differs only in timing.`;
  }
  return `vs ${below.below} (dashed): largest gap ${top.px.toFixed(1)} px, ${top.from}–${top.to}`;
};

/**
 * The ladder as a two-by-two grid of large panels, one per curve, each the
 * driving connected scatter plot. Every panel's dot moves on one clock, and
 * the year is written once above the grid. Gaps are distances in pixels on
 * a 560 × 420 panel, with the data's extents spread over the panel.
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
  grid.style.gridTemplateColumns = `repeat(2, ${PANEL.w + 40}px)`;
  grid.style.gap = "24px 8px";
  container.appendChild(grid);
  for (const curve of CURVES) {
    const cell = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = curve;
    title.style.fontWeight = "bold";
    cell.appendChild(title);
    const plot = document.createElement("div");
    cell.appendChild(plot);
    const note = document.createElement("div");
    note.textContent = caption(curve);
    note.style.fontSize = "13px";
    note.style.color = "#555";
    note.style.maxWidth = `${PANEL.w + 30}px`;
    cell.appendChild(note);
    grid.appendChild(cell);
    animatedPanel(curve, clock).render(plot, PANEL);
  }
  return container;
};

/** The animated ladder: every dot moves through the years on one clock, so
 *  the curves can be compared at the same year. */
export const LadderAnimated: StoryObj = {
  render: () => animatedLadder(timer({ domain: YEARS, duration: 20000 })),
};

/** The animated ladder held at 1980.5, inside the year where `smooth` and
 *  `monotone` are furthest apart: 1980 to 1981, where gas peaks and miles
 *  turn back, and `smooth` rounds the peak past its point. */
export const LadderAnimatedPaused1980: StoryObj = {
  render: () => animatedLadder(pausedClock(YEARS, 20000, 1980.5)),
};

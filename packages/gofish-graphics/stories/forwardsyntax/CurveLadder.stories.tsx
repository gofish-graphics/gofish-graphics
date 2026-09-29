import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { drivingShifts } from "../../src/data/drivingShifts";
import { chart, circle, interpolate, line, scatter } from "../../src/lib";

/**
 * The data-space curve ladder, from the least to the most smooth: the same
 * data drawn with each of `step`, `linear`, `monotone`, `smooth` and
 * `smoother`. Each row is one curve: gas price by year on the left, and the
 * connected scatter plot of miles driven against gas price on the right.
 *
 * `step` is a way to read a run over time (`time.transition`,
 * `interpolate`), not a path shape, so its row draws the run read with
 * `interpolate({ method: "step" })` at every year and just before the next,
 * joined with straight lines: each value holds until the next one's time
 * arrives, and then jumps. In the connected scatter plot both values jump
 * at once, so the step row looks like the linear one there.
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

/** The run read with the step method at every year and just before the
 *  next one, so straight lines between the readings draw the steps. */
const run = drivingShifts.map((d) => ({ ...d, run: "us" }));
const stepped = drivingShifts.flatMap((d, i) =>
  (i === 0 ? [d.year] : [d.year - 1e-6, d.year]).flatMap((at) =>
    interpolate(run, { along: "year", key: "run", at, method: "step" })
  )
);

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

      const panel = (x: string, into: HTMLElement, w: number) => {
        if (curve === "step") {
          chart(stepped, { axes: true })
            .flow(scatter({ by: "year", x, y: "gas" }))
            .mark(line({ along: "year", curve: "linear", stroke: "steelblue" }))
            .render(into, { w, h: 240 });
          return;
        }
        chart(drivingShifts, { axes: true })
          .flow(scatter({ by: "year", x, y: "gas" }))
          .mark(circle({ r: 2.5, fill: "white", stroke: "black", strokeWidth: 1 }))
          .layer(line({ along: "year", curve, stroke: "steelblue" }))
          .render(into, { w, h: 240 });
      };
      panel("year", byYear, 600);
      panel("miles", connected, 360);
    }

    return container;
  },
};

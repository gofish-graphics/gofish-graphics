// Connected Scatter Plot Animated
// Fifty-five years of miles driven per person against the price of gas, with the line drawn in year by year as the animation plays.

import { chart, line, scatter, time, timer } from "gofish-graphics";
import { drivingShifts } from "./dataset";
const YEARS = [1956, 2010];
const DURATION = 54 * 200;
const playing = () => timer({ domain: YEARS, duration: DURATION });
const years = (clock, ...between) =>
  chart(drivingShifts).flow(
    time.sequence({ by: "year", on: clock }),
    ...between,
    scatter({ x: "miles", y: "gas" }),
  );
const port = (clock) =>
  years(clock, time.history()).mark(line({ along: "year", curve: "linear" }));
const container = document.getElementById("app");
port(playing()).render(container, { w: 500, h: 500, axes: true });

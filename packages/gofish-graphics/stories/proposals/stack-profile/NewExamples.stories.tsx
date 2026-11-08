// THROWAWAY prototypes for the stack-profile proposal
// (proposals/stack-profile/proposal.md). Each story renders a hard example
// with today's API. Where the proposed spelling needs something GoFish does
// not have, the numbers are computed in plain JS first and the comment says
// "EMULATED".
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  scatter,
  stack,
  group,
  ribbon,
  line,
  Color,
} from "../../../src/lib";

const meta: Meta = { title: "Proposals/Stack Profile/New Examples" };
export default meta;

const show = (fn: (c: HTMLElement) => unknown) => {
  const container = initializeContainer();
  Promise.resolve()
    .then(() => fn(container))
    .catch((e) => {
      const pre = document.createElement("pre");
      pre.textContent = "ERROR: " + (e?.message ?? String(e));
      container.prepend(pre);
      console.error(e);
    });
  return container;
};

// ---------------------------------------------------------------------------
// Fan chart: a history line, then nested central intervals of a forecast
// (50%, 80%, 95%) that widen with the horizon, as in the Bank of England's
// inflation fan charts. Every interval is a pair of position profiles
// (lo(t), hi(t)). Nothing adds: the intervals are positions on one axis.
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647 - 0.5;
};
const history: { t: number; v: number }[] = [];
{
  let v = 2.0;
  for (let t = 0; t <= 24; t++) {
    v += rand() * 0.5 + 0.02;
    history.push({ t, v });
  }
}
const last = history[history.length - 1];
const Z: Record<string, number> = { "95%": 1.96, "80%": 1.2816, "50%": 0.6745 };
const LEVELS = ["95%", "80%", "50%"];
const forecast = LEVELS.flatMap((level) =>
  Array.from({ length: 13 }, (_, k) => {
    const t = last.t + k;
    const median = last.v + 0.03 * k;
    const sd = 0.22 * Math.sqrt(k);
    return {
      t,
      level,
      median,
      lo: median - Z[level] * sd,
      hi: median + Z[level] * sd,
    };
  })
);
const FAN = Color.palette({ "95%": "#f4c7c3", "80%": "#e8857c", "50%": "#c0392b" });

export const FanChart: StoryObj = {
  name: "Fan chart",
  render: () =>
    show((c) =>
      chart(forecast, { w: 460, h: 240, color: FAN })
        .flow(group({ by: "level" }), scatter({ by: "t", x: "t", yMin: "lo", yMax: "hi" }))
        .mark(ribbon({ fill: "level" }))
        .layer(
          chart(history)
            .flow(scatter({ by: "t", x: "t", y: "v" }))
            .mark(line({ stroke: "#333", strokeWidth: 2 }))
        )
        .render(c, { axes: { x: { title: "month" }, y: { title: "inflation (%)" } } } as any)
    ),
};

// The same fan written as a stack: the parts are the gaps between
// neighboring quantiles (they add up to the 95% width), and the stack's
// baseline is the lowest quantile, a profile, not 0. EMULATED: the baseline
// is a first part with no fill, because `stack` has no profile baseline.
const QS = [
  { name: "base", z: -1.96 },
  { name: "95% low", z: -1.2816 },
  { name: "80% low", z: -0.6745 },
  { name: "50%", z: 0.6745 },
  { name: "80% high", z: 1.2816 },
  { name: "95% high", z: 1.96 },
];
const incrementRows = Array.from({ length: 13 }, (_, k) => {
  const t = last.t + k;
  const median = last.v + 0.03 * k;
  const sd = 0.22 * Math.sqrt(k);
  return QS.map((q, i) => ({
    t,
    part: q.name,
    // the base part spans 0 to the lowest quantile; the others are the
    // distance from the previous quantile up to this one
    h: i === 0 ? median + q.z * sd : (q.z - QS[i - 1].z) * sd,
  }));
}).flat();
const FAN_STACK = Color.palette({
  base: "transparent",
  "95% low": "#f4c7c3",
  "80% low": "#e8857c",
  "50%": "#c0392b",
  "80% high": "#e8857c",
  "95% high": "#f4c7c3",
});
export const FanChartAsStack: StoryObj = {
  name: "Fan chart as a stack",
  render: () =>
    show((c) =>
      chart(incrementRows, { w: 460, h: 240, color: FAN_STACK })
        .flow(scatter({ by: "t", x: "t" }), stack({ by: "part", dir: "y" }))
        .mark(ribbon({ h: "h", fill: "part" }))
        .layer(
          chart(history)
            .flow(scatter({ by: "t", x: "t", y: "v" }))
            .mark(line({ stroke: "#333", strokeWidth: 2 }))
        )
        .render(c, { legend: false, axes: { x: { title: "month" }, y: { title: "inflation (%)" } } } as any)
    ),
};

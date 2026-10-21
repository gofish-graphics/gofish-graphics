/**
 * THROWAWAY prototype stories for the proposal in
 * `proposals/python-animation-interaction/proposal.md`.
 *
 * Each story draws one animated or interactive spec as a STRIP: the same spec
 * held at several values of its clock or input, side by side, so one capture
 * shows how it moves. Every panel is rendered by today's JS library. The
 * clocks are paused timers (`playing: false` plus `.set(at)`), and the input
 * states are fixed values standing in for a pointer, a drag or a wheel, which
 * is exactly what a source's initial value would be in the proposed IR.
 *
 * Not gallery-tagged, and exempt from Python parity: this is review material,
 * not an example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood } from "../../../src/data/catch";
import { penguins } from "../../../src/data/penguins";
import {
  categoryBrands,
  type CategoryBrand,
} from "../../../src/data/categoryBrands";
import {
  Animation,
  Curve,
  chart,
  circle,
  derive,
  field,
  layer,
  line,
  live,
  rect,
  scatter,
  spread,
  sumBy,
  text,
  time,
  timer,
  type Timer,
} from "../../../src/lib";
import data from "vega-datasets";

const meta: Meta = { title: "Proposals/Python Anim Interaction" };
export default meta;

const FONT = "system-ui, -apple-system, sans-serif";

const paused = (domain: [number, number], duration: number, at: number) => {
  const clock = timer({ domain, duration, playing: false, loop: false });
  clock.set(at);
  return clock;
};

/** A row of captioned panels; `draw` renders one panel into its box. */
const strip = <T,>(
  values: T[],
  caption: (v: T) => string,
  draw: (box: HTMLElement, v: T) => void
) => {
  const page = initializeContainer();
  Object.assign(page.style, {
    fontFamily: FONT,
    display: "flex",
    flexWrap: "wrap",
    maxWidth: "1180px",
    gap: "14px 22px",
    alignItems: "flex-start",
  });
  for (const v of values) {
    const cell = document.createElement("div");
    const label = document.createElement("div");
    Object.assign(label.style, { fontSize: "13px", color: "#555" });
    label.textContent = caption(v);
    const box = document.createElement("div");
    cell.append(label, box);
    page.appendChild(cell);
    draw(box, v);
  }
  return page;
};

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const TRAIL_COUNTRIES = [
  "China",
  "India",
  "United States",
  "Rwanda",
  "South Africa",
];

/** Gapminder with trails (the `Trails` story's spec) at four playheads. */
export const GapminderTrailsStrip: StoryObj = {
  loaders: [async () => ({ gapminder: await data["gapminder.json"]() })],
  render: (_args: unknown, context: any) => {
    const gapminder = (context.loaded.gapminder as any[]).filter((d) =>
      TRAIL_COUNTRIES.includes(d.country)
    );
    return strip(
      [1957.5, 1967.5, 1982.5, 1997.5],
      (y) => `year ${y}`,
      (box, at) => {
        const year = paused([1955, 2005], 10000, at);
        chart(gapminder, { legend: false })
          .flow(
            time.sequence({ by: "year", on: year }),
            scatter({ by: "country", x: "fertility", y: "life_expect" })
          )
          .mark(
            layer([
              time.history([circle({ r: 4, fill: "country", opacity: 0.3 })]),
              circle({ r: 4, fill: "country" }).transition({
                update: Animation.tween({ curve: Curve.monotone() }),
              }),
            ])
          )
          .layer(
            line({
              along: "year",
              stroke: "country",
              strokeWidth: 1.5,
              opacity: 0.6,
              curve: Curve.monotone(),
            })
          )
          .layer(
            chart([{ fertility: 7.2, life_expect: 80 }])
              .flow(scatter({ x: "fertility", y: "life_expect" }))
              .mark(
                text({
                  text: live(() => String(Math.floor(year()))),
                  fontSize: 32,
                  fill: "#ccc",
                }).zOrder(-1)
              )
          )
          .render(box, { w: 380, h: 280, axes: true } as any);
      }
    );
  },
};

/** The top-ten bar chart race across one year boundary: Mercedes-Benz fades
 *  out and Google fades in. */
const rankTop = (rows: CategoryBrand[], n: number) => {
  const years = Array.from(new Set(rows.map((d) => d.year)));
  return years.flatMap((y) =>
    rows
      .filter((d) => d.year === y)
      .sort((a, b) => b.value - a.value)
      .slice(0, n)
  );
};
const top10 = rankTop(categoryBrands, 10);

export const RaceTop10Strip: StoryObj = {
  render: () =>
    strip(
      [2007, 2007.5, 2008],
      (y) => `year ${y}`,
      (box, at) => {
        const year: Timer<number> = paused([2000, 2019], 20000, at);
        chart(top10, { legend: false })
          .flow(
            time.sequence({ by: "year", on: year }),
            spread({
              by: field("name").sort("value", "desc"),
              dir: "y",
              spacing: 2,
            })
          )
          .mark(
            rect({ w: "value", fill: "category" }).label("name", {
              position: "outset-right",
            })
          )
          .layer(time.transition({ curve: Curve.linear() }))
          .render(box, {
            w: 300,
            h: 300,
            axes: { x: true, y: false },
          } as any);
      }
    ),
};

/** A staggered build-in (the `Build-in Prototype` example 2) at four times. */
const alphabet = [
  { letter: "A", frequency: 0.08167 },
  { letter: "B", frequency: 0.01492 },
  { letter: "C", frequency: 0.02782 },
  { letter: "D", frequency: 0.04253 },
  { letter: "E", frequency: 0.12702 },
  { letter: "F", frequency: 0.02288 },
  { letter: "G", frequency: 0.02015 },
  { letter: "H", frequency: 0.06094 },
  { letter: "I", frequency: 0.06966 },
  { letter: "J", frequency: 0.00153 },
];

export const BuildInStaggerStrip: StoryObj = {
  render: () =>
    strip(
      [0, 300, 700, 1200],
      (t) => `t = ${t} ms`,
      (box, at) => {
        chart(alphabet)
          .flow(
            spread({ by: "letter", dir: "x" }).transition({
              enter: time.stagger({ lag: 60 }),
            })
          )
          .mark(
            rect({ h: "frequency" }).transition({
              enter: Animation.grow({ duration: 600 }),
            })
          )
          .render(box, { w: 210, h: 160, playing: false, at } as any);
      }
    ),
};

/** A static accessor sees one row or a group of rows; a `live()` one sees the
 *  group. Read both the same way. */
const rowsOf = (d: any): any[] => (Array.isArray(d) ? d : [d]);

// ---------------------------------------------------------------------------
// Interaction: the state each input value draws
// ---------------------------------------------------------------------------

/** Hover highlight with the pointer over no bar, Lake B, and Lake E. The fill
 *  is what the proposed expression `when(hover.over()).then(red)` evaluates
 *  to in that state. */
export const HoverStates: StoryObj = {
  render: () =>
    strip(
      [undefined, "Lake B", "Lake E"] as (string | undefined)[],
      (lake) => (lake ? `pointer over ${lake}` : "no pointer"),
      (box, lake) => {
        chart(seafood)
          .flow(spread({ by: "lake", dir: "x" }))
          .mark(
            rect({
              h: "count",
              fill: (d: any) =>
                rowsOf(d)[0]?.lake === lake ? "#d62728" : "#6b9bd1",
            })
          )
          .render(box, { w: 240, h: 220 });
      }
    ),
};

const bars = [
  { cat: "a", count: 30 },
  { cat: "b", count: 95 },
  { cat: "c", count: 55 },
  { cat: "d", count: 72 },
  { cat: "e", count: 40 },
  { cat: "f", count: 88 },
];

/** Draggable threshold at three values of `cut`: the rule moves (a pipeline
 *  read) and the bars above it turn red (a paint read). */
export const ThresholdStates: StoryObj = {
  render: () =>
    strip(
      [35, 60, 85],
      (c) => `cut = ${c}`,
      (box, cut) => {
        chart(bars)
          .flow(spread({ by: "cat", dir: "x" }))
          .mark(
            rect({
              h: "count",
              fill: (d: any) =>
                sumBy(rowsOf(d), "count") > cut ? "#d62728" : "#6b9bd1",
            })
          )
          .layer(rect({ y: () => cut, h: 3, w: 240, fill: "#333" }))
          .render(box, { w: 240, h: 200 });
      }
    ),
};

const MASS = "Body Mass (g)";
function binRows(rows: typeof penguins, k: number) {
  const masses = rows
    .map((p) => p[MASS])
    .filter((m): m is number => m !== null);
  const [lo, hi] = [Math.min(...masses), Math.max(...masses)];
  const width = (hi - lo) / k;
  const counts = new Array<number>(k).fill(0);
  for (const m of masses) counts[Math.min(k - 1, Math.floor((m - lo) / width))]++;
  return counts.map((count, i) => ({
    bin: String(Math.round(lo + i * width)),
    count,
  }));
}

/** Semantic zoom at three wheel positions: each re-bins the rows in a derive
 *  (the tier a Python callback can serve). */
export const SemanticZoomStates: StoryObj = {
  render: () =>
    strip(
      [6, 12, 24],
      (k) => `bins = ${k}`,
      (box, k) => {
        chart(penguins)
          .flow(
            derive((rows) => binRows(rows, k)),
            spread({ by: "bin", dir: "x" })
          )
          .mark(rect({ h: "count" }))
          .render(box, { w: 260, h: 200 });
      }
    ),
};

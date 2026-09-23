/**
 * Bar chart race — the *Animated Vega-Lite* rescale example (Zong, Pollock,
 * Wootton, Satyanarayan, IEEE VIS 2022, Fig. 4A), after Mike Bostock's D3 bar
 * chart race, and the sibling of the Gapminder stories (issue #831).
 *
 * It is the Gapminder spec with the scatter swapped for a sorted bar chart.
 * The inner `spread` sorts the brands by value, largest on top, and the
 * transition is `curve: "linear"`, so every bar slides to its new rank and
 * grows or shrinks at a steady rate between two years, the way the D3
 * original moves. Each brand's name is a label just past the end of its bar.
 *
 * `sharedScale: true` is the spelling of Animated Vega-Lite's `rescale: true`:
 * each year's spread solves a value scale of its own, so the longest bar always
 * spans the plot. KNOWN GAP (issue #891): under a `time.sequence` it does not
 * take effect yet. The spread does solve its own σ, but the bars size
 * themselves through the chart's anchored x map, which the shared scope leaves
 * as the root's (`buildChildScalePlan` in `src/ast/constraints/proposalPlan.ts`
 * replaces σ and not the map; `rect.tsx` prefers the map). So every year is
 * drawn against the whole run's x domain for now, Animated Vega-Lite's
 * `rescale: false` (the paper's Fig. 4B).
 *
 * A label is part of its mark, so the transition moves each name with its
 * bar. The names sit OUTSIDE the bars. Inside the right end, as in the D3
 * original, works too, but while every year is drawn against the whole run's
 * x domain (the known gap above) the short bars are narrower than their names.
 *
 * FRAME2000 is one year filtered by hand, the static bar chart a keyframe is.
 * The PAUSED stories are the animation held still, on a keyframe and between
 * two, so the frames can be captured without a playing clock.
 *
 * DECLARED SHORTCUT: the chart plays only the 37 brands that have a value in
 * every year (`everyYearBrands`). A brand that enters or leaves the ranking
 * partway through needs a transition that can bring a mark into or out of
 * existence. The default for that is built (a bar fades in or out in place,
 * see `Top10`); options to restyle it are not (animation design note,
 * Appendix B). They are to come as a high level
 * `.transition({ enter, update, exit })`, tracked in issue #831; when it lands
 * this story should play all 173 brands and keep only the top N per year.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  field,
  filter,
  group,
  live,
  rect,
  scatter,
  selectAll,
  spread,
  text,
  time,
  timer,
  type Timer,
} from "../../src/lib";
import { pausedClock } from "./pausedClock";
import {
  categoryBrands,
  everyYearBrands,
  type CategoryBrand,
} from "../../src/data/categoryBrands";

const meta: Meta = {
  title: "Animated Vega-Lite/Bar Chart Race",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 2000, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/** The 37 brands present in every year (see the shortcut note above). */
const brands = everyYearBrands(categoryBrands);

/** Every row of the full dataset with its `rank` that year among all that
 *  year's brands, largest first. Rows come year by year, each year in rank
 *  order. */
const rankEachYear = (
  rows: CategoryBrand[]
): (CategoryBrand & { rank: number })[] => {
  const years = Array.from(new Set(rows.map((d) => d.year)));
  return years.flatMap((y) =>
    rows
      .filter((d) => d.year === y)
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, rank: i + 1 }))
  );
};
const ranked = rankEachYear(categoryBrands);

/** The top ten brands of each year. A brand's run has a knot only in the
 *  years it ranks. */
const top10: CategoryBrand[] = ranked
  .filter((d) => d.rank <= 10)
  .map(({ rank, ...d }) => d);

/** D3's bar chart race data shape: the brands that ever rank in a year's top
 *  `n`, with a row in every year they have a value, each carrying its `rank`
 *  that year among ALL that year's brands, clamped to `n + 1`. Rank `n + 1` is
 *  the slot just below the visible ones, where a brand waits while it is out
 *  of the top `n`, so it enters and leaves by sliding rather than fading. */
const rankedTopEachYear = (
  ranked: (CategoryBrand & { rank: number })[],
  n: number
): (CategoryBrand & { rank: number })[] => {
  const kept = new Set(ranked.filter((d) => d.rank <= n).map((d) => d.name));
  return ranked
    .filter((d) => kept.has(d.name))
    .map((d) => ({ ...d, rank: Math.min(d.rank, n + 1) }));
};
const top10Ranked = rankedTopEachYear(ranked, 10);

/** The first and last keyframes, for the clock a readout shares. */
const YEARS: [number, number] = [2000, 2019];
/** One pass through the twenty years: a second per year. */
const DURATION = 20000;

/**
 * The year the chart is showing, written large and pale in the plot's bottom
 * right, where the shortest bars leave the room, as in the D3 original.
 *
 * It is a tier of its own holding one row, like Gapminder's readout. The row's
 * `value` places it on the chart's x scale; the y is in pixels from the top of
 * the plot, because the bars' y is a ranking, not a scale a row could sit on.
 * `zOrder(-1)` puts it behind the bars.
 */
const yearReadout = (clock: () => number, h: number) =>
  chart([{ value: 210000 }])
    .flow(scatter({ x: "value" }))
    .mark(
      text({
        text: live(() => String(Math.floor(clock()))),
        fontSize: 48,
        fill: "#ccc",
        y: h - 130,
      }).zOrder(-1)
    );

/** The race on a clock the caller hands in, so the paused stories are the
 *  animated one read at a fixed playhead. The same spec as `Animated`,
 *  duplicated on purpose: the docs extractor copies helpers into the gallery
 *  snippet but not a bare `args` or type-only names, so `Animated` must write
 *  the spec out itself. Keep the two in step. */
const race = (
  container: HTMLElement,
  args: Args,
  year: Timer<number>,
  rows: CategoryBrand[] = brands
) =>
  chart(rows, { legend: false })
    .flow(
      time.sequence({ by: "year", on: year }),
      spread({
        by: field("name").sort("value", "desc"),
        dir: "y",
        sharedScale: true,
        spacing: 2,
      })
    )
    .mark(
      rect({ w: "value", fill: "category" }).label("name", {
        position: "outset-right",
      })
    )
    .layer(time.transition({ curve: "linear" }))
    .layer(yearReadout(year, args.h))
    .render(container, {
      w: args.w,
      h: args.h,
      axes: { x: true, y: false },
    } as any);

/**
 * The animation. Beside Gapminder's `Animated`, the scatter became a spread
 * sorted by value, with a value scale per year, and the transition reads the
 * run linearly instead of smoothing it.
 */
export const Animated: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bar Chart Race",
      description:
        "Twenty years of brand values as an animated bar chart race, in which every brand slides to its new rank as the years go by.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();
    const year = timer({ domain: YEARS, duration: DURATION });

    chart(brands, { legend: false })
      .flow(
        time.sequence({ by: "year", on: year }),
        spread({
          by: field("name").sort("value", "desc"),
          dir: "y",
          sharedScale: true,
          spacing: 2,
        })
      )
      .mark(
        rect({ w: "value", fill: "category" }).label("name", {
          position: "outset-right",
        })
      )
      .layer(time.transition({ curve: "linear" }))
      .layer(yearReadout(year, args.h))
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: true, y: false },
      } as any);

    return container;
  },
};

/** The race held on its first keyframe. */
export const Paused2000: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, pausedClock(YEARS, DURATION, 2000));
    return container;
  },
};

/** The race held on a keyframe halfway through. */
export const Paused2010: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, pausedClock(YEARS, DURATION, 2010));
    return container;
  },
};

/** The race held on its last keyframe. */
export const Paused2019: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, pausedClock(YEARS, DURATION, 2019));
    return container;
  },
};

/** The race held halfway between the 2007 and 2008 keyframes, where the bars
 *  are between ranks and between lengths. */
export const Paused2007_5: StoryObj<Args> = {
  name: "Paused 2007.5",
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, pausedClock(YEARS, DURATION, 2007.5));
    return container;
  },
};

/** The top-ten race over all 173 brands. Brands enter and leave the ranking,
 *  so a brand's run has knots only in the years it ranks. A bar moves between
 *  two years it ranks in both, and fades in or out in place over the year it
 *  enters or leaves the top ten. `enter`/`exit` options that restyle that are
 *  deferred to issue #831. */
export const Top10: StoryObj<Args> = {
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, timer({ domain: YEARS, duration: DURATION }), top10);
    return container;
  },
};

/** The top-ten race held between 2007 and 2008: the brands in both years'
 *  top ten are opaque and between ranks; Mercedes-Benz (2007 only) is half
 *  faded out at its 2007 place and Google (2008 only) half faded in at its
 *  2008 place. */
export const Top10Paused2007_5: StoryObj<Args> = {
  name: "Top 10 Paused 2007.5",
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, pausedClock(YEARS, DURATION, 2007.5), top10);
    return container;
  },
};

/** The top-ten race held on the 2008 keyframe: that year's ten, Google
 *  included. */
export const Top10Paused2008: StoryObj<Args> = {
  name: "Top 10 Paused 2008",
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    race(container, args, pausedClock(YEARS, DURATION, 2008), top10);
    return container;
  },
};

/** One frame of the animation: the 2000 bar chart the playback starts from. */
export const Frame2000: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(brands, { legend: false })
      .flow(
        filter((d: any) => d.year === 2000),
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
      .render(container, {
        w: args.w,
        h: args.h,
        axes: { x: true, y: false },
      } as any);
    return container;
  },
};

/** The eleven rank slots, in order, pinned so every year has the same bands. */
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** The gap between two bars, in pixels. */
const BAR_SPACING = 2;
/** The library's default padding, which the clip math depends on. */
const PADDING = 40;

/**
 * PROBE (issue #831): the top-ten race with D3's entering and exiting bars,
 * built as data with today's API. Every brand that ever ranks in the top ten
 * has a row in every year it has a value, and its `rank` is clamped to 11
 * (`rankedTopEachYear`). Slot 11 is where a brand waits while it is out of
 * the top ten, so it slides up out of it and back down into it instead of
 * fading in place.
 *
 * - Layout: one spread on rank, eleven equal bands, pinned in order by
 *   `field("rank").sort(SLOTS)`. `group({ by: "name" })` under it keeps one bar
 *   per brand in slot 11, which holds six or seven brands every year.
 * - Slot 11 is hidden the way D3 hides it: it is a full band like the others,
 *   laid out just below the ten visible ones. The chart is laid out at eleven
 *   bands and the story's container is cut off at the bottom of band 10 with
 *   a CSS `clip-path` (`clipToTopTen`). A bar entering the top ten slides up
 *   into view at full height, and a leaving one slides down out of it; the
 *   parked brands and their names are drawn but cut off.
 *   DECLARED HACK (issue #889): the library has no way to say "this slot is
 *   laid out but not shown". Whether that is a clip on the plot box, a hidden
 *   slot, or something else is an open design question, so the hiding lives
 *   in the story for now.
 * - The x axis sits on top (`side: "start"`), as in D3, so nothing is drawn
 *   under slot 11.
 * - The key is written out: the sugar `time.transition()` would key by the
 *   complement of the time tier, `rank` + `name`, and a brand changes rank
 *   every year. The explicit `.layer(chart(selectAll(...)).flow(group({ by:
 *   "name" })))` form (the desugaring tower's level 1) keys by name alone.
 */
const raceFromBelow = (
  container: HTMLElement,
  args: Args,
  year: Timer<number>
) => {
  // One band plus one gap. Ten of them, less the last gap, fill `args.h`;
  // the layout holds eleven.
  const pitch = (args.h + BAR_SPACING) / 10;
  const layoutH = 11 * pitch - BAR_SPACING;
  clipToTopTen(container, pitch);
  return chart(top10Ranked, { legend: false })
    .flow(
      time.sequence({ by: "year", on: year }),
      spread({
        by: field("rank").sort(SLOTS),
        dir: "y",
        spacing: BAR_SPACING,
      }),
      group({ by: "name" })
    )
    .mark(
      rect({ w: "value", fill: "category" })
        .label("name", { position: "outset-right" })
        .name("bars")
    )
    .layer(
      chart(selectAll("bars"))
        .flow(group({ by: "name" }))
        .mark(time.transition({ along: "year", curve: "linear" }))
    )
    .layer(yearReadout(year, args.h))
    .render(container, {
      w: args.w,
      h: layoutH,
      padding: PADDING,
      axes: { x: { side: "start" }, y: false },
    } as any);
};

/** Cut the container off at the bottom of band 10. The bottom reserve is the
 *  padding alone, since nothing is drawn under the plot, so this needs no DOM
 *  reads. `display: flex` removes the gap under the inline SVG. */
const clipToTopTen = (container: HTMLElement, pitch: number) => {
  container.style.display = "flex";
  container.style.clipPath = `inset(0 0 ${PADDING + pitch}px 0)`;
};

export const Top10FromBelow: StoryObj<Args> = {
  name: "Top 10 From Below",
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    raceFromBelow(
      container,
      args,
      timer({ domain: YEARS, duration: DURATION })
    );
    return container;
  },
};

export const Top10FromBelowPaused2007_5: StoryObj<Args> = {
  name: "Top 10 From Below Paused 2007.5",
  args: { w: 600, h: 400 },
  render: (args: Args) => {
    const container = initializeContainer();
    raceFromBelow(container, args, pausedClock(YEARS, DURATION, 2007.5));
    return container;
  },
};

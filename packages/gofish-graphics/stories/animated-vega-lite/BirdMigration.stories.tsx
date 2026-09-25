/**
 * The running example of *Animated Vega-Lite* (Zong, Pollock, Wootton,
 * Satyanarayan, IEEE VIS 2022), one story per panel of the paper's Figure 1.
 *
 * Panel A is the static picture the ornithologist starts from; panel B adds
 * hover; panel C plays the year through with `timer()` and `filter()`; panel D
 * adds trails; panel E adds the play/scrub controls — a `slider` and a `button`
 * as ordinary low-level marks, laid out under the map with `spreadY`/`spreadX`,
 * with the `timer()` as the single source of truth (the slider displays it one
 * way and writes it the other, and a scrub pauses it). See the plan note at
 * `apps/docs/docs/internals/design/bird-migration.md`.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { birds } from "../../src/data/birds";
import { world110m } from "../../src/data/world110m";
import { pausedClock } from "./pausedClock";
import {
  Frame,
  GoFish,
  between,
  button,
  chart,
  circle,
  filter,
  geo,
  group,
  layer,
  line,
  live,
  polygon,
  pointer,
  scatter,
  slider,
  spreadX,
  spreadY,
  text,
  time,
  timer,
} from "../../src/lib";

const meta: Meta = {
  title: "Animated Vega-Lite/Bird Migration",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    h: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
};
export default meta;

type Args = { w: number; h: number };

/**
 * The Americas under Equal Earth — the basemap every panel shares.
 *
 * `legend: false`: the bird layers color by species, and a 72-entry swatch
 * column would take more of the canvas than the map. The colors still come
 * from the scale; only the chrome is dropped.
 */
const basemap = (options: { padding?: number } = {}) =>
  chart(world110m, {
    coord: geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    legend: false,
    ...options,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));

export const A_StaticLines: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bird Migration A: Static",
      description:
        "A static visualization of 72 bird species' yearly migrations, each species' daily positions threaded into one path over a map of the Americas.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    basemap()
      .layer(
        chart(birds)
          .flow(
            group({ by: "species" }),
            scatter({ by: "day", x: "lon", y: "lat" })
          )
          .mark(line({ stroke: "species", strokeWidth: 1, opacity: 0.5 }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

export const B_HoverHighlight: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bird Migration B: Hover",
      description:
        "The same migration paths with interaction added: hovering a path thickens it, fades the rest, and reads the species' name out in the corner.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const hover = pointer();
    const hot = (d: any) => hover.datum()?.species === d?.species;

    basemap()
      .layer(
        chart(birds)
          .flow(
            group({ by: "species" }),
            scatter({ by: "day", x: "lon", y: "lat" })
          )
          .mark(
            line({
              stroke: "species",
              strokeWidth: live((d) => (hot(d) ? 3 : 0.1)),
              opacity: live((d) => (hot(d) ? 1 : 0.5)),
            })
          )
      )
      // Readout instead of a cursor-following tooltip: the tooltip the plan
      // prefers — a one-row `chart(hover)` placed at the pointer's data
      // position — needs `pointer().dataPos()` to invert a NON-affine
      // projection, which the interaction layer's affine frame scales cannot
      // express today. See the report / the plan note.
      .layer(
        text({
          text: live(() => hover.datum()?.species ?? ""),
          fontSize: 14,
          fill: "#333",
        })
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

export const C_Animated: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bird Migration C: Animated",
      description:
        "Switching from static lines to animated circle marks: each species is one circle at its position on the current day, and the chart plays through the year in ten seconds.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    // The clock is a scale from the data's own `day` domain onto ten seconds of
    // wall time, read backward — so `day()` is a day number, not a tick count.
    const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

    basemap()
      .layer(
        chart(birds)
          .flow(
            filter((d: any) => d.day === day()),
            scatter({ x: "lon", y: "lat" })
          )
          .mark(circle({ r: 3, fill: "species" }))
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

export const D_Trails: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bird Migration D: Trails",
      description:
        "Adding animated path trails for the previous twenty days, with the current day's positions at full opacity.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

    basemap()
      .layer(
        chart(birds)
          .flow(
            // Day-of-year is cyclic, so the 20-day trail is a window on the
            // WRAPPED distance back from the playhead — it stays 20 days long
            // across the loop boundary instead of shrinking at the new year.
            filter((d: any) =>
              between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })
            ),
            scatter({ x: "lon", y: "lat" })
          )
          .mark(
            circle({
              r: 3,
              fill: "species",
              opacity: (d: any) => (d.day === day() ? 1 : 0.1),
            })
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

/** The day the paused panel-D stories are held on, as the birds head north
 *  in spring. */
const PAUSED_DAY = 120;

/** Panel D as it ships, a filter on the wrapped distance back from the
 *  playhead, held still on `PAUSED_DAY`. */
export const D_TrailsPaused: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();

    const day = pausedClock([1, 365], 10000, PAUSED_DAY);

    basemap()
      .layer(
        chart(birds)
          .flow(
            filter((d: any) =>
              between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })
            ),
            scatter({ x: "lon", y: "lat" })
          )
          .mark(
            circle({
              r: 3,
              fill: "species",
              opacity: (d: any) => (d.day === day() ? 1 : 0.1),
            })
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

/**
 * Panel D spelled with `time.history`, held still on `PAUSED_DAY`: one
 * keyframe per day, each species a circle placed by its position that day.
 * Each day's mark is two layers. The faint circle is kept for 20 days after
 * its own (`time.history`), which is the trail, and the solid circle is that
 * day's position, shown during its day.
 *
 * Only the paused picture is built this way for now. Played, every one of the
 * 52,560 circles (365 days × 72 species × 2 layers) re-reads the clock each
 * tick to decide whether it shows, which costs far more than panel D's frame
 * budget (#848), so the playing panels D and E keep the filter.
 */
export const D_TrailsHistoryPaused: StoryObj<Args> = {
  args: { w: 600, h: 600 },
  render: (args: Args) => {
    const container = initializeContainer();

    const day = pausedClock([1, 365], 10000, PAUSED_DAY);

    basemap()
      .layer(
        chart(birds)
          .flow(
            time.sequence({ by: "day", on: day }),
            scatter({ x: "lon", y: "lat" })
          )
          .mark(
            layer([
              time.history({ last: 20 }, [
                circle({ r: 3, fill: "species", opacity: 0.1 }),
              ]),
              circle({ r: 3, fill: "species" }),
            ])
          )
      )
      .render(container, { w: args.w, h: args.h });

    return container;
  },
};

export const E_Controls: StoryObj<Args> = {
  args: { w: 600, h: 660 },
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Bird Migration E: Controls",
      description:
        "Adding an interactive slider to scrub through the animation, with a play/pause button; dragging the slider pauses the clock and seeking is exact.",
    },
  },
  render: (args: Args) => {
    const container = initializeContainer();

    const day = timer({ domain: [1, 365], step: 1, duration: 10000 });

    // `padding: 0`: the chart's 30px coord padding is drawn OUTSIDE the node's
    // box, so a padded map would paint 30px past the box the `spreadY` stacks
    // against — and the controls would sit inside the map. At the root (panels
    // A–D) that padding is just canvas margin; in a composition it has to go,
    // and the spacing below is the composition's own business.
    const map = basemap({ padding: 0 }).layer(
      chart(birds)
        .flow(
          // Day-of-year is cyclic, so the 20-day trail is a window on the
          // WRAPPED distance back from the playhead — it stays 20 days long
          // across the loop boundary instead of shrinking at the new year.
          filter((d: any) =>
            between((day() - d.day + 365) % 365, 0, 20, { closed: "left" })
          ),
          scatter({ x: "lon", y: "lat" })
        )
        .mark(
          circle({
            r: 3,
            fill: "species",
            opacity: (d: any) => (d.day === day() ? 1 : 0.1),
          })
        )
    );

    // The controls are ordinary marks, so they lay out under the map with the
    // ordinary operators. The timer stays the single source of truth: the
    // slider displays it one way and writes it the other, and a scrub takes
    // ownership of the clock by pausing it (the paper's delegation rule).
    const timeSlider = slider({
      value: day,
      onInput: (v) => {
        day.pause();
        day.set(v);
      },
      domain: day.domain as readonly [number, number],
      step: day.step,
      w: 300,
      // Day-of-year is a cycle, like the trail filter above: a scrub off either
      // end of the track continues around the year instead of stopping.
      wrap: true,
      format: (d) => `day ${d}`,
    });
    const playButton = button({
      label: () => (day.isPlaying() ? "❚❚" : "▶"),
      onClick: () => (day.isPlaying() ? day.pause() : day.play()),
    });

    // The THUNK form of the low-level terminal: the clock and the handle both
    // change the SPEC (a filter, a placement), so the whole picture has to be
    // re-evaluable — which is what a thunk gives a composition with no
    // `chart()` builder at its root.
    // `legend: false` and the map's size are options of the ROOT render here,
    // not of the chart: the chart is no longer the root, so it is the enclosing
    // composition that decides how big the map box is and whether the canvas
    // grows a swatch column. `Frame({ w, h })` is the low-level "this child is
    // this many pixels" wrapper.
    GoFish(container, { w: args.w, h: args.h, legend: false }, () =>
      spreadY({ spacing: 12 }, [
        Frame({ w: 600, h: 600 }, [map]),
        spreadX({ spacing: 8 }, [playButton, timeSlider]),
      ])
    );

    return container;
  },
};

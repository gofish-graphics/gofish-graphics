/**
 * Extension architecture proposal: the example corpus, drawn with what GoFish
 * has today (SVG painter, small data). Each story is the nearest honest
 * render of a lonboard / fastplotlib / ProgressiVis program rewritten in
 * GoFish style; `proposals/extension-architecture/examples.md` gives the
 * original program, the future-extension spelling, and what is missing.
 *
 * Proposal prototypes: no gallery tag. Only public exports of src/lib.ts.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Bin,
  chart,
  circle,
  Color,
  Coord,
  Curve,
  datum,
  derive,
  field,
  filter,
  gofish,
  group,
  layer,
  line,
  partition,
  polygon,
  rect,
  region,
  resolve,
  scatter,
  selectAll,
  signal,
  slider,
  spread,
  text,
} from "../../src/lib";
import { europeRings, europeSpeeds } from "./extension-architecture-data/europe";
import {
  counties,
  countyRings,
  migrationArcs,
  migrationSources,
} from "./extension-architecture-data/migration";

// A seeded generator, so every synthetic array is the same on every render.
const rng = (seed: number) => () =>
  ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

const meta: Meta = {
  title: "Proposals/Extension Architecture",
};
export default meta;

type Args = { w: number; h: number };

// ColorBrewer BrBG, 10 classes (palettable's BrBG_10), as gradient stops.
const BrBG_10 = [
  "#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3",
  "#c7eae5", "#80cdc1", "#35978f", "#01665e", "#003c30",
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * L1, lonboard internet-speeds: points colored by a continuous value, radius
 * from data, over a basemap. The basemap is world110m polygons (no tiles).
 */
export const L1_SpeedPoints: StoryObj<Args> = {
  args: { w: 460, h: 420 },
  render: (args: Args) => {
    const container = initializeContainer();
    const minBound = 5000;
    const maxBound = 50000;
    chart(europeRings, {
      coord: Coord.geo("mercator", { lon: [-11.83, 25.5], lat: [34.9, 59] }),
      color: Color.gradient(BrBG_10),
      w: args.w,
      h: args.h,
    })
      .mark(polygon({ points: "ring", fill: "#eeeeee", stroke: "#bbbbbb", strokeWidth: 0.5 }))
      .layer(
        chart(europeSpeeds)
          .flow(
            derive((rows) =>
              rows.map((d) => ({
                ...d,
                speed: clamp01((d.avg_d_kbps - minBound) / (maxBound - minBound)),
              }))
            ),
            scatter({ x: "lon", y: "lat" })
          )
          .mark(circle({ r: 2, fill: "speed", opacity: 0.7 }))
      )
      .render(container);
    return container;
  },
};

/**
 * L2, lonboard kontur_pop (H3 hexagons, log-scaled population). GoFish has no
 * H3 cell type, so this draws the nearest honest thing: a polygon choropleth
 * of real county net migration (deck.gl's counties.json, KS/NE/CO), with a
 * diverging BrBG fill clipped to +-1500 people so the gradient is centered
 * on 0 (GoFish has no gradient midpoint).
 */
export const L2_Choropleth: StoryObj<Args> = {
  args: { w: 520, h: 360 },
  render: (args: Args) => {
    const container = initializeContainer();
    const M = 1500;
    chart(countyRings, {
      coord: Coord.geo("mercator"),
      color: Color.gradient(BrBG_10),
      w: args.w,
      h: args.h,
    })
      .flow(
        derive((rows) =>
          rows.map((d) => ({ ...d, netClipped: Math.max(-M, Math.min(M, d.net)) }))
        )
      )
      .mark(polygon({ points: "ring", fill: "netClipped", stroke: "white", strokeWidth: 0.4 }))
      .render(container);
    return container;
  },
};

/**
 * L3, lonboard migration: polygons as the basemap, target rings, source
 * points and arcs in one map, with the brush frozen at one place (Denver):
 * only arcs and points with an end within 200 km are drawn. The brush is a
 * one-row dataset; the filter is plain code.
 */
const SOURCE_COLOR = "rgb(166,3,3)";
const TARGET_COLOR = "rgb(35,181,184)";
const brush = [{ lon: -104.99, lat: 39.74, radiusKm: 200 }];
const km = (aLon: number, aLat: number, bLon: number, bLat: number) => {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return 6371 * Math.hypot(x, y);
};
const inBrush = (lon: number, lat: number) =>
  brush.some((b) => km(lon, lat, b.lon, b.lat) <= b.radiusKm);

export const L3_MultiLayer: StoryObj<Args> = {
  args: { w: 560, h: 380 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(countyRings, {
      coord: Coord.geo("mercator", { lon: [-109.1, -94.6], lat: [36.9, 43.1] }),
      color: Color.palette({ out: SOURCE_COLOR, in: TARGET_COLOR }),
      w: args.w,
      h: args.h,
    })
      .mark(polygon({ points: "ring", fill: "#f3f3f3", stroke: "#d0d0d0", strokeWidth: 0.4 }))
      .layer(
        chart(counties)
          .flow(
            derive((rows) =>
              rows.map((d) => ({ ...d, direction: d.net > 0 ? "in" : "out" }))
            ),
            scatter({ by: "name", x: "lon", y: "lat" })
          )
          .mark(circle({ r: 3, fill: "none", stroke: "direction", strokeWidth: 1.5 }).name("counties"))
      )
      .layer(
        chart(migrationSources)
          .flow(
            filter((d: any) => inBrush(d.lon, d.lat)),
            derive((rows) =>
              rows.map((d) => ({ ...d, direction: d.gain > 0 ? "in" : "out" }))
            ),
            scatter({ x: "lon", y: "lat" })
          )
          .mark(circle({ r: 2, fill: "direction" }))
      )
      // Each arc as two endpoint rows threaded into a line, the Bird
      // Migration idiom. Workaround, declared: `resolve` + `line({ from, to })`
      // against the named counties draws its lines in the wrong place under
      // Coord.geo (see ex-L3-wall-ref-lines.png).
      .layer(
        chart(migrationArcs)
          .flow(
            filter(
              (d: any) =>
                inBrush(d.sourceLon, d.sourceLat) || inBrush(d.targetLon, d.targetLat)
            ),
            derive((rows) =>
              rows.flatMap((d, k) => [
                { arc: k, end: 0, lon: d.sourceLon, lat: d.sourceLat },
                { arc: k, end: 1, lon: d.targetLon, lat: d.targetLat },
              ])
            ),
            group({ by: "arc" }),
            scatter({ by: "end", x: "lon", y: "lat" })
          )
          .mark(line({ stroke: SOURCE_COLOR, opacity: 0.4 }))
      )
      .render(container);
    return container;
  },
};

/**
 * L4, lonboard air-traffic-control (TripsLayer): SYNTHETIC flight tracks
 * around JFK, drawn as a filmstrip of three moments. Each frame keeps the
 * last 10 minutes of each track (the trail). The `now` column is the clock as
 * a dataset; `time.sequence({ by: "now" })` would play the same frames.
 */
const JFK = { lon: -73.78, lat: 40.64 };
const tracks = (() => {
  const r = rng(11);
  const rows: { flight: string; t: number; lon: number; lat: number }[] = [];
  for (let f = 0; f < 28; f++) {
    const ang = r() * 2 * Math.PI;
    const far = { lon: JFK.lon + 0.9 * Math.cos(ang), lat: JFK.lat + 0.6 * Math.sin(ang) };
    const arriving = f % 2 === 0;
    const start = Math.floor(r() * 40);
    const bend = (r() - 0.5) * 0.4;
    const a = arriving ? far : JFK;
    const b = arriving ? JFK : far;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const lon = a.lon + (b.lon - a.lon) * u + bend * Math.sin(Math.PI * u) * Math.sin(ang);
      const lat = a.lat + (b.lat - a.lat) * u - bend * Math.sin(Math.PI * u) * Math.cos(ang);
      rows.push({ flight: `F${f}`, t: start + k, lon, lat });
    }
  }
  return rows;
})();
const TRAIL = 10;
const tripFrames = [20, 35, 50].flatMap((now) =>
  tracks
    .filter((d) => d.t <= now && d.t > now - TRAIL)
    .map((d) => ({ ...d, now: `t = ${now} min` }))
);

export const L4_TripsFilmstrip: StoryObj<Args> = {
  args: { w: 720, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();
    chart(tripFrames, { w: args.w, h: args.h })
      .flow(spread({ by: "now", dir: "x", spacing: 16 }))
      .mark(
        chart({
          coord: Coord.geo("mercator", {
            lon: [JFK.lon - 0.95, JFK.lon + 0.95],
            lat: [JFK.lat - 0.65, JFK.lat + 0.65],
          }),
        })
          .flow(group({ by: "flight" }), scatter({ by: "t", x: "lon", y: "lat" }))
          .mark(line({ stroke: "rgb(30,30,200)", strokeWidth: 2, opacity: 0.8 }))
      )
      .render(container);
    return container;
  },
};

// ---------------------------------------------------------------------------
// fastplotlib

/** A synthetic grayscale "photo": a few Gaussian blobs over a gradient. */
const makeImage = (n: number, seed: number) => {
  const r = rng(seed);
  const blobs = Array.from({ length: 6 }, () => ({
    x: r() * n,
    y: r() * n,
    s: n * (0.06 + 0.12 * r()),
    a: 0.5 + r(),
  }));
  const rows: { row: number; col: number; v: number }[] = [];
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      let v = (0.4 * col) / n;
      for (const b of blobs)
        v += b.a * Math.exp(-((col - b.x) ** 2 + (row - b.y) ** 2) / (2 * b.s * b.s));
      rows.push({ row, col, v: Math.round(v * 255) / 255 });
    }
  return rows;
};

/** An image as rows on a data grid: one data-unit rect per pixel. */
const imageChart = (pixels: any[], palette: any, opts: any = {}) =>
  chart(pixels, { color: Color.gradient(palette), ...opts })
    .flow(scatter({ x: "col", y: "row" }))
    .mark(rect({ w: datum(1), h: datum(1), fill: "v", stroke: "v", strokeWidth: 0.5 }));

/**
 * Panels side by side, ONE RENDER EACH. Workaround, declared: charts that are
 * siblings under one combinator (`spread({ dir }, [a, b])`) share the first
 * chart's color scale, so two colormaps cannot sit in one render today.
 */
const panels = (
  container: HTMLElement,
  cols: number,
  draws: ((el: HTMLElement) => void)[]
) => {
  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
  grid.style.gap = "16px 28px";
  container.appendChild(grid);
  for (const draw of draws) {
    const cell = document.createElement("div");
    grid.appendChild(cell);
    draw(cell);
  }
};

/** F1, fastplotlib image_cmap: one image, then two colormaps. */
export const F1_ImageCmap: StoryObj<Args> = {
  args: { w: 240, h: 240 },
  render: (args: Args) => {
    const container = initializeContainer();
    const pixels = makeImage(48, 3);
    panels(container, 2, [
      (el) => imageChart(pixels, "viridis", { w: args.w, h: args.h }).render(el),
      (el) =>
        imageChart(pixels, ["orange", "purple", "green"], { w: args.w, h: args.h }).render(el),
    ]);
    return container;
  },
};

/**
 * F2, fastplotlib line_stack: ten sine waves stacked along y, three ways to
 * color them. A colormap ALONG a line has no spelling today, so panels 1 and
 * 2 cut each line into two-point segments (the ugly version); panel 3 colors
 * across lines, which GoFish does directly.
 */
const sines = (() => {
  const rows: { line: number; i: number; x: number; y: number }[] = [];
  for (let line = 0; line < 10; line++)
    for (let i = 0; i < 100; i++) {
      const x = (i / 99) * Math.PI * 10;
      rows.push({ line, i, x, y: Math.sin(x) });
    }
  return rows;
})();
type SineRow = (typeof sines)[0];
const segments = (rows: SineRow[], color: (d: SineRow) => number) =>
  rows.flatMap((d, k) => {
    const next = rows[k + 1];
    if (!next || next.line !== d.line) return [];
    const seg = `${d.line}-${d.i}`;
    const c = color(d);
    return [
      { ...d, seg, c },
      { ...next, seg, c },
    ];
  });
const TAB10 = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
];
const JET = ["#00007f", "#0000ff", "#007fff", "#00ffff", "#7fff7f", "#ffff00", "#ff7f00", "#ff0000", "#7f0000"];
const BWR = ["#0000ff", "#ffffff", "#ff0000"];

export const F2_LineStack: StoryObj<Args> = {
  args: { w: 520, h: 150 },
  render: (args: Args) => {
    const container = initializeContainer();
    const segmentStack = (data: any[], palette: any) =>
      chart(data, { color: Color.gradient(palette), w: args.w, h: args.h })
        .flow(
          spread({ by: "line", dir: "y", spacing: -8 }),
          group({ by: "seg" }),
          scatter({ by: "i", x: "x", y: "y" })
        )
        .mark(line({ stroke: "c", strokeWidth: 1.5 }));
    panels(container, 1, [
      (el) => segmentStack(segments(sines, (d) => d.i), JET).render(el),
      (el) => segmentStack(segments(sines, (d) => d.y), BWR).render(el),
      (el) =>
        chart(sines, { color: Color.gradient("viridis"), w: args.w, h: args.h })
          .flow(spread({ by: "line", dir: "y", spacing: -8 }), scatter({ by: "i", x: "x", y: "y" }))
          .mark(line({ stroke: "line", strokeWidth: 1.5 }))
          .render(el),
    ]);
    return container;
  },
};

/**
 * F3, fastplotlib multigraphic_gridplot: a 2 x 2 grid mixing an image with an
 * overlay, circles on an image, a line stack and two scatter clouds.
 * Synthetic images stand in for imageio's coffee.png and coins.png.
 */
export const F3_Grid: StoryObj<Args> = {
  args: { w: 280, h: 230 },
  render: (args: Args) => {
    const container = initializeContainer();
    const img = makeImage(40, 5);
    const bright = img.filter((d) => d.v > 0.9);
    const coins = makeImage(40, 9);
    const labels = [0, 1, 1, 2, 0, 0, 1, 1, 2, 2, 8, 3, 1, 9, 1, 5];
    const centers: { cx: number; cy: number; label: string }[] = [];
    let k = 0;
    for (let a = 0; a < 50; a += 15)
      for (let b = 0; b < 50; b += 15)
        centers.push({ cx: (a + 7) * 0.75, cy: (b + 7) * 0.75, label: String(labels[k++]) });
    const sine15 = Array.from({ length: 15 }, (_, line) =>
      Array.from({ length: 100 }, (_, i) => {
        const x = -10 + (20 * i) / 99;
        return { line, i, x, y: Math.sin(x) };
      })
    ).flat();
    const r = rng(21);
    const cloudA = Array.from({ length: 500 }, (_, i) => ({ i, x: gauss(r), y: gauss(r) }));
    const cloudB = Array.from({ length: 500 }, () => ({ x: gauss(r), y: gauss(r) }));
    const W = args.w;
    const H = args.h;
    panels(container, 2, [
      (el) =>
        imageChart(img, "viridis", { w: W, h: H })
          .layer(
            chart(bright)
              .flow(scatter({ x: "col", y: "row" }))
              .mark(rect({ w: datum(1), h: datum(1), fill: "rgb(0,0,255)", opacity: 0.6 }))
          )
          .render(el),
      (el) =>
        imageChart(coins, ["#000000", "#ffffff"], { w: W, h: H })
          .layer(
            chart(centers)
              .flow(scatter({ x: "cx", y: "cy" }))
              // Workaround, declared: `stroke: "label"` draws nothing here,
              // because the render's one color scale is the image's gradient.
              // The tab10 colors are looked up by hand.
              .mark(
                circle({
                  r: 12,
                  fill: "none",
                  stroke: (d: any) => TAB10[Number(d.label)],
                  strokeWidth: 3,
                  opacity: 0.6,
                })
              )
          )
          .render(el),
      (el) =>
        chart(sine15, { color: Color.gradient(["#ffff00", "#ff9900"]), w: W, h: H })
          .flow(spread({ by: "line", dir: "y", spacing: -10 }), scatter({ by: "i", x: "x", y: "y" }))
          .mark(line({ stroke: "line" }))
          .render(el),
      (el) =>
        chart(cloudA, { color: Color.gradient(JET), w: W, h: H })
          .flow(scatter({ x: "x", y: "y" }))
          .mark(circle({ r: 1.5, fill: "i" }))
          .layer(
            chart(cloudB)
              .flow(scatter({ x: "x", y: "y" }))
              .mark(circle({ r: 1.5, fill: "red" }))
          )
          .render(el),
    ]);
    return container;
  },
};

/**
 * F4, fastplotlib ImageWidget over a t x y x x movie with a time slider, and
 * the calcium-imaging composition it is used for: the frame at time t with
 * ROI contours, the ROI traces with a cursor at t, and the slider. SYNTHETIC
 * movie: five flickering Gaussian "cells" on a 40 x 40 grid, 60 frames.
 * capture-one snapshots t = 23.
 */
const MOVIE = (() => {
  const n = 40;
  const T = 60;
  const r = rng(4);
  const cells = Array.from({ length: 5 }, (_, id) => ({
    id: `roi ${id}`,
    x: 6 + r() * 28,
    y: 6 + r() * 28,
    s: 2.2 + r() * 1.5,
    phase: r() * 10,
    rate: 0.15 + r() * 0.25,
  }));
  const act = (c: (typeof cells)[0], t: number) =>
    Math.max(0, Math.sin(c.rate * t + c.phase)) ** 3;
  const frames: { t: number; row: number; col: number; v: number }[] = [];
  for (let t = 0; t < T; t++)
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++) {
        let v = 0.08;
        for (const c of cells)
          v += (0.2 + act(c, t)) * Math.exp(-((col - c.x) ** 2 + (row - c.y) ** 2) / (2 * c.s * c.s));
        frames.push({ t, row, col, v });
      }
  const traces = cells.flatMap((c) =>
    Array.from({ length: T }, (_, t) => ({ roi: c.id, t, f: act(c, t) }))
  );
  const rois = cells.map((c) => ({ roi: c.id, cx: c.x, cy: c.y }));
  return { frames, traces, rois };
})();

// Workaround, declared: one color scale per render, and here it is the
// image's gray gradient, so `stroke: "roi"` cannot reach a palette.
const roiColor = (d: any) => {
  const row = Array.isArray(d) ? d[0] : d;
  return TAB10[Number(String(row.roi).slice(4))];
};

export const F4_MovieTracesSlider: StoryObj<Args> = {
  args: { w: 820, h: 300 },
  render: (args: Args) => {
    const container = initializeContainer();
    const t = signal(23);
    const timeSlider = slider({
      value: t,
      onInput: (v) => t.set(v),
      domain: [0, 59],
      step: 1,
      w: 260,
    });
    gofish(container, { w: args.w, h: args.h }, () => {
      const now = t();
      return spread({ dir: "y", spacing: 12 }, [
        spread({ dir: "x", spacing: 48 }, [
          imageChart(MOVIE.frames.filter((d) => d.t === now), ["#000000", "#ffffff"], {
            w: 220,
            h: 220,
          }).layer(
            chart(MOVIE.rois)
              .flow(scatter({ x: "cx", y: "cy" }))
              .mark(circle({ r: 12, fill: "none", stroke: roiColor, strokeWidth: 2 }))
          ),
          // Workaround, declared: the stack offset is computed by hand
          // (`y = f + 1.3 * roi`). With `spread({ by: "roi" })` the cursor
          // layer's own spread does not line up with the traces' rows, and
          // the panel overflows its box.
          chart(MOVIE.traces.map((d) => ({ ...d, y: d.f + 1.3 * Number(d.roi.slice(4)) })), {
            w: 300,
            h: 220,
          })
            .flow(group({ by: "roi" }), scatter({ by: "t", x: "t", y: "y" }))
            .mark(line({ stroke: roiColor, strokeWidth: 1.5 }))
            .layer(
              chart(
                MOVIE.traces
                  .filter((d) => d.t === now)
                  .map((d) => ({ ...d, y: d.f + 1.3 * Number(d.roi.slice(4)) }))
              )
                .flow(scatter({ x: "t", y: "y" }))
                .mark(circle({ r: 4, fill: "#f0b400" }))
            ),
        ]),
        timeSlider,
      ]);
    });
    return container;
  },
};

// ---------------------------------------------------------------------------
// progressive

/**
 * P1, ProgressiVis Histogram2D + Heatmap over NYC taxi pickups with fixed
 * bounds: the same spec drawn at 1%, 10%, 50% and 100% of the rows. SYNTHETIC
 * pickups (a Gaussian mixture on Manhattan, JFK and LaGuardia). The window is
 * Coord.geo's lon / lat, the notebook's Bounds, so the cells do not move
 * between frames; the color domain does (each frame's own max count).
 */
const BOUNDS = { left: -74.27, right: -73.68, bottom: 40.49, top: 40.92 };
const pickups = (() => {
  const r = rng(8);
  const hubs = [
    { lon: -73.985, lat: 40.755, sx: 0.018, sy: 0.03, w: 0.55 },
    { lon: -74.005, lat: 40.715, sx: 0.012, sy: 0.015, w: 0.2 },
    { lon: -73.955, lat: 40.78, sx: 0.012, sy: 0.02, w: 0.12 },
    { lon: -73.785, lat: 40.645, sx: 0.01, sy: 0.008, w: 0.07 },
    { lon: -73.872, lat: 40.774, sx: 0.006, sy: 0.005, w: 0.06 },
  ];
  const rows: { pickup_longitude: number; pickup_latitude: number }[] = [];
  for (let i = 0; i < 20000; i++) {
    let u = r();
    const h = hubs.find((hh) => (u -= hh.w) < 0) ?? hubs[0];
    rows.push({
      pickup_longitude: h.lon + h.sx * gauss(r),
      pickup_latitude: h.lat + h.sy * gauss(r),
    });
  }
  return rows;
})();

export const P1_ProgressiveHeatmap: StoryObj<Args> = {
  args: { w: 190, h: 190 },
  render: (args: Args) => {
    const container = initializeContainer();
    // The spec, one function of the rows: what a progressive source would
    // re-run on each chunk.
    const heatmap = (rows: typeof pickups) =>
      chart(rows, {
        coord: Coord.geo("mercator", {
          lon: [BOUNDS.left, BOUNDS.right],
          lat: [BOUNDS.bottom, BOUNDS.top],
        }),
        color: Color.gradient("viridis"),
        w: args.w,
        h: args.h,
      })
        .flow(
          partition({
            by: {
              x: field("pickup_longitude").bin(Bin.step(0.01)),
              y: field("pickup_latitude").bin(Bin.step(0.01)),
            },
          })
        )
        .mark(region({ fill: field("pickup_longitude").count() }));
    // One render per frame (sibling charts would share one color scale).
    // The caption is HTML, not GoFish: the progress indicator is a gap.
    panels(
      container,
      4,
      [0.01, 0.1, 0.5, 1].map((fraction) => (el: HTMLElement) => {
        heatmap(pickups.slice(0, Math.round(pickups.length * fraction))).render(el);
        const cap = document.createElement("div");
        cap.style.font = "12px sans-serif";
        cap.textContent = `${Math.round(fraction * 100)}% of rows`;
        el.appendChild(cap);
      })
    );
    return container;
  },
};

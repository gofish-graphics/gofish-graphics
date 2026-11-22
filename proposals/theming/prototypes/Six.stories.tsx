import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  spread,
  stack,
  scatter,
  group,
  rect,
  circle,
  line,
  ribbon,
  Color,
  Curve,
} from "../../src/lib";
import { lines, dots, solid, restyleChrome, drawn } from "./defs";
import { applyWear } from "./scan";
import { replaceWithScan } from "./raster";

const meta: Meta = { title: "Proposals Theming/Six" };
export default meta;

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const W = 150;
const H = 140;

// ---------------------------------------------------------------- data

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(7);
const normal = () => {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

const bars = [
  { g: "A", v: 38 },
  { g: "B", v: 61 },
  { g: "C", v: 70 },
];

/** Two histograms over shared bins, as step-band rows (x = bin start). */
const hist = (() => {
  const edges = Array.from({ length: 19 }, (_, i) => -3 + (i * 7) / 18);
  const count = (mu: number, sd: number, n: number) => {
    const c = new Array(edges.length).fill(0);
    for (let i = 0; i < n; i++) {
      const x = mu + sd * normal();
      const k = Math.floor(((x + 3) / 7) * 18);
      if (k >= 0 && k < 18) c[k]++;
    }
    c[18] = c[17]; // step to the last edge
    return c;
  };
  const a = count(-0.2, 1.1, 160);
  const b = count(1.3, 0.6, 160);
  return [
    ...edges.map((x, i) => ({ s: "a", x, n: a[i] })),
    ...edges.map((x, i) => ({ s: "b", x, n: b[i] })),
  ];
})();

/** Scatter, its least-squares line and a band around it. */
const pts = Array.from({ length: 90 }, () => {
  const x = r() * 10;
  return { x, y: 2 + 0.7 * x + 1.6 * normal() };
})
  .concat([{ x: 0, y: 0 }]) // keep the y domain from 0 for both layers
  .slice(0, 90);
const fit = (() => {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  const b = sxy / sxx;
  return (x: number) => my + b * (x - mx);
})();
const ends = [0, 10].map((x) => ({ x, y: fit(x) }));
const BAND = 0.9;
const band = [0, 2.5, 5, 7.5, 10].flatMap((x) => [
  { part: "lo", x, v: fit(x) - BAND * (1 + Math.abs(x - 5) / 10) },
  { part: "band", x, v: 2 * BAND * (1 + Math.abs(x - 5) / 10) },
]);

/** Two densities on one x. */
const dens = (() => {
  const xs = Array.from({ length: 61 }, (_, i) => -3 + (i * 7) / 60);
  const pdf = (x: number, m: number, s: number) =>
    Math.exp(-0.5 * ((x - m) / s) ** 2) / s;
  return [
    ...xs.map((x) => ({ s: "a", x, d: pdf(x, -0.3, 0.9) })),
    ...xs.map((x) => ({ s: "b", x, d: 1.25 * pdf(x, 1.2, 0.65) })),
  ];
})();

/** Two series over five doses. */
const series = [1, 2, 3, 4, 5].flatMap((x) => [
  { s: "a", x, y: 1 + 1.15 * x },
  { s: "b", x, y: 1.6 + 0.62 * x },
]);

// ---------------------------------------------------------------- panels

const DEFS = [
  solid("sx-white", "white"),
  solid("sx-none", "transparent"),
  lines("sx-hatch", { angle: 45, gap: 4.5, width: 1 }),
  dots("sx-dots", { gap: 5, r: 0.85 }),
  dots("sx-dots-clear", { gap: 5, r: 0.85, bg: "transparent" }),
];

type Panel = (host: HTMLElement) => Promise<unknown>;

const PANELS: Record<string, Panel> = {
  bars: (host) =>
    chart(bars, {
      w: W,
      h: H,
      legend: false,
      color: Color.palette({
        A: "url(#sx-white)",
        B: "url(#sx-hatch)",
        C: "url(#sx-dots)",
      }),
    })
      .flow(spread({ by: "g", dir: "x", spacing: 16 }))
      .mark(rect({ h: "v", fill: "g", stroke: "black", strokeWidth: 1 }))
      .render(host, { defs: DEFS }),

  hist: (host) =>
    chart(hist, {
      w: W,
      h: H,
      legend: false,
      color: Color.palette({ a: "url(#sx-none)", b: "url(#sx-hatch)" }),
    })
      .flow(group({ by: "s" }))
      .mark(
        ribbon({
          x: "x",
          h: "n",
          fill: "s",
          stroke: "black",
          strokeWidth: 1,
          curve: Curve.step(),
        })
      )
      .render(host, { defs: DEFS }),

  scatter: (host) =>
    chart(band, {
      w: W,
      h: H,
      legend: false,
      color: Color.palette({
        lo: "url(#sx-none)",
        band: "url(#sx-dots-clear)",
      }),
    })
      .flow(stack({ by: "part", dir: "y" }))
      .mark(ribbon({ x: "x", h: "v", fill: "part", curve: Curve.linear() }))
      .layer(
        chart(pts)
          .flow(scatter({ x: "x", y: "y" }))
          .mark(
            circle({ r: 1.6, fill: "white", stroke: "black", strokeWidth: 0.8 })
          )
      )
      .layer(
        chart(ends).mark(
          line({
            x: "x",
            y: "y",
            stroke: "black",
            strokeWidth: 1.4,
            curve: Curve.linear(),
          })
        )
      )
      .render(host, { defs: DEFS }),

  density: (host) =>
    chart(dens, {
      w: W,
      h: H,
      legend: false,
      color: Color.palette({ a: "url(#sx-hatch)", b: "url(#sx-dots-clear)" }),
    })
      .flow(group({ by: "s" }))
      .mark(
        ribbon({
          x: "x",
          h: "d",
          fill: "s",
          stroke: "black",
          strokeWidth: 1,
        })
      )
      .render(host, { defs: DEFS }),

  lines: (host) =>
    chart(series, { w: W, h: H, legend: false })
      .flow(group({ by: "s" }))
      .mark(
        line({
          x: "x",
          y: "y",
          stroke: "black",
          strokeWidth: 1,
          curve: Curve.linear(),
        })
      )
      .layer(
        chart(series)
          .flow(scatter({ x: "x", y: "y" }))
          .mark(
            circle({ r: 3, fill: "white", stroke: "black", strokeWidth: 1 })
          )
      )
      .render(host, { defs: DEFS }),
};

/** Cogra panel chrome, by editing the rendered svg (the proposal would get
 *  this from the theme's axis style): black ink, no tick labels or titles
 *  (the reference has none), a closed frame around the plot with a few
 *  inward ticks, and the svg cropped to the frame. */
function cograFrame(svg: SVGSVGElement) {
  restyleChrome(svg, { ink: "black", font: SANS });
  for (const t of Array.from(svg.querySelectorAll("text"))) t.remove();
  const rects = Array.from(svg.querySelectorAll("rect")) as SVGRectElement[];
  const n = (r: Element, a: string) => Number(r.getAttribute(a));
  const chrome = rects.filter((r) => r.getAttribute("fill") === "black");
  const yAxis = chrome.find((r) => n(r, "width") === 1 && n(r, "height") > 20)!;
  const xAxis = chrome.find((r) => n(r, "height") === 1 && n(r, "width") > 20);
  const yTicks = chrome.filter(
    (r) => n(r, "width") === 4 && n(r, "height") === 1
  );
  const xTicks = chrome.filter(
    (r) => n(r, "width") === 1 && n(r, "height") === 4
  );
  const all = svg.getBBox();
  const pad = 7;
  const left = n(yAxis, "x") - pad + 4;
  const top = n(yAxis, "y") - pad;
  const bottom = n(yAxis, "y") + n(yAxis, "height") + pad;
  const right =
    (xAxis ? n(xAxis, "x") + n(xAxis, "width") : all.x + all.width) + pad;
  for (const r of chrome) r.remove();
  const NS = "http://www.w3.org/2000/svg";
  const add = (x: number, y: number, w: number, h: number) => {
    const e = document.createElementNS(NS, "rect");
    e.setAttribute("x", String(x));
    e.setAttribute("y", String(y));
    e.setAttribute("width", String(w));
    e.setAttribute("height", String(h));
    e.setAttribute("fill", "black");
    svg.appendChild(e);
  };
  const lw = 1.2;
  add(left, top, right - left, lw);
  add(left, bottom - lw, right - left, lw);
  add(left, top, lw, bottom - top);
  add(right - lw, top, lw, bottom - top);
  yTicks.forEach((t, i) => i % 3 === 0 && add(left, n(t, "y"), 4, lw));
  xTicks.forEach((t, i) => i % 3 === 0 && add(n(t, "x"), bottom - 4, lw, 4));
  const m = 2;
  const vw = right - left + 2 * m;
  const vh = bottom - top + 2 * m;
  svg.setAttribute("viewBox", `${left - m} ${top - m} ${vw} ${vh}`);
  svg.setAttribute("width", String(vw));
  svg.setAttribute("height", String(vh));
}

type Look = "none" | "scan" | "raster";

async function panel(name: string, look: Look): Promise<HTMLElement> {
  const box = document.createElement("div");
  box.style.cssText = "background:white;padding:6px;display:inline-block;";
  const host = document.createElement("div");
  box.appendChild(host);
  document.body.appendChild(box);
  await PANELS[name](host);
  const [svg] = await drawn(host);
  cograFrame(svg);
  if (look === "scan") applyWear(svg, "scan");
  if (look === "raster") await replaceWithScan(svg);
  return box;
}

const ORDER = ["bars", "hist", "scatter", "density", "lines"];

const grid = (look: Look): StoryObj => ({
  render: async () => {
    const container = initializeContainer();
    container.style.cssText +=
      "display:inline-flex;gap:6px;background:white;padding:6px;";
    for (const n of ORDER) container.appendChild(await panel(n, look));
    return container;
  },
});

export const CograSixPlain = grid("none");
export const CograSixScan = grid("scan");
export const CograSixScanRaster = grid("raster");

// The whole intro video as one page. `window.__seek(t)` puts every element in
// its state at time t (seconds). Nothing moves on its own: there are no timers,
// no requestAnimationFrame loops, and no CSS animations or transitions, so the
// capture script can step through frames in any order and get the same pixels.

import { chart, spread, stack, rect, clock } from "gofish-graphics";
import { seafood } from "../../../packages/gofish-graphics/src/data/catch.ts";
import montage from "../montage.json";
import logoUrl from "../../../apps/docs/docs/public/gofish-logo.png";
import "./style.css";
import {
  clamp01,
  diffLines,
  easeInOut,
  editHtml,
  ramp,
  staticHtml,
  typedCount,
  typingHtml,
  typingSchedule,
} from "./code.js";

export const DURATION = 45;

// ---- the code on screen ---------------------------------------------------
// These exact strings are shown in the code panel AND executed to draw the
// charts, so the video cannot show code that differs from what it renders.

const CODE_SPREAD = `chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x" }),
    spread({ by: "species", dir: "y" })
  )
  .mark(rect({ h: "count", fill: "species" }))
  .render(el, { w: 520, h: 380, axes: true });`;

// Change one word: the inner `spread` becomes `stack`.
const CODE_STACK = CODE_SPREAD.replace(
  `    spread({ by: "species"`,
  `    stack({ by: "species"`
);

// Polar coordinates. `spacing` is measured in the chart's own coordinates, so
// in polar it is an angle in radians: the default gap of 8 would wrap the
// wedges around the circle more than once, which is why it is set here.
const CODE_POLAR = CODE_STACK.replace(
  `chart(seafood)`,
  `chart(seafood, { coord: clock() })`
).replace(`dir: "x" }),`, `dir: "x", spacing: 0.1 }),`);

async function runCode(code, el) {
  const fn = new Function(
    "chart",
    "spread",
    "stack",
    "rect",
    "clock",
    "seafood",
    "el",
    `return ${code}`
  );
  await fn(chart, spread, stack, rect, clock, seafood, el);
}

// ---- timeline (seconds) ---------------------------------------------------

const T = {
  // scene 1: title
  logoIn: [0.1, 1.0],
  wordIn: [0.45, 1.35],
  subIn: [0.95, 1.75],
  titleOut: [4.0, 4.6],

  // scene 2: data, layout, mark
  capStart: [4.7, 5.2, 14.0, 14.4],
  codeCardIn: [4.9, 5.6],
  chartCardIn: [5.1, 5.8],
  typeStart: 5.7,
  typeCps: 44,
  typeLinePause: 0.15,

  // scene 3: one word, then polar
  capWord: [14.5, 14.9, 19.3, 19.7],
  edit1: 15.4,
  morph1: [16.6, 17.6],
  edit1Fade: [18.6, 19.2],
  capPolar: [19.7, 20.1, 25.0, 25.4],
  edit2: 20.4,
  morph2: [22.3, 23.1],
  edit2Fade: [24.2, 24.8],
  cardsOut: [25.1, 25.7],

  // scene 4: montage
  capMontage: [25.7, 26.2, 33.9, 34.4],
  tilesIn: 25.9,
  drift: [25.9, 34.4],
  gridOut: [33.9, 34.4],

  // scene 5: two languages
  capLang: [34.6, 35.1, 40.1, 40.5],
  jsIn: [35.0, 35.7],
  pyIn: [35.3, 36.0],
  installOut: [40.1, 40.5],

  // scene 6: outro
  outroLogo: [40.7, 41.5],
  outroWord: [40.9, 41.7],
  outroUrl: [41.3, 42.1],
};

// Typing schedule for scene 2, and when each line of it finishes.
const typing = typingSchedule(
  CODE_SPREAD,
  T.typeStart,
  T.typeCps,
  T.typeLinePause
);
const lineEnds = (() => {
  const ends = [];
  let offset = 0;
  for (const line of CODE_SPREAD.split("\n")) {
    offset += line.length;
    ends.push(typing.times[offset - 1] ?? typing.end);
    offset += 1;
  }
  return ends;
})();
const lineStarts = (() => {
  const starts = [];
  let offset = 0;
  for (const line of CODE_SPREAD.split("\n")) {
    starts.push(typing.times[offset]);
    offset += line.length + 1;
  }
  return starts;
})();
// Line 0 is `chart(seafood)`, lines 1-4 the flow, line 5 the mark.
const FLOW_START = lineStarts[1];
const LAYOUT_DONE = lineEnds[4];
const MARK_START = lineStarts[5];
const MARK_DONE = lineEnds[5];

// Edit plans: when each hunk is marked, struck, typed, and collapsed.
function planEdit(hunks, start, cps) {
  let t = start;
  return hunks.map((h) => {
    const plan = {};
    if (h.del.length) {
      plan.mark = [t, t + 0.3];
      plan.strike = [t + 0.3, t + 0.65];
      t += 0.7;
    }
    const insText = h.ins.map((x) => x.text).join("");
    plan.type = typingSchedule(insText, t, cps);
    t = plan.type.end + 0.05;
    plan.collapse = [t, t + 0.35];
    if (h.del.length) t += 0.35;
    t += 0.2; // pause before the next hunk
    return plan;
  });
}
const hunks1 = diffLines(CODE_SPREAD, CODE_STACK);
const plan1 = planEdit(hunks1, T.edit1, 14);
const hunks2 = diffLines(CODE_STACK, CODE_POLAR);
const plan2 = planEdit(hunks2, T.edit2, 22);

// ---- small helpers ----------------------------------------------------------

const $ = (id) => document.getElementById(id);
const lerp = (a, b, p) => a + (b - a) * p;

/** Opacity for an element that fades in over [a, b] and out over [c, d]. */
const fadeWindow = (t, [a, b, c, d]) =>
  Math.min(ramp(t, a, b), 1 - ramp(t, c, d));

function show(el, opacity, transform = "") {
  el.style.opacity = opacity.toFixed(4);
  el.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
  el.style.transform = transform;
}

// ---- setup --------------------------------------------------------------------

const CARD = {
  code: { top: 404 },
  chart: { top: 232, w: 888, h: 716, pad: 34 },
};

const charts = []; // { el, svg, box }
let bars = []; // spread-chart bars: { el, x, y, w, h, start, to }
let chrome = null; // axes, labels, legend of the spread and stack charts
let tiles = []; // { el, delay }

async function renderCharts() {
  const card = $("chart-card");
  card.style.top = `${CARD.chart.top}px`;
  card.style.height = `${CARD.chart.h}px`;
  for (const code of [CODE_SPREAD, CODE_STACK, CODE_POLAR]) {
    const el = document.createElement("div");
    el.className = "chart-layer";
    card.appendChild(el);
    await runCode(code, el);
    let svg = null;
    for (let i = 0; i < 200 && !svg; i++) {
      svg = el.querySelector("svg");
      if (!svg) await new Promise((r) => setTimeout(r, 25));
    }
    if (!svg) throw new Error("chart did not render:\n" + code);
    charts.push({ el, svg, box: svg.getBBox() });
  }

  // The spread and stack charts share one scale so the swap keeps the legend
  // and labels still. The radial chart leaves more of its box empty, so it may
  // zoom in a little further to fill the card.
  const innerW = CARD.chart.w - 2 * CARD.chart.pad;
  const innerH = CARD.chart.h - 2 * CARD.chart.pad;
  const fit = ({ box }) => Math.min(innerW / box.width, innerH / box.height);
  const barScale = Math.min(fit(charts[0]), fit(charts[1]));
  const scales = [barScale, barScale, Math.min(fit(charts[2]), barScale * 1.3)];
  // The spread and stack charts share one frame so their axes line up.
  const union = (a, b) => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  };
  const frames = [
    union(charts[0].box, charts[1].box),
    union(charts[0].box, charts[1].box),
    charts[2].box,
  ];
  charts.forEach((c, i) => {
    const b = frames[i];
    const s = scales[i];
    const left = CARD.chart.w / 2 - (b.x + b.width / 2) * s;
    const top = CARD.chart.h / 2 - (b.y + b.height / 2) * s;
    c.base = `translate(${left.toFixed(2)}px, ${top.toFixed(2)}px) scale(${s.toFixed(4)})`;
    c.el.style.transformOrigin = "0 0";
    c.el.style.transform = c.base;
  });

  // Scene 2 animates the first chart: axes and legend fade in once the layout
  // is typed, then each bar grows up from its own bottom edge once the mark is.
  // Scene 3 then slides each of those bars to where the stack chart draws it.
  const barsOf = (svg) => {
    const found = [...svg.querySelectorAll("rect")].filter(
      (n) =>
        n.getAttribute("fill") !== "gray" &&
        Number(n.getAttribute("width")) > 20
    );
    if (found.length !== seafood.length) {
      throw new Error(`expected ${seafood.length} bars, found ${found.length}`);
    }
    return found;
  };
  const geom = (n) => ({
    x: Number(n.getAttribute("x")),
    y: Number(n.getAttribute("y")),
    w: Number(n.getAttribute("width")),
    h: Number(n.getAttribute("height")),
    fill: n.getAttribute("fill"),
  });
  const spreadBars = barsOf(charts[0].svg);
  const stackBars = barsOf(charts[1].svg);
  const stackGeoms = stackBars.map(geom);
  bars = spreadBars.map((el) => {
    const g = geom(el);
    // The same row in the stack chart: same lake column, same species color.
    const to = stackGeoms.find((s) => s.x === g.x && s.fill === g.fill);
    if (!to) throw new Error("no matching bar in the stack chart");
    return { el, ...g, to };
  });
  const xs = [...new Set(bars.map((b) => b.x))].sort((a, b) => a - b);
  // Stagger: left to right by lake, bottom to top within a lake.
  for (const col of xs) {
    const inCol = bars.filter((b) => b.x === col).sort((a, b) => b.y - a.y);
    inCol.forEach((b, j) => {
      b.start = MARK_DONE + 0.05 + xs.indexOf(col) * 0.15 + j * 0.09;
    });
  }

  // Axes, labels, and legend. Pieces drawn identically in both charts (the
  // legend, the lake labels) stay put during the morph; the rest (the count
  // ticks) fade out of one chart and into the other.
  const sig = (n) =>
    n.tagName +
    [...n.attributes]
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(";") +
    n.textContent;
  const spreadChrome = [...charts[0].svg.children].filter(
    (n) => !spreadBars.includes(n)
  );
  const stackChrome = [...charts[1].svg.children].filter(
    (n) => !stackBars.includes(n)
  );
  const stackSigs = new Set(stackChrome.map(sig));
  const spreadSigs = new Set(spreadChrome.map(sig));
  chrome = {
    spread: spreadChrome.map((el) => ({ el, shared: stackSigs.has(sig(el)) })),
    stack: stackChrome.map((el) => ({ el, shared: spreadSigs.has(sig(el)) })),
    stackBars,
  };
}

/** The first rows of the dataset, shown while `chart(seafood)` is typed. */
function buildDataPreview() {
  const rows = seafood.slice(0, 5);
  const cols = Object.keys(rows[0]);
  const cell = (v) =>
    typeof v === "number"
      ? `<td class="num">${v}</td>`
      : `<td class="str">"${v}"</td>`;
  $("data-preview").innerHTML =
    `<div class="name">seafood</div>` +
    `<table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>` +
    rows
      .map((r) => `<tr>${cols.map((c) => cell(r[c])).join("")}</tr>`)
      .join("") +
    `</table><div class="more">${seafood.length} rows</div>`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** The bounding box of the non-white pixels of an image. */
function contentBox(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("blank tile image");
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const GRID = { cols: 4, tileW: 404, tileH: 246, gapX: 36, gapY: 30, top: 214 };
const TILE_IMG = { w: 376, h: 186 };

async function buildMontage() {
  const grid = $("grid");
  const left0 =
    (1920 - (GRID.cols * GRID.tileW + (GRID.cols - 1) * GRID.gapX)) / 2;
  for (const [i, entry] of montage.entries()) {
    const img = await loadImage(`/${entry.id}.png`);
    let box = contentBox(img);
    if (entry.crop) {
      // Optional zoom into part of the drawing, as fractions of its box.
      const [fx0, fy0, fx1, fy1] = entry.crop;
      box = {
        x: box.x + fx0 * box.w,
        y: box.y + fy0 * box.h,
        w: (fx1 - fx0) * box.w,
        h: (fy1 - fy0) * box.h,
      };
    }
    const pad = 6;
    const sx = Math.max(0, box.x - pad);
    const sy = Math.max(0, box.y - pad);
    const sw = Math.min(img.naturalWidth - sx, box.w + 2 * pad);
    const sh = Math.min(img.naturalHeight - sy, box.h + 2 * pad);
    const s = Math.min(TILE_IMG.w / sw, TILE_IMG.h / sh);
    const canvas = document.createElement("canvas");
    canvas.width = TILE_IMG.w;
    canvas.height = TILE_IMG.h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      sx,
      sy,
      sw,
      sh,
      (TILE_IMG.w - sw * s) / 2,
      (TILE_IMG.h - sh * s) / 2,
      sw * s,
      sh * s
    );
    const tile = document.createElement("div");
    tile.className = "tile";
    const row = Math.floor(i / GRID.cols);
    const col = i % GRID.cols;
    tile.style.left = `${left0 + col * (GRID.tileW + GRID.gapX)}px`;
    tile.style.top = `${GRID.top + row * (GRID.tileH + GRID.gapY)}px`;
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = entry.label ?? entry.title;
    tile.append(canvas, label);
    grid.appendChild(tile);
    tiles.push({ el: tile, delay: (row + col) * 0.11 });
  }
}

async function setup() {
  $("title-logo").src = logoUrl;
  $("outro-logo").src = logoUrl;
  await Promise.all([loadImage(logoUrl)]);
  await Promise.all(
    [
      '800 150px "Fraunces"',
      '700 54px "Fraunces"',
      '500 46px "Spline Sans"',
      '600 30px "Spline Sans"',
      '400 23px "Spline Sans Mono"',
      '600 23px "Spline Sans Mono"',
      '500 48px "Spline Sans Mono"',
    ].map((f) => document.fonts.load(f))
  );
  await document.fonts.ready;
  window.__fontsOk = ["Fraunces", "Spline Sans", "Spline Sans Mono"].every(
    (f) => document.fonts.check(`16px "${f}"`)
  );

  $("code-card").style.top = `${CARD.code.top}px`;
  buildDataPreview();
  await renderCharts();
  await buildMontage();
  window.__codes = { CODE_SPREAD, CODE_STACK, CODE_POLAR };
}

// ---- per-frame state ----------------------------------------------------------

let lastCode = null;

function seekTitle(t) {
  const out = 1 - ramp(t, ...T.titleOut);
  const logo = ramp(t, ...T.logoIn);
  const word = ramp(t, ...T.wordIn);
  const sub = ramp(t, ...T.subIn);
  show($("title"), out);
  // A slow tilt, like the logo on the docs landing page.
  const tilt = Math.sin((t / 5) * 2 * Math.PI);
  show(
    $("title-logo"),
    logo,
    `scale(${lerp(0.82, 1, logo).toFixed(4)}) rotateY(${(18 * tilt).toFixed(3)}deg) rotateX(${(6 * tilt).toFixed(3)}deg)`
  );
  show($("title-word"), word, `translateY(${lerp(22, 0, word).toFixed(2)}px)`);
  show($("title-sub"), sub, `translateY(${lerp(18, 0, sub).toFixed(2)}px)`);
}

function seekCaption(id, t, win) {
  const o = fadeWindow(t, win);
  const rise = lerp(14, 0, ramp(t, win[0], win[1]));
  show($(id), o, `translateY(${rise.toFixed(2)}px)`);
}

function seekCaptions(t) {
  seekCaption("cap-start", t, T.capStart);
  // Each sentence lights up as the code it describes is typed.
  const partTimes = [T.capStart[0], FLOW_START, MARK_START];
  [...$("cap-start").querySelectorAll(".part")].forEach((el, i) => {
    const on = ramp(t, partTimes[i], partTimes[i] + 0.35);
    el.style.opacity = lerp(0.25, 1, on).toFixed(4);
  });
  seekCaption("cap-word", t, T.capWord);
  seekCaption("cap-polar", t, T.capPolar);
  seekCaption("cap-montage", t, T.capMontage);
  seekCaption("cap-lang", t, T.capLang);
}

function codeHtmlAt(t) {
  if (t < T.edit1) {
    const n = typedCount(typing, t);
    const typingNow = t >= T.typeStart && n < CODE_SPREAD.length;
    return n >= CODE_SPREAD.length
      ? staticHtml(CODE_SPREAD)
      : typingHtml(CODE_SPREAD, n, typingNow);
  }
  if (t < T.edit2) {
    return editHtml(CODE_SPREAD, hunks1, plan1, t, 1 - ramp(t, ...T.edit1Fade));
  }
  return editHtml(CODE_STACK, hunks2, plan2, t, 1 - ramp(t, ...T.edit2Fade));
}

function seekCodeAndCharts(t) {
  const out = ramp(t, ...T.cardsOut);
  const codeIn = ramp(t, ...T.codeCardIn);
  const chartIn = ramp(t, ...T.chartCardIn);
  show(
    $("code-card"),
    Math.min(codeIn, 1 - out),
    `translateX(${(lerp(-40, 0, codeIn) - 40 * out).toFixed(2)}px)`
  );
  show(
    $("chart-card"),
    Math.min(chartIn, 1 - out),
    `translateX(${(lerp(40, 0, chartIn) + 40 * out).toFixed(2)}px)`
  );
  if (codeIn <= 0 || out >= 1) return;

  const html = codeHtmlAt(t);
  if (html !== lastCode) {
    $("code").innerHTML = html;
    lastCode = html;
  }

  // Scene 2: the data shows while `chart(seafood)` is typed, then gives way to
  // the spread chart building up.
  const dataIn = ramp(t, T.typeStart, T.typeStart + 0.45);
  const dataOut = ramp(t, LAYOUT_DONE - 0.35, LAYOUT_DONE + 0.1);
  show(
    $("data-preview"),
    Math.min(dataIn, 1 - dataOut),
    `translateY(${lerp(14, 0, dataIn).toFixed(2)}px)`
  );
  const chromeIn = ramp(t, LAYOUT_DONE, LAYOUT_DONE + 0.5);
  // Scene 3a: spread becomes stack. The bars slide together; the count ticks
  // fade out of the old chart, then into the new one.
  const m1 = ramp(t, ...T.morph1);
  // Scene 3b: the stack chart hands off to the radial chart (fade out, then in).
  const out2 = ramp(t, T.morph2[0], T.morph2[0] + 0.45);
  const in2 = ramp(t, T.morph2[1] - 0.5, T.morph2[1]);

  const [spreadC, stackC, polarC] = charts;
  const setLayer = (c, o, extra = "") => {
    c.el.style.opacity = o.toFixed(4);
    c.el.style.visibility = o <= 0.001 ? "hidden" : "visible";
    c.el.style.transform = c.base + extra;
  };
  const morphing = m1 < 1;
  setLayer(spreadC, morphing ? 1 : 0);
  setLayer(stackC, m1 > 0 ? 1 - out2 : 0);
  const k = lerp(0.92, 1, in2);
  const cx = polarC.box.x + polarC.box.width / 2;
  const cy = polarC.box.y + polarC.box.height / 2;
  setLayer(
    polarC,
    in2,
    ` translate(${cx}px, ${cy}px) scale(${k.toFixed(4)}) translate(${-cx}px, ${-cy}px)`
  );

  if (morphing) {
    for (const { el, shared } of chrome.spread) {
      const o = shared ? chromeIn : chromeIn * (1 - clamp01(m1 / 0.5));
      el.style.opacity = o.toFixed(4);
    }
    for (const b of bars) {
      const p = ramp(t, b.start, b.start + 0.5);
      const y0 = b.y + b.h * (1 - p);
      const h0 = b.h * p;
      b.el.setAttribute("y", lerp(y0, b.to.y, m1).toFixed(3));
      b.el.setAttribute("height", lerp(h0, b.to.h, m1).toFixed(3));
    }
  }
  if (m1 > 0) {
    // Until the morph lands, the stack chart shows only its own new pieces.
    for (const { el, shared } of chrome.stack) {
      const o = morphing ? (shared ? 0 : clamp01((m1 - 0.5) / 0.5)) : 1;
      el.style.opacity = o.toFixed(4);
    }
    for (const el of chrome.stackBars) el.style.opacity = morphing ? "0" : "1";
  }
}

function seekMontage(t) {
  const grid = $("grid");
  const out = ramp(t, ...T.gridOut);
  const started = t >= T.tilesIn;
  const drift = clamp01((t - T.drift[0]) / (T.drift[1] - T.drift[0]));
  const d = easeInOut(0.5 * drift) * 2; // gentle start, steady finish
  show(
    grid,
    started ? 1 - out : 0,
    `translateY(${lerp(10, -12, d).toFixed(2)}px) scale(${lerp(0.985, 1.035, d).toFixed(4)})`
  );
  if (!started || out >= 1) return;
  for (const { el, delay } of tiles) {
    const p = ramp(t, T.tilesIn + delay, T.tilesIn + delay + 0.75);
    show(
      el,
      p,
      `translateY(${lerp(28, 0, p).toFixed(2)}px) scale(${lerp(0.9, 1, p).toFixed(4)})`
    );
  }
}

function seekInstall(t) {
  const out = ramp(t, ...T.installOut);
  show($("install"), 1 - out);
  const js = ramp(t, ...T.jsIn);
  const py = ramp(t, ...T.pyIn);
  show($("install-js"), js, `translateY(${lerp(24, 0, js).toFixed(2)}px)`);
  show($("install-py"), py, `translateY(${lerp(24, 0, py).toFixed(2)}px)`);
}

function seekOutro(t) {
  const logo = ramp(t, ...T.outroLogo);
  const word = ramp(t, ...T.outroWord);
  const url = ramp(t, ...T.outroUrl);
  show($("outro"), logo > 0 ? 1 : 0);
  show($("outro-logo"), logo, `scale(${lerp(0.85, 1, logo).toFixed(4)})`);
  show($("outro-word"), word, `translateY(${lerp(20, 0, word).toFixed(2)}px)`);
  show($("outro-url"), url, `translateY(${lerp(16, 0, url).toFixed(2)}px)`);
}

function seek(t) {
  seekTitle(t);
  seekCaptions(t);
  seekCodeAndCharts(t);
  seekMontage(t);
  seekInstall(t);
  seekOutro(t);
}

window.__duration = DURATION;
window.__seek = seek;
setup()
  .then(() => {
    const q = new URLSearchParams(location.search).get("t");
    seek(q ? Number(q) : 0);
    window.__ready = true;
  })
  .catch((err) => {
    console.error(err);
    window.__error = String(err?.stack ?? err);
  });

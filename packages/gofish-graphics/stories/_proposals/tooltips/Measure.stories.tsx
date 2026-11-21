/**
 * PROTOTYPE(#1395): measurements for NOTES.md, run in a real browser.
 *
 * Open "Proposals/Tooltips/Measure" in Storybook (or drive it with
 * `measure.ts` beside this file) and it prints a table into the page and
 * onto `window.__TT_MEASURE__`:
 *
 *  1. the cost of one re-run (resolve + layout + paint) of stories 1-3 with
 *     a tooltip open, as the median of N full renders;
 *  2. how many re-runs a sweep of synthetic pointermoves causes, with the
 *     pointer read IN the spec (naive) and with the focus split (only the
 *     focused key is read in the spec);
 *  3. whether a box drawn under a still pointer steals the hit-test
 *     (flicker), with and without the `noPointer` CSS.
 *
 * The capture harness runs stories on a fake clock, so its numbers are
 * meaningless; `measure.ts` opens the harness page without one.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { pointer, live, chart, scatter, circle, line, group } from "../../../src/lib";
import { issueBar } from "./IssueBar.stories";
import { stackTooltip } from "./StackedBar.stories";
import { sharedLines, yearly, CANVAS as LINES_CANVAS } from "./SharedLines.stories";
import { focusFrom, hitRow, noPointer } from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Measure" };
export default meta;

const N = 15;
const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function host() {
  const c = document.createElement("div");
  c.style.position = "absolute";
  c.style.left = "0";
  c.style.top = "0";
  c.style.background = "white";
  document.body.appendChild(c);
  return c;
}

/** Median wall time of a full render (what one re-run does). */
async function renderCost(build: (i: number) => any): Promise<number> {
  const times: number[] = [];
  for (let i = -2; i < N; i++) {
    const c = host();
    const t0 = performance.now();
    await build(i).render(c);
    const t1 = performance.now();
    if (i >= 0) times.push(t1 - t0);
    c.remove();
  }
  return median(times);
}

/** Count `<svg>` replacements (re-runs) in `c` while `act` runs. */
async function countReruns(c: HTMLElement, act: () => Promise<void>) {
  let n = 0;
  const mo = new MutationObserver((ms) => {
    for (const m of ms)
      for (const a of m.addedNodes) if ((a as Element).tagName === "svg") n++;
  });
  mo.observe(c, { childList: true, subtree: true });
  await act();
  await sleep(100);
  mo.disconnect();
  return n;
}

/** Dispatch a pointermove at client (x, y) on whatever is hit there. */
function moveTo(c: HTMLElement, x: number, y: number) {
  const svg = c.querySelector("svg")!;
  const r = svg.getBoundingClientRect();
  const cx = r.left + x;
  const cy = r.top + y;
  const target = document.elementFromPoint(cx, cy) ?? svg;
  target.dispatchEvent(
    new PointerEvent("pointermove", { clientX: cx, clientY: cy, bubbles: true })
  );
}

const settle = async () => {
  await raf();
  await raf();
  await sleep(40);
};

/** A sweep of `points`, one move per settled frame. */
async function sweep(c: HTMLElement, points: [number, number][]) {
  for (const [x, y] of points) {
    moveTo(c, x, y);
    await settle();
  }
}

/** Points along the bars of the issue chart: 3 bars, 10 moves each. */
function barSweep(c: HTMLElement): [number, number][] {
  const svg = c.querySelector("svg")!;
  const bars = [...svg.querySelectorAll("rect")].filter((r) =>
    /4c78a8|2f5d8a/.test(r.getAttribute("fill") ?? "")
  );
  const pts: [number, number][] = [];
  for (const b of bars.slice(5, 8)) {
    const x = +b.getAttribute("x")!;
    const y = +b.getAttribute("y")! + +b.getAttribute("height")! / 2;
    const w = +b.getAttribute("width")!;
    for (let k = 0; k < 10; k++) pts.push([x + 2 + (k * (w - 4)) / 9, y]);
  }
  return pts;
}

async function measure() {
  const out: Record<string, unknown> = {};

  // 1. Cost of one re-run, tooltip open (median of N full renders).
  const paths = ["VO→VO", "PK→PK", "INF→VO", "VO→PK"];
  out.rerunMs_issueBar = await renderCost((i) => issueBar(() => paths[(i + 4) % 4]));
  out.rerunMs_issueBarClosed = await renderCost(() => issueBar(() => undefined));
  const lakes = ["Lake A", "Lake C", "Lake D", "Lake E"];
  out.rerunMs_stackWhole = await renderCost((i) =>
    stackTooltip(() => ({ lake: lakes[(i + 4) % 4] }))
  );
  out.rerunMs_sharedLines = await renderCost((i) => sharedLines(() => 2001 + ((i + 4) % 4)));

  // 2. Re-runs per pointer sweep: naive (pointer read in the spec) vs split.
  {
    const c = host();
    const p = pointer();
    // Naive: the spec's filter reads the pointer itself.
    await issueBar(() => hitRow<any>(p)?.path).render(c);
    await settle();
    const pts = barSweep(c);
    out.sweepMoves_bars = pts.length;
    out.reruns_bars_naive = await countReruns(c, () => sweep(c, pts));
    c.remove();
  }
  {
    const c = host();
    const p = pointer();
    const focus = focusFrom(() => hitRow<any>(p)?.path);
    await issueBar(
      focus,
      live((d: any) => (d?.path === hitRow<any>(p)?.path ? "#2f5d8a" : "#4c78a8"))
    ).render(c);
    await settle();
    const pts = barSweep(c);
    out.reruns_bars_split = await countReruns(c, () => sweep(c, pts));
    c.remove();
  }
  {
    // Lines: 40 moves across the plot, left to right, at mid height.
    const linePts = (c: HTMLElement): [number, number][] => {
      const svg = c.querySelector("svg")!;
      const paths = [...svg.querySelectorAll("path")];
      const xs = paths
        .flatMap((p) => (p.getAttribute("d") ?? "").match(/[\d.]+(?=,)/g) ?? [])
        .map(Number);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      return Array.from({ length: 40 }, (_, k) => [x0 + ((x1 - x0) * k) / 39, 150]);
    };
    const nearestYear = (p: any) => {
      const x = p.dataPos()?.x;
      if (x === undefined) return undefined;
      return Math.max(2000, Math.min(2009, Math.round(x)));
    };
    {
      const c = host();
      const p = pointer();
      await sharedLines(() => nearestYear(p), 1, {}).render(c, LINES_CANVAS);
      await settle();
      const pts = linePts(c);
      out.sweepMoves_lines = pts.length;
      out.reruns_lines_naive = await countReruns(c, () => sweep(c, pts));
      c.remove();
    }
    {
      const c = host();
      const p = pointer();
      const year = focusFrom(() => nearestYear(p));
      await sharedLines(year, live(() => (p.pos(), 1)), {}).render(c, LINES_CANVAS);
      await settle();
      const pts = linePts(c);
      out.reruns_lines_split = await countReruns(c, () => sweep(c, pts));
      out.lines_sample = JSON.stringify({ pos: p.pos(), dataPos: p.dataPos(), year: year() });
      c.remove();
    }
  }

  // Diagnostic: does `dataPos()` convert, for which chart shapes?
  {
    const forms: Record<string, (p: any) => any> = {
      scatterSized: (p) =>
        chart(yearly, { w: 400, h: 300 })
          .flow(scatter({ x: "year", y: "count" }))
          .mark(circle({ r: 3, opacity: live(() => (p.pos(), 1)) })),
      scatterRenderSized: (p) =>
        chart(yearly)
          .flow(scatter({ x: "year", y: "count" }))
          .mark(circle({ r: 3, opacity: live(() => (p.pos(), 1)) })),
      linesSized: (p) =>
        chart(yearly, { w: 400, h: 300 })
          .flow(group({ by: "series" }), scatter({ by: "year", x: "year", y: "count" }))
          .mark(line({ stroke: "series", opacity: live(() => (p.pos(), 1)) })),
      scatterSizedWithLayer: (p) =>
        chart(yearly, { w: 400, h: 300 })
          .flow(scatter({ x: "year", y: "count" }))
          .mark(circle({ r: 3, opacity: live(() => (p.pos(), 1)) }))
          .layer(chart(yearly).flow(scatter({ x: "year", y: "count" })).mark(circle({ r: 1 }))),
    };
    const diag: Record<string, string> = {};
    for (const [name, build] of Object.entries(forms)) {
      const c = host();
      const p = pointer();
      const b = build(p);
      if (name === "scatterRenderSized") await b.render(c, { w: 400, h: 300 });
      else await b.render(c);
      await settle();
      moveTo(c, 200, 150);
      await settle();
      diag[name] = JSON.stringify(p.dataPos() ?? null);
      c.remove();
    }
    out.dataPosByChartShape = diag;
  }

  // 3. Flicker: hold the pointer still inside the open box of the top bar
  // (which hangs over the bars below it), and send the same move 8 times.
  for (const css of [false, true]) {
    const c = host();
    if (css) noPointer(c);
    const p = pointer();
    const seen: (string | undefined)[] = [];
    const focus = focusFrom(() => hitRow<any>(p)?.path);
    await issueBar(
      () => focus(),
      live((d: any) => (d?.path === hitRow<any>(p)?.path ? "#2f5d8a" : "#4c78a8"))
    ).render(c);
    await settle();
    // Open the top bar's box first.
    const svg = c.querySelector("svg")!;
    const top = [...svg.querySelectorAll("rect")].find((r) =>
      /4c78a8|2f5d8a/.test(r.getAttribute("fill") ?? "")
    )!;
    const end = +top.getAttribute("x")! + +top.getAttribute("width")!;
    const ty = +top.getAttribute("y")! + 8;
    moveTo(c, end - 30, ty);
    await settle();
    seen.push(focus());
    // Now hold still inside the open box (it hangs under the top bar's
    // end), at a spot where the second bar is under the box.
    for (let k = 0; k < 8; k++) {
      moveTo(c, end - 115, ty + 40);
      await settle();
      seen.push(focus());
    }
    out[css ? "focus_heldStill_withNoPointerCSS" : "focus_heldStill_noCSS"] = seen.join(" → ");
    c.remove();
  }
  return out;
}

export const Run: StoryObj = {
  render: () => {
    const container = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "measuring…";
    container.appendChild(pre);
    void measure().then((out) => {
      (window as any).__TT_MEASURE__ = out;
      pre.textContent = JSON.stringify(out, null, 2);
    });
    return container;
  },
};

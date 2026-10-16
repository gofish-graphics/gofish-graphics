import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  scatter,
  group,
  line,
  layer,
  Constraint,
  createMark,
  createName,
  rect,
  text,
  ref,
  arrow,
  Schema,
} from "../../../src/lib";
import { loadYearlyStocks } from "./data";
import { plotBounds } from "./Points.stories";
import { zoomed, afterPaint, readPaths, measure, outsideColor, hits, type Obstacle, type Pt } from "./place";
import { alongSide, choose, drawLabels, pieces, type Side, type At } from "./side";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

/** A titled panel in a CSS grid; returns the chart's container. */
export function panel(grid: HTMLElement, title: string, pad = "4px 16px 4px 16px"): HTMLElement {
  const cell = document.createElement("div");
  cell.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  const t = document.createElement("div");
  t.textContent = title;
  t.style.cssText = "font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color:#333; white-space:pre;";
  const c = document.createElement("div");
  c.style.cssText = `padding: ${pad};`;
  cell.append(t, c);
  grid.append(cell);
  return c;
}

export function gridOf(container: HTMLElement, cols: string, gap = "14px 18px") {
  const grid = document.createElement("div");
  grid.style.cssText = `display:grid;grid-template-columns:${cols};gap:${gap};background:white;padding:8px;`;
  container.append(grid);
  return grid;
}

// ─── 1. path-sides ──────────────────────────────────────────────────────────

const stocks = (rows: any[], c: HTMLElement, w: number, h: number) =>
  chart(rows, { schema: { date: Schema.time() } })
    .flow(group({ by: "symbol" }), scatter({ by: "date", x: "date", y: "price" }))
    .mark(line({ stroke: "symbol", strokeWidth: 2 }))
    .render(c, { w, h, legend: false } as any);

function seriesLines(svg: SVGSVGElement, rows: any[]) {
  const symbols = [...new Set(rows.map((r) => r.symbol as string))];
  return readPaths(
    svg,
    (el) => el.getAttribute("fill") === "none" && +(el.getAttribute("stroke-width") ?? 0) >= 2
  ).map((p, i) => ({ ...p, text: symbols[i] }));
}

/** Label every line with Place.along({ at, side, orient }). Lines are
 *  obstacles; a label's own line too, unless it sits "on" it. */
function labelLines(
  svg: SVGSVGElement,
  lines: { pts: Pt[]; stroke: string; text: string }[],
  side: Side | Side[],
  at: At,
  orient: "sloped" | "horizontal" | "curved" = "sloped",
  steps = 14,
  axes = true
) {
  const all: Obstacle[] = lines.map((l) => ({ kind: "polyline", pts: l.pts }));
  const reqs = lines.map((l, i) => {
    const sides = Array.isArray(side) ? side : [side];
    const style = {
      fontSize: 11,
      fontWeight: 600,
      fill: outsideColor(l.stroke),
      halo: sides.includes("on"),
    };
    const cands = alongSide(l.pts, l.text, measure(svg, l.text, style), style, {
      at, side, orient, steps,
    });
    return {
      candidates: cands,
      // "on" sits on its own line; other sides must clear it
      ownObstacles: all.filter((_, j) => j !== i),
      own: all[i],
    };
  });
  // a label off its line must clear its own line too
  const filtered = reqs.map((r) => ({
    candidates: r.candidates.filter(
      (c) => c.side === "on" || !pieces(c, 1).some((poly) => hits(poly, r.own))
    ),
    ownObstacles: r.ownObstacles,
  }));
  return choose(filtered, [], axes ? plotBounds(svg) : undefined);
}

export const PathSides: StoryObj = {
  name: "path-sides",
  loaders: [async () => ({ stocks: await loadYearlyStocks() })],
  render: (_a: any, ctx: any) => {
    const container = zoomed(initializeContainer(), 1.6);
    const grid = gridOf(container, "560px", "10px");
    for (const side of ["above", "on", "below"] as const) {
      const c = panel(grid, `Place.along({ at: 0.6, side: "${side}", orient: "sloped" })`);
      stocks(ctx.loaded.stocks, c, 520, 180);
      afterPaint(c, (svg) => {
        const lines = seriesLines(svg, ctx.loaded.stocks);
        drawLabels(svg, labelLines(svg, lines, side, 0.6));
      });
    }
    return container;
  },
};

// ─── 3. side-candidates ─────────────────────────────────────────────────────

// Two series that run close together (Plan just above Actual) and one apart.
const close = (() => {
  const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const plan = [3.0, 3.6, 4.1, 4.5, 5.0, 5.6, 6.0, 6.3, 6.6];
  const actual = plan.map((v, i) => v - 0.55 - 0.05 * Math.sin(i));
  const cost = [1.2, 1.3, 1.25, 1.5, 1.7, 1.6, 1.9, 2.1, 2.0];
  return [
    ...xs.map((x) => ({ s: "Plan", x, y: plan[x] })),
    ...xs.map((x) => ({ s: "Actual", x, y: actual[x] })),
    ...xs.map((x) => ({ s: "Cost", x, y: cost[x] })),
  ];
})();

export const SideCandidates: StoryObj = {
  name: "side-candidates",
  render: () => {
    const container = zoomed(initializeContainer(), 1.6);
    const grid = gridOf(container, "repeat(2, 340px)");
    const variants: [string, Side | Side[]][] = [
      ['side: "above"', "above"],
      ['side: ["above", "below"]', ["above", "below"]],
    ];
    for (const [title, side] of variants) {
      const c = panel(grid, `Place.along({ at: 0.5, orient: "sloped",\n             ${title} })`);
      chart(close)
        .flow(group({ by: "s" }), scatter({ by: "x", x: "x", y: "y" }))
        .mark(line({ stroke: "s", strokeWidth: 2 }))
        .render(c, { w: 300, h: 200, legend: false } as any);
      afterPaint(c, (svg) => {
        const names = ["Plan", "Actual", "Cost"];
        const lines = readPaths(svg, (el) => el.getAttribute("fill") === "none" && +(el.getAttribute("stroke-width") ?? 0) >= 2).map(
          (p, i) => ({ ...p, text: names[i] })
        );
        // steps: 0 so the label stays at `at` (no slide) and the side choice is the only freedom
        const placed = labelLines(svg, lines, side, 0.5, "sloped", 0);
        drawLabels(svg, placed);
        const hidden = lines.filter((_, i) => !placed[i]).map((l) => l.text);
        const note = document.createElement("div");
        note.textContent = hidden.length ? `hidden: ${hidden.join(", ")}` : "all placed";
        note.style.cssText = "font: 10px ui-monospace, Menlo, monospace; color:#b00020; margin-top:2px;";
        if (!hidden.length) note.style.color = "#2a7a2a";
        c.append(note);
      });
    }
    return container;
  },
};

// ─── 7. along-grid ──────────────────────────────────────────────────────────

const wave = Array.from({ length: 15 }, (_, i) => ({ x: i, y: Math.sin(i / 2.2) * 1.0 + i * 0.1 }));

export const AlongGrid: StoryObj = {
  name: "along-grid",
  render: () => {
    const container = zoomed(initializeContainer(), 1.6);
    const grid = gridOf(container, "repeat(3, 230px)", "10px 14px");
    for (const side of ["above", "on", "below"] as const)
      for (const at of ["start", 0.5, "end"] as const) {
        const atStr = typeof at === "string" ? `"${at}"` : String(at);
        const c = panel(grid, `side: "${side}", at: ${atStr}`, "10px 10px 10px 10px");
        chart(wave, { axes: false })
          .flow(scatter({ by: "x", x: "x", y: "y" }))
          .mark(line({ stroke: "#4e79a7", strokeWidth: 2 }))
          .render(c, { w: 210, h: 56 });
        afterPaint(c, (svg) => {
          const lines = readPaths(svg, (el) => el.getAttribute("fill") === "none").map((p) => ({ ...p, text: "revenue" }));
          drawLabels(svg, labelLines(svg, lines, side, at, "sloped", 0, false));
        });
      }
    return container;
  },
};

// ─── 2. edge-sides ──────────────────────────────────────────────────────────

const Node = createMark(({ label }: { label: string }) =>
  layer({ w: 56, h: 34 }, [
    rect({ w: 56, h: 34, rx: 6, fill: "#e2ebf6", stroke: "#457b9d", strokeWidth: 2 }).name("box"),
    text({ text: label, fontSize: 13, fill: "#1d3557" }).name("label"),
  ]).relate(({ box, label }) => [Constraint.align({ x: "middle", y: "middle" }, [box, label])])
);

const EDGE = "#90a4ae";
const dnodes = [
  { id: "A", x: 0, y: 0 },
  { id: "B", x: 200, y: 0 },
  { id: "C", x: 200, y: 170 },
  { id: "D", x: 0, y: 170 },
  { id: "X", x: 310, y: 85 },
  { id: "Y", x: 480, y: 85 },
];
// the ring runs clockwise on screen: A (top left) → B → C → D → A
const dedges = [
  { from: "A", to: "B", label: "submit" },
  { from: "B", to: "C", label: "review" },
  { from: "C", to: "D", label: "approve" },
  { from: "D", to: "A", label: "archive" },
  { from: "X", to: "Y", label: "request" },
  { from: "Y", to: "X", label: "reply" },
];

export const EdgeSides: StoryObj = {
  name: "edge-sides",
  render: () => {
    const container = zoomed(initializeContainer(), 1.6);
    const grid = gridOf(container, "600px", "6px");
    for (const side of ["above", "left"] as const) {
      const c = panel(grid, `Place.along({ at: 0.5, side: "${side}", orient: "sloped" })`, "16px 16px");
      const names = Object.fromEntries(dnodes.map((n) => [n.id, createName(n.id)]));
      layer({ x: 30, y: 20 }, [
        ...dnodes.map((n) => layer({ x: n.x, y: n.y }, [Node({ label: n.id })]).name(names[n.id])),
        ...dedges.map((e) =>
          arrow({ stroke: EDGE, strokeWidth: 2, bow: e.from === "X" || e.from === "Y" ? 0.3 : 0, stretch: 0, straights: false, padStart: 4, padEnd: 8 }, [
            ref(names[e.from]),
            ref(names[e.to]),
          ])
        ),
      ]).render(c, { w: 590, h: 230 });
      afterPaint(c, (svg) => {
        const paths = readPaths(svg, (el) => el.getAttribute("stroke") === EDGE && el.getAttribute("fill") === "none");
        const reqs = paths.map((p, i) => {
          const style = { fontSize: 11, fill: "#546e7a" };
          const t = dedges[i].label;
          return {
            candidates: alongSide(p.pts, t, measure(svg, t, style), style, {
              at: 0.5, side, orient: "sloped", steps: 0,
            }),
          };
        });
        // no collision avoidance here: show where the side rule alone puts them
        const out = reqs.map((r) => r.candidates[0] ?? null);
        drawLabels(svg, out);
        const hidden = dedges.filter((_, i) => !out[i]).map((e) => `${e.from}→${e.to} "${e.label}"`);
        const note = document.createElement("div");
        note.textContent = hidden.length
          ? `no "${side}" on a vertical edge, label hidden: ${hidden.join(", ")}`
          : "";
        note.style.cssText = "font: 10px ui-monospace, Menlo, monospace; color:#b00020;";
        c.append(note);
      });
    }
    return container;
  },
};

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, scatter, group, circle, polygon, rect, stack, layer } from "../../../src/lib";
import { clock } from "../../../src/ast/coordinateTransforms/clock";
import { seafood } from "../../../src/data/catch";
import { zoomed, afterPaint, measure, insideColor, outsideColor, readCircles, type Obstacle, type Pt } from "./place";
import {
  boundary,
  compassPoint,
  onBoundary,
  boundaryCandidates,
  outlineOf,
  drawLabels,
  drawDots,
  centeredOn,
  cumulative,
  alongSide,
  choose,
  openRing,
  signedArea,
  COMPASS,
  type Label,
  type Side,
} from "./side";
import { takeLegend } from "./Areas.stories";
import { regions } from "./Polygons.stories";
import { panel, gridOf } from "./Sides.stories";

const meta: Meta = { title: "Proposals/Labels" };
export default meta;

// ─── 4. boundary-vocabulary ─────────────────────────────────────────────────

const FILL = "#cfe0f1";
const STROKE = "#457b9d";
const shapes: [string, () => any][] = [
  ["rect", () => rect({ x: 0, y: 0, w: 130, h: 84, fill: FILL, stroke: STROKE, strokeWidth: 1.5 })],
  ["circle", () => circle({ r: 62, fill: FILL, stroke: STROKE, strokeWidth: 1.5 })],
  [
    "polygon (C wing)",
    () =>
      polygon({
        points: regions[0].ring.map(([x, y]) => [x * 30, y * 30] as Pt),
        fill: FILL,
        stroke: STROKE,
        strokeWidth: 1.5,
      }),
  ],
];

export const BoundaryVocabulary: StoryObj = {
  name: "boundary-vocabulary",
  render: () => {
    const container = zoomed(initializeContainer(), 1.6);
    const grid = gridOf(container, "repeat(3, 236px)", "0px 8px");
    for (const side of ["outset", "inset"] as const)
      for (const [name, mk] of shapes) {
        const c = panel(grid, `${name}, side: "${side}"`, "26px 50px 26px 50px");
        layer([mk()]).render(c, { w: 130, h: 120 });
        afterPaint(c, (svg) => {
          const el = svg.querySelector(`[fill="${FILL}"]`)!;
          const b = boundary(outlineOf(el, 0.5));
          const style = { fontSize: 8, fill: side === "inset" ? "#1d3557" : "#333" };
          const labels: (Label | null)[] = [];
          const dots: Pt[] = [];
          for (const at of Object.keys(COMPASS)) {
            const { index } = compassPoint(b, at);
            dots.push(b.ring[index]);
            labels.push(onBoundary(b, at, at, measure(svg, at, style), style, side, "horizontal", 2));
          }
          drawDots(svg, dots);
          drawLabels(svg, labels);
        });
      }
    const cap = document.createElement("div");
    cap.style.cssText =
      "font: 11px ui-monospace, Menlo, monospace; color:#333; padding: 6px 8px; max-width: 760px; line-height:1.5; background:white;";
    cap.textContent =
      'Today\'s strings are these spots on a box: "outset-top" = Place.along({ at: "top", side: "outset" }), ' +
      '"inset-top-right" = { at: "top-right", side: "inset" }. The spot is the outline point farthest in that ' +
      "direction (red dot), so the same names work on any outline. The C's \"right\" is a tie between its two arm tips; " +
      "the prototype takes the tip nearest the middle of the bounding box's right side, then the upper one.";
    container.append(cap);
    return container;
  },
};

// ─── 5. boundary-donut ──────────────────────────────────────────────────────

const donut = (c: HTMLElement, label?: "plain" | "outset-top") => {
  const m = rect({ w: "count", fill: "species" });
  // the Donut story's spec, with axes off (the clock axis ring would sit
  // right where outset labels go) and, for today's labels, no legend
  chart(seafood, { coord: clock(), axes: false, padding: 40 })
    .flow(stack({ by: "species", dir: "x", y: 50, h: 50 }))
    .mark(
      label === "plain"
        ? m.label("species")
        : label === "outset-top"
          ? m.label("species", { position: "outset-top" })
          : m
    )
    .render(c, { w: 280, h: 280, legend: false } as any);
};

/** A slice's "top" edge: in polar, the run of outline points at the
 *  largest radius (the outer arc). Returned as an open polyline centered on
 *  the edge, with the edge's arc-length extent. */
function outerArc(ring: Pt[], center: Pt) {
  const r = openRing(ring);
  const rad = r.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1]));
  const R = Math.max(...rad);
  const on = rad.map((v) => v >= R - 0.75);
  // the longest cyclic run of `on`
  const n = r.length;
  let best: number[] = [], cur: number[] = [];
  const start = on.findIndex((t) => !t);
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (on[i]) cur.push(i);
    else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  }
  if (cur.length > best.length) best = cur;
  const mid = best[Math.floor(best.length / 2)];
  const { pts } = centeredOn(r, mid);
  const k = (mid + Math.floor(n / 2)) % n; // pts[0] = r[k]
  const idx = (i: number) => (i - k + n) % n;
  const cum = cumulative(pts);
  return {
    pts,
    within: [cum[idx(best[0])], cum[idx(best[best.length - 1])]] as [number, number],
    at: cum[idx(mid)] / cum[cum.length - 1],
    outsideIsLeft: signedArea(r) > 0,
    R,
  };
}

export const BoundaryDonut: StoryObj = {
  name: "boundary-donut",
  render: () => {
    const container = zoomed(initializeContainer(), 1.6);
    const grid = gridOf(container, "repeat(2, 340px)", "4px 20px");
    // 1. today
    for (const which of ["plain", "outset-top"] as const) {
      const c = panel(
        grid,
        which === "plain"
          ? 'today: rect(...).label("species")'
          : 'today: rect(...).label("species",\n         { position: "outset-top" })',
        "10px"
      );
      try {
        donut(c, which);
      } catch (e: any) {
        c.textContent = `throws: ${e?.message ?? e}`;
      }
    }
    // 2, 3. proposed
    for (const side of ["outset", "inset"] as const) {
      const c = panel(
        grid,
        `.label("species", { position:\n  Place.along({ at: "top",\n    side: "${side}", orient: "curved" }) })`,
        "10px"
      );
      donut(c);
      afterPaint(c, (svg) => {
        const species = [...new Set(seafood.map((d: any) => d.species as string))];
        const slices = [...svg.querySelectorAll("path")].filter((p) => (p.getAttribute("fill") ?? "none") !== "none");
        const rings = slices.map((s) => outlineOf(s, 0.75));
        const all = rings.flat();
        const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
        const center: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        const reqs = slices.map((s, i) => {
          const text = species[i]; // slices are in data order
          const fill = s.getAttribute("fill")!;
          const style = {
            fontSize: 11,
            fill: side === "inset" ? insideColor(fill) : outsideColor(fill),
          };
          const arc = outerArc(rings[i], center);
          return {
            candidates: alongSide(arc.pts, text, measure(svg, text, style), style, {
              at: arc.at,
              side,
              orient: "curved",
              offset: 4,
              steps: 0,
              outsideIsLeft: arc.outsideIsLeft,
              within: arc.within,
            }),
          };
        });
        drawLabels(svg, choose(reqs));
      });
    }
    return container;
  },
};

// ─── 6. boundary-region ─────────────────────────────────────────────────────

// Three clusters of birds measured by wing and bill length (synthetic).
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}
const clusters = [
  { name: "Finches", cx: 3, cy: 7, sx: 0.9, sy: 0.7, n: 14 },
  { name: "Warblers", cx: 7.6, cy: 4.2, sx: 1.0, sy: 1.1, n: 16 },
  { name: "Sparrows", cx: 3.2, cy: 2.4, sx: 1.1, sy: 0.6, n: 12 },
];
const birds = (() => {
  const r = rng(7);
  const gauss = () => {
    const u = r() || 1e-9, v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return clusters.flatMap((c) =>
    Array.from({ length: c.n }, (_, i) => ({
      id: `${c.name}-${i}`,
      group: c.name,
      wing: +(c.cx + gauss() * c.sx * 0.6).toFixed(2),
      bill: +(c.cy + gauss() * c.sy * 0.6).toFixed(2),
    }))
  );
})();

function convexHull(ps: Pt[]): Pt[] {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], hi: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of [...p].reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/** Rounded hull: the hull of every point padded by a small circle. */
const hulls = clusters.map((c) => {
  const pad = 0.45;
  const pts: Pt[] = birds
    .filter((b) => b.group === c.name)
    .flatMap((b) =>
      Array.from({ length: 16 }, (_, k) => [
        b.wing + pad * Math.cos((k / 16) * 2 * Math.PI),
        b.bill + pad * Math.sin((k / 16) * 2 * Math.PI),
      ] as Pt)
    );
  return { group: c.name, ring: convexHull(pts) };
});

const HULL_COLORS: Record<string, string> = { Finches: "#4e79a7", Warblers: "#f28e2b", Sparrows: "#59a14f" };

const regionChart = (c: HTMLElement) =>
  chart(birds, { axes: true })
    .flow(scatter({ by: "id", x: "wing", y: "bill" }))
    .mark(circle({ r: 3, fill: "group" }))
    .layer(
      chart(hulls)
        .flow(group({ by: "group" }))
        .mark(polygon({ points: "ring", fill: "group", opacity: 0.18 }))
    )
    .render(c, { w: 330, h: 300, legend: false } as any);

export const BoundaryRegion: StoryObj = {
  name: "boundary-region",
  render: () => {
    const container = zoomed(initializeContainer(), 1.5);
    const grid = gridOf(container, "repeat(2, 380px)", "4px 10px");
    for (const side of ["outset", "inset"] as const) {
      const c = panel(
        grid,
        `polygon(...).label("group", { position:\n  Place.along({ at: "top",\n    side: "${side}", orient: "curved" }) })`,
        "10px"
      );
      regionChart(c);
      afterPaint(c, (svg) => {
        const polys = [...svg.querySelectorAll("path, polygon")].filter(
          (p) => +(p.getAttribute("opacity") ?? 1) < 0.5 || +(p.getAttribute("fill-opacity") ?? 1) < 0.5
        );
        // the dots and the other regions' outlines are obstacles; a label
        // slides along its own outline from "top" until it is clear
        const dots: Obstacle[] = readCircles(svg).map((d) => ({ kind: "circle", cx: d.cx, cy: d.cy, r: d.r + 1 }));
        const outlines = polys.map((p) => outlineOf(p, 1.5));
        const reqs = polys.map((p, i) => {
          const b = boundary(outlineOf(p, 0.75));
          const text = hulls[i].group;
          const fill = p.getAttribute("fill")!;
          const style = { fontSize: 12, fontWeight: 600, fill: outsideColor(fill) };
          return {
            candidates: boundaryCandidates(b, "top", text, measure(svg, text, style), style, side, "curved", 3, 30, 4),
            ownObstacles: outlines
              .filter((_, j) => j !== i)
              .map((o) => ({ kind: "polyline", pts: [...o, o[0]] }) as Obstacle),
          };
        });
        const out = choose(reqs, dots);
        drawLabels(svg, out);
        const hidden = hulls.filter((_, i) => !out[i]).map((h) => h.group);
        const note = document.createElement("div");
        note.textContent = hidden.length ? `hidden (no clear spot near "top"): ${hidden.join(", ")}` : "";
        note.style.cssText = "font: 10px ui-monospace, Menlo, monospace; color:#b00020;";
        c.append(note);
      });
    }
    return container;
  },
};

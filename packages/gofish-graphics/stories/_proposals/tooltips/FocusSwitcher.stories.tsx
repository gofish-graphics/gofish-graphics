/**
 * PROTOTYPE(#1395): several focus behaviors on one chart, each written in
 * user space against focus.ts. The proposal page's Focus tab shows a button
 * per behavior, the code below beside the chart, and three charts to try
 * them on: the issue's bars, the same bars far apart, and the donut.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { chart, spread, rect, selectAll, filter, group, live } from "../../../src/lib";
import { pathTypes } from "./data";
import { rowTooltip, beside, percent1, thousands, rowOf, BARS } from "./helpers";
import {
  Focus,
  boxDistance,
  defaultFocus,
  readsOf,
  type Candidate,
  type FocusBehavior,
  type Frame,
  type Point,
} from "./focus";
import { snap } from "./focusRuntime";
import { mountInteractive as issueBar } from "./IssueBar.stories";
import { mountInteractive as donut } from "./Donut.stories";

// The lowercase exports are builders and mounts, not stories.
const meta: Meta = { title: "Proposals/Tooltips/Focus Behaviors", excludeStories: /^[a-z]/ };
export default meta;

/** The escape hatch: a plain function, no combinators. The bar with the
 *  largest share among those within 60 px of the pointer. */
const largestNear: FocusBehavior = ({ pointer, candidates }) => {
  if (!pointer) return undefined;
  const near = candidates.filter((c) => boxDistance(pointer, c.box) <= 60);
  return near.sort((a, b) => (b.datum[0] as any).share - (a.datum[0] as any).share)[0];
};

/* ---------------- the earlier default: the convex hull limit --------------- */

/** The convex hull of the candidates' box corners (monotone chain). */
function hullOf(candidates: Candidate[]): Point[] {
  const pts = candidates
    .flatMap(({ box: b }) => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x0, y: b.y1 },
      { x: b.x1, y: b.y1 },
    ])
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (ps: Point[]) => {
    const h: Point[] = [];
    for (const p of ps) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** Distance from a point to a convex polygon, zero inside it. */
function hullDistance(p: Point, hull: Point[]): number {
  let inside = hull.length >= 3;
  let d = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [a, b] = [hull[i], hull[(i + 1) % hull.length]];
    const [vx, vy] = [b.x - a.x, b.y - a.y];
    if (vx * (p.y - a.y) - vy * (p.x - a.x) < 0) inside = false;
    const l2 = vx * vx + vy * vy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    d = Math.min(d, Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy));
  }
  return inside ? 0 : d;
}

/** The earlier default, kept as a named behavior: a hit, else the nearest
 *  by position, while the pointer is within 8 px of the hull of all the
 *  marks (12 px once there is a focus). The hull covers the hole of a
 *  donut and every gap between bars, so they are never quiet. */
const hulls = new WeakMap<Candidate[], Point[]>();
const hullLimit = (behavior: FocusBehavior, gap = 8, out = gap + 4): FocusBehavior => (f) => {
  if (!f.pointer) return undefined;
  let hull = hulls.get(f.candidates);
  if (!hull) hulls.set(f.candidates, (hull = hullOf(f.candidates)));
  return hullDistance(f.pointer, hull) > (f.current ? out : gap) ? undefined : behavior(f);
};

export const behaviors: Record<string, FocusBehavior> = {
  default: defaultFocus,
  hit: Focus.hit(),
  center: Focus.closest({ to: "center", radius: 40 }),
  outline: Focus.closest({ to: "outline" }).within(16),
  hull: Focus.from(hullLimit(Focus.first([Focus.hit(), Focus.closest({ stickiness: 4 })]))),
  pin: defaultFocus.onClick(),
  custom: largestNear,
};

/** The selected behavior, shared by every switcher chart on the page. */
let selected = "default";
export function select(name: string) {
  if (behaviors[name]) selected = name;
}
/** A behavior is a function, so switching is one more user function. It
 *  passes on what the selected behavior reads, for the region overlay. */
const switching: FocusBehavior = Object.defineProperty(
  (frame: Frame) => behaviors[selected](frame),
  "reads",
  { get: () => readsOf(behaviors[selected]) }
);

/* ------------------------------ far-apart bars ----------------------------- */

const FAR = pathTypes.slice(0, 5);
const format = { n: thousands, n_articles: thousands, share: percent1 };

/** The first five bars of the issue's chart, 60 px apart: wider than twice
 *  the reach, so the middle of a gap is near no bar. */
export function farBars(focus: () => string | undefined, fill: any = "#4c78a8") {
  return chart(FAR, { w: 520, h: 330, axes: { x: { title: "share of paths" }, y: { title: false } } })
    .flow(spread({ by: "path", dir: "y", spacing: 60 }))
    .mark(rect({ w: "share", fill }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(
          filter((bar: any) => bar.datum[0].path === focus()),
          group({ by: "path" })
        )
        .mark(((bar: any[]) =>
          beside(
            bar[0],
            rowTooltip(bar[0].datum[0], { format }),
            bar[0].datum[0].share > 0.09 ? { side: "bottom", align: "end", gap: 4 } : { side: "right" }
          )) as any)
    );
}

export function mountFar(container: HTMLElement, focus: FocusBehavior = defaultFocus) {
  const { focus: path, ping } = snap(
    container,
    { selector: BARS, count: FAR.length, position: ["y"], key: (r) => r?.path },
    focus
  );
  return farBars(path, live((d: any) => (ping(), rowOf<any>(d)?.path === path() ? "#2f5d8a" : "#4c78a8"))).render(
    container
  );
}

export const mountBars = (container: HTMLElement) => issueBar(container, switching);
export const mountFarBars = (container: HTMLElement) => mountFar(container, switching);
export const mountDonut = (container: HTMLElement) => donut(container, switching);

export const Bars: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountBars(container);
    return container;
  },
};

export const FarApart: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountFarBars(container);
    return container;
  },
};

export const OnDonut: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountDonut(container);
    return container;
  },
};

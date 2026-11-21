/**
 * PROTOTYPE(#1395): a scatterplot whose tooltip goes to the point NEAREST
 * the pointer within a radius, not only the point under it, with a ring on
 * the focused point. Nearest is computed outside the spec from
 * `pointer().dataPos()`; the spec reads only the focused row's index.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  chart,
  scatter,
  circle,
  text,
  selectAll,
  filter,
  group,
  enclose,
  Shape,
  pointer,
  live,
} from "../../../src/lib";
import { penguins } from "../../../src/data/penguins";
import { rowTooltip, beside, focusFrom, drawnScales, heldOnTouch } from "./helpers";

// The lowercase exports are builders and mounts, not stories.
const meta: Meta = { title: "Proposals/Tooltips/Scatter Nearest", excludeStories: /^[a-z]/ };
export default meta;

const X = "Flipper Length (mm)";
const Y = "Body Mass (g)";
const rows = penguins
  .filter((p) => p[X] !== null && p[Y] !== null)
  .map((p, i) => ({ id: i, ...p })) as any[];

/** The chart's own size, for the static stories. */
const W = 440;
const H = 360;
const RADIUS = 30; // px

/**
 * The nearest row to a data position, within RADIUS px, or undefined, for
 * the pinned story. WALL: `Pointer` gives data coordinates but no data → px
 * map, so pixel distance is approximated from the chart's own size over the
 * data's extent (the axis may nice its domain a little past the extent). The
 * live story measures true pixels instead (`mountInteractive`).
 */
const xs = rows.map((r) => r[X]);
const ys = rows.map((r) => r[Y]);
const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
export function nearest(at: { x?: number; y?: number } | undefined) {
  if (at?.x === undefined || at?.y === undefined) return undefined;
  let best: any;
  let bestD = Infinity;
  for (const r of rows) {
    const dx = ((r[X] - at.x) / (x1 - x0)) * W;
    const dy = ((r[Y] - at.y) / (y1 - y0)) * H;
    const d = Math.hypot(dx, dy);
    if (d < bestD) [best, bestD] = [r, d];
  }
  return bestD <= RADIUS ? best.id : undefined;
}

const fields = ["Species", "Island", "Sex", X, Y, "Beak Length (mm)"];

export function scatterNearest(
  focus: () => number | undefined,
  /** Where the (virtual) pointer is, drawn as a small cross. */
  cursor?: { x: number; y: number },
  /** The points' opacity, a `live()` pointer read in the live story. */
  opacity: any = 0.75
) {
  let c = chart(rows, { w: W, h: H })
    .flow(scatter({ x: X, y: Y }))
    .mark(circle({ r: 3, fill: "Species", opacity }).name("pts"))
    .layer(
      chart(selectAll("pts"))
        .flow(filter((pt: any) => pt.datum[0].id === focus()), group({ by: "id" }))
        .mark(((pt: any[]) => {
          // The ring: an oval `enclose` around the focused point.
          const ring = Promise.resolve(
            enclose(
              { shape: Shape.oval(), padding: 3, fill: "none", stroke: "#111827", strokeWidth: 1.5 } as any,
              pt
            )
          ).then((n: any) => n.zOrder(1));
          return beside(ring, rowTooltip(pt[0].datum[0], { fields }), {
            side: pt[0].datum[0][X] > 215 ? "left" : "right",
          });
        }) as any)
    );
  if (cursor)
    c = c.layer(
      chart([{ [X]: cursor.x, [Y]: cursor.y }])
        .flow(scatter({ x: X, y: Y }))
        .mark(text({ text: "+", fontSize: 18, fill: "#dc2626" }))
    );
  return c;
}

/** Static capture: the virtual pointer (the red cross) is NOT on a point;
 *  the nearest one within 30 px gets the ring and the tooltip. */
export const Pinned: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const cursor = { x: 181.5, y: 4760 };
    scatterNearest(() => nearest(cursor), cursor).render(container);
    return container;
  },
};

export const Closed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    scatterNearest(() => undefined).render(container);
    return container;
  },
};

/**
 * Live. The pointer is registered by a `live()` read of it in the opacity
 * (paint only); the nearest point is mapped to the focus outside the spec, so the
 * spec re-runs only when the nearest point changes.
 *
 * The chart keeps its own size, so `pointer().dataPos()` is undefined (see
 * `drawnScales`): each row's position in px comes from the data → px map read
 * off the drawn points (`r: 3`), and the distance to `pointer().pos()` is a
 * true pixel distance. Shared by the Interactive story and the proposal
 * page's demo bundle (proposals/tooltips/demo).
 */
export function mountInteractive(container: HTMLElement) {
  const p = pointer();
  const nearestPx = () => {
    const at = p.pos();
    if (at === undefined) return undefined;
    const px = drawnScales(container, 'ellipse[rx="3"]', { x: [x0, x1], y: [y0, y1] });
    if (!px?.x || !px.y) return undefined;
    let best: any;
    let bestD = Infinity;
    for (const r of rows) {
      const d = Math.hypot(px.x(r[X]) - at.x, px.y(r[Y]) - at.y);
      if (d < bestD) [best, bestD] = [r, d];
    }
    return bestD <= RADIUS ? best.id : undefined;
  };
  const focus = focusFrom(heldOnTouch(container, nearestPx));
  // `live(() => 0.75)` that reads the pointer: a paint-only read whose only
  // job is to register the pointer with the chart. It is on the opacity, not
  // the fill, so the fill keeps its color scale and legend.
  return scatterNearest(focus, undefined, live(() => (p.pos(), 0.75))).render(container);
}

export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountInteractive(container);
    return container;
  },
};

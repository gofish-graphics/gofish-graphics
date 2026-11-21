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
import { rowTooltip, beside, focusFrom } from "./helpers";

const meta: Meta = { title: "Proposals/Tooltips/Scatter Nearest" };
export default meta;

const X = "Flipper Length (mm)";
const Y = "Body Mass (g)";
const rows = penguins
  .filter((p) => p[X] !== null && p[Y] !== null)
  .map((p, i) => ({ id: i, ...p })) as any[];

/** The chart's own size, for the static stories. */
const W = 440;
const H = 360;
/** The canvas of the live story. WALL: there the size goes to `render`, not
 *  `chart`, because `pointer().dataPos()` converts nothing when the chart
 *  has a size of its own; and a render-sized chart with a tier that claims
 *  nothing draws its axes past the canvas. See NOTES.md. The plot inside it
 *  is about W x H, which `nearest` assumes. */
export const CANVAS = { w: 560, h: 400 };
const RADIUS = 30; // px

/**
 * The nearest row to a data position, within RADIUS px, or undefined.
 * WALL: `Pointer` gives data coordinates but no data → px map, so pixel
 * distance is approximated from the chart's own size over the data's extent
 * (the axis may nice its domain a little past the extent).
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
  fill: any = "Species",
  size: { w?: number; h?: number } = { w: W, h: H }
) {
  let c = chart(rows, size)
    .flow(scatter({ x: X, y: Y }))
    .mark(circle({ r: 3, fill, opacity: 0.75 }).name("pts"))
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

/** Live. The pointer is registered by a `live()` read of it in the fill
 *  (paint only); `nearest(dataPos())` is mapped to the focus outside the
 *  spec, so the spec re-runs only when the nearest point changes. */
export const Interactive: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const p = pointer();
    const focus = focusFrom(() => nearest(p.dataPos()));
    const palette: Record<string, string> = {
      Adelie: "#4c78a8",
      Chinstrap: "#f58518",
      Gentoo: "#54a24b",
    };
    // A live fill must be a literal color (the color scale is resolve-time),
    // so the species palette is spelled out here.
    scatterNearest(focus, undefined, live((d: any) => (p.pos(), palette[d?.Species] ?? "#999")), {}).render(
      container,
      CANVAS
    );
    return container;
  },
};

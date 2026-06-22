// Shared scaffolding for the GoTree gallery ports. Each gallery story maps one
// example from https://github.com/BIT-VIS/gotree (gallery/<Name>/dsl.json) onto
// a GoFish `combine({ x, y })` spec. Relation → combine kind:
//   include → nest, juxtapose/flatten → distribute, within/align → align.
import { tree, combine, alternate, perDepth } from "../../src";

export { tree, combine, alternate, perDepth };
export type { CombineAxis } from "../../src";

// A moderate sample tree (3 levels, uneven) with leaf `value`s so value-driven
// layouts (treemaps) have something to size against. `width` (leaf count) is
// always available from the datum for proportional sizing.
export const sampleTree = {
  name: "root",
  children: [
    {
      name: "A",
      children: [
        { name: "A1", value: 4 },
        { name: "A2", value: 2 },
        { name: "A3", value: 3 },
      ],
    },
    {
      name: "B",
      children: [
        { name: "B1", value: 5 },
        {
          name: "B2",
          children: [
            { name: "B2a", value: 2 },
            { name: "B2b", value: 1 },
          ],
        },
      ],
    },
    {
      name: "C",
      children: [
        { name: "C1", value: 3 },
        { name: "C2", value: 2 },
      ],
    },
  ],
};

// Sequential blue ramp, dark at the root → light at the leaves.
export const depthBlues = [
  "#08306b",
  "#2171b5",
  "#6baed6",
  "#c6dbef",
  "#deebf7",
];
export const byDepth =
  (range: string[] = depthBlues) =>
  (d: any) =>
    range[Math.min(d.depth, range.length - 1)];

const initContainer = () => {
  const c = document.createElement("div");
  c.style.margin = "16px";
  document.body.appendChild(c);
  return c;
};

// Scale the rendered SVG to fill the container by setting its viewBox to the
// content bounding box (so small trees are centered and large ones don't clip).
export const fitToContent = (host: HTMLElement) => {
  requestAnimationFrame(() => {
    const svg = host.querySelector("svg");
    if (!svg) return;
    try {
      const bb = (svg as SVGSVGElement).getBBox();
      if (!bb.width || !bb.height) return;
      const pad = 10;
      svg.setAttribute(
        "viewBox",
        `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`
      );
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
    } catch {
      /* getBBox throws before paint; ignore */
    }
  });
};

// Render a GoTreeSpec into a fresh container and fit it. Returns the container.
export const mount = (
  spec: any,
  size: { w: number; h: number } = { w: 640, h: 420 },
  data: any = sampleTree
) => {
  const c = initContainer();
  c.style.width = `${size.w}px`;
  c.style.height = `${size.h}px`;
  try {
    tree(spec, data).render(c, size);
    fitToContent(c);
  } catch (e) {
    c.textContent = `render error: ${String(e)}`;
    c.style.color = "#c00";
  }
  return c;
};

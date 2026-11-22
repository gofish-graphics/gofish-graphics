/**
 * Throwaway SVG defs for the theming proposal prototypes. Each helper returns
 * one <pattern> or <filter> element; a pattern "in a color" is one def per
 * color, so callers generate one per (pattern, color) pair.
 */
import type { JSX } from "solid-js";

type LinesOpts = {
  angle?: number;
  gap?: number;
  width?: number;
  color?: string;
  bg?: string;
};

/** Parallel lines. angle 0 = horizontal, 90 = vertical, 45 = "/". */
export const lines = (id: string, o: LinesOpts = {}): JSX.Element => {
  const { angle = 45, gap = 6, width = 1, color = "black", bg = "white" } = o;
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={gap}
      height={gap}
      patternTransform={`rotate(${-angle})`}
    >
      <rect width={gap} height={gap} fill={bg} />
      <line
        x1={-1}
        y1={gap / 2}
        x2={gap + 1}
        y2={gap / 2}
        stroke={color}
        stroke-width={width}
      />
    </pattern>
  );
};

/** Two sets of lines at right angles. */
export const cross = (
  id: string,
  o: {
    angle?: number;
    gap?: number;
    width?: number;
    color?: string;
    bg?: string;
  } = {}
): JSX.Element => {
  const { angle = 45, gap = 6, width = 1, color = "black", bg = "white" } = o;
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={gap}
      height={gap}
      patternTransform={`rotate(${-angle})`}
    >
      <rect width={gap} height={gap} fill={bg} />
      <line
        x1={-1}
        y1={gap / 2}
        x2={gap + 1}
        y2={gap / 2}
        stroke={color}
        stroke-width={width}
      />
      <line
        x1={gap / 2}
        y1={-1}
        x2={gap / 2}
        y2={gap + 1}
        stroke={color}
        stroke-width={width}
      />
    </pattern>
  );
};

/** Staggered dots (stipple). */
export const dots = (
  id: string,
  o: { gap?: number; r?: number; color?: string; bg?: string } = {}
): JSX.Element => {
  const { gap = 6, r = 1, color = "black", bg = "white" } = o;
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={gap} height={gap}>
      <rect width={gap} height={gap} fill={bg} />
      <circle cx={gap / 4} cy={gap / 4} r={r} fill={color} />
      <circle cx={(3 * gap) / 4} cy={(3 * gap) / 4} r={r} fill={color} />
    </pattern>
  );
};

/** A tile of arbitrary SVG children, repeated every w x h. */
export const tile = (
  id: string,
  w: number,
  h: number,
  children: JSX.Element,
  bg = "white"
): JSX.Element => (
  <pattern id={id} patternUnits="userSpaceOnUse" width={w} height={h}>
    <rect width={w} height={h} fill={bg} />
    {children}
  </pattern>
);

/** A flat fill, as a pattern so every palette entry is a url(). */
export const solid = (id: string, color: string): JSX.Element => (
  <pattern id={id} patternUnits="userSpaceOnUse" width={4} height={4}>
    <rect width={4} height={4} fill={color} />
  </pattern>
);

// ---------------------------------------------------------------- filters

/** Soft drop shadow, from primitives (Solid's template check does not know
 *  feDropShadow and warns that the HTML is malformed). */
const shadowPrims = (
  src: string,
  dx: number,
  dy: number,
  blur: number,
  opacity: number
) => [
  <feGaussianBlur
    in={src === "SourceGraphic" ? "SourceAlpha" : src}
    stdDeviation={blur}
    result="sb"
  />,
  <feOffset in="sb" dx={dx} dy={dy} result="so" />,
  <feFlood flood-color="#000" flood-opacity={opacity} result="sc" />,
  <feComposite in="sc" in2="so" operator="in" result="sh" />,
  <feMerge>
    <feMergeNode in="sh" />
    <feMergeNode in={src} />
  </feMerge>,
];

export const shadow = (
  id: string,
  o: { dx?: number; dy?: number; blur?: number; opacity?: number } = {}
) => {
  const { dx = 2, dy = 3, blur = 2.5, opacity = 0.35 } = o;
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      {shadowPrims("SourceGraphic", dx, dy, blur, opacity)}
    </filter>
  );
};

/** Gaussian blur. */
export const blur = (id: string, std = 2) => (
  <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation={std} />
  </filter>
);

/** Hand-drawn wobble on edges: turbulence + displacement. */
export const roughen = (
  id: string,
  o: { scale?: number; freq?: number; seed?: number } = {}
) => {
  const { scale = 3, freq = 0.06, seed = 2 } = o;
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency={freq}
        numOctaves="2"
        seed={seed}
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );
};

/** Paper grain inside the shape: noise multiplied over the fill. */
export const grain = (
  id: string,
  o: { amount?: number; freq?: number } = {}
) => {
  const { amount = 0.7, freq = 0.8 } = o;
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency={freq}
        numOctaves="3"
        seed="7"
        result="noise"
      />
      <feColorMatrix
        in="noise"
        type="matrix"
        values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${amount} -${amount * 0.35}`}
        result="speckle"
      />
      <feComposite
        in="speckle"
        in2="SourceGraphic"
        operator="in"
        result="inside"
      />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="inside" />
      </feMerge>
    </filter>
  );
};

/** roughen then shadow, in one filter (a filter list). */
export const roughShadow = (id: string) => (
  <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.06"
      numOctaves="2"
      seed="2"
      result="noise"
    />
    <feDisplacementMap
      in="SourceGraphic"
      in2="noise"
      scale="3"
      xChannelSelector="R"
      yChannelSelector="G"
      result="rough"
    />
    {shadowPrims("rough", 2, 3, 2.5, 0.35)}
  </filter>
);

// ---------------------------------------------------------------- DOM restyling

/** Resolves once GoFish has drawn `count` <svg>s with content into
 *  `container` (the layout is an async resource, so the svg arrives after
 *  render() resolves). */
export const drawn = (
  container: HTMLElement,
  count = 1
): Promise<SVGSVGElement[]> =>
  new Promise((resolve) => {
    const ready = () => {
      const svgs = Array.from(container.querySelectorAll("svg")).filter(
        (s) =>
          s.parentElement?.closest("svg") === null &&
          s.querySelector("rect, path, text")
      ) as SVGSVGElement[];
      return svgs.length >= count ? svgs : null;
    };
    const now = ready();
    if (now) return resolve(now);
    const mo = new MutationObserver(() => {
      const r = ready();
      if (r) {
        mo.disconnect();
        resolve(r);
      }
    });
    mo.observe(container, { childList: true, subtree: true });
  });

/** Every element under `root` matching `sel`, as an array. */
export const all = (root: ParentNode, sel: string) =>
  Array.from(root.querySelectorAll(sel)) as SVGElement[];

/** Is this element chart chrome (axis/legend ink), i.e. drawn in the built-in gray? */
export const isChrome = (el: Element) => el.getAttribute("fill") === "gray";

/** Restyle the built-in axis/legend ink: gray -> `ink`, font -> `font`. */
export const restyleChrome = (
  root: ParentNode,
  o: { ink: string; font?: string; fontSize?: number }
) => {
  for (const el of all(root, "rect, text")) {
    if (!isChrome(el)) continue;
    el.setAttribute("fill", o.ink);
    el.setAttribute("stroke", o.ink);
  }
  for (const t of all(root, "text")) {
    if (o.font) t.setAttribute("font-family", o.font);
    if (
      t.getAttribute("fill") === "gray" ||
      t.getAttribute("fill") === "#333333"
    )
      t.setAttribute("fill", o.ink);
  }
};

/** The svg's own pixel box, for converting client rects to svg coordinates. */
const box = (svg: SVGSVGElement, el: Element) => {
  const s = svg.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
};

/** Grow the built-in 10x10 legend swatches that hold a pattern (a 10px
 *  square shows only a fragment of a tile), shifting their labels to match. */
export const growSwatches = (
  svg: SVGSVGElement,
  size = 14,
  stroke?: string
) => {
  const sw = all(svg, "rect").filter(
    (r) =>
      Number(r.getAttribute("width")) === 10 &&
      Number(r.getAttribute("height")) === 10
  );
  const d = size - 10;
  for (const r of sw) {
    const x = Number(r.getAttribute("x"));
    const y = Number(r.getAttribute("y"));
    r.setAttribute("y", String(y - d / 2));
    r.setAttribute("width", String(size));
    r.setAttribute("height", String(size));
    if (stroke) {
      r.setAttribute("stroke", stroke);
      r.setAttribute("stroke-width", "0.8");
    }
    for (const t of all(svg, "text")) {
      if (
        Math.abs(Number(t.getAttribute("y")) - (y + 9)) < 0.5 &&
        Number(t.getAttribute("x")) > x
      )
        t.setAttribute("x", String(Number(t.getAttribute("x")) + d));
    }
  }
  if (sw.length)
    svg.setAttribute("width", String(Number(svg.getAttribute("width")) + d));
};

/** Keep only numeric tick labels (and their tick marks) that are multiples
 *  of `step`; the built-in axis always picks about 10 ticks. */
export const thinTicks = (svg: SVGSVGElement, step: number) => {
  const ticks = all(svg, "rect").filter(
    (r) =>
      Number(r.getAttribute("height")) === 1 &&
      Number(r.getAttribute("width")) === 4
  );
  for (const t of all(svg, "text")) {
    const v = Number(t.textContent?.trim());
    if (t.textContent?.trim() === "" || Number.isNaN(v) || v % step === 0)
      continue;
    const tb = box(svg, t);
    const cy = tb.y + tb.h / 2;
    const tick = ticks.find((r) => {
      const rb = box(svg, r);
      return Math.abs(rb.y - cy) < 4 && rb.x > tb.x;
    });
    tick?.remove();
    t.remove();
  }
};

/**
 * Cogra-style axes on a rendered chart: find the y-axis line (a 1px-wide
 * chrome rect), flip its ticks to point inward, and add an x baseline so
 * the axes form an L. Draws in `ink`.
 */
export const lAxes = (
  svg: SVGSVGElement,
  ink: string,
  o: { inward?: boolean; right?: number } = {}
) => {
  const rects = all(svg, "rect").filter((r) => r.getAttribute("fill") === ink);
  const axis = rects.find(
    (r) =>
      Number(r.getAttribute("width")) === 1 &&
      Number(r.getAttribute("height")) > 20
  );
  if (!axis) return;
  const a = box(svg, axis);
  if (o.inward !== false) {
    for (const t of rects) {
      if (
        Number(t.getAttribute("height")) === 1 &&
        Number(t.getAttribute("width")) === 4
      ) {
        const x = Number(t.getAttribute("x"));
        t.setAttribute("x", String(x + 4));
      }
    }
  }
  // right edge: the rightmost non-chrome rect (the data)
  let right = a.x + 10;
  for (const r of all(svg, "rect")) {
    if (r.getAttribute("fill") === ink) continue;
    if (Number(r.getAttribute("width")) <= 12) continue; // legend swatches
    const b = box(svg, r);
    if (b.x > a.x && b.x < (o.right ?? Infinity))
      right = Math.max(right, b.x + b.w);
  }
  const line = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  line.setAttribute("x", String(a.x));
  line.setAttribute("y", String(a.y + a.h - 1));
  line.setAttribute("width", String(right + 6 - a.x));
  line.setAttribute("height", "1");
  line.setAttribute("fill", ink);
  svg.appendChild(line);
};

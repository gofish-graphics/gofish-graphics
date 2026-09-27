/**
 * Browser-side extractor: reads a rendered chart out of the DOM into the
 * library-neutral RenderRecord (record.ts). Loaded by the benchmark harness
 * page (tests/harness/llm-bench/main.ts); never runs in Node.
 *
 * This is the one place that knows how SVG can encode a picture. Everything
 * library-specific that the checks must not see is handled here, and only in
 * general geometric terms:
 *   - <use> elements (matplotlib markers) are expanded into inline copies of
 *     what they reference, so their geometry is walked like any other shape.
 *   - Shapes are classified by their sampled geometry, not by tag, so a
 *     rectangle drawn as a <path> (matplotlib, Recharts) is still a `rect`.
 *   - Colors are resolved through CSS and normalized to RGBA, with every
 *     opacity on the way to the root folded into the alpha.
 */

import type { Box, Mark, MarkKind, RGBA, RenderRecord } from "./record";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Containers whose children are templates, not painted content. */
const NON_RENDERED = "defs, clipPath, mask, marker, pattern, symbol";

/** Replace every <use> under `root` with an inline copy of its target. The
 *  copy sits in a <g> that carries the <use>'s own attributes (so its style
 *  still inherits) and its x/y offset. Runs after the screenshot is taken. */
export function expandUses(root: Element): void {
  for (let pass = 0; pass < 4; pass++) {
    const uses = Array.from(root.querySelectorAll("use"));
    if (uses.length === 0) return;
    for (const use of uses) {
      const href =
        use.getAttribute("href") ?? use.getAttributeNS(XLINK_NS, "href");
      const scope = use.ownerSVGElement ?? root;
      const target =
        href && href.startsWith("#")
          ? (scope.querySelector(`[id="${CSS.escape(href.slice(1))}"]`) ??
            document.getElementById(href.slice(1)))
          : null;
      if (!target) {
        use.remove();
        continue;
      }
      const g = document.createElementNS(SVG_NS, "g");
      for (const attr of Array.from(use.attributes)) {
        if (["href", "x", "y", "width", "height"].includes(attr.localName))
          continue;
        g.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      }
      const x = parseFloat(use.getAttribute("x") ?? "0") || 0;
      const y = parseFloat(use.getAttribute("y") ?? "0") || 0;
      const transform = use.getAttribute("transform") ?? "";
      g.setAttribute("transform", `${transform} translate(${x},${y})`.trim());
      const copy = target.cloneNode(true) as Element;
      copy.removeAttribute("id");
      copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      if (copy.localName === "symbol") {
        g.append(...Array.from(copy.childNodes));
      } else {
        g.appendChild(copy);
      }
      use.replaceWith(g);
    }
  }
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const colorCache = new Map<string, RGBA | null>();
let colorCtx: OffscreenCanvasRenderingContext2D | null = null;

/** Any CSS color string to RGBA, via a 1x1 canvas so every color syntax the
 *  browser understands (rgb, hex, hsl, oklch, named) comes out the same. */
function parseColor(css: string): RGBA | null {
  if (!css || css === "none" || css === "transparent") return null;
  const cached = colorCache.get(css);
  if (cached !== undefined) return cached;
  let out: RGBA | null;
  if (css.startsWith("url(")) {
    // Gradient or pattern paint: no single color. Record a neutral gray so
    // the mark still counts as painted. (Two different gradients therefore
    // look the same to the checks; no v0 task uses gradients.)
    out = [128, 128, 128, 1];
  } else {
    colorCtx ??= new OffscreenCanvas(1, 1).getContext("2d", {
      willReadFrequently: true,
    });
    const ctx = colorCtx!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    out = a === 0 ? null : [r, g, b, Math.round((a / 255) * 1000) / 1000];
  }
  colorCache.set(css, out);
  return out;
}

function withAlpha(c: RGBA | null, factor: number): RGBA | null {
  if (!c) return null;
  const a = Math.round(c[3] * factor * 1000) / 1000;
  return a <= 0.001 ? null : [c[0], c[1], c[2], a];
}

/** Product of `opacity` on `el` and every ancestor up to (and including)
 *  `root`. */
function opacityChain(el: Element, root: Element): number {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    o *= parseFloat(getComputedStyle(e).opacity || "1");
    if (e === root) break;
  }
  return o;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

type Pt = [number, number];

function shoelace(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Perpendicular distance from p to the infinite line through a and b. */
function lineDist(p: Pt, a: Pt, b: Pt): number {
  const len = dist(a, b);
  if (len < 1e-9) return dist(p, a);
  return (
    Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) /
    len
  );
}

function circumcircle(
  a: Pt,
  b: Pt,
  c: Pt
): { cx: number; cy: number; r: number } | null {
  const d =
    2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { cx, cy, r: Math.hypot(a[0] - cx, a[1] - cy) };
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const angleOf = (p: Pt, cx: number, cy: number) =>
  (deg(Math.atan2(p[1] - cy, p[0] - cx)) + 360) % 360;

/** Least-squares circle through `pts` (Kasa fit). */
function fitCircle(pts: Pt[]): { cx: number; cy: number; r: number } | null {
  // Minimize sum (x^2 + y^2 + D x + E y + F)^2 via the 3x3 normal equations.
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    sz = 0,
    sxz = 0,
    syz = 0;
  const n = pts.length;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sz += z;
    sxz += x * z;
    syz += y * z;
  }
  const A = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const b = [-sxz, -syz, -sz];
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-9) return null;
  const col = (i: number) =>
    A.map((row, k) => row.map((v, j) => (j === i ? b[k] : v)));
  const D = det(col(0)) / d;
  const E = det(col(1)) / d;
  const F = det(col(2)) / d;
  const cx = -D / 2;
  const cy = -E / 2;
  const r2 = cx * cx + cy * cy - F;
  return r2 > 0 ? { cx, cy, r: Math.sqrt(r2) } : null;
}

type Circle = { cx: number; cy: number; r: number };

/** Maximal straight runs of the closed outline `pts` at least `minLen`
 *  long: consecutive samples all within a small distance of the chord
 *  between the run's ends (0.1-0.4px, proportional to the chord, so a
 *  stretch of a large arc does not pass as straight) and progressing along
 *  it. Non-overlapping, longest first. */
function straightRuns(
  pts: Pt[],
  minLen: number
): { from: number; to: number }[] {
  const n = pts.length;
  const found: { from: number; to: number; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    let end = i;
    for (let j = i + 2; j < i + n; j++) {
      const a = pts[i];
      const b = pts[j % n];
      const len = dist(a, b);
      let ok = len > 0;
      for (let k = i + 1; ok && k < j; k++) {
        const p = pts[k % n];
        const t =
          ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len;
        ok =
          lineDist(p, a, b) <= Math.min(0.4, Math.max(0.1, 0.004 * len)) &&
          t >= -0.5 &&
          t <= len + 0.5;
      }
      if (!ok) break;
      end = j;
    }
    const len = dist(pts[i], pts[end % n]);
    if (len >= minLen) found.push({ from: i, to: end, len });
  }
  found.sort((a, b) => b.len - a.len);
  const taken = new Set<number>();
  const runs: { from: number; to: number }[] = [];
  for (const r of found) {
    const idx = Array.from(
      { length: r.to - r.from + 1 },
      (_, k) => (r.from + k) % n
    );
    // Runs may share an end sample (a corner) but not interior samples.
    if (idx.slice(1, -1).some((k) => taken.has(k))) continue;
    idx.slice(1, -1).forEach((k) => taken.add(k));
    runs.push(r);
  }
  return runs;
}

/** Total-least-squares line through `pts`, as two points on it. */
function fitLine(pts: Pt[]): [Pt, Pt] {
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [
    [mx, my],
    [mx + Math.cos(theta), my + Math.sin(theta)],
  ];
}

/** Where the infinite lines a1-b1 and a2-b2 cross, or null if parallel. */
function intersect(a1: Pt, b1: Pt, a2: Pt, b2: Pt): Pt | null {
  const d1x = b1[0] - a1[0];
  const d1y = b1[1] - a1[1];
  const d2x = b2[0] - a2[0];
  const d2y = b2[1] - a2[1];
  const den = d1x * d2y - d1y * d2x;
  // Parallel within ~1 degree: no usable crossing.
  if (Math.abs(den) < 0.017 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y))
    return null;
  const t = ((a2[0] - a1[0]) * d2y - (a2[1] - a1[1]) * d2x) / den;
  return [a1[0] + t * d1x, a1[1] + t * d1y];
}

/**
 * Pie/donut slice with two straight radial edges: the center is where the
 * edges' lines cross, and every other sample must lie on the outer arc (or,
 * for a donut, a concentric inner arc) about it. Finding the center from the
 * edges keeps thin slices exact, where the short arc alone pins it poorly.
 */
function wedgeFromEdges(pts: Pt[], box: Box): Mark["wedge"] | null {
  const n = pts.length;
  // The two edges are the two longest straight runs. Shorter ones may exist
  // on the arcs (some libraries draw arcs as short chords); they must be
  // clearly shorter than the edges.
  const all = straightRuns(pts, Math.max(8, 0.15 * Math.max(box.w, box.h)));
  const runLen = (r: { from: number; to: number }) =>
    dist(pts[r.from], pts[r.to % n]);
  if (
    all.length < 2 ||
    (all.length > 2 && runLen(all[2]) > 0.5 * runLen(all[1]))
  )
    return null;
  const runs = all.slice(0, 2);
  const [e1, e2] = runs.map((r) => [pts[r.from], pts[r.to % n]] as [Pt, Pt]);
  // Cross the edges' least-squares lines, fitted to the middle 80% of each
  // run: a run's ends can creep a few samples onto the adjoining arc.
  const [l1, l2] = runs.map((r) => {
    const len = r.to - r.from;
    const inner = Array.from(
      { length: len + 1 },
      (_, k) => pts[(r.from + k) % n]
    ).slice(Math.floor(0.1 * len), Math.ceil(0.9 * len) + 1);
    return fitLine(inner);
  });
  const c = intersect(l1[0], l1[1], l2[0], l2[1]);
  if (!c) return null;
  const [cx, cy] = c;
  const inRun = new Set<number>();
  for (const r of runs) for (let k = r.from; k <= r.to; k++) inRun.add(k % n);
  const others = pts.filter((_, i) => !inRun.has(i));
  if (others.length < 3) return null;
  const d = (p: Pt) => dist(p, c);
  const r = Math.max(...others.map(d));
  const tol = 1 + 0.005 * r;
  const apex = Math.max(3, 0.05 * r);
  const inner = others.filter((p) => Math.abs(d(p) - r) > tol && d(p) > apex);
  const r0 = inner.length ? Math.min(...inner.map(d)) : 0;
  if (!inner.every((p) => Math.abs(d(p) - r0) <= tol)) return null;
  // Each edge must run from the inner radius (or the center) out to r, give
  // or take the sample spacing, since a run ends on a sample, not a corner.
  const step = dist(pts[0], pts[1]);
  const endTol = tol + 1.5 * step;
  for (const [a, b] of [e1, e2]) {
    const far = Math.max(d(a), d(b));
    const near = Math.min(d(a), d(b));
    if (
      Math.abs(far - r) > endTol ||
      (r0 > 0 ? Math.abs(near - r0) > endTol : near > apex + endTol)
    )
      return null;
  }
  const arc = others.filter((p) => Math.abs(d(p) - r) <= tol);
  const t1 = angleOf(d(e1[0]) > d(e1[1]) ? e1[0] : e1[1], cx, cy);
  const t2 = angleOf(d(e2[0]) > d(e2[1]) ? e2[0] : e2[1], cx, cy);
  const mid = angleOf(
    [
      cx + arc.reduce((s, p) => s + (p[0] - cx) / d(p), 0),
      cy + arc.reduce((s, p) => s + (p[1] - cy) / d(p), 0),
    ],
    cx,
    cy
  );
  const s12 = (t2 - t1 + 360) % 360;
  const inside = (mid - t1 + 360) % 360 <= s12;
  return {
    cx: round1(cx),
    cy: round1(cy),
    r: round1(r),
    r0: round1(r0),
    a0: round1(inside ? t1 : t2),
    sweep: round1(inside ? s12 : 360 - s12),
  };
}

/**
 * Best-effort pie/donut slice fit. A slice is an outer arc of a circle, plus
 * samples that are either on a concentric inner arc (donut) or on at most two
 * radial edges through the center. Tried first from the two straight edges
 * (wedgeFromEdges). Otherwise (a half-disc, whose edges form one line),
 * candidate circles come from sample triples (deterministic), are tried from
 * most to fewest samples on them, refined by least squares, and the first
 * one whose remaining samples have that structure wins. Returns null when the
 * shape is not such a slice.
 */
function fitWedge(pts: Pt[], box: Box): Mark["wedge"] | null {
  const byEdges = wedgeFromEdges(pts, box);
  if (byEdges) return byEdges;
  const n = pts.length;
  const maxR = 2 * Math.max(box.w, box.h);
  // Tight and nearly scale-free: with a loose tolerance, a large circle
  // passes "through" the long straight edges of a thin slice.
  const arcTol = (r: number) => 0.5 + 0.002 * r;
  const onCircle = (c: Circle) => (p: Pt) =>
    Math.abs(dist(p, [c.cx, c.cy]) - c.r) <= arcTol(c.r);
  const candidates = new Map<string, Circle & { inliers: number }>();
  for (const s of [1, 2, 3, 5, 8, 13, 21]) {
    for (let i = 0; i < n; i++) {
      const c = circumcircle(pts[i], pts[(i + s) % n], pts[(i + 2 * s) % n]);
      if (!c || c.r > maxR || c.r < 2) continue;
      const key = `${Math.round(c.cx)}|${Math.round(c.cy)}|${Math.round(c.r)}`;
      if (!candidates.has(key))
        candidates.set(key, { ...c, inliers: pts.filter(onCircle(c)).length });
    }
  }
  const ranked = [...candidates.values()]
    .filter((c) => c.inliers >= 6)
    .sort((a, b) => b.inliers - a.inliers)
    .slice(0, 300);
  for (const candidate of ranked) {
    let circle: Circle | null = candidate;
    for (let k = 0; k < 3 && circle; k++)
      circle = fitCircle(pts.filter(onCircle(circle)));
    if (!circle) continue;
    const wedge = sliceAround(pts, circle, arcTol(circle.r));
    if (wedge) return wedge;
  }
  return null;
}

/** The slice structure of `pts` around `circle` (see fitWedge), or null. */
function sliceAround(
  pts: Pt[],
  { cx, cy, r }: Circle,
  tol: number
): Mark["wedge"] | null {
  const d = (p: Pt) => dist(p, [cx, cy]);
  const arc = pts.filter((p) => Math.abs(d(p) - r) <= tol);
  const rest = pts.filter((p) => Math.abs(d(p) - r) > tol);
  const apex = Math.max(3, 0.05 * r);
  const r0Raw = rest.length ? Math.min(...rest.map(d)) : 0;
  const r0 = r0Raw <= apex ? 0 : r0Raw;
  // Group the non-arc samples into radial edges: samples whose angle from the
  // center agrees within 1.5px at their distance.
  const edges: { angle: number }[] = [];
  const angDiff = (a: number, b: number) => {
    const x = Math.abs(a - b) % 360;
    return Math.min(x, 360 - x);
  };
  for (const p of [...rest].sort((a, b) => d(b) - d(a))) {
    const dp = d(p);
    if (dp <= apex) continue;
    if (r0 > 0 && Math.abs(dp - r0) <= tol) continue;
    const a = angleOf(p, cx, cy);
    const edge = edges.find(
      (e) => (angDiff(a, e.angle) * Math.PI * dp) / 180 <= 1.5
    );
    if (!edge) edges.push({ angle: a });
    if (edges.length > 2) return null;
  }
  // The arc's mean direction says which side of the edges the slice is on.
  const arcAngles = arc.map((p) => angleOf(p, cx, cy));
  const mid = angleOf(
    [
      cx + arc.reduce((s, p) => s + (p[0] - cx) / d(p), 0),
      cy + arc.reduce((s, p) => s + (p[1] - cy) / d(p), 0),
    ],
    cx,
    cy
  );
  let a0: number;
  let sweep: number;
  if (edges.length === 2) {
    const [t1, t2] = edges.map((e) => e.angle);
    const s12 = (t2 - t1 + 360) % 360;
    const inside = (mid - t1 + 360) % 360 <= s12;
    a0 = inside ? t1 : t2;
    sweep = inside ? s12 : 360 - s12;
  } else if (edges.length === 0) {
    // No straight edges (e.g. a donut slice drawn with tiny ends): the sweep
    // is the circle minus the largest gap between arc samples.
    const sorted = [...arcAngles].sort((a, b) => a - b);
    let gap = 360 - sorted[sorted.length - 1] + sorted[0];
    a0 = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > gap) {
        gap = sorted[i] - sorted[i - 1];
        a0 = sorted[i];
      }
    }
    sweep = 360 - gap;
  } else {
    return null;
  }
  if (sweep < 1 || sweep > 359) return null;
  return {
    cx: round1(cx),
    cy: round1(cy),
    r: round1(r),
    r0: round1(r0),
    a0: round1(a0),
    sweep: round1(sweep),
  };
}

/** Sample `el` along its outline in container coordinates: one point per
 *  2px of length, at least 24 and at most `maxN`. */
function samplePoints(
  el: SVGGeometryElement,
  closed: boolean,
  origin: DOMRect,
  maxN = 240
): Pt[] {
  const len = el.getTotalLength();
  if (!(len > 0)) return [];
  const n = Math.max(24, Math.min(maxN, Math.round(len / 2)));
  const m = el.getScreenCTM();
  if (!m) return [];
  const pts: Pt[] = [];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const p = el.getPointAtLength((i * len) / n);
    pts.push([
      m.a * p.x + m.c * p.y + m.e - origin.left,
      m.b * p.x + m.d * p.y + m.f - origin.top,
    ]);
  }
  return pts;
}

function classify(
  el: SVGGeometryElement,
  hasFill: boolean,
  box: Box,
  origin: DOMRect
): { kind: MarkKind; points?: Pt[]; wedge?: Mark["wedge"] } {
  const tag = el.localName;
  const closedTag = ["rect", "circle", "ellipse", "polygon"].includes(tag);
  const open = samplePoints(el, false, origin);
  if (open.length === 0) return { kind: "path" };
  const first = open[0];
  const last = open[open.length - 1];
  const closedPath = closedTag || dist(first, last) <= 1;
  const straight =
    !closedTag && open.every((p) => lineDist(p, first, last) <= 0.75);
  if (tag === "line" || straight) return { kind: "line" };
  if (closedPath || hasFill) {
    const pts = open.slice(0, -1);
    if (box.w < 0.5 || box.h < 0.5) return { kind: "line" };
    const ratio = shoelace(pts) / (box.w * box.h);
    // A <rect> is exactly its box. Any other shape that nearly fills its box
    // (a flat band between two bars, say) keeps its outline, since it may
    // not be exactly rectangular.
    if (ratio >= 0.95)
      return tag === "rect"
        ? { kind: "rect" }
        : { kind: "rect", points: thin(simplify(pts, 0.5), 400) };
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (Math.abs(box.w - box.h) <= 0.1 * Math.max(box.w, box.h)) {
      const radii = pts.map((p) => dist(p, [cx, cy]));
      const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
      if ((Math.max(...radii) - Math.min(...radii)) / mean <= 0.08)
        return { kind: "circle" };
    }
    const wedge = fitWedge(pts, box);
    if (wedge) return { kind: "wedge", wedge };
  }
  // A path's shape is kept as a polyline. Sampling densely and then dropping
  // points that lie within 0.5px of the simplified line keeps every corner,
  // so a jagged line with many vertices does not lose its peaks (evenly
  // spaced thinning would cut them off).
  const dense = samplePoints(el, false, origin, 4000);
  return { kind: "path", points: thin(simplify(dense, 0.5), 400) };
}

/** Ramer-Douglas-Peucker: the fewest points of `pts` such that every
 *  dropped point lies within `eps` px of the kept polyline. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts;
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1;
    let worstD = eps;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > worstD) {
        worstD = d;
        worst = k;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([i, worst], [worst, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Distance from p to the segment a-b. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
        );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Keep at most `max` points, evenly spaced, always including the last. */
function thin(pts: Pt[], max: number): Pt[] {
  const out =
    pts.length <= max
      ? pts
      : Array.from(
          { length: max },
          (_, i) => pts[Math.round((i * (pts.length - 1)) / (max - 1))]
        );
  return out.map(([x, y]) => [round1(x), round1(y)]);
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

function boxOf(r: DOMRect, origin: DOMRect): Box {
  return {
    x: round1(r.left - origin.left),
    y: round1(r.top - origin.top),
    w: round1(r.width),
    h: round1(r.height),
  };
}

/** The text a reader sees in a <text>. A <tspan> with its own x, y or dy
 *  starts a new line or run (e.g. a wrapped tick label), so it is joined to
 *  what came before with a space; inline tspans are joined as they are. */
function textOf(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof Element) {
      const moved = ["x", "y", "dy"].some((a) => node.hasAttribute(a));
      out += (moved ? " " : "") + textOf(node);
    }
  }
  return out;
}

function isShown(el: Element): boolean {
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility === "visible";
}

export function extractRecord(container: HTMLElement): RenderRecord {
  expandUses(container);
  const origin = container.getBoundingClientRect();
  const marks: Mark[] = [];

  const outerSvgs = Array.from(container.querySelectorAll("svg")).filter(
    (s) => !s.parentElement?.closest("svg")
  );
  const svgs = outerSvgs
    .map((s) => boxOf(s.getBoundingClientRect(), origin))
    .filter((b) => b.w > 0 && b.h > 0)
    .sort((a, b) => b.w * b.h - a.w * a.h);

  const elements = container.querySelectorAll<SVGElement>(
    "rect, circle, ellipse, line, polyline, polygon, path, text"
  );
  for (const el of Array.from(elements)) {
    if (!(el instanceof SVGElement) || el.closest(NON_RENDERED)) continue;
    if (!isShown(el)) continue;
    const opacity = opacityChain(el, container);
    if (opacity <= 0.001) continue;
    const cs = getComputedStyle(el);
    const fill = withAlpha(
      parseColor(cs.fill),
      parseFloat(cs.fillOpacity || "1") * opacity
    );
    const strokeWidth = parseFloat(cs.strokeWidth || "0") || 0;
    const stroke =
      strokeWidth > 0
        ? withAlpha(
            parseColor(cs.stroke),
            parseFloat(cs.strokeOpacity || "1") * opacity
          )
        : null;
    const box = boxOf(el.getBoundingClientRect(), origin);

    if (el.localName === "text") {
      const text = textOf(el).replace(/\s+/g, " ").trim();
      if (!text || box.w <= 0 || box.h <= 0 || !(fill || stroke)) continue;
      marks.push({
        kind: "text",
        tag: "text",
        ...box,
        fill,
        stroke,
        strokeWidth,
        text,
      });
      continue;
    }
    if (!fill && !stroke) continue;
    if (box.w <= 0.05 && box.h <= 0.05) continue;
    const c = classify(el as SVGGeometryElement, !!fill, box, origin);
    const mark: Mark = {
      kind: c.kind,
      tag: el.localName,
      ...box,
      fill,
      stroke,
      strokeWidth: round1(strokeWidth),
    };
    if (c.points) mark.points = c.points;
    if (c.kind === "line") {
      const pts = samplePoints(el as SVGGeometryElement, false, origin);
      mark.points = thin([pts[0], pts[pts.length - 1]], 2);
    }
    if (c.wedge) mark.wedge = c.wedge;
    marks.push(mark);
  }

  // HTML text inside the container (e.g. an HTML legend next to the <svg>).
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent instanceof SVGElement) continue;
    if (parent.closest("script, style")) continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text || !isShown(parent)) continue;
    const opacity = opacityChain(parent, container);
    if (opacity <= 0.001) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = boxOf(range.getBoundingClientRect(), origin);
    if (box.w <= 0 || box.h <= 0) continue;
    const fill = withAlpha(parseColor(getComputedStyle(parent).color), opacity);
    marks.push({
      kind: "text",
      tag: parent.localName,
      ...box,
      fill,
      stroke: null,
      strokeWidth: 0,
      text,
    });
  }

  return { svgs, marks };
}

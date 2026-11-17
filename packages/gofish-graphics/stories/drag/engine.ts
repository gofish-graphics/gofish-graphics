/**
 * A small GoFish-native drag engine built on Dragology's ideas
 * ("Declarative Dragging", UIST 2026), PROTOTYPE quality, story-level code.
 *
 *   1. Speculative layout: the states a drag can reach are derived from the
 *      spec's data (`edit`, `reorder`, `states`), and each is laid out with
 *      GoFish's own `toDisplayList`, cached by state.
 *   2. Key join: display items are matched across states by a stable key
 *      (the user's `key(row)` on an item's datum; chrome by role + content).
 *   3. Drop targets from layout: the dragged mark's box in each candidate
 *      layout is its target.
 *   4. Behaviors: `closest` (snap to the nearest target, optionally with the
 *      dragged mark floating under the pointer) and `between` (blend the
 *      candidate layouts: piecewise linear along a line, barycentric over a
 *      Delaunay triangulation in 2-D).
 *   5. Continuous fields: two layouts per discrete state (field at its min
 *      and max) give the field's pixel map; the pointer is inverted through it
 *      and the two layouts are blended (exact while the axis domain is fixed).
 *   6. Paint: the blended display list goes through GoFish's own painter.
 */
import { render } from "solid-js/web";
import { Delaunay } from "d3-delaunay";
import { parse, converter, formatRgb } from "culori";
import type { DisplayList } from "gofish-ir";
import { paintDocument } from "../../src/ast/displayList/paintSVG";

type Row = Record<string, any>;
type Item = DisplayList.DisplayItem;
type Affine = { tx: number; ty: number; sx: number; sy: number };
type Entry = { key: string; item: Item; at: Affine; rows?: Row[] };
type Layout = { entries: Entry[]; byKey: Map<string, Entry> };
type Vec = { x: number; y: number };

/** A field a drag edits. A numeric field is continuous; its range defaults
 *  to the data's extent of that field. */
export type EditField =
  | string
  | {
      field: string;
      min?: number | ((row: Row) => number);
      max?: number | ((row: Row) => number);
    };

export type DragOptions = {
  /** Which rows' marks can be dragged (all rows of a mark must pass). */
  marks?: (row: Row) => boolean;
  /** Fields the drag edits on the dragged rows. */
  edit?: EditField[];
  /** Reorder the groups of this field. */
  reorder?: string;
  /** Escape hatch: the reachable row lists, given the dragged rows. */
  states?: (dragged: Row[], rows: Row[]) => Row[][];
  /** `between` blends layouts; `closest` snaps; `floating` snaps the rest
   *  while the dragged mark follows the pointer. */
  feel?: "between" | "closest" | "floating";
  /** `lazy`: lay candidates out at pointer-down. `eager`: after mount and
   *  each drop, for every draggable mark. */
  precompute?: "lazy" | "eager";
};

export type MountOptions = {
  data: Row[];
  key: (row: Row) => string;
  spec: (rows: Row[]) => {
    toDisplayList(o: any): Promise<DisplayList.DisplayListDocument>;
  };
  w: number;
  h: number;
  drag: DragOptions;
  debug?: boolean;
  /** Panel background painted behind the chart. */
  background?: string;
};

export type DragStats = {
  layouts: number;
  layoutMs: number[];
  candidatesPerDrag: number[];
  pointerDownMs: number[];
  frameMs: number[];
  eagerMs: number[];
  /** Continuous drops: max px gap between the blended preview and a real
   *  layout of the dropped rows, over every box. */
  blendErrPx: number[];
};

export type DragHandle = {
  stats: DragStats;
  rows: () => Row[];
  /** Resolves once the initial render (and eager precompute) is done. */
  ready: Promise<void>;
  /** Resolves when the in-flight drop tween ends. */
  settled: () => Promise<void>;
  setDebug: (on: boolean) => void;
  svg: SVGSVGElement;
};

const ID: Affine = { tx: 0, ty: 0, sx: 1, sy: 1 };
const NS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------------------
// Display list -> keyed entries
// ---------------------------------------------------------------------------

function flatten(items: Item[], at: Affine, out: Entry[]) {
  for (const item of items) {
    if (item.kind === "group" && !item.filter) {
      const [tx, ty] = item.transform.translate ?? [0, 0];
      const [sx, sy] = item.transform.scale ?? [1, 1];
      flatten(
        item.children,
        {
          tx: at.tx + at.sx * tx,
          ty: at.ty + at.sy * ty,
          sx: at.sx * sx,
          sy: at.sy * sy,
        },
        out
      );
    } else out.push({ key: "", item, at });
  }
}

function keyEntries(items: Item[], key: (r: Row) => string): Layout {
  const entries: Entry[] = [];
  flatten(items, ID, entries);
  const counts = new Map<string, number>();
  const texts = entries.filter((e) => !e.item.datum && e.item.kind === "text");
  const anchor = (e: Entry): Vec => {
    const it = e.item as DisplayList.TextItem;
    return { x: e.at.tx + e.at.sx * it.x, y: e.at.ty + e.at.sy * it.y };
  };
  for (const e of entries) {
    const d = e.item.datum;
    let base: string;
    if (d) {
      e.rows = Array.isArray(d) ? d : [d];
      base = `m:${rowsKey(e.rows, key)}:${e.item.kind}`;
      if (e.item.kind === "text") base += `:${e.item.text}`;
    } else if (e.item.kind === "text") {
      base = `t:${e.item.text}`;
    } else {
      // Chrome with no content of its own (a tick, a legend swatch, an axis
      // line): keyed by the nearest label. A heuristic; GoFish has no stable
      // id for chrome (see the findings file).
      const c = centerOf(e);
      let near: Entry | undefined;
      if (c)
        for (const t of texts)
          if (!near || dist2(anchor(t), c) < dist2(anchor(near), c)) near = t;
      base = `c:${e.item.kind}@${near ? (near.item as DisplayList.TextItem).text : ""}`;
    }
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    e.key = n ? `${base}#${n}` : base;
  }
  return { entries, byKey: new Map(entries.map((e) => [e.key, e])) };
}

const rowsKey = (rows: Row[], key: (r: Row) => string) =>
  [...new Set(rows.map(key))].sort().join("|");

function boxOf(e: Entry) {
  const it = e.item;
  const { tx, ty, sx, sy } = e.at;
  let b: { x: number; y: number; w: number; h: number } | undefined;
  if (it.kind === "rect" || it.kind === "image")
    b = { x: it.x, y: it.y, w: it.w, h: it.h };
  else if (it.kind === "ellipse")
    b = { x: it.cx - it.rx, y: it.cy - it.ry, w: 2 * it.rx, h: 2 * it.ry };
  else if (it.kind === "composite") b = it.bbox;
  if (!b) return undefined;
  return { x: tx + sx * b.x, y: ty + sy * b.y, w: sx * b.w, h: sy * b.h };
}

const centerOf = (e: Entry): Vec | undefined => {
  const b = boxOf(e);
  return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

// ---------------------------------------------------------------------------
// Blending
// ---------------------------------------------------------------------------

const toRgb = converter("rgb");
const colorCache = new Map<string, any>();
const asColor = (s: string) => {
  if (!colorCache.has(s)) {
    const c = s === "none" ? undefined : parse(s);
    colorCache.set(s, c ? toRgb(c) : undefined);
  }
  return colorCache.get(s);
};
const NUM = /(-?\d*\.?\d+(?:e[-+]?\d+)?)/i;

function blendValue(vals: any[], ws: number[], h: number): any {
  const v0 = vals[h];
  if (vals.length === 1) return v0;
  if (typeof v0 === "number") {
    if (!vals.every((v) => typeof v === "number")) return v0;
    let s = 0;
    for (let i = 0; i < vals.length; i++) s += ws[i] * vals[i];
    return s;
  }
  if (typeof v0 === "string") {
    if (vals.every((v) => v === v0)) return v0;
    if (!vals.every((v) => typeof v === "string")) return v0;
    const cs = vals.map(asColor);
    if (cs.every(Boolean)) {
      const out = { mode: "rgb", r: 0, g: 0, b: 0, alpha: 0 };
      cs.forEach((c, i) => {
        out.r += ws[i] * c.r;
        out.g += ws[i] * c.g;
        out.b += ws[i] * c.b;
        out.alpha += ws[i] * (c.alpha ?? 1);
      });
      return formatRgb(out as any);
    }
    // Path data with the same command skeleton blends number by number.
    const parts = vals.map((v: string) => v.split(NUM));
    const p0 = parts[h];
    const same = parts.every(
      (p) => p.length === p0.length && p.every((s, k) => k % 2 || s === p0[k])
    );
    if (!same) return v0;
    return p0
      .map((s, k) =>
        k % 2
          ? String(
              blendValue(
                parts.map((p) => +p[k]),
                ws,
                h
              )
            )
          : s
      )
      .join("");
  }
  if (Array.isArray(v0)) {
    if (!vals.every((v) => Array.isArray(v) && v.length === v0.length))
      return v0;
    return v0.map((_, k) =>
      blendValue(
        vals.map((v) => v[k]),
        ws,
        h
      )
    );
  }
  if (v0 && typeof v0 === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v0)) {
      if (k === "datum" || k === "id" || k === "kind" || k === "text") {
        out[k] = v0[k];
        continue;
      }
      const sub = vals.map((v) => v?.[k]);
      out[k] = sub.every((s) => s !== undefined)
        ? blendValue(sub, ws, h)
        : v0[k];
    }
    return out;
  }
  return v0;
}

/** Weighted blend of keyed layouts. Items in only some states fade by the
 *  weight of the states that have them. Text never blends between strings:
 *  its content is part of its key. */
function blendLayouts(layouts: Layout[], weights: number[]): Entry[] {
  const live = layouts
    .map((l, i) => ({ l, w: weights[i] }))
    .filter((x) => x.w > 1e-6);
  live.sort((a, b) => b.w - a.w);
  // Merge key orders: the heaviest layout's order, others spliced in.
  const order: string[] = live[0].l.entries.map((e) => e.key);
  const seen = new Set(order);
  for (const { l } of live.slice(1)) {
    let prev = -1;
    for (const e of l.entries) {
      if (seen.has(e.key)) prev = order.indexOf(e.key);
      else {
        order.splice(prev + 1, 0, e.key);
        seen.add(e.key);
        prev++;
      }
    }
  }
  const out: Entry[] = [];
  for (const key of order) {
    const here = live.filter((x) => x.l.byKey.has(key));
    const kind = here[0].l.byKey.get(key)!.item.kind;
    const same = here.filter((x) => x.l.byKey.get(key)!.item.kind === kind);
    const W = same.reduce((s, x) => s + x.w, 0);
    const ws = same.map((x) => x.w / W);
    const es = same.map((x) => x.l.byKey.get(key)!);
    const item = blendValue(
      es.map((e) => e.item),
      ws,
      0
    ) as Item;
    const at = blendValue(
      es.map((e) => e.at),
      ws,
      0
    ) as Affine;
    if (W < 0.999) {
      const op = (item.style?.opacity ?? 1) * W;
      (item as any).style = { ...(item.style ?? {}), opacity: op };
    }
    out.push({ key, item, at, rows: es[0].rows });
  }
  return out;
}

const asLayout = (entries: Entry[]): Layout => ({
  entries,
  byKey: new Map(entries.map((e) => [e.key, e])),
});

function toItems(entries: Entry[]): Item[] {
  return entries.map((e) => {
    const { tx, ty, sx, sy } = e.at;
    if (tx === 0 && ty === 0 && sx === 1 && sy === 1) return e.item;
    return {
      kind: "group",
      transform: { translate: [tx, ty], scale: [sx, sy] },
      children: [e.item],
    } as Item;
  });
}

// ---------------------------------------------------------------------------
// Pointer -> weights over targets
// ---------------------------------------------------------------------------

const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function closestWeights(pts: Vec[], p: Vec): number[] {
  let best = 0;
  pts.forEach((q, i) => {
    if (dist2(q, p) < dist2(pts[best], p)) best = i;
  });
  return pts.map((_, i) => (i === best ? 1 : 0));
}

function segmentWeights(a: Vec, b: Vec, p: Vec): [number, number, number] {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L))
    : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return [1 - t, t, dist2(q, p)];
}

/** `between` weights: piecewise linear when the targets are collinear,
 *  barycentric in the Delaunay triangle holding the pointer otherwise, and
 *  the nearest hull edge outside the hull (as Dragology's default). Targets
 *  at the same spot are merged into the first (Dragology throws instead). */
function betweenWeights(pts: Vec[], p: Vec): number[] {
  const n = pts.length;
  const w = new Array(n).fill(0);
  const uniq: number[] = [];
  pts.forEach((q, i) => {
    if (!uniq.some((u) => dist2(pts[u], q) < 0.25)) uniq.push(i);
  });
  const U = uniq.map((i) => pts[i]);
  if (U.length === 1) {
    w[uniq[0]] = 1;
    return w;
  }
  // Collinear targets (all within half a pixel of one line) are a line, not a
  // triangulation: d3-delaunay jitters collinear input into sliver triangles,
  // whose barycentric weights land on the far ends of the line.
  let far = 1;
  U.forEach((q, i) => {
    if (dist2(q, U[0]) > dist2(U[far], U[0])) far = i;
  });
  const dl = Math.sqrt(dist2(U[far], U[0]));
  const collinear = U.every(
    (q) =>
      Math.abs(
        (U[far].x - U[0].x) * (q.y - U[0].y) -
          (U[far].y - U[0].y) * (q.x - U[0].x)
      ) /
        dl <
      0.5
  );
  const del = collinear ? undefined : Delaunay.from(U.map((q) => [q.x, q.y]));
  const tris = del?.triangles ?? new Uint32Array();
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [U[tris[t]], U[tris[t + 1]], U[tris[t + 2]]];
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det;
    const l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) {
      w[uniq[tris[t]]] += l1;
      w[uniq[tris[t + 1]]] += l2;
      w[uniq[tris[t + 2]]] += l3;
      return w;
    }
  }
  // Outside the hull, or collinear: nearest edge. For collinear targets the
  // "edges" are the consecutive pairs along the line.
  let edges: [number, number][] = [];
  if (!del || tris.length === 0) {
    const a = U[0];
    const d = { x: U[far].x - a.x, y: U[far].y - a.y };
    const idx = U.map((_, i) => i).sort(
      (i, j) =>
        (U[i].x - a.x) * d.x +
        (U[i].y - a.y) * d.y -
        ((U[j].x - a.x) * d.x + (U[j].y - a.y) * d.y)
    );
    for (let k = 0; k + 1 < idx.length; k++) edges.push([idx[k], idx[k + 1]]);
  } else {
    const hull = del!.hull;
    for (let k = 0; k < hull.length; k++)
      edges.push([hull[k], hull[(k + 1) % hull.length]]);
  }
  let best: [number, number, number, number, number] | undefined;
  for (const [i, j] of edges) {
    const [wi, wj, d] = segmentWeights(U[i], U[j], p);
    if (!best || d < best[4]) best = [i, j, wi, wj, d];
  }
  w[uniq[best![0]]] += best![2];
  w[uniq[best![1]]] += best![3];
  return w;
}

// ---------------------------------------------------------------------------
// Candidate states, derived from the data
// ---------------------------------------------------------------------------

type Cont = { field: string; lo: number; hi: number };
/** One discrete state ("combo") with 2^k corner row lists for k continuous
 *  fields (corner bit j = field j at its max). */
type Combo = { corners: Row[][] };

function candidates(
  dragged: Row[],
  rows: Row[],
  opts: MountOptions
): { combos: Combo[]; conts: Cont[] } {
  const { drag, key } = opts;
  const ids = new Set(dragged.map(key));
  const isDragged = (r: Row) => ids.has(key(r));
  const fields = (drag.edit ?? []).map((f) =>
    typeof f === "string" ? { field: f } : f
  );
  const ord = fields.filter((f) => typeof dragged[0][f.field] !== "number");
  const conts: Cont[] = fields
    .filter((f) => typeof dragged[0][f.field] === "number")
    .map((f) => {
      const vs = rows
        .map((r) => r[f.field])
        .filter((v) => typeof v === "number");
      const ev = (x: any, dflt: number) =>
        typeof x === "function" ? x(dragged[0]) : (x ?? dflt);
      return {
        field: f.field,
        lo: ev(f.min, Math.min(...vs)),
        hi: ev(f.max, Math.max(...vs)),
      };
    });

  let lists: Row[][];
  if (drag.states) lists = drag.states(dragged, rows);
  else if (drag.reorder) {
    const F = drag.reorder;
    const order = [...new Set(rows.map((r) => r[F]))];
    const v = dragged[0][F];
    lists = order.map((_, j) => {
      const o = order.filter((x) => x !== v);
      o.splice(j, 0, v);
      const rank = new Map(o.map((x, i) => [x, i]));
      return [...rows].sort((a, b) => rank.get(a[F])! - rank.get(b[F])!);
    });
  } else {
    lists = [rows];
    for (const f of ord) {
      const domain = [...new Set(rows.map((r) => r[f.field]))];
      lists = lists.flatMap((l) =>
        domain.map((v) =>
          l.map((r) => (isDragged(r) ? { ...r, [f.field]: v } : r))
        )
      );
    }
  }
  const combos = lists.map((l) => ({
    corners: Array.from({ length: 1 << conts.length }, (_, c) =>
      conts.length === 0
        ? l
        : l.map((r) => {
            if (!isDragged(r)) return r;
            const o = { ...r };
            conts.forEach((f, j) => (o[f.field] = c & (1 << j) ? f.hi : f.lo));
            return o;
          })
    ),
  }));
  return { combos, conts };
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountDraggable(
  container: HTMLElement,
  opts: MountOptions
): DragHandle {
  const { w, h, key } = opts;
  const stats: DragStats = {
    layouts: 0,
    layoutMs: [],
    candidatesPerDrag: [],
    pointerDownMs: [],
    frameMs: [],
    eagerMs: [],
    blendErrPx: [],
  };
  let debug = !!opts.debug;
  let rows = opts.data;

  const panel = document.createElement("div");
  // A light panel with padding: GoFish draws a little past {w, h} (legend
  // labels), and the page around it may be dark.
  const PAD = 16;
  panel.style.cssText = `position:relative;box-sizing:content-box;padding:${PAD}px;width:${w}px;height:${h}px;background:${
    opts.background ?? "#ffffff"
  };border-radius:6px;touch-action:none;user-select:none;color-scheme:light`;
  const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
  const over = document.createElementNS(NS, "svg") as SVGSVGElement;
  for (const s of [svg, over]) {
    s.setAttribute("width", String(w));
    s.setAttribute("height", String(h));
    s.style.cssText = `position:absolute;left:${PAD}px;top:${PAD}px;overflow:visible`;
  }
  over.style.pointerEvents = "none";
  panel.append(svg, over);
  container.appendChild(panel);

  // Layout cache. Layouts run one at a time: the layout pass uses
  // module-level contexts, so interleaving two async layouts is unsafe.
  const cache = new Map<string, Promise<Layout>>();
  let queue: Promise<unknown> = Promise.resolve();
  const layout = (rs: Row[]): Promise<Layout> => {
    const k = JSON.stringify(rs);
    let p = cache.get(k);
    if (!p) {
      p = queue.then(async () => {
        const t0 = performance.now();
        const dl = await opts.spec(rs).toDisplayList({ w, h });
        stats.layoutMs.push(performance.now() - t0);
        stats.layouts++;
        return keyEntries(dl.items, key);
      });
      queue = p.catch(() => undefined);
      cache.set(k, p);
    }
    return p;
  };

  let dispose: (() => void) | undefined;
  let shown: Entry[] = [];
  const paint = (entries: Entry[]) => {
    shown = entries;
    dispose?.();
    const items = toItems(entries);
    dispose = render(() => paintDocument(items), svg);
  };

  let current: Layout;
  const draggableMarks = (l: Layout) =>
    l.entries.filter(
      (e) =>
        e.rows &&
        e.item.kind !== "text" &&
        e.rows.every((r) => opts.drag.marks?.(r) ?? true)
    );

  const eager = async () => {
    const t0 = performance.now();
    for (const e of draggableMarks(current)) {
      const { combos } = candidates(e.rows!, rows, opts);
      combos.forEach((c) => c.corners.forEach((rs) => layout(rs)));
    }
    await queue;
    stats.eagerMs.push(performance.now() - t0);
    console.log(
      `[drag] eager precompute: ${stats.layouts} layouts cached, ${(
        performance.now() - t0
      ).toFixed(0)} ms`
    );
  };

  const ready = (async () => {
    current = await layout(rows);
    paint(current.entries);
    if (opts.drag.precompute === "eager") await eager();
  })();

  // --- Drag state -----------------------------------------------------------
  type Drag = {
    markKey: string;
    rowKeys: string;
    grab: Vec;
    combos: Combo[];
    conts: Cont[];
    layouts: Layout[][]; // [combo][corner]
    pos: Vec[][]; // dragged mark center per [combo][corner]
    pointer: Vec;
    drop?: Row[];
    dropLayout?: Layout;
    choice?: number;
    shownW?: number[];
    switchFrom?: number[];
    switchT0?: number;
    best?: number;
    bestCornerW?: number[];
  };
  let drag: Drag | undefined;
  let loading = false;
  let pendingPointer: Vec | undefined;
  let tweening: Promise<void> = Promise.resolve();

  const pt = (e: PointerEvent): Vec => {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hit = (p: Vec) => {
    const marks = draggableMarks(current);
    for (let i = marks.length - 1; i >= 0; i--) {
      const b = boxOf(marks[i]);
      if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
        return marks[i];
    }
    return undefined;
  };

  svg.addEventListener("pointerdown", async (ev) => {
    if (drag || loading) return;
    const p = pt(ev);
    const e = hit(p);
    if (!e) return;
    svg.setPointerCapture(ev.pointerId);
    loading = true;
    pendingPointer = p;
    const t0 = performance.now();
    const { combos, conts } = candidates(e.rows!, rows, opts);
    const layouts = await Promise.all(
      combos.map((c) => Promise.all(c.corners.map(layout)))
    );
    // A candidate whose layout lost the dragged mark has no target: drop it.
    const keep = layouts.map((ls) => ls.every((l) => l.byKey.has(e.key)));
    const c0 = centerOf(e)!;
    drag = {
      markKey: e.key,
      rowKeys: rowsKey(e.rows!, key),
      grab: { x: p.x - c0.x, y: p.y - c0.y },
      combos: combos.filter((_, i) => keep[i]),
      conts,
      layouts: layouts.filter((_, i) => keep[i]),
      pos: layouts
        .filter((_, i) => keep[i])
        .map((ls) => ls.map((l) => centerOf(l.byKey.get(e.key)!)!)),
      pointer: pendingPointer!,
    };
    loading = false;
    stats.pointerDownMs.push(performance.now() - t0);
    stats.candidatesPerDrag.push(
      combos.reduce((s, c) => s + c.corners.length, 0)
    );
    frame();
  });

  svg.addEventListener("pointermove", (ev) => {
    const p = pt(ev);
    if (loading) pendingPointer = p;
    if (!drag) {
      svg.style.cursor = hit(p) ? "grab" : "default";
      return;
    }
    drag.pointer = p;
    frame();
  });

  const frame = () => {
    if (!drag) return;
    const t0 = performance.now();
    const D = drag;
    const want = { x: D.pointer.x - D.grab.x, y: D.pointer.y - D.grab.y };
    const k = D.conts.length;
    // Continuous fields: invert each field's pixel map (two layouts per
    // field) by projecting the pointer onto the line between them.
    const ts = D.pos.map((P) =>
      D.conts.map((_, j) => {
        const a = P[0],
          b = P[1 << j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const L = dx * dx + dy * dy;
        if (L < 1e-9) return 0;
        const t = ((want.x - a.x) * dx + (want.y - a.y) * dy) / L;
        return Math.max(0, Math.min(1, t));
      })
    );
    const cornerW = (t: number[]) =>
      Array.from({ length: 1 << k }, (_, c) =>
        t.reduce((s, tj, j) => s * (c & (1 << j) ? tj : 1 - tj), 1)
      );
    const cws = ts.map(cornerW);
    const targets = D.pos.map((P, i) =>
      P.reduce(
        (s, q, c) => ({ x: s.x + cws[i][c] * q.x, y: s.y + cws[i][c] * q.y }),
        { x: 0, y: 0 }
      )
    );
    const feel = opts.drag.feel ?? "between";
    const comboW =
      feel === "between"
        ? betweenWeights(targets, want)
        : closestWeights(targets, want);
    const flatL: Layout[] = [];
    const flatW: number[] = [];
    D.layouts.forEach((ls, i) =>
      ls.forEach((l, c) => {
        flatL.push(l);
        flatW.push(comboW[i] * cws[i][c]);
      })
    );
    // Branch transition (Dragology's `.withBranchTransition`): when `closest`
    // switches to another state, ease from the weights on screen to the new
    // ones over 150 ms instead of jumping, so axes and stacks move.
    let best = 0;
    comboW.forEach((x, i) => (x > comboW[best] ? (best = i) : 0));
    if (feel !== "between") {
      const now = performance.now();
      if (D.choice !== undefined && D.choice !== best) {
        D.switchFrom = D.shownW ?? flatW;
        D.switchT0 = now;
      }
      D.choice = best;
      if (D.switchFrom && D.switchT0 !== undefined) {
        const u = Math.min(1, (now - D.switchT0) / 150);
        const e = 1 - (1 - u) ** 3;
        const from = D.switchFrom;
        for (let i = 0; i < flatW.length; i++)
          flatW[i] = (1 - e) * from[i] + e * flatW[i];
        if (u < 1) requestAnimationFrame(frame);
        else D.switchFrom = undefined;
      }
    }
    D.shownW = flatW;
    let entries = blendLayouts(flatL, flatW);
    // The dragged mark (and anything drawing the same rows) on top; when
    // floating, also moved to sit under the pointer.
    const mine = (e: Entry) => e.key.startsWith(`m:${D.rowKeys}:`);
    let off = { x: 0, y: 0 };
    if (feel === "floating") {
      const m = entries.find((e) => e.key === D.markKey);
      const c = m && centerOf(m);
      if (c) off = { x: want.x - c.x, y: want.y - c.y };
    }
    entries = [
      ...entries.filter((e) => !mine(e)),
      ...entries
        .filter(mine)
        .map((e) => ({
          ...e,
          at: { ...e.at, tx: e.at.tx + off.x, ty: e.at.ty + off.y },
        })),
    ];
    paint(entries);
    // Drop state: the heaviest combo, with continuous fields at the
    // inverted values.
    const ids = new Set(D.rowKeys.split("|"));
    D.drop = D.combos[best].corners[0].map((r) => {
      if (!ids.has(key(r)) || k === 0) return r;
      const o = { ...r };
      D.conts.forEach(
        (f, j) => (o[f.field] = f.lo + ts[best][j] * (f.hi - f.lo))
      );
      return o;
    });
    D.dropLayout = k === 0 ? D.layouts[best][0] : undefined;
    D.best = best;
    D.bestCornerW = cws[best];
    stats.frameMs.push(performance.now() - t0);
    drawDebug(D, targets, comboW, want);
  };

  const drawDebug = (D: Drag, targets: Vec[], ws: number[], want: Vec) => {
    over.replaceChildren();
    if (!debug) return;
    const el = (tag: string, a: Record<string, any>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v));
      over.appendChild(n);
    };
    // Continuous fields: the segment each discrete state can slide along.
    D.pos.forEach((P) => {
      if (P.length > 1)
        el("line", {
          x1: P[0].x,
          y1: P[0].y,
          x2: P[1].x,
          y2: P[1].y,
          stroke: "#94a3b8",
          "stroke-dasharray": "3 3",
        });
    });
    targets.forEach((q, i) => {
      if (ws[i] > 1e-6)
        el("line", {
          x1: want.x,
          y1: want.y,
          x2: q.x,
          y2: q.y,
          stroke: "#e11d48",
          "stroke-width": 1 + 4 * ws[i],
          "stroke-opacity": 0.8,
        });
    });
    targets.forEach((q, i) =>
      el("circle", {
        cx: q.x,
        cy: q.y,
        r: 5,
        fill: ws[i] > 1e-6 ? "#e11d48" : "white",
        stroke: "#e11d48",
        "stroke-width": 1.5,
      })
    );
    el("circle", { cx: want.x, cy: want.y, r: 3, fill: "#111" });
  };

  const end = async (ev: PointerEvent) => {
    if (loading) {
      // Released before the candidates were laid out: no drag happened.
      loading = false;
      queueMicrotask(() => {
        drag = undefined;
        paint(current.entries);
      });
      return;
    }
    if (!drag) return;
    svg.releasePointerCapture?.(ev.pointerId);
    const D = drag;
    drag = undefined;
    over.replaceChildren();
    const next = D.drop ?? rows;
    const target = D.dropLayout ?? (await layout(next));
    if (!D.dropLayout && D.best !== undefined && D.bestCornerW) {
      // Check the affine claim: the blend of the two cached layouts at the
      // inverted value against a real layout of the dropped rows.
      const pred = asLayout(blendLayouts(D.layouts[D.best], D.bestCornerW));
      let err = 0;
      for (const e of target.entries) {
        const p = pred.byKey.get(e.key);
        const a = boxOf(e),
          b = p && boxOf(p);
        if (a && b)
          err = Math.max(
            err,
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.w - b.w),
            Math.abs(a.h - b.h)
          );
      }
      stats.blendErrPx.push(err);
    }
    // Tween from the preview to the dropped state: the drag ends as a
    // transition on the clock.
    const from = asLayout(shown);
    tweening = new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / 200);
        const e = 1 - (1 - u) ** 3;
        if (u < 1) {
          paint(blendLayouts([from, target], [1 - e, e]));
          requestAnimationFrame(step);
        } else {
          paint(target.entries);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
    await tweening;
    rows = next;
    current = target;
    if (opts.drag.precompute === "eager") await eager();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  return {
    stats,
    rows: () => rows,
    ready,
    settled: () => tweening,
    setDebug: (on) => (debug = on),
    svg,
  };
}

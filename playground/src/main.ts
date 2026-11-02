import DATA from "./datasets.json";
import {
  SEARCH,
  BLEND,
  computeSet,
  type BlobMember,
  type Means,
  type Params,
  type Seal,
  type Pt,
  type SetResult,
  type ShapeKind,
} from "./compute";

// ── data ─────────────────────────────────────────────────────────────────────
type Paint = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
};
type DataSet = {
  members: BlobMember[];
  avoiding: BlobMember[];
  /** frame to pixel: x + tx, flip * y + ty */
  T: [number, number, number];
  paint: Paint;
};
type Dataset = {
  id: string;
  label: string;
  note: string;
  call: string;
  avoidable: boolean;
  avoidSpelling: string;
  avoidLabel: string;
  avoidDefault: boolean;
  padding: number;
  clearance: number;
  story: Partial<State>;
  width: number;
  height: number;
  scenery: string;
  sets: DataSet[];
};
const DATASETS = DATA as unknown as Dataset[];

// ── state ────────────────────────────────────────────────────────────────────
type State = Omit<Params, "avoid" | "compare"> & {
  dataset: string;
  avoidOn: Record<string, boolean>;
  compare: boolean;
  showLinks: boolean;
  showMembers: boolean;
  /** PROTOTYPE: small multiples of the three convexity modes */
  compareModes: boolean;
};
const BLOB = {
  convexity: 0.5,
  neck: 1,
  holes: false,
  shape: "blob" as ShapeKind,
  join: Infinity,
};
const ARCS_RADIUS = 12; // Shape.arcs()'s default radius
const CLEARANCE = 4; // Shape.blob()'s default clearance
const ds0 = DATASETS.find((d) => d.id === "chartaccent")!;
let state: State = {
  dataset: ds0.id,
  ...BLOB,
  radius: ARCS_RADIUS,
  padding: ds0.padding,
  clearance: ds0.clearance,
  smooth: true,
  avoidOn: Object.fromEntries(DATASETS.map((d) => [d.id, d.avoidDefault])),
  compare: false,
  showLinks: false,
  showMembers: false,
  means: "blend",
  seal: "jump",
  compareModes: false,
};
const dataset = (): Dataset => DATASETS.find((x) => x.id === state.dataset)!;
const avoiding = () => dataset().avoidable && !!state.avoidOn[state.dataset];

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const num = (v: number) => String(+v.toFixed(2));
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ── the spelling ─────────────────────────────────────────────────────────────
/** The call these settings stand for, defaults left out. The presets spine, hull and oval are
 *  named only when every other option is at its default. */
const spelling = () => {
  const d = dataset(),
    o: string[] = [];
  let shape: string;
  const avoid = avoiding();
  const keepOpts = () => {
    if (state.holes) o.push("holes: true");
    if (avoid) o.push(d.avoidSpelling);
    if (avoid && !eq(state.clearance, CLEARANCE))
      o.push(`clearance: ${num(state.clearance)}`);
  };
  if (state.shape === "blob") {
    const plain =
      !state.holes && !avoid && eq(state.neck, 1) && state.join === Infinity;
    const preset = plain
      ? eq(state.convexity, 0)
        ? "spine"
        : eq(state.convexity, 1)
          ? "hull"
          : eq(state.convexity, 2)
            ? "oval"
            : null
      : null;
    if (preset) shape = `Shape.${preset}()`;
    else {
      if (!eq(state.convexity, BLOB.convexity))
        o.push(`convexity: ${num(state.convexity)}`);
      if (!eq(state.neck, 1)) o.push(`neck: ${num(state.neck)}`);
      if (state.join !== Infinity) o.push(`join: ${num(state.join)}`);
      keepOpts();
      shape = `Shape.blob(${o.length ? `{ ${o.join(", ")} }` : ""})`;
    }
  } else {
    if (!eq(state.radius, ARCS_RADIUS)) o.push(`radius: ${num(state.radius)}`);
    keepOpts();
    shape = `Shape.arcs(${o.length ? `{ ${o.join(", ")} }` : ""})`;
  }
  let code = `enclose({ shape: ${shape}, padding: ${num(state.padding)} }, ${d.call})`;
  if (
    state.shape === "blob" &&
    (state.means !== "blend" || state.seal !== "jump")
  ) {
    const m = [`convexity means ${MEANS_NAME[state.means]}`];
    if (state.means !== "blend") m.push(`when a bay seals: ${state.seal}`);
    code += `\n// prototype, not an API option yet: ${m.join("; ")}`;
  }
  if (state.smooth !== (state.shape === "blob"))
    code += `\n// debug view: smoothing ${state.smooth ? "on" : "off"} (not an option)`;
  return code;
};

// ── convexity modes (PROTOTYPE) ─────────────────────────────────────────────
const MEANS: Means[] = ["area", "radius", "blend"];
const MEANS_NAME: Record<Means, string> = {
  area: "area share",
  radius: "radius",
  blend: "per-bay blend",
};
const MEANS_HINT: Record<Means, string> = {
  area: "The share of the room between the spine and the hull that is filled, counted over the whole set. It picks one closing radius, so one region's shape depends on the others, and it can stand still while a bay elsewhere fills.",
  radius:
    "The closing disc's radius itself: r = padding + s·c / (1 − c), where s is the hull's area over its perimeter (about half its thickness). Each region depends only on the members near it.",
  blend:
    "Every pocket between the spine and the hull fills the same share of its own area, rising from its floor to its mouth. There is no closing radius, so nothing seals.",
};
const SEAL_HINT: Record<Seal, string> = {
  jump: "A bay that the disc can no longer get into fills all at once (the exact closing).",
  lake: "A sealed bay stays open as a hole while a disc of radius r still fits inside it. On these datasets the hole is gone at once, so this looks like jump.",
  lid: "A sealed bay fills from its far end toward its mouth while r grows by the bay's depth. In between it is not an exact closing.",
};

const SHAPE_HINT: Record<ShapeKind, string> = {
  blob: "Shape.blob: the members' spanning tree, its links kept where the gap is under join; each piece filled to the convexity and smoothed.",
  arcs: "Shape.arcs: the exact closing by a disc of the radius; pieces join where the disc cannot pass between them. No smoothing.",
};

// ── join slider (PROTOTYPE): 0, then 0.5 · 2^((k − 1)/10) px for k = 1..99, then ∞ ───────
const sliderToJoin = (k: number) =>
  k <= 0 ? 0 : k >= 100 ? Infinity : +(0.5 * 2 ** ((k - 1) / 10)).toFixed(2);
const joinToSlider = (j: number) =>
  j <= 0
    ? 0
    : j === Infinity
      ? 100
      : Math.max(1, Math.min(99, Math.round(1 + 10 * Math.log2(j / 0.5))));
const fmtJoin = (j: number) => (j === Infinity ? "∞" : `${num(j)} px`);

// ── presets ──────────────────────────────────────────────────────────────────
const PRESETS: Record<string, () => Partial<State>> = {
  spine: () => ({ ...BLOB, convexity: 0, smooth: true }),
  hull: () => ({ ...BLOB, convexity: 1, smooth: true }),
  oval: () => ({ ...BLOB, convexity: 2, smooth: true }),
  blob: () => ({ ...BLOB, smooth: true, means: "blend", seal: "jump" }),
  arcs: () => ({
    holes: false,
    shape: "arcs",
    radius: ARCS_RADIUS,
    smooth: false,
  }),
  story: () => {
    const d = dataset();
    const s = { ...BLOB, ...d.story };
    return {
      ...s,
      radius: d.story.radius ?? ARCS_RADIUS,
      smooth: s.shape === "blob",
      padding: d.padding,
      clearance: d.clearance,
      avoidOn: { ...state.avoidOn, [d.id]: d.avoidDefault },
    };
  },
};
const presetOf = (): string | null => {
  for (const k of ["spine", "hull", "oval", "blob", "arcs"]) {
    const p = PRESETS[k]();
    if (
      (Object.keys(p) as (keyof State)[]).every((key) =>
        typeof p[key] === "number" && Number.isFinite(p[key])
          ? eq(p[key] as number, state[key] as number)
          : p[key] === state[key]
      ) &&
      !avoiding()
    )
      return k;
  }
  return null;
};

// ── controls ─────────────────────────────────────────────────────────────────
type Key = "convexity" | "neck" | "radius" | "padding" | "clearance";
const SLIDERS: Key[] = ["convexity", "neck", "radius", "padding", "clearance"];
const unit = (k: Key) => (k === "convexity" || k === "neck" ? "" : " px");

const syncControls = () => {
  const d = dataset();
  for (const k of SLIDERS) {
    $<HTMLInputElement>(k).value = String(state[k]);
    $(`${k}-out`).textContent = num(state[k]) + unit(k);
  }
  const blob = state.shape === "blob";
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-shape]"))
    b.setAttribute("aria-checked", String(b.dataset.shape === state.shape));
  $("shape-hint").textContent = SHAPE_HINT[state.shape];
  $<HTMLInputElement>("join").value = String(joinToSlider(state.join));
  $("join-out").textContent = fmtJoin(state.join);
  $<HTMLInputElement>("holes").checked = state.holes;
  $<HTMLInputElement>("smooth").checked = state.smooth;
  $<HTMLInputElement>("show-links").checked = state.showLinks;
  $<HTMLInputElement>("show-members").checked = state.showMembers;
  $<HTMLInputElement>("compare").checked = state.compare;
  $<HTMLInputElement>("compare-modes").checked = state.compareModes;
  for (const id of ["means-field", "compare-modes-field", "join-field"])
    $(id).hidden = !blob;
  $("seal-field").hidden = !blob || state.means === "blend";
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-means]"))
    b.setAttribute("aria-checked", String(b.dataset.means === state.means));
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-seal]"))
    b.setAttribute("aria-checked", String(b.dataset.seal === state.seal));
  $("means-hint").textContent = MEANS_HINT[state.means];
  $("seal-hint").textContent = SEAL_HINT[state.seal];
  $("multiples").hidden = !(state.compareModes && blob);
  $("convexity-field").hidden = !blob;
  $("neck-field").hidden = !blob;
  $("radius-field").hidden = blob;
  $("avoid-field").hidden = !d.avoidable;
  $("avoid-label").textContent = d.avoidLabel;
  $<HTMLInputElement>("avoid").checked = avoiding();
  $("clearance-field").hidden = !avoiding();
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-ds]")) {
    const on = b.dataset.ds === state.dataset;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $("ds-note").textContent = d.note;
  const p = presetOf();
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
    b.setAttribute("aria-pressed", String(b.dataset.preset === p));
  $("code").textContent = spelling();
};

// ── drawing ──────────────────────────────────────────────────────────────────
const f2 = (v: number) => v.toFixed(2);
const pathOf = (rings: Pt[][]) =>
  rings
    .filter((l) => l.length > 1)
    .map((l) => "M" + l.map((p) => `${f2(p[0])},${f2(p[1])}`).join("L") + "Z")
    .join("");
const frame = (s: DataSet) => `matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})`;

/** The view: the story's own canvas, grown to hold each set's oval (convexity 2), so the
 *  outline is never cut off as convexity rises. Computed once per dataset. */
const views = new Map<string, number[]>();
/** PROTOTYPE: the small multiples' view: the sets' ovals only (not the whole canvas). */
const tight = new Map<string, number[]>();
const tightOf = (d: Dataset) => {
  viewOf(d);
  return tight.get(d.id)!;
};
const viewOf = (d: Dataset) => {
  let v = views.get(d.id);
  if (v) return v;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of d.sets) {
    const r = computeSet(s, {
      ...BLOB,
      convexity: 2,
      padding: d.padding,
      radius: ARCS_RADIUS,
      avoid: false,
      clearance: d.clearance,
      smooth: true,
      compare: false,
      means: "blend",
      seal: "jump",
    });
    for (const ring of r.rings)
      for (const [x, y] of ring) {
        const X = x + s.T[0],
          Y = s.T[2] * y + s.T[1];
        x0 = Math.min(x0, X);
        x1 = Math.max(x1, X);
        y0 = Math.min(y0, Y);
        y1 = Math.max(y1, Y);
      }
  }
  const m = 10;
  tight.set(d.id, [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m]);
  [x0, y0] = [Math.min(0, x0), Math.min(0, y0)];
  [x1, y1] = [Math.max(d.width, x1), Math.max(d.height, y1)];
  v = [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
  views.set(d.id, v);
  return v;
};

let shownFor = "";
const drawScene = () => {
  const d = dataset();
  if (shownFor === d.id) return;
  shownFor = d.id;
  const svg = $("stage") as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", viewOf(d).map(f2).join(" "));
  svg.setAttribute("aria-label", `${d.label}: the enclose outline`);
  $("scenery").innerHTML = d.scenery;
  for (const id of ["outlines", "today", "debug"]) $(id).innerHTML = "";
};

const memberMarkup = (m: BlobMember, grow: number, style: string) => {
  if (m.kind === "disc")
    return `<circle cx="${f2(m.cx)}" cy="${f2(m.cy)}" r="${f2(Math.max(0, m.r + grow))}" ${style}/>`;
  if (m.kind === "segment") {
    const w = Math.max(m.w, m.w2 ?? m.w) / 2 + grow;
    if (w <= 0.01)
      return `<line x1="${f2(m.a[0])}" y1="${f2(m.a[1])}" x2="${f2(m.b[0])}" y2="${f2(m.b[1])}" ${style}/>`;
    return tube(m.a, m.b, m.w / 2 + grow, (m.w2 ?? m.w) / 2 + grow, style);
  }
  return `<rect x="${f2(m.x - grow)}" y="${f2(m.y - grow)}" width="${f2(m.w + 2 * grow)}" height="${f2(m.h + 2 * grow)}" rx="${f2(Math.max(0, grow))}" ${style}/>`;
};
/** A tapered tube from a (half-width ra) to b (half-width rb): two round ends and the tangent
 *  sides, drawn as a polygon (debug only). */
const tube = (a: Pt, b: Pt, ra: number, rb: number, style: string) => {
  ra = Math.max(0, ra);
  rb = Math.max(0, rb);
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = Math.hypot(dx, dy);
  if (L < 1e-6)
    return `<circle cx="${f2(a[0])}" cy="${f2(a[1])}" r="${f2(Math.max(ra, rb))}" ${style}/>`;
  const th = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / L)));
  const pts: Pt[] = [];
  const arc = (c: Pt, r: number, t0: number, t1: number) => {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
  };
  arc(b, rb, th - al, th + al);
  arc(a, ra, th + al, th + 2 * Math.PI - al);
  return `<polygon points="${pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join(" ")}" ${style}/>`;
};

const outlineMarkup = (results: SetResult[]) => {
  const d = dataset();
  return results
    .map((r, i) => {
      const s = d.sets[i],
        P = s.paint;
      return `<path transform="${frame(s)}" d="${pathOf(r.rings)}" fill="${P.fill}" fill-opacity="${P.fillOpacity}" stroke="${P.stroke}" stroke-width="${Math.max(1, P.strokeWidth)}" stroke-linejoin="round"/>`;
    })
    .join("");
};

/** PROTOTYPE: the three convexity modes side by side, each with the seal choice where it
 *  applies; the current mode's result is reused. */
const drawMultiples = (
  byMode: Map<Means, { out: SetResult[]; ms: number }>
) => {
  const d = dataset();
  const vb = tightOf(d).map(f2).join(" ");
  $("multiples").innerHTML = MEANS.map((m) => {
    const x = byMode.get(m)!;
    const radii = x.out.map((r) => r.radius).filter((v) => Number.isFinite(v));
    const rTxt =
      m === "blend"
        ? "no radius"
        : radii.length
          ? `r ${Math.min(...radii).toFixed(1)}${radii.length > 1 ? `–${Math.max(...radii).toFixed(1)}` : ""}`
          : "r ∞";
    const seal = m === "blend" ? "" : ` · ${state.seal}`;
    return `<figure data-current="${m === state.means}"><svg viewBox="${vb}" role="img" aria-label="${MEANS_NAME[m]}"><g>${outlineMarkup(x.out)}</g><g>${d.scenery}</g></svg><figcaption><b>${MEANS_NAME[m]}</b>${seal}<br>${rTxt} · ${fmtMs(x.ms)} ms</figcaption></figure>`;
  }).join("");
};

const drawResults = (results: SetResult[]) => {
  const d = dataset();
  const outlines = outlineMarkup(results);
  let today = "",
    debug = "";
  results.forEach((r, i) => {
    const s = d.sets[i],
      T = frame(s);
    if (r.today)
      today += `<path transform="${T}" d="${pathOf(r.today.rings)}" fill="none" stroke="#6a3d9a" stroke-width="1.4" stroke-dasharray="5 3" stroke-linejoin="round"/>`;
    let g = "";
    if (state.showMembers) {
      for (const m of s.members) {
        g += memberMarkup(
          m,
          0,
          'fill="none" stroke="#333" stroke-width="0.75"'
        );
        g += memberMarkup(
          m,
          state.padding,
          'fill="none" stroke="#666" stroke-width="0.6" stroke-dasharray="2 2"'
        );
      }
      if (avoiding())
        for (const m of s.avoiding)
          g += memberMarkup(
            m,
            state.clearance,
            'fill="#d62728" fill-opacity="0.08" stroke="#d62728" stroke-width="0.8" stroke-dasharray="3 2"'
          );
    }
    if (state.showLinks) {
      // the spanning tree's edges that are not links: longer than join (gray dashed); edges
      // between members that overlap need no link and are not drawn
      for (const e of r.tree)
        if (!e.overlap && e.share === 0)
          g += `<line x1="${f2(e.a[0])}" y1="${f2(e.a[1])}" x2="${f2(e.b[0])}" y2="${f2(e.b[1])}" stroke="#888" stroke-width="1" stroke-dasharray="2 3"/>`;
      const ramping = new Set(
        r.tree
          .filter((e) => e.share > 0 && e.share < 1)
          .map((e) => `${f2(e.a[0])},${f2(e.a[1])}`)
      );
      for (const l of r.links) {
        if (l.kind !== "segment") continue;
        const grow = ramping.has(`${f2(l.a[0])},${f2(l.a[1])}`);
        g += tube(
          l.a,
          l.b,
          l.w / 2 + state.padding,
          (l.w2 ?? l.w) / 2 + state.padding,
          grow
            ? 'fill="#ffbb78" fill-opacity="0.3" stroke="#ffbb78" stroke-width="0.8"'
            : 'fill="#ff7f0e" fill-opacity="0.14" stroke="#ff7f0e" stroke-width="0.6"'
        );
        g += `<line x1="${f2(l.a[0])}" y1="${f2(l.a[1])}" x2="${f2(l.b[0])}" y2="${f2(l.b[1])}" stroke="${grow ? "#e6a05a" : "#b35900"}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      }
    }
    if (g) debug += `<g transform="${T}">${g}</g>`;
  });
  $("outlines").innerHTML = outlines;
  $("today").innerHTML = today;
  $("debug").innerHTML = debug;
};

const fmtMs = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));
const drawStats = (results: SetResult[], wall: number, modeMs = "") => {
  const sum = (f: (r: SetResult) => number) =>
    results.reduce((s, r) => s + f(r), 0);
  const radii = results.map((r) => r.radius);
  const fin = radii.filter((r) => Number.isFinite(r));
  const rText =
    state.shape === "arcs"
      ? `${num(state.radius)} px (given)`
      : state.means === "blend" && state.convexity > 0 && state.convexity < 1
        ? "none (per-bay blend)"
        : fin.length === 0
          ? state.convexity > 1
            ? "∞ (beyond the hull)"
            : "∞ (the hull)"
          : fin.length === 1 && radii.length === 1
            ? `${fin[0].toFixed(1)} px`
            : `${Math.min(...fin).toFixed(1)} to ${Math.max(...fin).toFixed(1)} px${fin.length < radii.length ? " (some ∞)" : ""}`;
  const iters = sum((r) => r.iterations);
  const today = results.some((r) => r.today)
    ? sum((r) => r.today?.ms ?? 0)
    : null;
  const stat = (k: string, v: string, s = "") =>
    `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  $("stats").innerHTML =
    stat(
      "closing radius r",
      rText,
      state.shape === "blob"
        ? state.means === "area" && state.seal === "jump"
          ? `${iters} closing${iters === 1 ? "" : "s"} in the search (${SEARCH})`
          : `${MEANS_NAME[state.means]}${state.means === "blend" ? ` (${BLEND === "grid" ? "1 px grid" : "mesh"})` : ` · ${state.seal}${state.seal === "lid" ? ` (${sum((r) => r.lidActive)} bay${sum((r) => r.lidActive) === 1 ? "" : "s"} filling)` : ""}`}`
        : ""
    ) +
    stat(
      "pieces / holes",
      `${sum((r) => r.pieces)} / ${sum((r) => r.holes)}`,
      `${results.length} set${results.length === 1 ? "" : "s"}, ${sum((r) => r.links.length)} links${
        state.shape === "blob"
          ? ` (${sum((r) => r.tree.filter((e) => e.share > 0 && e.share < 1).length)} growing in, ${sum((r) => r.tree.filter((e) => !e.overlap && e.share === 0).length)} past join)`
          : ""
      }`
    ) +
    stat(
      "compute",
      `${fmtMs(wall)} ms`,
      `links ${fmtMs(sum((r) => r.ms.links))} · closing ${fmtMs(sum((r) => r.ms.close))}${sum((r) => r.ms.grid) > 0 ? ` (grid ${fmtMs(sum((r) => r.ms.grid))})` : ""}${sum((r) => r.ms.separate) > 0 ? ` · apart ${fmtMs(sum((r) => r.ms.separate))}` : ""} · cut+smooth ${fmtMs(sum((r) => r.ms.smooth))}${sum((r) => r.ms.cached) > 0 ? ` · cache built ${fmtMs(sum((r) => r.ms.cached))}` : ""}${modeMs ? `<br>${modeMs}` : ""}`
    ) +
    (today !== null
      ? stat(
          state.shape === "blob" ? "today's Shape.blob" : "today's Shape.arcs",
          `${fmtMs(today)} ms`,
          "the dashed outline"
        )
      : "");
};

// ── recompute scheduling ─────────────────────────────────────────────────────
// Every set is computed in one task, at most once per animation frame. A dataset whose last
// compute took longer than SLOW ms redraws only when a slider is released. Dragging convexity
// reuses the per-set cache (spine, hull, filtration), so it is judged by the last compute less
// the time spent building that cache; the other sliders rebuild it.
const SLOW = 120;
const lastMs = new Map<string, number>();
const lastWarm = new Map<string, number>();
let pending: number | null = null;
const recompute = () => {
  const d = dataset();
  const p: Params = { ...state, avoid: avoiding() };
  let out: SetResult[];
  const byMode = new Map<Means, { out: SetResult[]; ms: number }>();
  const t0 = performance.now();
  try {
    out = d.sets.map((s) => computeSet(s, p));
    byMode.set(state.means, { out, ms: performance.now() - t0 });
    if (state.compareModes && state.shape === "blob")
      for (const m of MEANS) {
        if (byMode.has(m)) continue;
        const t1 = performance.now();
        const o = d.sets.map((s) =>
          computeSet(s, { ...p, means: m, compare: false })
        );
        byMode.set(m, { out: o, ms: performance.now() - t1 });
      }
  } catch (err) {
    $("status").textContent = `error: ${(err as Error).message}`;
    console.error(err);
    return;
  }
  const ms = performance.now() - t0;
  // the cache each mode built this time (compare modes builds the others' too)
  let cached = 0;
  for (const { out: o } of byMode.values())
    cached += o.reduce((t, r) => t + r.ms.cached, 0);
  const warm = ms - cached;
  lastMs.set(d.id, ms);
  lastWarm.set(d.id, warm);
  drawResults(out);
  const modeMs =
    byMode.size > 1
      ? MEANS.map((m) => `${MEANS_NAME[m]} ${fmtMs(byMode.get(m)!.ms)}`).join(
          " · "
        )
      : "";
  if (byMode.size > 1) drawMultiples(byMode);
  drawStats(out, ms, modeMs);
  $("status").textContent = `computed in ${fmtMs(ms)} ms`;
  $("status").dataset.ms = String(ms);
  const msg =
    warm > SLOW
      ? "Slow at these settings: sliders redraw when released."
      : ms > SLOW
        ? "Convexity drags live; the other sliders redraw when released."
        : "";
  $("slow").hidden = !msg;
  $("slow").textContent = msg;
};
const schedule = () => {
  if (pending !== null) cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    pending = null;
    recompute();
  });
};
const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  syncControls();
  schedule();
};

// ── wiring ───────────────────────────────────────────────────────────────────
for (const k of SLIDERS) {
  const el = $<HTMLInputElement>(k);
  el.addEventListener("input", () => {
    state = { ...state, [k]: +el.value };
    syncControls();
    const last = (k === "convexity" ? lastWarm : lastMs).get(state.dataset);
    if ((last ?? 0) <= SLOW) schedule();
  });
  el.addEventListener("change", () => update({ [k]: +el.value }));
}
const check = (id: string, f: (on: boolean) => Partial<State>) =>
  $<HTMLInputElement>(id).addEventListener("change", (e) =>
    update(f((e.target as HTMLInputElement).checked))
  );
// the arcs shape is not smoothed
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-shape]"))
  b.addEventListener("click", () => {
    const shape = b.dataset.shape as ShapeKind;
    if (shape !== state.shape) update({ shape, smooth: shape === "blob" });
  });
{
  const el = $<HTMLInputElement>("join");
  el.addEventListener("input", () => {
    state = { ...state, join: sliderToJoin(+el.value) };
    syncControls();
    if ((lastMs.get(state.dataset) ?? 0) <= SLOW) schedule();
  });
  el.addEventListener("change", () =>
    update({ join: sliderToJoin(+el.value) })
  );
}
check("holes", (on) => ({ holes: on }));
check("smooth", (on) => ({ smooth: on }));
check("compare", (on) => ({ compare: on }));
check("show-links", (on) => ({ showLinks: on }));
check("compare-modes", (on) => ({ compareModes: on }));
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-means]"))
  b.addEventListener("click", () =>
    update({ means: b.dataset.means as Means })
  );
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-seal]"))
  b.addEventListener("click", () => update({ seal: b.dataset.seal as Seal }));
check("show-members", (on) => ({ showMembers: on }));
check("avoid", (on) => ({
  avoidOn: { ...state.avoidOn, [state.dataset]: on },
}));
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
  b.addEventListener("click", () => update(PRESETS[b.dataset.preset!]()));

const tabs = $("ds-tabs");
tabs.innerHTML = DATASETS.map(
  (d) =>
    `<button type="button" role="tab" id="ds-${d.id}" data-ds="${d.id}">${d.label}</button>`
).join("");
const pickDataset = (id: string) => {
  if (id === state.dataset) return;
  const d = DATASETS.find((x) => x.id === id)!;
  // the shape options carry over; the distances are the story's
  state = { ...state, dataset: id, padding: d.padding, clearance: d.clearance };
  drawScene();
  update({});
};
tabs.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-ds]");
  if (b) pickDataset(b.dataset.ds!);
});
tabs.addEventListener("keydown", (e) => {
  const i = DATASETS.findIndex((d) => d.id === state.dataset);
  const j =
    e.key === "ArrowRight"
      ? i + 1
      : e.key === "ArrowLeft"
        ? i - 1
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? DATASETS.length - 1
            : null;
  if (j === null) return;
  e.preventDefault();
  const d = DATASETS[(j + DATASETS.length) % DATASETS.length];
  pickDataset(d.id);
  $(`ds-${d.id}`).focus();
});

$("copy").addEventListener("click", async () => {
  const btn = $("copy");
  try {
    await navigator.clipboard.writeText($("code").textContent ?? "");
    btn.textContent = "Copied";
  } catch {
    const r = document.createRange();
    r.selectNodeContents($("code"));
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    btn.textContent = "Selected: press Ctrl+C";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

const THEMES = ["auto", "light", "dark"];
let theme = 0;
$("theme").addEventListener("click", () => {
  theme = (theme + 1) % THEMES.length;
  const t = THEMES[theme];
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  $("theme").textContent = `Theme: ${t}`;
});

// for the headless checks
(window as any).__playground = {
  set: (patch: Partial<State> & { dataset?: string }) => {
    if (patch.dataset) pickDataset(patch.dataset);
    const { dataset: _d, ...rest } = patch;
    state = { ...state, ...rest };
    syncControls();
    recompute();
    return $("status").dataset.ms;
  },
  state: () => state,
};

drawScene();
syncControls();
schedule();

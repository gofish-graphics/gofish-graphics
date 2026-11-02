import DATA from "./datasets.json";
import {
  computeSet,
  type BlobMember,
  type Params,
  type Pt,
  type SetResult,
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
};
const BLOB = { convexity: 0.5, neck: 1, holes: false, connected: true };
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
  if (state.connected) {
    const plain = !state.holes && !avoid && eq(state.neck, 1);
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
      keepOpts();
      shape = `Shape.blob(${o.length ? `{ ${o.join(", ")} }` : ""})`;
    }
  } else {
    if (!eq(state.radius, ARCS_RADIUS)) o.push(`radius: ${num(state.radius)}`);
    keepOpts();
    shape = `Shape.arcs(${o.length ? `{ ${o.join(", ")} }` : ""})`;
  }
  let code = `enclose({ shape: ${shape}, padding: ${num(state.padding)} }, ${d.call})`;
  if (state.smooth !== state.connected)
    code += `\n// debug view: smoothing ${state.smooth ? "on" : "off"} (not an option)`;
  return code;
};

// ── presets ──────────────────────────────────────────────────────────────────
const PRESETS: Record<string, () => Partial<State>> = {
  spine: () => ({ ...BLOB, convexity: 0, smooth: true }),
  hull: () => ({ ...BLOB, convexity: 1, smooth: true }),
  oval: () => ({ ...BLOB, convexity: 2, smooth: true }),
  blob: () => ({ ...BLOB, smooth: true }),
  arcs: () => ({
    holes: false,
    connected: false,
    radius: ARCS_RADIUS,
    smooth: false,
  }),
  story: () => {
    const d = dataset();
    const s = { ...BLOB, ...d.story };
    return {
      ...s,
      radius: d.story.radius ?? ARCS_RADIUS,
      smooth: s.connected,
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
        typeof p[key] === "number"
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
  $<HTMLInputElement>("connected").checked = state.connected;
  $<HTMLInputElement>("holes").checked = state.holes;
  $<HTMLInputElement>("smooth").checked = state.smooth;
  $<HTMLInputElement>("show-links").checked = state.showLinks;
  $<HTMLInputElement>("show-members").checked = state.showMembers;
  $<HTMLInputElement>("compare").checked = state.compare;
  $("convexity-field").hidden = !state.connected;
  $("neck-field").hidden = !state.connected;
  $("radius-field").hidden = state.connected;
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
const viewOf = (d: Dataset) => {
  let v = views.get(d.id);
  if (v) return v;
  let [x0, y0, x1, y1] = [0, 0, d.width, d.height];
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

const drawResults = (results: SetResult[]) => {
  const d = dataset();
  let outlines = "",
    today = "",
    debug = "";
  results.forEach((r, i) => {
    const s = d.sets[i],
      P = s.paint,
      T = frame(s);
    outlines += `<path transform="${T}" d="${pathOf(r.rings)}" fill="${P.fill}" fill-opacity="${P.fillOpacity}" stroke="${P.stroke}" stroke-width="${Math.max(1, P.strokeWidth)}" stroke-linejoin="round"/>`;
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
    if (state.showLinks)
      for (const l of r.links) {
        if (l.kind !== "segment") continue;
        g += tube(
          l.a,
          l.b,
          l.w / 2 + state.padding,
          (l.w2 ?? l.w) / 2 + state.padding,
          'fill="#ff7f0e" fill-opacity="0.14" stroke="#ff7f0e" stroke-width="0.6"'
        );
        g += `<line x1="${f2(l.a[0])}" y1="${f2(l.a[1])}" x2="${f2(l.b[0])}" y2="${f2(l.b[1])}" stroke="#b35900" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      }
    if (g) debug += `<g transform="${T}">${g}</g>`;
  });
  $("outlines").innerHTML = outlines;
  $("today").innerHTML = today;
  $("debug").innerHTML = debug;
};

const fmtMs = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));
const drawStats = (results: SetResult[], wall: number) => {
  const sum = (f: (r: SetResult) => number) =>
    results.reduce((s, r) => s + f(r), 0);
  const radii = results.map((r) => r.radius);
  const fin = radii.filter((r) => Number.isFinite(r));
  const rText = !state.connected
    ? `${num(state.radius)} px (given)`
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
      state.connected
        ? `${iters} closing${iters === 1 ? "" : "s"} in the search`
        : ""
    ) +
    stat(
      "pieces / holes",
      `${sum((r) => r.pieces)} / ${sum((r) => r.holes)}`,
      `${results.length} set${results.length === 1 ? "" : "s"}, ${sum((r) => r.links.length)} links`
    ) +
    stat(
      "compute",
      `${fmtMs(wall)} ms`,
      `links ${fmtMs(sum((r) => r.ms.links))} · closing ${fmtMs(sum((r) => r.ms.close))} · cut+smooth ${fmtMs(sum((r) => r.ms.smooth))}`
    ) +
    (today !== null
      ? stat(
          state.connected ? "today's Shape.blob" : "today's Shape.arcs",
          `${fmtMs(today)} ms`,
          "the dashed outline"
        )
      : "");
};

// ── recompute scheduling ─────────────────────────────────────────────────────
// Every set is computed in one task, at most once per animation frame. A dataset whose last
// compute took longer than SLOW ms redraws only when a slider is released.
const SLOW = 120;
const lastMs = new Map<string, number>();
let pending: number | null = null;
const recompute = () => {
  const d = dataset();
  const p: Params = { ...state, avoid: avoiding() };
  let out: SetResult[];
  const t0 = performance.now();
  try {
    out = d.sets.map((s) => computeSet(s, p));
  } catch (err) {
    $("status").textContent = `error: ${(err as Error).message}`;
    console.error(err);
    return;
  }
  const ms = performance.now() - t0;
  lastMs.set(d.id, ms);
  drawResults(out);
  drawStats(out, ms);
  $("status").textContent = `computed in ${fmtMs(ms)} ms`;
  $("status").dataset.ms = String(ms);
  const slow = ms > SLOW;
  $("slow").hidden = !slow;
  $("slow").textContent = slow
    ? "Slow at these settings: sliders redraw when released."
    : "";
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
    if ((lastMs.get(state.dataset) ?? 0) <= SLOW) schedule();
  });
  el.addEventListener("change", () => update({ [k]: +el.value }));
}
const check = (id: string, f: (on: boolean) => Partial<State>) =>
  $<HTMLInputElement>(id).addEventListener("change", (e) =>
    update(f((e.target as HTMLInputElement).checked))
  );
// connected off is the arcs preset, whose outline is not smoothed
check("connected", (on) => ({ connected: on, smooth: on }));
check("holes", (on) => ({ holes: on }));
check("smooth", (on) => ({ smooth: on }));
check("compare", (on) => ({ compare: on }));
check("show-links", (on) => ({ showLinks: on }));
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

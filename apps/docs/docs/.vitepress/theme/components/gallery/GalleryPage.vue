<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vitepress";
import { effectiveLang } from "../../docsLang";
import { data as examplesData } from "../../../data/examples.data.js";
import {
  renderExampleRoot,
  namespaceSvgIds,
} from "../../../../../components/galleryRender";
import "./gallery.css";

// The example gallery is a horizontally-scrolling "museum hall": every registered
// example is rendered LIVE in the browser (no shipped baked-SVG blob), measured for
// its true size, hung in a frame proportional to that size, packed greedily onto a
// long wall, lit by spotlights, and walked by silhouette visitors that step aside
// from the pointer. Ported from prototypes/gallery/index.html — see that file and
// prototypes/gallery/SPEC.md for the full behavioral spec. The DOM-heavy logic runs
// only in onMounted (SSR-safe); every listener/observer/rAF is torn down on unmount.
//
// SCALE NOTE: examples are measured on mount (≈30 charts; the old grid gallery
// already mounted all of them live). At 100–200 examples a build-time dimension
// manifest could replace measure-on-mount, but the live render is still needed for
// the lazily-injected chart art, so only the *measuring* pass would change.

const route = useRoute();
const router = useRouter();

// Template element refs (scoped to this component — no global getElementById, so
// SPA navigation away and back never collides with a stale instance).
const sceneEl = ref<HTMLElement | null>(null);
const hallEl = ref<HTMLElement | null>(null);
const trackEl = ref<HTMLElement | null>(null);
const spotsEl = ref<HTMLElement | null>(null);
const entranceEl = ref<HTMLElement | null>(null);
const endwallEl = ref<HTMLElement | null>(null);
const figuresEl = ref<HTMLElement | null>(null);
const cardEl = ref<HTMLElement | null>(null);
const emptyEl = ref<HTMLElement | null>(null);
const emptyFigEl = ref<HTMLElement | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const countEl = ref<HTMLElement | null>(null);
const minimapEl = ref<HTMLElement | null>(null);
const winEl = ref<HTMLElement | null>(null);
const hintEl = ref<HTMLElement | null>(null);
const backstartEl = ref<HTMLElement | null>(null);

const cleanups: Array<() => void> = [];

const GFONTS_ID = "gofish-landing-fonts";
const GFONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Spline+Sans+Mono:wght@400;500&family=Spline+Sans:wght@400;500;600&display=swap";

function injectFonts(): void {
  if (document.getElementById(GFONTS_ID)) return;
  const sheet = document.createElement("link");
  sheet.id = GFONTS_ID;
  sheet.rel = "stylesheet";
  sheet.href = GFONTS_HREF;
  document.head.append(sheet);
}

onMounted(() => {
  document.documentElement.classList.add("gallery-page");
  injectFonts();

  const scene = sceneEl.value!;
  const hall = hallEl.value!;
  const track = trackEl.value!;
  const spots = spotsEl.value!;
  const entrance = entranceEl.value!;
  const endwall = endwallEl.value!;
  const figuresHost = figuresEl.value!;
  const card = cardEl.value!;
  const emptyBox = emptyEl.value!;
  const search = searchEl.value!;
  const countBox = countEl.value!;
  const minimap = minimapEl.value!;
  const winBox = winEl.value!;
  const hint = hintEl.value!;
  const backstart = backstartEl.value!;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Click-through target. Per-example pages currently exist only under
  // /js/examples/ (the Python docs direct readers to that catalog, which renders
  // identical charts), so a Python piece would 404 on /python/examples/<id>. To
  // keep clicks landing on real content (and the console error-free), Python
  // pieces also open the JS example page. When Python per-example pages land,
  // switch this back to deriving `/${effectiveLang(route.path)}/examples/<id>`.
  function exampleHref(id: string): string {
    const lang = effectiveLang(route.path);
    const section = lang === "python" ? "js" : lang;
    return `/${section}/examples/${id}`;
  }

  // =====================================================================
  // LIVE RENDER + MEASURE — replaces the prototype's window.GALLERY_RENDERS.
  // An offscreen host lays out each chart so we can read its true pixel size,
  // then we keep the normalized <svg> NODE in memory and lazily clone it into
  // frames on scroll proximity (preserving the prototype's lazy-DOM perf work
  // without ever re-executing chart code).
  // =====================================================================
  const measureHost = document.createElement("div");
  measureHost.setAttribute(
    "style",
    "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;"
  );
  document.body.appendChild(measureHost);
  cleanups.push(() => measureHost.remove());

  type Entry = {
    uid: number;
    id: string;
    title: string;
    description: string;
    w: number;
    h: number;
    svgNode: SVGElement;
    jY: number;
    jRot: number;
    frameClass: string;
    _gone?: boolean;
  };

  const raf = () =>
    new Promise<void>((res) => requestAnimationFrame(() => res()));

  // gofish renders through an async (rAF-driven) layout pipeline, so the <svg> is
  // not present synchronously after .render(); the host must be connected and we
  // must wait for the svg to appear with a settled non-zero box before measuring.
  async function measure(
    code: string,
    id: string
  ): Promise<{ w: number; h: number; node: SVGElement } | null> {
    const root = renderExampleRoot(code);
    measureHost.appendChild(root);
    try {
      let svg = root.querySelector("svg") as SVGElement | null;
      for (
        let i = 0;
        i < 90 && (!svg || svg.getBoundingClientRect().width <= 0);
        i++
      ) {
        await raf();
        if (cancelled) return null;
        svg = root.querySelector("svg") as SVGElement | null;
      }
      if (!svg) return null;
      const wAttr = svg.getAttribute("width");
      const hAttr = svg.getAttribute("height");
      const r = svg.getBoundingClientRect();
      let w = wAttr && !wAttr.includes("%") ? parseFloat(wAttr) : r.width;
      let h = hAttr && !hAttr.includes("%") ? parseFloat(hAttr) : r.height;
      if (!w || !h) {
        w = r.width;
        h = r.height;
      }
      // Force responsive sizing so the svg SCALES to its frame instead of cropping
      // to a corner (the "blank frames" bug): synthesize a viewBox if missing.
      if (!svg.getAttribute("viewBox")) {
        svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      }
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      if (!svg.getAttribute("preserveAspectRatio"))
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      namespaceSvgIds(svg, id);
      svg.remove(); // detach; survives the measure host being emptied
      return { w: Math.round(w), h: Math.round(h), node: svg };
    } finally {
      root.remove();
    }
  }

  function injectChart(artEl: HTMLElement, d: Entry): void {
    artEl.replaceChildren(d.svgNode.cloneNode(true));
    artEl.classList.remove("empty");
  }

  // ---- seeded deterministic jitter, stable across repaints in a session.
  function mulberry32(a: number) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedJitter(d: Entry): void {
    const r = mulberry32(d.uid * 2654435761 + 12345);
    d.jY = (r() - 0.5) * 10; // ±5px vertical hand-hung wobble
    d.jRot = (r() - 0.5) * 1.2; // ±0.6° rotation
    d.frameClass = ["f-walnut", "f-brass", "f-ink", "f-float"][d.uid % 4];
  }

  // Per-material frame-edge color for the cheap TRANSIT proxy outline.
  const FRAME_EDGE: Record<string, string> = {
    "f-walnut": "#6b4a2a",
    "f-brass": "#c79a3e",
    "f-ink": "#2c2620",
    "f-float": "#cdbfa3",
  };

  // =====================================================================
  // FIGURES — smooth single-silhouette visitors (head ≈ 1/7.5 height).
  // =====================================================================
  function limb(pts: number[][], w: number): string {
    let d = "M" + pts[0][0] + "," + pts[0][1];
    for (let i = 1; i < pts.length; i++) d += "L" + pts[i][0] + "," + pts[i][1];
    return (
      '<path d="' +
      d +
      '" fill="none" stroke="currentColor" stroke-width="' +
      w +
      '" stroke-linecap="round" stroke-linejoin="round"/>'
    );
  }
  function torso(opt?: { shY?: number; lean?: number }): string {
    const o = opt || {};
    const shY = o.shY || 50,
      lean = o.lean || 0;
    return (
      '<path d="M' +
      (40 + lean) +
      "," +
      shY +
      " C" +
      (40 + lean) +
      "," +
      (shY - 7) +
      " " +
      (50 + lean) +
      "," +
      (shY - 9) +
      " 60," +
      (shY - 9) +
      " C" +
      (70 - lean) +
      "," +
      (shY - 9) +
      " " +
      (80 - lean) +
      "," +
      (shY - 7) +
      " " +
      (80 - lean) +
      "," +
      shY +
      " C" +
      (80 - lean) +
      "," +
      (shY + 30) +
      " 77," +
      (shY + 52) +
      " 73," +
      (shY + 74) +
      " C72," +
      (shY + 80) +
      " 48," +
      (shY + 80) +
      " 47," +
      (shY + 74) +
      " C43," +
      (shY + 52) +
      " " +
      (40 + lean) +
      "," +
      (shY + 30) +
      " " +
      (40 + lean) +
      "," +
      shY +
      ' Z" fill="currentColor"/>'
    );
  }
  function head(cx: number, cy: number, r?: number): string {
    return (
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="' +
      (r || 15) +
      '" fill="currentColor"/>'
    );
  }

  const POSES: Record<string, () => string> = {
    leaning: () =>
      head(64, 26, 14) +
      torso({ shY: 48, lean: 3 }) +
      limb(
        [
          [60, 122],
          [56, 170],
          [58, 220],
        ],
        16
      ) +
      limb(
        [
          [64, 122],
          [70, 168],
          [74, 220],
        ],
        16
      ) +
      limb(
        [
          [44, 56],
          [40, 92],
          [50, 118],
        ],
        11
      ) +
      limb(
        [
          [80, 56],
          [84, 92],
          [72, 116],
        ],
        11
      ),
    pondering: () =>
      '<g transform="rotate(8 60 26)">' +
      head(58, 25, 14) +
      "</g>" +
      torso({ shY: 50 }) +
      limb(
        [
          [56, 124],
          [54, 172],
          [54, 220],
        ],
        16
      ) +
      limb(
        [
          [66, 124],
          [70, 172],
          [72, 220],
        ],
        16
      ) +
      limb(
        [
          [44, 56],
          [30, 88],
          [84, 96],
        ],
        11
      ) +
      limb(
        [
          [80, 54],
          [92, 88],
          [70, 38],
        ],
        11
      ) +
      limb(
        [
          [70, 38],
          [66, 34],
        ],
        10
      ),
    pointing: () =>
      head(58, 26, 14) +
      torso({ shY: 50, lean: 2 }) +
      limb(
        [
          [56, 124],
          [54, 172],
          [54, 220],
        ],
        16
      ) +
      limb(
        [
          [66, 124],
          [70, 172],
          [72, 220],
        ],
        16
      ) +
      limb(
        [
          [44, 58],
          [40, 92],
          [44, 116],
        ],
        11
      ) +
      limb(
        [
          [78, 56],
          [105, 40],
          [112, 16],
        ],
        11
      ) +
      limb(
        [
          [112, 16],
          [115, 8],
        ],
        6
      ),
    lookup: () =>
      '<g transform="rotate(-7 60 28)">' +
      head(60, 26, 14) +
      "</g>" +
      torso({ shY: 50 }) +
      limb(
        [
          [57, 124],
          [55, 172],
          [55, 220],
        ],
        16
      ) +
      limb(
        [
          [66, 124],
          [68, 172],
          [69, 220],
        ],
        16
      ) +
      limb(
        [
          [44, 58],
          [46, 92],
          [52, 112],
        ],
        11
      ) +
      limb(
        [
          [78, 58],
          [76, 92],
          [70, 112],
        ],
        11
      ),
    child: () =>
      head(60, 30, 16) +
      '<path d="M44,56 C44,50 52,48 60,48 C68,48 76,50 76,56 C76,78 73,96 71,112 C70,118 50,118 49,112 C47,96 44,78 44,56 Z" fill="currentColor"/>' +
      limb(
        [
          [55, 116],
          [54, 150],
          [54, 188],
        ],
        14
      ) +
      limb(
        [
          [66, 116],
          [68, 150],
          [69, 188],
        ],
        14
      ) +
      limb(
        [
          [46, 60],
          [42, 86],
          [44, 104],
        ],
        9
      ) +
      limb(
        [
          [75, 60],
          [80, 86],
          [80, 104],
        ],
        9
      ),
    sitting: () =>
      head(60, 40, 14) +
      '<path d="M44,64 C44,58 52,56 60,56 C68,56 76,58 76,64 C76,86 74,104 72,120 C71,126 49,126 48,120 C46,104 44,86 44,64 Z" fill="currentColor"/>' +
      limb(
        [
          [52, 124],
          [54, 150],
          [80, 150],
        ],
        16
      ) +
      limb(
        [
          [80, 150],
          [82, 186],
          [84, 220],
        ],
        16
      ) +
      limb(
        [
          [66, 124],
          [66, 150],
          [88, 150],
        ],
        16
      ) +
      limb(
        [
          [88, 150],
          [90, 186],
          [92, 220],
        ],
        16
      ) +
      limb(
        [
          [46, 70],
          [44, 100],
          [52, 126],
        ],
        11
      ) +
      limb(
        [
          [76, 70],
          [80, 100],
          [76, 126],
        ],
        11
      ) +
      '<rect x="36" y="150" width="72" height="9" rx="3" fill="currentColor" opacity="0.85"/>' +
      '<rect x="40" y="159" width="6" height="58" fill="currentColor" opacity="0.85"/>' +
      '<rect x="98" y="159" width="6" height="58" fill="currentColor" opacity="0.85"/>',
    puzzled: () =>
      '<g transform="rotate(6 60 28)">' +
      head(60, 26, 14) +
      "</g>" +
      torso({ shY: 50 }) +
      limb(
        [
          [57, 124],
          [55, 172],
          [55, 220],
        ],
        16
      ) +
      limb(
        [
          [66, 124],
          [68, 172],
          [69, 220],
        ],
        16
      ) +
      limb(
        [
          [44, 58],
          [42, 92],
          [50, 114],
        ],
        11
      ) +
      limb(
        [
          [78, 58],
          [70, 80],
          [58, 40],
        ],
        11
      ),
  };

  function figureSVG(pose: string, h: number): string {
    const body = POSES[pose]();
    return (
      '<svg width="' +
      (h * 180) / 230 +
      '" height="' +
      h +
      '" viewBox="-30 0 180 230" aria-hidden="true">' +
      body +
      "</svg>"
    );
  }

  const STAND_POSES = [
    "leaning",
    "pondering",
    "pointing",
    "lookup",
    "leaning",
    "pondering",
  ];

  type Spot = {
    cx: number;
    top: number;
    aimTop: number;
    aimBottom: number;
    w: number;
  };
  type Layout = {
    columns: { items: Piece[]; h: number; w: number }[];
    spots: Spot[];
    artRight: number;
    caps: { entrance: number; endwall: number };
  };

  function distributeFigures(list: Piece[], layout: Layout) {
    const cols = (layout && layout.spots) || [];
    if (!cols.length) return [];
    const e = env;
    const wallStart = layout.caps.entrance;
    const wallEnd = layout.artRight;
    const span = Math.max(1, wallEnd - wallStart);
    const cap = e.mobile ? 3 : 80;
    let target = Math.round(span / 620);
    target = Math.max(1, Math.min(cap, target));

    const rng = mulberry32((list.length * 2654435761 + 1013904223) >>> 0);
    const stride = cols.length / target;
    const figs: { x: number; h: number; op: number; pose: string }[] = [];
    let benchPlaced = false;

    for (let i = 0; i < target && figs.length < cap; i++) {
      let idx = Math.floor(i * stride + (rng() - 0.5) * stride * 0.7);
      idx = Math.max(0, Math.min(cols.length - 1, idx));
      const col = cols[idx];
      const off = (rng() - 0.5) * Math.min(120, (col.w || 200) * 0.7);
      const x = col.cx + off;
      const depth = rng();
      const h = Math.round(
        (e.mobile ? 150 : 185) + depth * (e.mobile ? 40 : 85)
      );
      const op = +(0.84 + depth * 0.16).toFixed(3);
      let pose = STAND_POSES[Math.floor(rng() * STAND_POSES.length)];

      const frac = i / target;
      if (!benchPlaced && frac > 0.33 && frac < 0.66 && rng() < 0.6) {
        pose = "sitting";
        benchPlaced = true;
      }
      figs.push({ x, h, op, pose });

      if (pose !== "sitting" && figs.length < cap && rng() < 0.2) {
        const d2 = rng();
        figs.push({
          x: x + 52 + rng() * 46,
          h: Math.round((e.mobile ? 150 : 175) + d2 * (e.mobile ? 35 : 75)),
          op: +(0.84 + d2 * 0.16).toFixed(3),
          pose: STAND_POSES[Math.floor(rng() * STAND_POSES.length)],
        });
      }
      if (figs.length < cap && rng() < 0.16) {
        figs.push({
          x: x - 40 - rng() * 28,
          h: Math.round((e.mobile ? 96 : 112) + rng() * 22),
          op: 0.9,
          pose: "child",
        });
      }
    }
    return figs;
  }

  // ---- pointer repulsion config (see prototype's 6 documented behaviors) ----
  const REP = reduceMotion
    ? {
        radius: 150,
        maxDisp: 44,
        lerp: 0.08,
        lean: 0,
        bandMargin: 30,
        edgeMargin: 14,
        headTol: 10,
      }
    : {
        radius: 172,
        maxDisp: 94,
        lerp: 0.12,
        lean: 2.2,
        bandMargin: 40,
        edgeMargin: 18,
        headTol: 10,
      };
  const smoothstep = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  type FigState = {
    el: HTMLElement;
    leanEl: HTMLElement | null;
    restX: number;
    halfW: number;
    disp: number;
    prevTotal: number;
  };
  let figureState: FigState[] = [];
  function renderFigures(
    figs: { x: number; h: number; op: number; pose: string }[]
  ) {
    figuresHost.innerHTML = "";
    figureState = [];
    for (const v of figs) {
      const el = document.createElement("div");
      el.className = "figure";
      el.style.left = Math.round(v.x) + "px";
      el.style.opacity = String(v.op);
      el.style.setProperty(
        "--stand",
        "calc(var(--floor-h) - " + Math.round(v.h * 0.1) + "px)"
      );
      el.style.transform = "translateX(-50%)";
      el.innerHTML =
        '<div class="shadow"></div><div class="lean"><div class="body">' +
        figureSVG(v.pose, v.h) +
        "</div></div>";
      figuresHost.appendChild(el);
      figureState.push({
        el,
        leanEl: el.querySelector(".lean"),
        restX: v.x,
        halfW: (v.h * 120) / 230 / 2,
        disp: 0,
        prevTotal: 0,
      });
    }
  }
  emptyFigEl.value!.innerHTML = figureSVG("puzzled", 240);

  let pointerClientX = 0,
    pointerClientY = 0,
    pointerActive = false,
    figRAF = 0;
  let hoveredPiece: Piece | null = null;
  function figureTick() {
    figRAF = 0;
    let busy = false;
    let ptx = -1e9;
    if (pointerActive) {
      const rect = hall.getBoundingClientRect();
      ptx = hall.scrollLeft + (pointerClientX - rect.left);
    }
    let unionLeft = 0,
      unionRight = 0,
      unionBottomClient = 0,
      reading = false;
    if (hoveredPiece) {
      const fr = hoveredPiece.frameEl.getBoundingClientRect();
      if (fr.width > 0 && fr.height > 0) {
        const pr = hoveredPiece.plaqueEl.getBoundingClientRect();
        const cx = hoveredPiece.x! + hoveredPiece.boxW! / 2;
        const plaqueHalfW = (pr.width || 0) / 2;
        unionLeft = Math.min(hoveredPiece.x!, cx - plaqueHalfW);
        unionRight = Math.max(
          hoveredPiece.x! + hoveredPiece.boxW!,
          cx + plaqueHalfW
        );
        unionBottomClient = Math.max(fr.bottom, pr.bottom);
        reading = true;
      }
    }
    for (const f of figureState) {
      let prox = 0;
      if (pointerActive) {
        const dx = f.restX - ptx;
        const ad = Math.abs(dx);
        if (ad < REP.radius) {
          const fallX = 1 - ad / REP.radius;
          const r = f.el.getBoundingClientRect();
          let vFall = 1;
          if (pointerClientY < r.top || pointerClientY > r.bottom) {
            const dv =
              pointerClientY < r.top
                ? r.top - pointerClientY
                : pointerClientY - r.bottom;
            vFall = 1 - smoothstep(0, REP.bandMargin, dv);
          }
          prox = Math.sign(dx || 1) * REP.maxDisp * fallX * fallX * vFall;
        }
      }
      let clear = 0;
      if (
        reading &&
        f.restX + f.halfW > unionLeft &&
        f.restX - f.halfW < unionRight
      ) {
        const fc = f.el.getBoundingClientRect();
        const overlapsV =
          fc.height > 0 && unionBottomClient > fc.top + REP.headTol;
        if (overlapsV) {
          const toLeft = f.restX - unionLeft <= unionRight - f.restX;
          const targetCx = toLeft
            ? unionLeft - REP.edgeMargin - f.halfW
            : unionRight + REP.edgeMargin + f.halfW;
          clear = targetCx - f.restX;
        }
      }
      const tgt = Math.abs(clear) > Math.abs(prox) ? clear : prox;
      f.disp += (tgt - f.disp) * REP.lerp;
      const total = f.disp;
      const moved = Math.abs(total - f.prevTotal) > 0.05;
      if (moved) {
        f.el.style.transform =
          "translateX(calc(-50% + " + total.toFixed(1) + "px))";
        if (REP.lean && f.leanEl) {
          const lean = Math.max(
            -5,
            Math.min(5, (total - f.prevTotal) * REP.lean)
          );
          f.leanEl.style.transform = "rotate(" + lean.toFixed(2) + "deg)";
        }
      }
      f.prevTotal = total;
      if (Math.abs(tgt - f.disp) > 0.1) busy = true;
    }
    if (busy || pointerActive) figRAF = requestAnimationFrame(figureTick);
  }
  function kickFigures() {
    if (!figRAF) figRAF = requestAnimationFrame(figureTick);
  }

  const onScenePointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    pointerClientX = e.clientX;
    pointerClientY = e.clientY;
    pointerActive = true;
    kickFigures();
  };
  const onScenePointerLeave = () => {
    pointerActive = false;
    hoveredPiece = null;
    kickFigures();
  };
  const onWindowBlur = () => {
    pointerActive = false;
    hoveredPiece = null;
    kickFigures();
  };
  scene.addEventListener("pointermove", onScenePointerMove);
  scene.addEventListener("pointerleave", onScenePointerLeave);
  window.addEventListener("blur", onWindowBlur);
  cleanups.push(() => {
    scene.removeEventListener("pointermove", onScenePointerMove);
    scene.removeEventListener("pointerleave", onScenePointerLeave);
    window.removeEventListener("blur", onWindowBlur);
  });

  // =====================================================================
  // PACKING — greedy column-fill strip packing, O(n). (See prototype's note.)
  // =====================================================================
  type Piece = {
    data: Entry;
    el: HTMLElement;
    frameEl: HTMLElement;
    artEl: HTMLElement;
    plaqueEl: HTMLElement;
    injected: boolean;
    _queued?: boolean;
    _hideT?: number;
    appearing?: boolean;
    x?: number;
    y?: number;
    boxW?: number;
    boxH?: number;
    artW?: number;
    artH?: number;
    totalH?: number;
  };
  const pieces: Piece[] = [];
  type Env = {
    S: number;
    mat: number;
    bord: number;
    plaqueGap: number;
    plaqueH: number;
    vGap: number;
    hGap: number;
    wallH: number;
    band: number;
    bandTop: number;
    leftPad: number;
    mobile: boolean;
  };
  let env = {} as Env;

  function computeEnv(): Env {
    const vw = window.innerWidth;
    const sceneH = scene.clientHeight;
    const floorEl = scene.querySelector(".floor") as HTMLElement;
    const floorH =
      floorEl.getBoundingClientRect().height || Math.round(sceneH * 0.26);
    const wallH = sceneH - floorH;
    const mobile = vw <= 640;
    const ceilPad = mobile ? 56 : 78;
    const basePad = mobile ? 16 : 24;
    const band = Math.max(140, wallH - ceilPad - basePad);
    const mat = mobile ? 9 : 13;
    const bord = mobile ? 6 : 11;
    const plaqueGap = mobile ? 10 : 12;
    const plaqueH = mobile ? 44 : 48;
    const vGap = mobile ? 26 : 36;
    const hGap = mobile ? 38 : 64;
    const perFixed = mat * 2 + bord * 2 + plaqueGap + plaqueH;
    const refH = 420;
    let S = (band - vGap - 2 * perFixed) / (2 * refH);
    S = Math.max(mobile ? 0.24 : 0.3, Math.min(mobile ? 0.42 : 0.46, S));
    return {
      S,
      mat,
      bord,
      plaqueGap,
      plaqueH,
      vGap,
      hGap,
      wallH,
      band,
      bandTop: ceilPad,
      leftPad: mobile ? 320 : 0,
      mobile,
    };
  }

  function endcapWidths() {
    const mobileCap = Math.round(window.innerWidth * 0.66);
    return {
      entrance: Math.min(
        entrance.scrollWidth + 70,
        env.mobile ? mobileCap : 560
      ),
      endwall: Math.min(endwall.scrollWidth + 70, env.mobile ? 320 : 460),
    };
  }

  // Push the entrance text block down so the centered headline clears the
  // hanging search card. The card is viewport-fixed within the scene (it does
  // not scroll), so its real rendered bottom — measured in scene coordinates,
  // which coincide with the entrance's own top — is exactly the padding-top the
  // entrance needs. Measuring (rather than guessing) absorbs the VitePress
  // navbar height, the card's swayed bbox, and its true height including the
  // results-count line + minimap, at desktop and the docked mobile bar alike.
  function clearEntranceForCard(): void {
    const sceneRect = scene.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    // On mobile the card docks at the BOTTOM edge — the entrance needs no top
    // clearance then (guard by position, not media query, so it can't drift
    // out of sync with the CSS).
    if (cardRect.top > sceneRect.top + sceneRect.height / 2) {
      entrance.style.paddingTop = "0px";
      return;
    }
    const gap = env.mobile ? 14 : 22;
    const clear = Math.max(
      0,
      Math.round(cardRect.bottom - sceneRect.top + gap)
    );
    entrance.style.paddingTop = clear + "px";
  }

  function pack(list: Piece[]): Layout {
    const e = env;
    const caps = endcapWidths();
    const startX = caps.entrance + e.hGap;
    const chrome = e.mat * 2 + e.bord * 2;
    for (const p of list) {
      let fw = p.data.w * e.S,
        fh = p.data.h * e.S;
      const total = fh + chrome + e.plaqueGap + e.plaqueH;
      if (total > e.band) {
        const artMax = e.band - e.plaqueGap - e.plaqueH - chrome;
        const f = Math.max(0.1, artMax / fh);
        fw *= f;
        fh *= f;
      }
      p.boxW = fw + chrome;
      p.boxH = fh + chrome;
      p.artW = fw;
      p.artH = fh;
      p.totalH = p.boxH + e.plaqueGap + e.plaqueH;
    }
    const columns: { items: Piece[]; h: number; w: number }[] = [];
    let col: Piece[] = [],
      colH = 0,
      colW = 0;
    const flush = () => {
      if (col.length) columns.push({ items: col, h: colH, w: colW });
      col = [];
      colH = 0;
      colW = 0;
    };
    for (const p of list) {
      const add = (col.length ? e.vGap : 0) + p.totalH!;
      if (col.length && colH + add > e.band) flush();
      colH += (col.length ? e.vGap : 0) + p.totalH!;
      colW = Math.max(colW, p.boxW!);
      col.push(p);
    }
    flush();
    let x = startX;
    const spotsArr: Spot[] = [];
    for (const c of columns) {
      const cx = x + c.w / 2;
      let y = e.bandTop + (e.band - c.h) / 2;
      const top = y;
      for (const p of c.items) {
        p.x = cx - p.boxW! / 2;
        p.y = y;
        y += p.boxH! + e.plaqueGap + e.plaqueH + e.vGap;
      }
      const bottom = y - e.vGap;
      spotsArr.push({
        cx,
        top: e.bandTop,
        aimTop: top,
        aimBottom: bottom,
        w: c.w,
      });
      x = cx + c.w / 2 + e.hGap;
    }
    const artRight = columns.length ? x : startX;
    return { columns, spots: spotsArr, artRight, caps };
  }

  function escapeHTML(s: string): string {
    return String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
    );
  }

  function buildPiece(d: Entry): void {
    const el = document.createElement("div");
    el.className = "piece";
    el.tabIndex = 0;
    el.setAttribute("role", "link");
    el.setAttribute("aria-label", d.title + " — open example");
    el.style.opacity = "0"; // fade in once placed

    const frame = document.createElement("div");
    frame.className = "frame " + d.frameClass;
    const art = document.createElement("div");
    art.className = "art empty";
    frame.appendChild(art);

    const plaque = document.createElement("div");
    plaque.className = "plaque";
    plaque.innerHTML =
      '<div class="ptitle">' +
      escapeHTML(d.title) +
      "</div>" +
      (d.description
        ? '<div class="pdesc">' + escapeHTML(d.description) + "</div>"
        : "");

    el.appendChild(frame);
    el.appendChild(plaque);

    const go = () => router.go(exampleHref(d.id));
    el.addEventListener("click", go);
    el.addEventListener("keydown", (ev) => {
      if ((ev as KeyboardEvent).key === "Enter") go();
    });

    const p: Piece = {
      data: d,
      el,
      frameEl: frame,
      artEl: art,
      plaqueEl: plaque,
      injected: false,
      appearing: true,
    };
    el.addEventListener("pointerenter", (ev) => {
      if ((ev as PointerEvent).pointerType === "touch") return;
      hoveredPiece = p;
      kickFigures();
    });
    el.addEventListener("pointerleave", (ev) => {
      if ((ev as PointerEvent).pointerType === "touch") return;
      if (hoveredPiece === p) hoveredPiece = null;
      kickFigures();
    });
    (el as unknown as { _piece: Piece })._piece = p;
    pieces.push(p);
    track.appendChild(el);
    io.observe(el);
  }

  // =====================================================================
  // TRANSIT VELOCITY GATE + budgeted injection (see prototype's notes).
  // =====================================================================
  const VEL_GATE = 55;
  const SETTLE_FRAMES = 2;
  let hallVel = 0;
  let lastSampleLeft = hall.scrollLeft;
  let velRAF = 0,
    settleFrames = 0;
  const pendingReclaim = new Set<Piece>();
  function isFast() {
    return hallVel > VEL_GATE;
  }
  function reclaim(p: Piece) {
    p.artEl.innerHTML = "";
    p.artEl.classList.add("empty");
    p.injected = false;
    p._queued = false;
    pendingReclaim.delete(p);
  }
  const injectQueue: Piece[] = [];
  let injectRAF = 0;
  function enqueueInject(p: Piece) {
    if (!p || p.injected || p._queued || p.data._gone) return;
    p._queued = true;
    injectQueue.push(p);
    if (!injectRAF) injectRAF = requestAnimationFrame(drainInject);
  }
  function drainInject() {
    injectRAF = 0;
    if (!isFast()) {
      const p = injectQueue.shift();
      if (p) {
        p._queued = false;
        if (!p.injected && !p.data._gone) {
          injectChart(p.artEl, p.data);
          p.injected = true;
        }
      }
    }
    if (injectQueue.length) injectRAF = requestAnimationFrame(drainInject);
  }
  function onSettle() {
    hallVel = 0;
    ensureVisible();
    if (pendingReclaim.size) {
      const left = hall.scrollLeft - 1900;
      const right = hall.scrollLeft + hall.clientWidth + 1900;
      for (const p of [...pendingReclaim]) {
        if (p.x == null || p.x + p.boxW! < left || p.x > right) reclaim(p);
        else pendingReclaim.delete(p);
      }
    }
  }
  function velTick() {
    velRAF = 0;
    const sl = hall.scrollLeft;
    hallVel = Math.abs(sl - lastSampleLeft);
    lastSampleLeft = sl;
    if (hallVel > VEL_GATE) {
      settleFrames = 0;
      velRAF = requestAnimationFrame(velTick);
    } else if (settleFrames < SETTLE_FRAMES) {
      settleFrames++;
      velRAF = requestAnimationFrame(velTick);
    } else {
      onSettle();
    }
  }
  function kickVel() {
    if (!velRAF) velRAF = requestAnimationFrame(velTick);
  }
  function instantJumpInject() {
    hallVel = 0;
    settleFrames = SETTLE_FRAMES;
    lastSampleLeft = hall.scrollLeft;
    ensureVisible();
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const p = (en.target as unknown as { _piece: Piece })._piece;
        if (!p) continue;
        if (en.isIntersecting) {
          pendingReclaim.delete(p);
          if (!isFast()) enqueueInject(p);
        } else if (p.injected) {
          if (isFast()) pendingReclaim.add(p);
          else reclaim(p);
        }
      }
    },
    { root: hall, rootMargin: "300px 1800px 300px 1800px", threshold: 0 }
  );
  cleanups.push(() => io.disconnect());

  // =====================================================================
  // APPLY a layout: position every visible piece + draw spotlights.
  // =====================================================================
  function applyLayout(list: Piece[], layout: Layout) {
    const e = env;
    for (const p of list) {
      const d = p.data;
      p.el.classList.remove("gone");
      p.el.style.display = "";
      if (p._hideT) {
        clearTimeout(p._hideT);
        p._hideT = 0;
      }
      p.el.style.containIntrinsicSize =
        Math.round(p.boxW!) + "px " + Math.round(p.totalH!) + "px";
      p.el.style.width = Math.round(p.boxW!) + "px";
      p.el.style.height = Math.round(p.totalH!) + "px";
      p.el.style.setProperty("--fh", Math.round(p.boxH!) + "px");
      p.el.style.setProperty("--edge", FRAME_EDGE[d.frameClass] || "#6b4a2a");
      p.frameEl.style.setProperty("--mat", e.mat + "px");
      p.artEl.style.width = Math.round(p.artW!) + "px";
      p.artEl.style.height = Math.round(p.artH!) + "px";
      p.plaqueEl.style.setProperty("--plaque-gap", e.plaqueGap + "px");
      p.plaqueEl.style.setProperty("--plaque-max", Math.round(p.boxW!) + "px");
      const tx = Math.round(p.x!);
      const ty = Math.round(p.y! + d.jY);
      // A newly-built piece must appear in place (not fly in from 0,0); disable its
      // transform transition for this frame, then restore + fade it in next frame.
      if (p.appearing) p.el.style.transition = "none";
      p.el.style.transform =
        "translate(" +
        tx +
        "px," +
        ty +
        "px) rotate(" +
        d.jRot.toFixed(2) +
        "deg)";
      if (p.appearing) {
        const el = p.el;
        requestAnimationFrame(() => {
          el.style.transition = "";
          el.style.opacity = "";
        });
        p.appearing = false;
      }
    }
    const visible = new Set(list);
    for (const p of pieces) {
      if (!visible.has(p)) {
        p.data._gone = true;
        if (p.el.style.display !== "none" && !p._hideT) {
          p.el.classList.add("gone");
          p._hideT = window.setTimeout(
            () => {
              p.el.style.display = "none";
              p._hideT = 0;
              const max = Math.max(
                0,
                parseFloat(track.style.width) - hall.clientWidth
              );
              if (hall.scrollLeft > max) hall.scrollLeft = max;
            },
            reduceMotion ? 220 : 480
          );
        }
      } else {
        p.data._gone = false;
      }
    }

    spots.innerHTML = "";
    const floorTop = e.wallH;
    for (const s of layout.spots) {
      const wrap = document.createElement("div");
      wrap.className = "spot";
      wrap.style.left = Math.round(s.cx) + "px";
      wrap.style.top = "0px";
      const coneW = Math.max(s.w * 2.1, 220);
      const coneH = floorTop - 40;
      const glowW = Math.max(s.w * 1.25, 180);
      const glowH = Math.min(coneH, s.aimBottom - 40 || coneH);
      const fixture =
        '<svg class="fixture" viewBox="0 0 20 26" aria-hidden="true">' +
        '<rect x="8" y="0" width="4" height="8" fill="#3a332c"/>' +
        '<ellipse cx="10" cy="9" rx="9" ry="4" fill="#4a4038"/>' +
        '<path d="M2 9 L18 9 L15 20 L5 20 Z" fill="#5b5048"/>' +
        '<ellipse cx="10" cy="20" rx="5.4" ry="2.2" fill="#ffe9b0"/>' +
        "</svg>";
      const poolW = coneW * 0.85,
        poolH = e.mobile ? 26 : 42;
      wrap.innerHTML =
        fixture +
        '<div class="cone" style="width:' +
        Math.round(coneW) +
        "px;height:" +
        Math.round(coneH) +
        'px"></div>' +
        '<div class="glow" style="width:' +
        Math.round(glowW) +
        "px;height:" +
        Math.round(glowH) +
        'px"></div>' +
        '<div class="pool" style="top:' +
        Math.round(floorTop + 10) +
        "px;width:" +
        Math.round(poolW) +
        "px;height:" +
        Math.round(poolH) +
        'px"></div>';
      spots.appendChild(wrap);
    }

    const caps = layout.caps;
    const total = list.length
      ? layout.artRight + caps.endwall + (e.mobile ? 40 : 80)
      : caps.entrance + (e.mobile ? 300 : 520);
    const trackW = Math.max(total, window.innerWidth);
    track.style.width = trackW + "px";
    entrance.style.width = caps.entrance + "px";
    endwall.style.left =
      (list.length ? layout.artRight : caps.entrance + e.hGap) + "px";
    endwall.style.width = caps.endwall + "px";
    endwall.style.right = "auto";

    const maxScroll = Math.max(0, trackW - hall.clientWidth);
    if (hall.scrollLeft > maxScroll) hall.scrollLeft = maxScroll;

    updateMinimap(list);
    ensureVisible();
  }

  function ensureVisible() {
    if (isFast()) return;
    const sl = hall.scrollLeft;
    const left = sl - 1900;
    const right = sl + hall.clientWidth + 1900;
    for (const p of pieces) {
      if (p.data._gone || p.injected || p._queued) continue;
      if (p.x != null && p.x + p.boxW! > left && p.x < right) enqueueInject(p);
    }
  }

  // =====================================================================
  // FILTER + REPACK
  // =====================================================================
  function currentList(): Piece[] {
    const q = search.value.trim().toLowerCase();
    if (!q) return pieces.slice();
    return pieces.filter(
      (p) =>
        p.data.title.toLowerCase().includes(q) ||
        (p.data.description && p.data.description.toLowerCase().includes(q))
    );
  }

  let lastLayout: Layout | null = null;
  let lastFigCols = -1;
  function relayout() {
    clearEntranceForCard();
    const list = currentList();
    const layout = pack(list);
    applyLayout(list, layout);
    lastLayout = layout;

    countBox.textContent =
      "Showing " + list.length + " of " + pieces.length + " pieces";
    const isEmpty = list.length === 0;
    // While the wall is still filling in, an empty list just means "not loaded
    // yet" — don't flash the empty state.
    emptyBox.classList.toggle("show", isEmpty && !loading);
    endwall.style.display = isEmpty ? "none" : "";
    if (isEmpty) {
      renderFigures([]);
      lastFigCols = 0;
      if (!loading) hall.scrollLeft = 0;
    } else {
      // Throttle the crowd re-derivation during the progressive load (re-render
      // only when the column count changes); refresh fully once loaded / on filter.
      const cols = layout.columns.length;
      if (!loading || cols !== lastFigCols) {
        renderFigures(distributeFigures(list, layout));
        lastFigCols = cols;
        kickFigures();
      }
    }
  }

  // =====================================================================
  // MINIMAP
  // =====================================================================
  let mmTicks: HTMLElement[] = [];
  function updateMinimap(list: Piece[]) {
    for (const t of mmTicks) t.remove();
    mmTicks = [];
    const total = parseFloat(track.style.width);
    const mmW = minimap.clientWidth;
    for (const p of list) {
      const t = document.createElement("div");
      t.className = "tick";
      t.style.left = (p.x! / total) * mmW + "px";
      minimap.appendChild(t);
      mmTicks.push(t);
    }
    syncWindow();
  }
  function syncWindow() {
    const total = parseFloat(track.style.width) || hall.scrollWidth;
    const mmW = minimap.clientWidth;
    const winW = Math.max((hall.clientWidth / total) * mmW, 12);
    const winX = (hall.scrollLeft / total) * mmW;
    winBox.style.width = winW + "px";
    winBox.style.left = Math.min(winX, mmW - winW) + "px";
  }
  function dragTo(clientX: number) {
    const rect = minimap.getBoundingClientRect();
    const mmW = rect.width;
    const winW = winBox.offsetWidth;
    const total = parseFloat(track.style.width) || hall.scrollWidth;
    let winLeft = clientX - rect.left - mmGrabDX;
    winLeft = Math.max(0, Math.min(winLeft, mmW - winW));
    hall.scrollLeft = (winLeft / mmW) * total;
    winBox.style.left = winLeft + "px";
  }
  function jumpTo(clientX: number) {
    const rect = minimap.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const total = parseFloat(track.style.width) || hall.scrollWidth;
    glideTo(frac * total - hall.clientWidth / 2);
  }
  let mmDrag = false;
  let mmGrabDX = 0;
  const onMmDown = (e: PointerEvent) => {
    minimap.setPointerCapture(e.pointerId);
    const winRect = winBox.getBoundingClientRect();
    if (e.clientX >= winRect.left && e.clientX <= winRect.right) {
      cancelGlide();
      mmDrag = true;
      mmGrabDX = e.clientX - winRect.left;
    } else {
      mmGrabDX = winBox.offsetWidth / 2;
      mmDrag = true;
      jumpTo(e.clientX);
    }
  };
  const onMmMove = (e: PointerEvent) => {
    if (mmDrag) dragTo(e.clientX);
  };
  const onMmUp = () => {
    mmDrag = false;
  };
  minimap.addEventListener("pointerdown", onMmDown);
  minimap.addEventListener("pointermove", onMmMove);
  minimap.addEventListener("pointerup", onMmUp);
  minimap.addEventListener("pointercancel", onMmUp);
  cleanups.push(() => {
    minimap.removeEventListener("pointerdown", onMmDown);
    minimap.removeEventListener("pointermove", onMmMove);
    minimap.removeEventListener("pointerup", onMmUp);
    minimap.removeEventListener("pointercancel", onMmUp);
  });

  // =====================================================================
  // FULL-DISTANCE GLIDE + TRANSIT MODE (see prototype's note).
  // =====================================================================
  const GLIDE_PEAK_VEL = 11000;
  const GLIDE_MIN_MS = 260;
  const GLIDE_MAX_MS = 2000;
  const TRANSIT_MIN_DIST = () => hall.clientWidth * 1.2;
  const GLIDE_IN = 0.15,
    GLIDE_OUT = 0.3;
  const GLIDE_CRUISE_SLOPE =
    1 / (GLIDE_IN / 2 + (1 - GLIDE_IN - GLIDE_OUT) + GLIDE_OUT / 2);
  function glideEase(t: number) {
    const a = GLIDE_IN,
      b = 1 - GLIDE_OUT,
      vc = GLIDE_CRUISE_SLOPE;
    if (t < a) return (vc * t * t) / (2 * a);
    const dA = (vc * a) / 2;
    if (t < b) return dA + vc * (t - a);
    const td = (t - b) / (1 - b);
    return dA + vc * (b - a) + vc * (1 - b) * (td - (td * td) / 2);
  }
  let glideRAF = 0,
    glideActive = false,
    transitOn = false;
  function enterTransit() {
    if (transitOn) return;
    transitOn = true;
    track.classList.add("transit");
  }
  function exitTransit() {
    if (!transitOn) return;
    transitOn = false;
    track.classList.remove("transit");
  }
  function cancelGlide() {
    if (glideRAF) {
      cancelAnimationFrame(glideRAF);
      glideRAF = 0;
    }
    glideActive = false;
    exitTransit();
  }
  function maxScrollNow() {
    return Math.max(
      0,
      (parseFloat(track.style.width) || hall.scrollWidth) - hall.clientWidth
    );
  }
  function glideTo(target: number) {
    cancelGlide();
    const max = maxScrollNow();
    target = Math.max(0, Math.min(target, max));
    if (reduceMotion) {
      hall.scrollLeft = target;
      instantJumpInject();
      return;
    }
    const from = hall.scrollLeft;
    const dist = target - from;
    const adist = Math.abs(dist);
    if (adist < 2) {
      hall.scrollLeft = target;
      return;
    }
    let dur = ((GLIDE_CRUISE_SLOPE * adist) / GLIDE_PEAK_VEL) * 1000;
    dur = Math.max(GLIDE_MIN_MS, Math.min(GLIDE_MAX_MS, dur));
    const longSweep = adist > TRANSIT_MIN_DIST();
    if (longSweep) enterTransit();
    glideActive = true;
    const t0 = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - t0) / dur);
      const e = glideEase(t);
      hall.scrollLeft = from + dist * e;
      if (t < 1) {
        glideRAF = requestAnimationFrame(step);
      } else {
        glideRAF = 0;
        glideActive = false;
        hall.scrollLeft = target;
        if (longSweep) exitTransit();
        onSettle();
      }
    }
    glideRAF = requestAnimationFrame(step);
  }

  // =====================================================================
  // INPUT — wheel→horizontal, keyboard paging, hint fade, scroll sync.
  // =====================================================================
  const onWheel = (e: WheelEvent) => {
    cancelGlide();
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      hall.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };
  hall.addEventListener("wheel", onWheel, { passive: false });
  const onHallDown = () => {
    if (glideActive) cancelGlide();
  };
  hall.addEventListener("pointerdown", onHallDown);

  const onKeydown = (e: KeyboardEvent) => {
    if (e.target === search) return;
    if (e.key === "ArrowRight") {
      hall.scrollTo({
        left: hall.scrollLeft + hall.clientWidth * 0.8,
        behavior: "smooth",
      });
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      hall.scrollTo({
        left: hall.scrollLeft - hall.clientWidth * 0.8,
        behavior: "smooth",
      });
      e.preventDefault();
    } else if (e.key === "Home") {
      glideTo(0);
      e.preventDefault();
    } else if (e.key === "End") {
      glideTo(maxScrollNow());
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKeydown);

  const onBackstart = () => glideTo(0);
  backstart.addEventListener("click", onBackstart);

  let hintHidden = false;
  let scrollRAF = 0;
  const onScroll = () => {
    syncWindow();
    if (!hintHidden && hall.scrollLeft > 80) {
      hint.style.opacity = "0";
      hintHidden = true;
    }
    backstart.classList.toggle("show", hall.scrollLeft > hall.clientWidth);
    if (pointerActive) kickFigures();
    kickVel();
    if (!scrollRAF)
      scrollRAF = requestAnimationFrame(() => {
        scrollRAF = 0;
        ensureVisible();
      });
  };
  hall.addEventListener("scroll", onScroll, { passive: true });

  const onSearchInput = () => relayout();
  search.addEventListener("input", onSearchInput);

  cleanups.push(() => {
    hall.removeEventListener("wheel", onWheel);
    hall.removeEventListener("pointerdown", onHallDown);
    window.removeEventListener("keydown", onKeydown);
    backstart.removeEventListener("click", onBackstart);
    hall.removeEventListener("scroll", onScroll);
    search.removeEventListener("input", onSearchInput);
  });

  let rt: ReturnType<typeof setTimeout>;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      env = computeEnv();
      lastFigCols = -1;
      relayout();
    }, 150);
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => {
    clearTimeout(rt);
    window.removeEventListener("resize", onResize);
  });

  // =====================================================================
  // PROGRESSIVE LIVE RENDER — render examples entrance-first, measuring each,
  // building its piece, and repacking incrementally so the first contentful
  // museum (wall/floor/entrance) shows instantly and pieces fade into place as
  // they become available. Packing is sub-millisecond, so per-piece repacks are
  // cheap; we coalesce them into one rAF.
  // =====================================================================
  let loading = true;
  let relayoutRAF = 0;
  function scheduleRelayout() {
    if (!relayoutRAF)
      relayoutRAF = requestAnimationFrame(() => {
        relayoutRAF = 0;
        relayout();
      });
  }

  env = computeEnv();
  relayout(); // size the empty hall (wall/floor/entrance/end wall) immediately
  // The hanging card's height depends on the (async) Fraunces label + monospace
  // count line; re-clear the entrance once webfonts settle so it never overlaps.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (!cancelled) clearEntranceForCard();
    });
  }
  // enable position transitions after first paint so existing pieces animate on
  // repack/search (newly-built pieces opt out per-piece via `appearing`).
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!reduceMotion) track.classList.add("animate");
    })
  );

  const params = new URLSearchParams(window.location.search);
  const N = parseInt(params.get("n") || "0", 10);

  const examples = examplesData.examples as {
    id: string;
    title: string;
    description?: string;
    code: string;
  }[];
  const baseEntries: Entry[] = [];
  let cancelled = false;
  cleanups.push(() => {
    cancelled = true;
    if (relayoutRAF) cancelAnimationFrame(relayoutRAF);
  });

  function addEntry(
    id: string,
    title: string,
    description: string,
    m: { w: number; h: number; node: SVGElement }
  ): Entry {
    const uid = baseEntries.length + synthCount;
    const d: Entry = {
      uid,
      id,
      title,
      description,
      w: m.w,
      h: m.h,
      svgNode: m.node,
      jY: 0,
      jRot: 0,
      frameClass: "f-walnut",
    };
    seedJitter(d);
    buildPiece(d);
    scheduleRelayout();
    return d;
  }
  let synthCount = 0;

  const nextFrame = () =>
    new Promise<void>((res) => requestAnimationFrame(() => res()));

  (async () => {
    for (const ex of examples) {
      if (cancelled) return;
      try {
        const m = await measure(ex.code, ex.id);
        if (m)
          baseEntries.push(addEntry(ex.id, ex.title, ex.description || "", m));
      } catch (err) {
        console.warn("gallery: example failed to render", ex.id, err);
      }
    }
    if (cancelled) return;

    // ---- ?n=150 scale test: synthesize a bigger wall by cycling measured renders.
    if (N > baseEntries.length && baseEntries.length) {
      for (let i = baseEntries.length; i < N; i++) {
        if (cancelled) return;
        const base = baseEntries[i % baseEntries.length];
        const cycle = Math.floor(i / baseEntries.length) + 1;
        synthCount++;
        const d: Entry = {
          uid: i,
          id: base.id + (cycle > 1 ? "-" + cycle : ""),
          title: base.title + (cycle > 1 ? " " + cycle : ""),
          description: base.description,
          w: base.w,
          h: base.h,
          svgNode: base.svgNode,
          jY: 0,
          jRot: 0,
          frameClass: "f-walnut",
        };
        seedJitter(d);
        buildPiece(d);
        if (i % 12 === 0) await nextFrame();
      }
    }

    loading = false;
    lastFigCols = -1;
    relayout(); // final pack + full crowd derivation
  })();
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("gallery-page");
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
});
</script>

<template>
  <div class="gallery-scene" ref="sceneEl">
    <div class="hall" ref="hallEl">
      <div class="track" ref="trackEl">
        <div class="wall"></div>
        <div class="rail"></div>
        <div class="floor"></div>
        <div class="spots" ref="spotsEl"></div>

        <section class="endcap entrance" ref="entranceEl">
          <h1>The <span class="em">GoFish</span><br />Collection</h1>
          <div class="sub">walk the hall <span class="arrow">&rarr;</span></div>
          <div class="cta-row">
            <a
              class="btn btn-primary"
              href="https://github.com/gofish-graphics/gofish-graphics"
              target="_blank"
              rel="noopener"
              >Contribute an example</a
            >
          </div>
        </section>

        <section class="endcap endwall" ref="endwallEl">
          <h2>That's it!</h2>
          <p>Want yours on this wall? Open a PR.</p>
          <a
            class="btn btn-primary"
            href="https://github.com/gofish-graphics/gofish-graphics"
            target="_blank"
            rel="noopener"
            >Contribute an example</a
          >
          <img class="fish" src="/gofish-logo.png" alt="GoFish Graphics logo" />
        </section>

        <div class="figures" ref="figuresEl"></div>
      </div>
    </div>

    <div class="empty" ref="emptyEl">
      <div class="emptyfig" ref="emptyFigEl"></div>
      <div class="msg">Nothing on view</div>
      <div class="sub">try another term</div>
    </div>

    <div class="searchcard" ref="cardEl">
      <div class="label">The GoFish Collection</div>
      <input
        class="search-input"
        ref="searchEl"
        type="text"
        placeholder="Search the hall…"
        aria-label="Search examples"
        autocomplete="off"
      />
      <div class="results-info" ref="countEl"></div>
      <div class="minimap" ref="minimapEl" title="Jump along the hall">
        <div class="win" ref="winEl"></div>
      </div>
    </div>

    <div class="scrollhint" ref="hintEl">scroll &rarr; to walk the hall</div>

    <button
      class="backstart"
      ref="backstartEl"
      type="button"
      aria-label="Return to the entrance"
    >
      &larr; Entrance
    </button>
  </div>
</template>

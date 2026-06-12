<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { docsLang } from "../../docsLang";

// Large static SVG / HTML chunks live in sibling fragment files imported as raw
// strings and rendered with v-html, so the 400KB of inline chart art never goes
// through the Vue template compiler.
import heroCards from "./fragments/hero-cards.html?raw";
import spectrumCards from "./fragments/spectrum-cards.html?raw";
import demoSvg from "./fragments/demo-svg.html?raw";
import codeStrip from "./fragments/code-strip.html?raw";
import footLogoRaw from "./fragments/foot-logo.txt?raw";

import "./landing.css";

// The data-URI fragment is stored with a trailing newline; trim for a clean src.
const footLogo = footLogoRaw.trim();

// The hero CTAs follow the reader's language preference (the toggle lives in the
// real navbar). VitePress intercepts internal <a href> for SPA navigation.
const getStartedHref = computed(() => `/${docsLang.value}/get-started`);
const examplesHref = computed(() => `/${docsLang.value}/examples/`);
const apiHref = computed(() => `/${docsLang.value}/api/core/chart`);

// The install chip follows the reader's language preference (the toggle lives in
// the real navbar). The computed text is SSR-safe; clipboard/document access is
// confined to the click handler below.
const installCmd = computed(() =>
  docsLang.value === "python"
    ? "pip install gofish-graphics"
    : "npm install gofish-graphics"
);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

function copyInstall(): void {
  const markCopied = () => {
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 1500);
  };
  try {
    navigator.clipboard.writeText(installCmd.value).then(markCopied, () => {
      fallbackCopy();
      markCopied();
    });
  } catch (_) {
    fallbackCopy();
    markCopied();
  }
}

function fallbackCopy(): void {
  const ta = document.createElement("textarea");
  ta.value = installCmd.value;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

const rootEl = ref<HTMLElement | null>(null);
const demoEl = ref<HTMLButtonElement | null>(null);
const pulltabEl = ref<HTMLElement | null>(null);
const jsReady = ref(false);

// Collected teardown callbacks (listeners, observers, injected nodes).
const cleanups: Array<() => void> = [];

const GFONTS_ID = "gofish-landing-fonts";
const GFONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Spline+Sans+Mono:wght@400;500&family=Spline+Sans:wght@400;500;600&display=swap";

function injectFonts(): void {
  if (document.getElementById(GFONTS_ID)) return;
  const pre1 = document.createElement("link");
  pre1.rel = "preconnect";
  pre1.href = "https://fonts.googleapis.com";
  pre1.dataset.gofishLandingFont = "1";
  const pre2 = document.createElement("link");
  pre2.rel = "preconnect";
  pre2.href = "https://fonts.gstatic.com";
  pre2.crossOrigin = "";
  pre2.dataset.gofishLandingFont = "1";
  const sheet = document.createElement("link");
  sheet.id = GFONTS_ID;
  sheet.rel = "stylesheet";
  sheet.href = GFONTS_HREF;
  document.head.append(pre1, pre2, sheet);
}

// ---- pull-apart explosion: click toggles, drag scrubs --pull, keyboard toggles.
function setState(on: boolean): void {
  const demo = demoEl.value;
  const tab = pulltabEl.value;
  if (!demo) return;
  demo.classList.toggle("exploded", on);
  demo.setAttribute("aria-pressed", on ? "true" : "false");
  if (tab) tab.textContent = on ? "put it back" : "pull apart";
}

function wireDemo(): void {
  const demo = demoEl.value;
  const tab = pulltabEl.value;
  if (!demo) return;

  let justDragged = false;

  const onClick = (e: MouseEvent) => {
    // Suppress the synthetic click that follows a real drag.
    if (justDragged) {
      justDragged = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setState(!demo.classList.contains("exploded"));
  };
  demo.addEventListener("click", onClick);
  cleanups.push(() => demo.removeEventListener("click", onClick));

  if (tab) {
    let dragging = false;
    let startY = 0;
    let startPull = 0;
    let moved = 0;
    let pull = 0;
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      startY = e.clientY;
      const cur = parseFloat(getComputedStyle(demo).getPropertyValue("--pull"));
      startPull = isNaN(cur)
        ? demo.classList.contains("exploded")
          ? 1
          : 0
        : cur;
      pull = startPull;
      demo.classList.add("dragging");
      try {
        tab.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      moved = Math.max(moved, Math.abs(e.clientY - startY));
      pull = clamp(startPull + (e.clientY - startY) / 120);
      demo.style.setProperty("--pull", String(pull));
    };
    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      demo.classList.remove("dragging");
      try {
        tab.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (moved < 6) {
        // Treat as a plain click: let the normal toggle run.
        demo.style.removeProperty("--pull");
        return;
      }
      // Real drag: snap, then let the CSS --pull transition animate.
      justDragged = true;
      setState(pull > 0.5);
      demo.style.removeProperty("--pull");
    };

    tab.addEventListener("pointerdown", onPointerDown);
    tab.addEventListener("pointermove", onPointerMove);
    tab.addEventListener("pointerup", endDrag);
    tab.addEventListener("pointercancel", endDrag);
    cleanups.push(() => {
      tab.removeEventListener("pointerdown", onPointerDown);
      tab.removeEventListener("pointermove", onPointerMove);
      tab.removeEventListener("pointerup", endDrag);
      tab.removeEventListener("pointercancel", endDrag);
    });
  }
}

// ---- hand-drawn pencil brackets beside the two Chart(...) blocks in the printout.
function wireBrackets(): void {
  const root = rootEl.value;
  if (!root) return;

  const buildBrackets = () => {
    const printout = root.querySelector(".printout");
    const layer = printout?.querySelector(
      ".code-brackets"
    ) as HTMLElement | null;
    // Two <pre> variants (JS / Python) live in the printout; only one is
    // visible at a time (CSS toggled off html[data-docs-lang]). Measure against
    // whichever is currently shown so the brackets land on the visible code.
    const pres = printout
      ? (Array.from(printout.querySelectorAll("pre")) as HTMLElement[])
      : [];
    const pre =
      pres.find((p) => getComputedStyle(p).display !== "none") ?? pres[0];
    if (!layer || !pre) return;
    layer.innerHTML = "";
    const lh = parseFloat(getComputedStyle(pre).lineHeight) || 24.6;
    const preTop = pre.offsetTop;
    const blocks = [
      { start: 3, n: 7, label: "bars" },
      { start: 10, n: 3, label: "ribbons" },
    ];
    const ns = "http://www.w3.org/2000/svg";
    const jit = (v: number) => (v + (Math.random() - 0.5) * 0.9).toFixed(2);
    const bx = 11;
    const tick = 8;
    blocks.forEach((bl) => {
      const top = preTop + bl.start * lh;
      const h = bl.n * lh;
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", String(tick + 3));
      svg.setAttribute("height", String(h));
      svg.setAttribute("viewBox", "0 0 " + (tick + 3) + " " + h.toFixed(1));
      svg.style.left = bx + "px";
      svg.style.top = top + "px";
      const d =
        "M " +
        jit(tick) +
        " " +
        jit(1.5) +
        " L " +
        jit(1.5) +
        " " +
        jit(3) +
        " L " +
        jit(1.8) +
        " " +
        (h - 3).toFixed(1) +
        " L " +
        jit(tick) +
        " " +
        (h - 1.5).toFixed(1);
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "var(--graphite)");
      path.setAttribute("stroke-width", "1.6");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      layer.appendChild(svg);
      const lab = document.createElement("span");
      lab.className = "clabel";
      lab.textContent = bl.label;
      lab.style.top = top + h / 2 - 9 + "px";
      lab.style.left = "0px";
      lab.style.visibility = "hidden";
      layer.appendChild(lab);
      const lw = lab.getBoundingClientRect().width;
      lab.style.left = bx - 7 - lw + "px";
      lab.style.visibility = "visible";
    });
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(buildBrackets);
  }
  buildBrackets();

  let rt: ReturnType<typeof setTimeout>;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(buildBrackets, 150);
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => {
    clearTimeout(rt);
    window.removeEventListener("resize", onResize);
  });

  // Flipping the language swaps which <pre> is visible; re-measure on the next
  // frame (after the CSS display toggle keyed off html[data-docs-lang] applies)
  // so the brackets re-align to the now-visible variant's line ranges.
  const stopLang = watch(docsLang, () => {
    requestAnimationFrame(buildBrackets);
  });
  cleanups.push(stopLang);
}

// ---- scroll reveal.
function wireReveals(): void {
  const root = rootEl.value;
  if (!root) return;
  const reveals = root.querySelectorAll(".reveal");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  reveals.forEach((el) => io.observe(el));
  cleanups.push(() => io.disconnect());
}

onMounted(() => {
  // Route-scoped desk: drives all html.landing-page body / navbar styling.
  document.documentElement.classList.add("landing-page");
  injectFonts();
  jsReady.value = true;
  wireDemo();
  wireBrackets();
  wireReveals();
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("landing-page");
  clearTimeout(copiedTimer);
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
});
</script>

<template>
  <div ref="rootEl" class="landing" :class="{ 'landing--js': jsReady }">
    <div class="sheet">
      <!-- ===================== HERO ===================== -->
      <section class="hero" aria-labelledby="hero-h">
        <!-- floating taped specimen cards -->
        <div class="hero-cards" v-html="heroCards"></div>

        <div class="inner">
          <h1 id="hero-h" class="rise" style="animation-delay: 0ms">GoFish</h1>
          <p class="subtitle rise" style="animation-delay: 90ms">
            an open-source visualization library for
            Python&nbsp;and&nbsp;JavaScript
          </p>
          <div class="cta-row rise" style="animation-delay: 180ms">
            <a class="btn btn-primary" :href="getStartedHref">Get Started</a>
            <a class="btn btn-secondary" :href="examplesHref">Examples</a>
            <a class="btn btn-secondary" :href="apiHref">API Reference</a>
          </div>
          <div class="rise" style="animation-delay: 270ms">
            <button
              type="button"
              class="install-chip"
              aria-label="Copy install command"
              @click="copyInstall"
            >
              <span class="install-cmd">{{ installCmd }}</span>
              <span class="install-glyph" aria-hidden="true">
                <span v-if="copied" class="install-copied">copied!</span>
                <svg
                  v-else
                  class="install-copy-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.3"
                >
                  <rect x="3.4" y="3.4" width="7.2" height="7.2" rx="1.6" />
                  <path
                    d="M9.8 3.4V2.4A1.4 1.4 0 0 0 8.4 1H2.4A1.4 1.4 0 0 0 1 2.4v6A1.4 1.4 0 0 0 2.4 9.8h1"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- ===================== SPECTRUM ===================== -->
      <section class="section spectrum" aria-labelledby="spec-h">
        <div class="head reveal">
          <h2 id="spec-h">
            Simple when you want it,<br />bespoke when you need it
          </h2>
        </div>

        <div class="track reveal">
          <div v-html="spectrumCards"></div>

          <!-- pencil axis line -->
          <svg
            class="track-line"
            viewBox="0 0 1080 60"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M6 40 Q270 32 540 38 T1066 30"
              fill="none"
              stroke="#4a4540"
              stroke-width="2.2"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
            <path
              d="M1057 22 L1068 30 L1056 38"
              fill="none"
              stroke="#4a4540"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="track-labels">
            <span>simple</span>
            <span>bespoke →</span>
          </div>
        </div>
      </section>

      <!-- ===================== COMPOSITION BAND ===================== -->
      <section class="band" aria-labelledby="comp-h">
        <div class="head reveal">
          <h2 id="comp-h" class="band-title">
            Because everything is a composition<br />of the same basic stuff
          </h2>
        </div>

        <!-- PULL-APART DEMO -->
        <div class="demo-wrap reveal">
          <button
            ref="demoEl"
            class="demo"
            aria-pressed="false"
            aria-label="Pull the chart apart into its layers"
          >
            <div class="card" v-html="demoSvg"></div>
            <span
              class="tape demo-tape"
              style="left: 12%; top: -11px; --tape-angle: -8deg"
              aria-hidden="true"
            ></span>
            <span
              class="tape demo-tape"
              style="right: 12%; top: -11px; --tape-angle: 5deg"
              aria-hidden="true"
            ></span>
            <span ref="pulltabEl" class="pulltab">pull apart</span>
          </button>
        </div>

        <!-- CODE STRIP -->
        <div class="codestrip reveal">
          <div v-html="codeStrip"></div>
        </div>

        <!-- made with … at MIT CSAIL -->
        <div class="band-foot">
          <span>made with</span>
          <img
            class="foot-logo"
            :src="footLogo"
            alt="GoFish"
            width="43"
            height="34"
          />
          <span>at</span>
          <a
            class="foot-vis"
            href="https://vis.mit.edu/"
            target="_blank"
            rel="noopener"
            aria-label="MIT Visualization Group"
          >
            <span>MIT</span>
            <svg
              class="vis-logo"
              viewBox="303 328 150 100"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#B94700"
                d="M306.8 397.9c0 1 .8 1.9 1.9 1.9h13.9c1 0 1.9-.9 1.9-1.9v-30.7c0-1-.9-1.9-1.9-1.9h-13.9c-1 0-1.9.9-1.9 1.9v30.7zm16.7 16.7c0 1 .8 1.9 1.9 1.9h13.9c1 0 1.9-.9 1.9-1.9v-13.9c0-1-.9-1.9-1.9-1.9h-13.9c-1 0-1.9.8-1.9 1.9v13.9zm16.8-16.7c0 1 .8 1.9 1.9 1.9h13.9c1 0 1.9-.9 1.9-1.9v-30.7c0-1-.9-1.9-1.9-1.9h-13.9c-1 0-1.9.9-1.9 1.9v30.7z"
              />
              <path
                fill="#F0B323"
                d="M369.6 414.6c0 1 .8 1.9 1.9 1.9h13.9c1 0 1.9-.9 1.9-1.9v-47.4c0-1-.9-1.9-1.9-1.9h-13.9c-1 0-1.9.9-1.9 1.9v47.4zm.5-62.3c0 1 .8 1.9 1.9 1.9h13.9c1 0 1.9-.9 1.9-1.9v-14c0-1-.9-1.9-1.9-1.9H372c-1 0-1.9.9-1.9 1.9v14z"
              />
              <path
                fill="#898D8D"
                d="M398.9 377c0 1 .8 1.9 1.9 1.9h47.4c1 0 1.9-.9 1.9-1.9v-9.8c0-1-.9-1.9-1.9-1.9h-47.4c-1 0-1.9.9-1.9 1.9v9.8zm18.8 18.8c0 1 .8 1.9 1.9 1.9h9.8c1 0 1.9-.9 1.9-1.9V386c0-1-.9-1.9-1.9-1.9h-9.8c-1 0-1.9.9-1.9 1.9v9.8zm18.9 10.5c0 1 .8 1.9 1.9 1.9h9.8c1 0 1.9-.9 1.9-1.9v-7.7c0-1-.9-1.9-1.9-1.9h-9.8c-1 0-1.9.9-1.9 1.9v7.7zm-37.7-23c0 1 .8 1.9 1.9 1.9h9.8c1 0 1.9-.9 1.9-1.9v-5.6c0-1-.9-1.9-1.9-1.9h-9.8c-1 0-1.9.9-1.9 1.9v5.6zm0 31.3c0 1 .8 1.9 1.9 1.9h47.4c1 0 1.9-.9 1.9-1.9v-9.8c0-1-.9-1.9-1.9-1.9h-47.4c-1 0-1.9.9-1.9 1.9v9.8z"
              />
            </svg>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>

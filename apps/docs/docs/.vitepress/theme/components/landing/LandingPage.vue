<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { docsLang } from "../../docsLang";
import CtaBlock from "./CtaBlock.vue";

// Large static SVG / HTML chunks live in sibling fragment files imported as raw
// strings and rendered with v-html, so the 400KB of inline chart art never goes
// through the Vue template compiler.
import heroCards from "./fragments/hero-cards.html?raw";
import spectrumCards from "./fragments/spectrum-cards.html?raw";
import demoSvg from "./fragments/demo-svg.html?raw";
import codeStrip from "./fragments/code-strip.html?raw";

import "./landing.css";

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
  // The site-wide preconnects to fonts.googleapis.com / fonts.gstatic.com are
  // already emitted by config.mts; we only need the stylesheet link here.
  const sheet = document.createElement("link");
  sheet.id = GFONTS_ID;
  sheet.rel = "stylesheet";
  sheet.href = GFONTS_HREF;
  document.head.append(sheet);
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
    const printout = root.querySelector(".printout") as HTMLElement | null;
    const layer = printout?.querySelector(
      ".code-brackets"
    ) as HTMLElement | null;
    if (!printout || !layer) return;
    // Two <pre> variants (JS / Python) live in the printout; only one is
    // visible at a time (CSS toggled off html[data-docs-lang]). Measure against
    // whichever is currently shown so the brackets land on the visible code.
    const pres = Array.from(printout.querySelectorAll("pre")) as HTMLElement[];
    const pre =
      pres.find((p) => getComputedStyle(p).display !== "none") ?? pres[0];
    if (!pre) return;
    layer.innerHTML = "";
    // Each highlighted block is wrapped in a `.cblk` span carrying its label.
    // Measure the real markup so the brackets track the actual rendered line
    // ranges (no magic line numbers / hardcoded line-height).
    const blocks = Array.from(pre.querySelectorAll(".cblk")) as HTMLElement[];
    // The brackets layer is inset:0 within the (positioned) .printout, so
    // measure each block relative to .printout's box.
    const printRect = printout.getBoundingClientRect();
    const ns = "http://www.w3.org/2000/svg";
    const jit = (v: number) => (v + (Math.random() - 0.5) * 0.9).toFixed(2);
    const bx = 11;
    const tick = 8;
    blocks.forEach((bl) => {
      const r = bl.getBoundingClientRect();
      const top = r.top - printRect.top;
      const h = r.height;
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
      lab.textContent = bl.dataset.label ?? "";
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
          <!-- The wordmark carries an inked "alpha" rubber stamp slapped over
               its right end at an angle. Kept as real text so it is announced to
               screen readers. The release-line tag lives under the install chip
               (CtaBlock, version prop). -->
          <h1 id="hero-h" class="wordmark rise" style="animation-delay: 0ms">
            GoFish<span class="hero-stamp" style="animation-delay: 240ms"
              >alpha</span
            >
          </h1>
          <p class="subtitle rise" style="animation-delay: 90ms">
            an open-source visualization library for
            JavaScript&nbsp;and&nbsp;Python
          </p>
          <div class="rise" style="animation-delay: 180ms">
            <CtaBlock version />
          </div>
        </div>
      </section>

      <!-- ===================== SPECTRUM ===================== -->
      <section class="section spectrum" aria-labelledby="spec-h">
        <div class="head reveal">
          <h2 id="spec-h" class="spec-title">
            <span class="nowrap">Simple when you want,</span>{{ " " }}
            <span class="nowrap">complex when you need</span>
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
              stroke="var(--graphite)"
              stroke-width="2.2"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
            <path
              d="M1057 22 L1068 30 L1056 38"
              fill="none"
              stroke="var(--graphite)"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="track-labels">
            <span>simple</span>
            <span>complex</span>
          </div>
        </div>
      </section>

      <!-- ===================== COMPOSITION BAND ===================== -->
      <section class="band" aria-labelledby="comp-h">
        <div class="head reveal">
          <h2 id="comp-h" class="band-title">
            Because graphics are all made of the same stuff
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
            <div class="card">
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
              <div class="demo-art" v-html="demoSvg"></div>
            </div>
            <span ref="pulltabEl" class="pulltab">pull apart</span>
          </button>
        </div>

        <!-- CODE STRIP -->
        <div class="codestrip reveal">
          <div v-html="codeStrip"></div>
        </div>

        <!-- closing CTA: easy to get started after reading the whole page -->
        <div class="band-cta reveal">
          <CtaBlock />
        </div>

        <!-- made with … at MIT VIS -->
        <div class="band-foot">
          <span>made with</span>
          <img
            class="foot-logo"
            src="/gofish-logo.png"
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
            <svg
              class="vis-logo"
              viewBox="303 336 150 81"
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

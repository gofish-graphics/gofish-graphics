<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { docsLang, examplesHref } from "../../docsLang";
import CtaBlock from "./CtaBlock.vue";
import PictureCard from "./PictureCard.vue";
import { HERO, SPECTRUM, type HeroCard } from "./landingCards";
// The stamp on the wordmark shows the package version, inlined at build time.
import { version as VERSION } from "../../../../../../../packages/gofish-graphics/package.json";

// Large static SVG / HTML chunks live in sibling fragment files imported as raw
// strings and rendered with v-html, so the inline chart art never goes through
// the Vue template compiler.
import demoSvg from "./fragments/demo-svg.html?raw";
import codeStrip from "./fragments/code-strip.html?raw";

import "./landing.css";

const rootEl = ref<HTMLElement | null>(null);
const demoEl = ref<HTMLButtonElement | null>(null);
const pulltabEl = ref<HTMLElement | null>(null);
const railEl = ref<HTMLElement | null>(null);
const axisEl = ref<HTMLElement | null>(null);
const knobEl = ref<HTMLElement | null>(null);
// Whether the spectrum row overflows, so it scrolls (narrow screens only). Only
// then is it a tab stop with a label, so keyboard users can scroll it.
const railScrolls = ref(false);
const allExamplesHref = computed(() => examplesHref(docsLang.value));

// The taped cards are taped down one after another as the page loads
// (landing.css, gf-hang), in list order, starting just after load. The
// hero's cards and the spectrum row's start together.
const dropDelay = (i: number): Record<string, string> => ({
  "--drop-delay": `${250 + 60 * i}ms`,
});

// Place a hero card floating around the title (wide screens); the cards
// are taped down one after another, in list order. A "center" card is centered
// here (left: 0; right: 0; margin-inline: auto); landing.css scales the width.
function floatStyle(card: HeroCard, i: number): Record<string, string> {
  const f = card.float;
  const style: Record<string, string> = {
    top: `${f.y}px`,
    "--fc-w": `${f.width}px`,
    ...dropDelay(i),
  };
  if (f.side === "center") {
    style.left = "0";
    style.right = "0";
    style.marginInline = "auto";
  } else style[f.side] = `${f.x}px`;
  return style;
}
// The hero list never changes, so place and group its cards once.
const FLOAT_STYLES = HERO.map(floatStyle);
const COLLAGE_COLUMNS = (["left", "right"] as const).map((column) =>
  HERO.filter((c) => c.column === column)
);
const COLLAGE_WIDE = HERO.filter((c) => c.column === "wide");
// The collage cards drop in in list order too, whatever column they are in.
const COLLAGE_DROP = Object.fromEntries(
  HERO.map((c, i) => [c.id, dropDelay(i)])
);

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
  // A mouse drag is followed by a click, a touch drag is not: forget the drag
  // when the next press starts, so it never swallows that press's own click.
  const onPress = () => {
    justDragged = false;
  };
  demo.addEventListener("pointerdown", onPress);
  cleanups.push(() => demo.removeEventListener("pointerdown", onPress));

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

// ---- spectrum swipe row (narrow screens): a dot on the pencil line under the
// row tracks how far it has been swiped, from 4% to 92% of the line. The
// sizes are measured on mount and resize, so a scroll only sets a transform.
// The same measure says whether the row scrolls at all (railScrolls).
function wireRail(): void {
  const rail = railEl.value;
  const axis = axisEl.value;
  const knob = knobEl.value;
  if (!rail || !axis || !knob) return;
  let axisW = 0;
  let max = 0;
  const update = () => {
    const f = max > 0 ? rail.scrollLeft / max : 0;
    knob.style.transform = `translateX(${(0.04 + 0.88 * f) * axisW}px)`;
  };
  const measure = () => {
    axisW = axis.clientWidth;
    max = rail.scrollWidth - rail.clientWidth;
    // On wide screens the row does not clip (overflow visible), though its
    // tilted cards still overflow it by a few pixels.
    railScrolls.value =
      max > 0 && getComputedStyle(rail).overflowX !== "visible";
    update();
  };
  rail.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", measure);
  cleanups.push(() => {
    rail.removeEventListener("scroll", update);
    window.removeEventListener("resize", measure);
  });
  measure();
}

onMounted(() => {
  // Route-scoped desk: drives all html.landing-page body / navbar styling.
  document.documentElement.classList.add("landing-page");
  injectFonts();
  wireRail();
  wireDemo();
  wireBrackets();
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("landing-page");
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
});
</script>

<template>
  <div ref="rootEl" class="landing">
    <div class="sheet">
      <!-- ===================== HERO ===================== -->
      <section class="hero" aria-labelledby="hero-h">
        <!-- wide screens: the hero's cards floating around the title, each
             linking to its example page. The container is display:none
             at 1100px and below, so phones never fetch their lazy pictures. -->
        <div class="hero-cards">
          <PictureCard
            v-for="(card, i) in HERO"
            :key="card.id"
            :card="card"
            class="float-card"
            :style="FLOAT_STYLES[i]"
          />
        </div>

        <div class="inner">
          <!-- The wordmark carries an inked rubber stamp of the version
               beside its right end. Kept as real text so it is announced to
               screen readers. -->
          <h1 id="hero-h" class="wordmark">
            GoFish<span class="hero-stamp">v{{ VERSION }}</span>
          </h1>
          <p class="subtitle">
            an open-source visualization library for
            JavaScript&nbsp;and&nbsp;Python
          </p>
          <div>
            <CtaBlock />
          </div>
        </div>

        <!-- phones and tablets, where the floating cards are hidden: the
             same cards as a pile, each linking to its example page -->
        <div class="collage-wrap">
          <div class="collage">
            <!-- two columns that stack on their own, then the wide cards
                 across both -->
            <div
              v-for="(cards, column) in COLLAGE_COLUMNS"
              :key="column"
              class="collage-col"
            >
              <PictureCard
                v-for="card in cards"
                :key="card.id"
                :card="card"
                :style="COLLAGE_DROP[card.id]"
              />
            </div>
            <PictureCard
              v-for="card in COLLAGE_WIDE"
              :key="card.id"
              :card="card"
              class="wide"
              :style="COLLAGE_DROP[card.id]"
            />
          </div>
          <p class="collage-more">
            <a :href="allExamplesHref">see all examples →</a>
          </p>
        </div>
      </section>

      <!-- ===================== SPECTRUM ===================== -->
      <section class="section spectrum" aria-labelledby="spec-h">
        <div class="head">
          <h2 id="spec-h" class="spec-title">
            <span class="nowrap">Simple when you want,</span>{{ " " }}
            <span class="nowrap">complex when you need</span>
          </h2>
        </div>

        <div class="track">
          <!-- a row on wide screens; a swipe row on narrow ones -->
          <div
            ref="railEl"
            class="specimens"
            :tabindex="railScrolls ? 0 : undefined"
            :aria-label="
              railScrolls ? 'Four charts, from simple to complex' : undefined
            "
          >
            <PictureCard
              v-for="(card, i) in SPECTRUM"
              :key="card.id"
              :card="card"
              lift
              class="specimen"
              :style="dropDelay(i)"
              role="group"
              :aria-label="`${i + 1} of ${SPECTRUM.length}`"
            />
          </div>

          <!-- the pencil axis under the row, simple to complex; on narrow
               screens a dot moves along it as the row is swiped (wireRail).
               The line stretches with the row; its arrowhead keeps its shape. -->
          <div class="spec-axis" aria-hidden="true">
            <div ref="axisEl" class="axis-line">
              <svg
                class="axis-stroke"
                viewBox="0 0 1080 60"
                preserveAspectRatio="none"
              >
                <path d="M6 40 Q270 32 540 38 T1066 30" />
              </svg>
              <svg class="axis-head" viewBox="0 0 12 16">
                <path d="M1 0.5 L11.5 8 L0.5 15.5" />
              </svg>
              <span ref="knobEl" class="knob"></span>
            </div>
            <span class="lbl l">simple</span>
            <span class="lbl r">complex</span>
          </div>
        </div>
      </section>

      <!-- ===================== COMPOSITION BAND ===================== -->
      <section class="band" aria-labelledby="comp-h">
        <div class="head">
          <h2 id="comp-h" class="band-title">
            Because graphics are all made of the same stuff
          </h2>
        </div>

        <!-- PULL-APART DEMO -->
        <div class="demo-wrap">
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
        <div class="codestrip">
          <div v-html="codeStrip"></div>
        </div>

        <!-- closing CTA: easy to get started after reading the whole page -->
        <div class="band-cta">
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

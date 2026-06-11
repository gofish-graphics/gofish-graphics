<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import {
  Chart,
  spread,
  stack,
  derive,
  layer,
  selectAll,
  rect,
  area,
  group,
  clock,
} from "gofish-graphics";
import _ from "lodash";
import { docsLang } from "../docsLang";
const { orderBy } = _;

const rootEl = ref<HTMLElement | null>(null);
const copied = ref(false);
const CHART_WIDTH = 500;
const CHART_HEIGHT = 300;

// The install command to copy follows the reader's language preference.
// Both code snippets are rendered; CSS (keyed off <html data-docs-lang>) shows
// the right one with no flash — see <style> below.
const installCmd = computed(() =>
  docsLang.value === "python"
    ? "pip install gofish-graphics"
    : "npm install gofish-graphics"
);

const seafood = [
  { lake: "Lake A", species: "Bass", count: 23 },
  { lake: "Lake A", species: "Trout", count: 31 },
  { lake: "Lake A", species: "Catfish", count: 29 },
  { lake: "Lake A", species: "Perch", count: 12 },
  { lake: "Lake A", species: "Salmon", count: 8 },
  { lake: "Lake B", species: "Bass", count: 25 },
  { lake: "Lake B", species: "Trout", count: 34 },
  { lake: "Lake B", species: "Catfish", count: 41 },
  { lake: "Lake B", species: "Perch", count: 21 },
  { lake: "Lake B", species: "Salmon", count: 16 },
  { lake: "Lake C", species: "Bass", count: 15 },
  { lake: "Lake C", species: "Trout", count: 25 },
  { lake: "Lake C", species: "Catfish", count: 31 },
  { lake: "Lake C", species: "Perch", count: 22 },
  { lake: "Lake C", species: "Salmon", count: 31 },
  { lake: "Lake D", species: "Bass", count: 12 },
  { lake: "Lake D", species: "Trout", count: 17 },
  { lake: "Lake D", species: "Catfish", count: 23 },
  { lake: "Lake D", species: "Perch", count: 23 },
  { lake: "Lake D", species: "Salmon", count: 41 },
  { lake: "Lake E", species: "Bass", count: 7 },
  { lake: "Lake E", species: "Trout", count: 9 },
  { lake: "Lake E", species: "Catfish", count: 13 },
  { lake: "Lake E", species: "Perch", count: 20 },
  { lake: "Lake E", species: "Salmon", count: 40 },
  { lake: "Lake F", species: "Bass", count: 4 },
  { lake: "Lake F", species: "Trout", count: 7 },
  { lake: "Lake F", species: "Catfish", count: 9 },
  { lake: "Lake F", species: "Perch", count: 21 },
  { lake: "Lake F", species: "Salmon", count: 47 },
];

const jsCode = `layer({ coord: clock() }, [
    Chart(seafood)
        .flow(
            spread({ by: "lake", dir: "x", spacing: (2 * Math.PI) / 6,
                     mode: "center", y: 50, label: false }),
            derive((d) => orderBy(d, "count")),
            stack({ by: "species", dir: "y", label: false }),
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars")),
    Chart(selectAll("bars"))
        .flow(group({ by: "datum.species" }))
        .mark(area({ opacity: 0.8 })),
]).render(root, { w: ${CHART_WIDTH}, h: ${CHART_HEIGHT}, transform: { x: 250, y: 150 }, axes: true });`;

const pyCode = `Layer({"coord": clock()}, [
    chart(seafood)
        .flow(
            spread(by="lake", dir="x", spacing=2 * math.pi / 6,
                   mode="center", y=50, label=False),
            derive(lambda d: sorted(d, key=lambda r: r["count"])),
            stack(by="species", dir="y", label=False),
        )
        .mark(rect(h="count", fill="species").name("bars")),
    chart(selectAll("bars"))
        .flow(group(by="datum.species"))
        .mark(area(opacity=0.8)),
]).render(w=${CHART_WIDTH}, h=${CHART_HEIGHT}, axes=True)`;

function escapeHtml(src: string): string {
  return src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Lightweight highlighter shared by the JS and Python snippets. Strings are
// tagged first so later passes never reach inside an injected <span>.
function highlight(src: string): string {
  let s = escapeHtml(src);

  // Strings
  s = s.replace(
    /("[^"]*"|'[^']*'|`[^`]*`)/g,
    '<span class="tok-str">$1</span>'
  );
  // Keywords (JS + Python). NB: do not add `class` here — it would match the
  // `class` attribute inside the <span> tags injected by the strings pass.
  s = s.replace(
    /\b(import|from|const|let|return|new|export|function|if|else|await|async|lambda|def|None|True|False|and|or|not|in)\b/g,
    '<span class="tok-kw">$1</span>'
  );
  // Numbers
  s = s.replace(
    /\b(0x[\da-fA-F]+|\d+)(?![\w])/g,
    '<span class="tok-num">$1</span>'
  );
  // Methods (simple heuristic: dot followed by ident)
  s = s.replace(/\.(\w+)\b/g, '.<span class="tok-fn">$1</span>');
  // Object keys inside { } (heuristic)
  s = s.replace(/\{([^}]+)\}/g, (m, inner) => {
    const highlighted = inner.replace(
      /\b([a-zA-Z_][\w]*)\b(?=\s*:)/g,
      '<span class="tok-prop">$1</span>'
    );
    return "{" + highlighted + "}";
  });
  return s;
}

const highlightedJs = highlight(jsCode);
const highlightedPy = highlight(pyCode);

function renderFixedChart() {
  const root = rootEl.value;
  if (!root) return;

  // Re-render chart with new dimensions
  root.innerHTML = "";
  const centerX = CHART_WIDTH / 2;
  const centerY = CHART_HEIGHT / 2;

  layer({ coord: clock() }, [
    Chart(seafood)
      .flow(
        spread({
          by: "lake",
          dir: "x",
          spacing: (2 * Math.PI) / 6,
          mode: "center",
          y: 50,
          label: false,
        }),
        derive((d) => orderBy(d, "count")),
        stack({ by: "species", dir: "y", label: false })
      )
      .mark(rect({ h: "count", fill: "species" }).name("bars")),
    Chart(selectAll("bars"))
      .flow(group({ by: "datum.species" }))
      .mark(area({ opacity: 0.8 })),
  ]).render(root, {
    w: CHART_WIDTH,
    h: CHART_HEIGHT,
    transform: { x: centerX, y: centerY },
    axes: true,
  });

  // Render in a fixed coordinate system, then scale the SVG to fit available width.
  const svg = root.querySelector("svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
  }
}

onMounted(() => {
  renderFixedChart();
});

async function copyInstall() {
  try {
    await navigator.clipboard.writeText(installCmd.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = installCmd.value;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }
}
</script>

<template>
  <div
    class="hero-snippet"
    :style="{
      '--hero-chart-width': `${CHART_WIDTH}px`,
    }"
  >
    <div
      class="install-pill hero-lang-js"
      role="button"
      aria-label="Copy install command"
      @click="copyInstall"
    >
      <code class="cmd"
        >npm install <span class="pkg">gofish-graphics</span></code
      >
      <span class="copy">{{ copied ? "Copied" : "Copy" }}</span>
    </div>
    <div
      class="install-pill hero-lang-python"
      role="button"
      aria-label="Copy install command"
      @click="copyInstall"
    >
      <code class="cmd"
        >pip install <span class="pkg">gofish-graphics</span></code
      >
      <span class="copy">{{ copied ? "Copied" : "Copy" }}</span>
    </div>
    <div ref="rootEl" class="viz"></div>
    <pre
      class="code hero-lang-js"
    ><code class="language-ts" v-html="highlightedJs"></code></pre>
    <pre
      class="code hero-lang-python"
    ><code class="language-python" v-html="highlightedPy"></code></pre>
  </div>
</template>

<style scoped>
.hero-snippet {
  padding: 8px;
  display: grid;
  gap: 12px;
  margin-left: auto;
  width: min(640px, 100%);
}
.pkg {
  color: #4cb05e;
}

/* The .hero-lang-js / .hero-lang-python visibility rules live in the global
   theme/style.css — keyed off <html data-docs-lang>, they must not go through
   Vue's scoped-CSS transform. */

.install-pill {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin-top: 2rem;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.05s ease;
}

.install-pill:hover {
  background: var(--vp-c-default-soft);
}

.install-pill:active {
  transform: translateY(1px);
}

.install-pill .cmd {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-1);
}

.install-pill .copy {
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.viz {
  width: 100%;
  max-width: var(--hero-chart-width);
  border-radius: 12px;
  display: block;
  overflow: hidden;
}

.viz :deep(svg) {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
}

.code {
  margin: 0;
  padding: 16px;
  background: var(--vp-code-block-bg, var(--vp-code-bg));
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: auto;
  text-align: left;
}

.code code {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre;
  display: block;
  text-align: left;
}

/* Token colors harmonized to example theme */
/* Use deep selectors so styles apply to v-html content */
:deep(.tok-kw) {
  color: var(--vp-c-purple-2, #7348c2);
}

:deep(.tok-str) {
  color: var(--vp-c-green-2, #a5e075);
}

:deep(.tok-num) {
  color: var(--vp-c-orange-2, #025cc5);
}

:deep(.tok-fn) {
  color: var(--vp-c-blue-2, #7348c2);
}

:deep(.tok-prop) {
  color: var(--vp-c-cyan-2, #000);
}

/* Entrance animation for the chart only. The install pill and code panels are
   intentionally left un-animated: with both languages rendered and toggled via
   `display`, an animation would re-fire every time the language is switched. */
@keyframes slideFadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-snippet .viz {
  animation: slideFadeUp 600ms ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .hero-snippet .viz {
    animation: none !important;
  }
}
</style>

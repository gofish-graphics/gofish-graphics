<script setup lang="ts">
import { computed, watch } from "vue";
import { useData, useRoute, useRouter } from "vitepress";
import { docsLang, setDocsLang, syncDocsLang } from "../docsLang";

const props = withDefaults(
  defineProps<{ placement?: "nav" | "sidebar" | "localnav" }>(),
  {
    placement: "nav",
  }
);

const route = useRoute();
const router = useRouter();
const { theme } = useData();

// The nav-bar copy of the toggle shows only on the home page — every doc page
// carries the toggle in its sidebar instead, so the nav copy would be a
// duplicate. The localnav copy is the same home-only toggle, docked into the
// fixed "Return to top" bar that replaces the navbar once you scroll the long
// landing page on narrow screens (so the switcher persists there). The sidebar
// copy shows wherever it renders, except the language-agnostic internals wiki.
const hidden = computed(() => {
  const p = route.path;
  if (props.placement === "nav" || props.placement === "localnav") {
    return !(p === "/" || p === "/index.html" || p === "/index");
  }
  return /^\/internals(\/|\.html|$)/.test(p);
});

const LANGS = [
  { id: "python", label: "Python" },
  { id: "js", label: "JavaScript" },
] as const;
type Lang = (typeof LANGS)[number]["id"];

// Keep docsLang + <html data-docs-lang> aligned with the route. The active
// button is styled purely from that attribute (see <style>), so it is already
// correct on first paint — no flash.
watch(
  () => route.path,
  (p) => syncDocsLang(p),
  { immediate: true }
);

// Strip the .html suffix, trailing slash, and /index so paths coming from the
// router and from the build-time manifest compare equal.
function norm(path: string): string {
  const s = path
    .replace(/\.html$/, "")
    .replace(/\/index$/, "")
    .replace(/\/$/, "");
  return s || "/";
}

// Map of normalized path -> doc route, from the build-time manifest in
// themeConfig (see collectDocRoutes in config.mts).
const routeByNorm = computed(() => {
  const routes = ((theme.value as Record<string, unknown>).docRoutes ??
    []) as string[];
  return new Map(routes.map((url) => [norm(url), url]));
});

function switchTo(lang: Lang) {
  setDocsLang(lang);

  // Already inside this language's docs — nothing to navigate.
  if (route.path.startsWith(`/${lang}/`)) return;

  // On the shared landing page (or any non-sectioned route) just record the
  // preference — don't pull the reader off the page.
  if (!/^\/(js|python)\//.test(route.path)) return;

  const map = routeByNorm.value;
  const rest = route.path.replace(/^\/(js|python)/, "");
  const target =
    map.get(norm(`/${lang}${rest}`)) ?? map.get(`/${lang}/get-started`);
  if (target) router.go(target);
}
</script>

<template>
  <div
    v-if="!hidden"
    class="lang-toggle"
    :class="`lang-toggle--${props.placement}`"
  >
    <span v-if="props.placement === 'sidebar'" class="lang-toggle__label">
      Language
    </span>
    <div
      class="lang-toggle__group"
      role="group"
      aria-label="Documentation language"
    >
      <button
        v-for="lang in LANGS"
        :key="lang.id"
        type="button"
        class="lang-toggle__btn"
        :data-lang="lang.id"
        :aria-label="lang.label"
        :aria-pressed="docsLang === lang.id"
        @click="switchTo(lang.id)"
      >
        <svg
          v-if="lang.id === 'js'"
          class="lang-toggle__icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <rect width="16" height="16" rx="3" fill="#f7df1e" />
          <text
            x="14"
            y="13.4"
            font-size="8.5"
            font-weight="700"
            fill="#000"
            text-anchor="end"
            font-family="system-ui, -apple-system, sans-serif"
          >
            JS
          </text>
        </svg>
        <svg
          v-else
          class="lang-toggle__icon"
          viewBox="0 0 256 255"
          aria-hidden="true"
        >
          <path
            fill="#366994"
            d="M126.916.072c-64.832 0-60.784 28.115-60.784 28.115l.072 29.128h61.868v8.745H41.631S.145 61.355.145 126.77c0 65.417 36.21 63.097 36.21 63.097h21.61v-30.356s-1.165-36.21 35.632-36.21h61.362s34.475.557 34.475-33.319V33.97S194.67.072 126.916.072zM92.802 19.66a11.12 11.12 0 0 1 11.13 11.13 11.12 11.12 0 0 1-11.13 11.13 11.12 11.12 0 0 1-11.13-11.13 11.12 11.12 0 0 1 11.13-11.13z"
          />
          <path
            fill="#ffc331"
            d="M128.757 254.126c64.832 0 60.784-28.115 60.784-28.115l-.072-29.128h-61.868v-8.745h86.441s41.486 4.705 41.486-60.711c0-65.416-36.21-63.096-36.21-63.096h-21.61v30.355s1.165 36.21-35.632 36.21h-61.362s-34.475-.557-34.475 33.32v56.013s-5.235 33.897 62.518 33.897zm34.114-19.586a11.12 11.12 0 0 1-11.13-11.13 11.12 11.12 0 0 1 11.13-11.131 11.12 11.12 0 0 1 11.13 11.13 11.12 11.12 0 0 1-11.13 11.13z"
          />
        </svg>
        <span>{{ lang.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.lang-toggle__group {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.lang-toggle__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.2s,
    background-color 0.2s;
}

.lang-toggle__btn:hover {
  color: var(--vp-c-text-1);
}

/* The active-button styling is keyed off <html data-docs-lang> and lives in the
   global theme/style.css so it bypasses Vue's scoped-CSS transform. */

.lang-toggle__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: block;
}

/* Nav placement: a small gap from the logo. */
.lang-toggle--nav {
  margin-left: 24px;
}

/* On narrow screens the navbar collapses its menu links behind the hamburger,
   but the content-after slot (search, social icon, hamburger, and this toggle)
   stays visible. The home page is the only route showing the nav copy and it has
   no sidebar fallback, so keep the toggle here rather than hiding it — just
   collapse it to icon-only buttons with a tighter gap so it fits beside the
   GitHub icon and hamburger. The buttons keep their aria-label, so hiding the
   text labels doesn't cost the accessible name. */
@media (max-width: 768px) {
  .lang-toggle--nav {
    margin-left: 8px;
  }
  .lang-toggle--nav .lang-toggle__btn {
    padding: 5px 8px;
  }
  .lang-toggle--nav .lang-toggle__btn span {
    display: none;
  }
}

/* Sidebar placement: stacked label above a full-width control. */
.lang-toggle--sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0 4px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.lang-toggle--sidebar .lang-toggle__label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
}

.lang-toggle--sidebar .lang-toggle__group {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.lang-toggle--sidebar .lang-toggle__btn {
  justify-content: center;
}
</style>

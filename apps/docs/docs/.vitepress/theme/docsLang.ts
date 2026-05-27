import { ref } from "vue";

// Shared documentation-language state. The source of truth is the
// `<html data-docs-lang>` attribute, set before first paint by the inline
// script in config.mts — so the toggle and hero render correctly with no
// flash. This module keeps a reactive mirror of that attribute and persists
// explicit choices.
export type DocsLang = "js" | "python";

const STORAGE_KEY = "gofish-docs-lang";
const ATTR = "data-docs-lang";

function fromAttr(): DocsLang {
  if (typeof document !== "undefined") {
    const v = document.documentElement.getAttribute(ATTR);
    if (v === "js" || v === "python") return v;
  }
  return "js";
}

export const docsLang = ref<DocsLang>(fromAttr());

function preference(): DocsLang | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "js" || v === "python" ? v : null;
}

// Effective language for a route: a `/js/` or `/python/` section wins; the
// home page (and anything else) falls back to the saved preference.
export function effectiveLang(path: string): DocsLang {
  if (path.startsWith("/python/") || path === "/python") return "python";
  if (path.startsWith("/js/") || path === "/js") return "js";
  return preference() ?? "js";
}

function writeAttr(lang: DocsLang): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(ATTR, lang);
  }
}

// Keep the mirror + the <html> attribute in step with the current route.
export function syncDocsLang(path: string): void {
  const l = effectiveLang(path);
  docsLang.value = l;
  writeAttr(l);
}

// Persist an explicit choice made via the language toggle.
export function setDocsLang(lang: DocsLang): void {
  docsLang.value = lang;
  writeAttr(lang);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang);
  }
}

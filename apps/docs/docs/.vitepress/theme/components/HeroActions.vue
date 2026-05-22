<script setup lang="ts">
import { onMounted, watch } from "vue";
import { docsLang } from "../docsLang";

// The home-page hero buttons come from frontmatter (a static link each). This
// component rewrites their hrefs to the reader's preferred language, and keeps
// them in sync when the language toggle changes. Only the href changes — the
// button text is language-agnostic — so the rewrite is visually invisible.
function applyLang(): void {
  if (typeof document === "undefined") return;
  const lang = docsLang.value;
  document
    .querySelectorAll<HTMLAnchorElement>(".VPHero .actions a")
    .forEach((a) => {
      const href = a.getAttribute("href");
      if (href)
        a.setAttribute("href", href.replace(/^\/(js|python)\//, `/${lang}/`));
    });
}

onMounted(() => {
  applyLang();
  watch(docsLang, applyLang);
});
</script>

<template>
  <span class="hero-actions-lang" aria-hidden="true" style="display: none" />
</template>

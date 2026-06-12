<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { docsLang } from "../../docsLang";

// Shared call-to-action: the three nav buttons + the copy-to-clipboard install
// chip. Rendered twice on the landing page (hero and closing band). Each
// instance owns its own `copied` flash so clicking one chip never lights up the
// other.
//
// All links follow the reader's language preference (the toggle lives in the
// real navbar). VitePress intercepts internal <a href> for SPA navigation.
const getStartedHref = computed(() => `/${docsLang.value}/get-started`);
const examplesHref = computed(() => `/${docsLang.value}/examples/`);
const apiHref = computed(() => `/${docsLang.value}/api/core/chart`);

// The computed text is SSR-safe; clipboard/document access is confined to the
// click handler below.
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

onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <div class="cta-row">
    <a class="btn btn-primary" :href="getStartedHref">Get Started</a>
    <a class="btn btn-secondary" :href="examplesHref">Examples</a>
    <a class="btn btn-secondary" :href="apiHref">API Reference</a>
  </div>
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
</template>

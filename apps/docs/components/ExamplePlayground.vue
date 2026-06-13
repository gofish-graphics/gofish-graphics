<script setup lang="ts">
/**
 * ExamplePlayground — the ONLY page that mounts the Sandpack editor.
 *
 * Reads the example id from `?id=<id>` in the URL, looks it up in the
 * build-time gallery data layer, and lazily mounts `GoFishLive` (the Sandpack
 * wrapper). The Sandpack bundle is pulled in via a dynamic import inside
 * `defineAsyncComponent`, so it ships only on this route — never on the
 * lightweight generated example pages.
 *
 * GoFishLive wraps `vitepress-plugin-sandpack`'s <Sandbox>, which reconstructs
 * its virtual files from (a) a `codeOptions` prop — a URI-encoded JSON array of
 * per-file fence-info strings — and (b) the default slot, one <div><pre>…</pre>
 * per file, in the same order. We reproduce that shape here from `code` and the
 * optional `datasetCode`.
 */
import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import { data as storyData } from "../docs/.vitepress/data/storyExamples.data.js";

// Lazy: Sandpack + its deps only load when this component mounts.
const GoFishLive = defineAsyncComponent(() =>
  import("./GoFishLive").then((m) => m.GoFishLive)
);

interface Example {
  id: string;
  title: string;
  description: string;
  code: string;
  datasetCode?: string;
  npmDeps?: Record<string, string>;
}

const byId = storyData.byId as Record<string, Example>;

const id = ref<string | null>(null);

onMounted(() => {
  if (typeof window !== "undefined") {
    id.value = new URLSearchParams(window.location.search).get("id");
  }
});

const example = computed<Example | null>(() =>
  id.value && byId[id.value] ? byId[id.value] : null
);

// Per-file fence-info strings, matching the slot div order below.
const codeOptions = computed(() => {
  const infos = ["ts index.ts"];
  if (example.value?.datasetCode) infos.push("ts dataset.ts");
  return encodeURIComponent(JSON.stringify(infos));
});
</script>

<template>
  <div class="example-playground">
    <ClientOnly>
      <template v-if="example">
        <p class="playground-back">
          <a :href="`/js/examples/${example.id}.html`"
            >&larr; Back to {{ example.title }}</a
          >
        </p>
        <h1 class="playground-title">{{ example.title }}</h1>
        <p v-if="example.description" class="playground-desc">
          {{ example.description }}
        </p>
        <!--
          Emit one <div><pre>{code}</pre></div> per virtual file as direct
          slot children (matching the `gofish-live` markdown container). Sandpack's
          getSandpackFiles only keeps top-level `div` slot vnodes and zips them
          positionally with `codeOptions` — index.ts first, then the optional
          dataset.ts. The slot contents must be EXACTLY those divs: comments or
          v-if placeholders inside the slot leave extra vnodes in dev builds
          (Vue strips them in prod) and silently break the file parsing, so the
          one-file and two-file shapes are separate static branches.
        -->
        <GoFishLive
          v-if="example.datasetCode"
          :key="example.id"
          template="vanilla-ts"
          :codeOptions="codeOptions"
          :extraDeps="example.npmDeps"
          :previewHeight="400"
          :coderHeight="512"
          lightTheme="aquaBlue"
          darkTheme="atomDark"
        >
          <div>
            <pre>{{ example.code }}</pre>
          </div>
          <div>
            <pre>{{ example.datasetCode }}</pre>
          </div>
        </GoFishLive>
        <GoFishLive
          v-else
          :key="example.id"
          template="vanilla-ts"
          :codeOptions="codeOptions"
          :extraDeps="example.npmDeps"
          :previewHeight="400"
          :coderHeight="512"
          lightTheme="aquaBlue"
          darkTheme="atomDark"
        >
          <div>
            <pre>{{ example.code }}</pre>
          </div>
        </GoFishLive>
      </template>
      <div v-else-if="id" class="playground-missing">
        <h1>Example not found</h1>
        <p>
          No example with id <code>{{ id }}</code> exists.
          <a href="/js/examples/">Browse the gallery</a>.
        </p>
      </div>
      <div v-else class="playground-missing">
        <h1>Live editor</h1>
        <p>
          Open an example from the
          <a href="/js/examples/">gallery</a> to edit it here.
        </p>
      </div>
      <template #fallback>
        <p class="playground-loading">Loading editor…</p>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.example-playground {
  max-width: 1100px;
  margin: 0 auto;
}
.playground-back {
  margin: 0 0 0.5rem;
  font-size: 14px;
}
.playground-title {
  margin: 0 0 0.25rem;
  font-size: 1.8rem;
  font-weight: 700;
}
.playground-desc {
  margin: 0 0 1.25rem;
  color: var(--vp-c-text-2);
}
.playground-missing {
  padding: 2rem 0;
}
.playground-loading {
  color: var(--vp-c-text-2);
  padding: 2rem 0;
}

/*
  Stack the Sandpack panels vertically with the rendered chart preview ABOVE
  the code editor (the default preset puts the editor first). vitepress-plugin-
  sandpack offers no layout prop for this, so we reach into Sandpack's internal
  layout container. Scoped via :deep() to this page only — the get-started
  page's inline editor keeps its default layout.

  `.sp-layout` is a `flex-direction: row; flex-wrap: wrap` container; the plugin
  already forces each panel to `min-width: 100%`, so they wrap into a vertical
  stack. We keep row+wrap (column direction breaks Sandpack's flex height
  sizing, collapsing the panels) and reassert full-width, then `order: -1` on
  the preview stack (`.sp-preset-column`) floats it above the editor
  (`.sp-editor`).
*/
.example-playground :deep(.sp-layout) > .sp-stack {
  min-width: 100%;
}
.example-playground :deep(.sp-layout) > .sp-preset-column {
  order: -1;
}
</style>

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
        <GoFishLive
          :key="example.id"
          template="vanilla-ts"
          :codeOptions="codeOptions"
          :previewHeight="400"
          :coderHeight="512"
          lightTheme="aquaBlue"
          darkTheme="atomDark"
        >
          <!--
            Emit one <div><pre>{code}</pre></div> per virtual file as direct
            slot children (matching the `gofish-live` markdown container). Sandpack's
            getSandpackFiles only sees top-level `div` vnodes, so the file divs must
            not be nested inside a wrapper component — index.ts first, then the
            optional dataset.ts, in the same order as `codeOptions`.
          -->
          <div>
            <pre>{{ example.code }}</pre>
          </div>
          <div v-if="example.datasetCode">
            <pre>{{ example.datasetCode }}</pre>
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
</style>

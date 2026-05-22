<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

// Repo + branch the `covers:` paths resolve against on the web.
const REPO = "https://github.com/gofish-graphics/gofish-graphics";
const BRANCH = "main";

const { frontmatter } = useData();

const covers = computed<string[]>(() => {
  const c = frontmatter.value.covers;
  return Array.isArray(c)
    ? c.filter((p): p is string => typeof p === "string")
    : [];
});

const status = computed<string>(() =>
  typeof frontmatter.value.status === "string" ? frontmatter.value.status : ""
);

const blobUrl = (path: string): string =>
  `${REPO}/blob/${BRANCH}/${path.replace(/^\/+/, "")}`;

const basename = (path: string): string => {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
};
</script>

<template>
  <div
    v-if="status === 'draft'"
    class="internals-status internals-status--draft"
  >
    <strong>Draft.</strong> This essay is a stub or a work in progress — read it
    as a sketch, not settled documentation.
  </div>
  <div
    v-else-if="status === 'speculative'"
    class="internals-status internals-status--speculative"
  >
    <strong>Speculative.</strong> This is design exploration — it describes
    ideas and direction, not necessarily shipped behavior.
  </div>

  <div v-if="covers.length" class="source-links">
    <span class="source-links__label">Source files</span>
    <ul class="source-links__list">
      <li v-for="path in covers" :key="path">
        <a :href="blobUrl(path)" target="_blank" rel="noreferrer">
          <code>{{ basename(path) }}</code>
        </a>
        <span class="source-links__path">{{ path }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.internals-status {
  margin: 0 0 20px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid var(--vp-c-divider);
}
.internals-status--draft {
  background: var(--vp-c-warning-soft);
}
.internals-status--speculative {
  background: var(--vp-c-tip-soft);
}

.source-links {
  margin: 0 0 24px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.source-links__label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
  margin-bottom: 6px;
}

.source-links__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.source-links__list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.source-links__path {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-3);
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

type GlossaryEntry = {
  term: string;
  definition: string;
  href?: string;
};

type Glossary = {
  title?: string;
  entries?: GlossaryEntry[];
};

const props = withDefaults(
  defineProps<{
    placement?: "aside" | "inline";
  }>(),
  { placement: "aside" }
);

const { frontmatter } = useData();
const glossary = computed<Glossary | undefined>(
  () => frontmatter.value.glossary
);
const entries = computed(() => glossary.value?.entries ?? []);
</script>

<template>
  <aside
    v-if="glossary && entries.length > 0"
    class="article-glossary"
    :class="`article-glossary--${props.placement}`"
    aria-label="Article glossary"
  >
    <details :open="props.placement === 'aside'">
      <summary>
        <span class="article-glossary__summary-row">
          <span class="article-glossary__title">
            {{ glossary.title ?? "Terms" }}
          </span>
          <span class="article-glossary__toggle" aria-hidden="true">
            <span class="article-glossary__when-open">Minimize</span>
            <span class="article-glossary__when-closed">Show</span>
          </span>
        </span>
      </summary>

      <table>
        <caption>
          Definitions of specialized terms used in this article
        </caption>
        <tbody>
          <tr v-for="entry in entries" :key="entry.term">
            <th scope="row">
              <a v-if="entry.href" :href="entry.href">{{ entry.term }}</a>
              <span v-else>{{ entry.term }}</span>
            </th>
            <td>{{ entry.definition }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </aside>
</template>

<style scoped>
.article-glossary {
  margin-bottom: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  overflow: hidden;
}

.article-glossary--aside {
  display: none;
}

.article-glossary--inline {
  display: block;
}

summary {
  padding: 9px 10px;
  cursor: pointer;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 600;
}

summary::marker {
  color: var(--vp-c-text-3);
}

.article-glossary__summary-row {
  display: inline-flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  width: calc(100% - 12px);
}

.article-glossary__toggle {
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 500;
}

.article-glossary__when-closed,
details[open] .article-glossary__when-open {
  display: inline;
}

.article-glossary__when-open,
details[open] .article-glossary__when-closed {
  display: none;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  line-height: 1.4;
}

caption {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

th,
td {
  padding: 7px 8px;
  border-top: 1px solid var(--vp-c-divider);
  vertical-align: top;
  overflow-wrap: anywhere;
}

th {
  width: 38%;
  color: var(--vp-c-text-1);
  text-align: left;
  font-weight: 600;
}

td {
  color: var(--vp-c-text-2);
}

th a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

th a:hover {
  text-decoration: underline;
}

@media (min-width: 1280px) {
  .article-glossary--aside {
    display: block;
  }

  .article-glossary--inline {
    display: none;
  }
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vitepress";

// The entry point to the internals wiki: a labeled nav-bar link, sitting in the
// right-hand cluster with the language toggle and the GitHub icon.
const route = useRoute();
// Matches the section root and nested pages, in every path form.
const active = computed(() => /^\/internals(\/|\.html|$)/.test(route.path));
</script>

<template>
  <a
    class="internals-link"
    :class="{ 'internals-link--active': active }"
    href="/internals/"
    title="Internals — architecture wiki"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
      />
    </svg>
    <span>Internals</span>
  </a>
</template>

<style scoped>
.internals-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  color: var(--vp-c-text-1);
  transition: color 0.25s;
}

.internals-link:hover {
  color: var(--vp-c-brand-1);
}

/* Mark the link when the reader is already inside the wiki. */
.internals-link--active {
  color: var(--vp-c-brand-1);
}

.internals-link svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>

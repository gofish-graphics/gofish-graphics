<template>
  <div class="example-gallery">
    <!-- Search and Filter Controls -->
    <div class="gallery-controls">
      <div class="controls-row">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search examples..."
            class="search-input"
          />
        </div>
        <div class="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            class="view-toggle__btn"
            :class="{ active: viewMode === 'grid' }"
            :aria-pressed="viewMode === 'grid'"
            aria-label="Grid view"
            @click="viewMode = 'grid'"
          >
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" rx="1.2" />
              <rect x="9" y="1" width="6" height="6" rx="1.2" />
              <rect x="1" y="9" width="6" height="6" rx="1.2" />
              <rect x="9" y="9" width="6" height="6" rx="1.2" />
            </svg>
          </button>
          <button
            type="button"
            class="view-toggle__btn"
            :class="{ active: viewMode === 'list' }"
            :aria-pressed="viewMode === 'list'"
            aria-label="List view"
            @click="viewMode = 'list'"
          >
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
              <rect x="1" y="2.5" width="14" height="3" rx="1.2" />
              <rect x="1" y="6.5" width="14" height="3" rx="1.2" />
              <rect x="1" y="10.5" width="14" height="3" rx="1.2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Results Count -->
    <div class="results-info">
      Showing {{ filteredExamples.length }} of {{ examples.length }} examples
    </div>

    <!-- Gallery Grid -->
    <div v-if="viewMode === 'grid'" class="gallery-grid">
      <div
        v-for="example in filteredExamples"
        :key="example.id"
        class="example-card"
      >
        <a :href="`/js/examples/${example.id}.html`" class="card-link">
          <div class="card-thumbnail">
            <LazyExampleThumb
              :id="example.id"
              :title="example.title"
              :scale="gridScale"
            />
          </div>

          <div class="card-content">
            <h3 class="card-title">{{ example.title }}</h3>
            <p class="card-description">{{ example.description }}</p>
          </div>
        </a>
      </div>
    </div>

    <!-- Compact List -->
    <div v-else class="gallery-list">
      <a
        v-for="example in filteredExamples"
        :key="example.id"
        :href="`/js/examples/${example.id}.html`"
        class="example-row"
      >
        <div class="row-thumbnail">
          <LazyExampleThumb
            :id="example.id"
            :title="example.title"
            :scale="listScale"
          />
        </div>
        <div class="row-content">
          <h3 class="row-title">{{ example.title }}</h3>
          <p v-if="example.description" class="row-description">
            {{ example.description }}
          </p>
        </div>
      </a>
    </div>

    <!-- No Results Message -->
    <div v-if="filteredExamples.length === 0" class="no-results">
      <p>No examples match your current filters.</p>
      <button @click="clearAllFilters" class="clear-filters">
        Clear Filters
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { data as storyData } from "../docs/.vitepress/data/storyExamples.data.js";
import LazyExampleThumb from "./LazyExampleThumb.vue";

const examples = ref([]);
const searchQuery = ref("");
const viewMode = ref("grid");

// Filter examples by the search query (title or description).
const filteredExamples = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return examples.value.filter(
    (example) =>
      q === "" ||
      example.title.toLowerCase().includes(q) ||
      (example.description && example.description.toLowerCase().includes(q))
  );
});

const clearAllFilters = () => {
  searchQuery.value = "";
};

onMounted(() => {
  examples.value = storyData.examples;
});

// Down-scale factors applied to the live-rendered story thumbnails.
const gridScale = 0.42;
const listScale = 0.26;
</script>

<style scoped>
.example-gallery {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  display: block;
}

.gallery-controls {
  margin-bottom: 30px;
  padding: 20px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  flex: 1;
  min-width: 0;
}

.search-input {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  /* margin-bottom: 20px; */
}

.view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
}

.view-toggle__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition:
    color 0.2s,
    background-color 0.2s;
}

.view-toggle__btn:hover {
  color: var(--vp-c-text-1);
}

.view-toggle__btn.active {
  color: #fff;
  background: var(--vp-c-brand-1);
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.filter-group label {
  font-weight: 600;
  margin-bottom: 8px;
  display: block;
  color: var(--vp-c-text-1);
}

.tag-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-filter {
  padding: 6px 12px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.tag-filter:hover {
  background: var(--vp-c-brand-light);
}

.tag-filter.active {
  background: var(--vp-c-brand);
  color: white;
  border-color: var(--vp-c-brand);
}

.clear-filters {
  margin-top: 15px;
  padding: 8px 16px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  cursor: pointer;
}

.results-info {
  margin-bottom: 20px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.example-card {
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.example-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.card-link {
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.card-thumbnail {
  position: relative;
  margin-left: 0px;
  aspect-ratio: 16/10;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-thumbnail :deep(.gofish-vue) {
  transform-origin: center center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-thumbnail :deep(.gofish-vue .container) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-content {
  padding: 16px;
  font-weight: 400;
}

.card-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.card-description {
  margin: 0 0 16px 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.4;
}

.card-tags {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin-right: 4px;
}

.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.mark-tag {
  background: #e3f2fd;
  color: #1565c0;
}

.operator-tag {
  background: #f3e5f5;
  color: #7b1fa2;
}

.type-tag {
  background: #e8f5e8;
  color: #2e7d32;
}

.no-results {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
}

.gallery-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: var(--vp-c-bg);
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.example-row:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.row-thumbnail {
  flex-shrink: 0;
  width: 150px;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-thumbnail :deep(.gofish-vue) {
  transform-origin: center center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-content {
  min-width: 0;
}

.row-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.row-description {
  margin: 4px 0 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.4;
}

@media (max-width: 768px) {
  .row-thumbnail {
    width: 110px;
  }

  .filter-section {
    gap: 12px;
  }

  .gallery-grid {
    grid-template-columns: 1fr;
  }

  .tag-filters {
    gap: 6px;
  }

  .tag-filter {
    font-size: 12px;
    padding: 4px 8px;
  }
}
</style>

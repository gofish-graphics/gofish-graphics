---
aside: false
editLink: false
---

<style>
/* "← Examples" back button above the title. Scoped under `.vp-doc a` to beat
   VitePress's default link styling. Secondary/outline button, matching the
   JS example pages' back button (see js/examples/[id].md). */
.vp-doc a.example-back {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  margin: 0 0 1.25rem;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;
}
.vp-doc a.example-back:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}
.example-dataset {
  margin: 0.5rem 0 1.5rem;
}
.example-dataset > summary {
  cursor: pointer;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
</style>

<!-- @content -->

---
aside: false
editLink: false
---

<style>
/* "← Examples" back button above the title. Scoped under `.vp-doc a` to beat
   VitePress's default link styling. Secondary/outline button (vs. the solid green
   playground button) so it reads as a button but stays subordinate to the title. */
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
.example-actions {
  margin: 1.5rem 0 2rem;
}
/* Scope under `.vp-doc a` so these rules beat VitePress's default
   `.vp-doc a { color: var(--vp-c-brand-1) }` (same green as our background).
   Without the extra specificity the label renders green-on-green — present in
   the DOM but invisible (the original "empty green pill" bug). */
.vp-doc a.example-playground-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  border-radius: 8px;
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white, #fff);
  text-decoration: none;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.vp-doc a.example-playground-btn:hover {
  color: var(--vp-c-white, #fff);
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}
.vp-doc a.example-playground-btn::after {
  content: "\2192";
  font-weight: 700;
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

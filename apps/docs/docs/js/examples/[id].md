---
aside: false
editLink: false
---

<style>
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

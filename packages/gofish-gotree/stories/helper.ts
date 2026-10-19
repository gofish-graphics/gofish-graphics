// Rendering scaffolding for the GoTree gallery stories. Named `helper` so the
// docs example scanner drops it from synthesized snippets (and rewrites
// `initializeContainer()` → `document.getElementById("app")`); see apps/docs
// CLAUDE.md. Like the gofish-graphics stories' helper, it only adds a margin:
// the chart is sized by its own `.render(container, { w, h })` options, so a
// story draws exactly what its spec draws, as its Python port does.
export const initializeContainer = () => {
  const container = document.createElement("div");
  container.style.margin = "20px";
  document.body.appendChild(container);
  return container;
};

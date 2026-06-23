// Rendering scaffolding for the GoTree gallery stories. Named `helper` so the
// docs example scanner drops it from synthesized snippets (and rewrites
// `initializeContainer()` → `document.getElementById("app")`); see apps/docs
// CLAUDE.md. The real story execution (Storybook, visual-diff capture, docs
// GoFishExample) uses these directly.

// Scale the rendered SVG to fill the container by setting its viewBox to the
// content bounding box (so small trees are centered and large ones don't clip).
export const fitToContent = (host: HTMLElement) => {
  requestAnimationFrame(() => {
    const svg = host.querySelector("svg");
    if (!svg) return;
    try {
      const bb = (svg as SVGSVGElement).getBBox();
      if (!bb.width || !bb.height) return;
      const pad = 10;
      svg.setAttribute(
        "viewBox",
        `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`
      );
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
    } catch {
      /* getBBox throws before paint; ignore */
    }
  });
};

// Create a fresh sized container, append it, and auto-fit whatever SVG gets
// rendered into it on the next frame. Stories call this, then render their tree
// into the returned element.
export const initializeContainer = (
  size: { w: number; h: number } = { w: 640, h: 420 }
) => {
  const c = document.createElement("div");
  c.style.margin = "16px";
  c.style.width = `${size.w}px`;
  c.style.height = `${size.h}px`;
  document.body.appendChild(c);
  fitToContent(c);
  return c;
};

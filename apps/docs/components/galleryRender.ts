// Live example renderer shared by the museum gallery (GalleryPage.vue).
//
// The docs example gallery renders every gallery example LIVE in the browser by
// executing the REAL Storybook story module (SolidJS) — the same mechanism
// GoFishExample.vue uses — rather than shipping a multi-megabyte file of baked
// SVG strings. The resolve/render surface lives in ./storyRender so the gallery
// and the single-example component share one implementation; this module adds
// the gallery's "render into a measure host" entry point plus the svg-id
// namespacing the wall needs to hang many charts side by side.
import { resolveById, renderStoryInto } from "./storyRender";

// Render one gallery example (by its story-example id) into `container`. Resolves
// the example to its `*.stories.tsx` module export, runs the story's loaders, and
// invokes its render. gofish renders through an async, rAF-driven layout
// pipeline, so the chart `<svg>` is generally NOT present synchronously when this
// promise resolves — the caller (the gallery's measure pass) waits for the svg to
// appear with a settled non-zero box before measuring. `container` should already
// be connected to the document so layout measurement (getBBox / getBoundingClientRect)
// resolves correctly. Throws on an unknown id or a story that fails to render.
export async function renderExampleInto(
  container: HTMLElement,
  id: string
): Promise<void> {
  const story = await resolveById(id);
  await renderStoryInto(story, container);
}

// Namespace any internal svg ids (gradients / clipPaths) so multiple inlined
// charts on the wall never collide. Mirrors capture-renders.mjs's namespacing
// (the prototype's renders.js was pre-namespaced; live renders are not).
export function namespaceSvgIds(svg: SVGElement, exampleId: string): void {
  const prefix = exampleId.replace(/[^a-zA-Z0-9_-]/g, "_") + "__";
  const idEls = svg.querySelectorAll("[id]");
  if (!idEls.length) return;
  const ids = new Set<string>();
  idEls.forEach((el) => {
    const id = el.getAttribute("id");
    if (id) ids.add(id);
  });
  // Rewrite id attributes and every url(#id) / href="#id" reference. Operating on
  // the serialized markup is the simplest exhaustive rewrite (covers fill, stroke,
  // clip-path, mask, filter, xlink:href, …).
  let html = svg.outerHTML;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html
      .replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${prefix}${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${prefix}${id})`)
      .replace(
        new RegExp(`((?:xlink:)?href)="#${esc}"`, "g"),
        `$1="#${prefix}${id}"`
      );
  }
  const doc = new DOMParser().parseFromString(html, "image/svg+xml");
  const reparsed = doc.documentElement;
  svg.replaceChildren(...Array.from(reparsed.childNodes));
  for (const attr of Array.from(reparsed.attributes)) {
    svg.setAttribute(attr.name, attr.value);
  }
}

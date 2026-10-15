/**
 * story-specs.ts
 *
 * The spec (the chart code) of every story, syntax-highlighted, for the review
 * pages: the Visual Diff Review site, the Python Parity Review site and
 * `capture-diff`'s report.html.
 *
 * The code comes from the docs build's story scanner
 * (apps/docs/docs/.vitepress/data/storyExamples.ts, `loadStorySpecs`), the
 * same transform that writes the snippets on the docs example pages, so a
 * story reads the same here as it does in the docs. Highlighting is Shiki, as
 * on the docs site, run at build time: the pages get static HTML with inline
 * colors and load no highlighter.
 */

import { createHighlighter } from "shiki";
import { storyToPath } from "./path-mapping.js";
import { escapeHtml } from "./diff-utils.js";
import type { StorySpec } from "../../apps/docs/docs/.vitepress/data/storyExamples.ts";

export type { StorySpec };

/**
 * Every story's spec, keyed by its capture path (`<storyToPath>.html`, the key
 * of DiffEntry.path and of capture-diff's changes).
 *
 * The docs package is `type: commonjs` while this one is `type: module`, so a
 * static named import trips tsx's CJS/ESM interop (see capture-docs-images.ts,
 * which loads the same module the same way).
 */
export async function loadSpecsByPath(): Promise<Map<string, StorySpec>> {
  const mod: any = await import(
    "../../apps/docs/docs/.vitepress/data/storyExamples.ts"
  );
  const load = mod.loadStorySpecs ?? mod.default?.loadStorySpecs;
  if (typeof load !== "function")
    throw new Error("loadStorySpecs export not found in storyExamples.ts");
  const specs: StorySpec[] = load();
  return new Map(
    specs.map((s) => [`${storyToPath(s.metaTitle, s.exportName)}.html`, s])
  );
}

export type Highlight = (code: string, lang: "tsx" | "python") => string;

/** A Shiki highlighter for TSX and Python, light theme, as static HTML. */
export async function createCodeHighlighter(): Promise<Highlight> {
  const highlighter = await createHighlighter({
    themes: ["github-light"],
    langs: ["tsx", "python"],
  });
  return (code, lang) =>
    highlighter.codeToHtml(code, { lang, theme: "github-light" });
}

const KIND_NOTE: Record<StorySpec["kind"], string> = {
  snippet: "Standalone snippet, as the docs show it.",
  adapted:
    "Snippet that imports local helper modules; their source follows it.",
  source:
    "Story source: not a plain render function, so this is the export and the top-level code it uses.",
};

/** CSS for the fragments `specHtml` writes. Pages include it once. */
export const SPEC_CSS = `
  .spec-meta { font-size: 12px; color: #666; padding: 8px 12px; border-bottom: 1px solid #eee; }
  .spec-meta code { font-size: 11px; color: #444; }
  .spec-code pre.shiki { margin: 0; padding: 10px 12px; font-size: 12px; line-height: 1.5; overflow-x: auto; }
`;

/** One story's spec as an HTML fragment: where it comes from, then the code. */
export function specHtml(spec: StorySpec, highlight: Highlight): string {
  return (
    `<div class="spec-meta">${escapeHtml(KIND_NOTE[spec.kind])} ` +
    `<code>${escapeHtml(spec.storyFile)}</code> · <code>${escapeHtml(spec.exportName)}</code></div>` +
    `<div class="spec-code">${highlight(spec.code, "tsx")}</div>`
  );
}

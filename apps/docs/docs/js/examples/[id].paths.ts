/**
 * Dynamic-route loader for the per-example pages.
 *
 * One route is emitted per gallery-tagged Storybook story (see
 * `.vitepress/data/storyExamples.ts`). Each page is fully described by the
 * `content` field below — VitePress treats it as the markdown body of
 * `[id].md`, so the template file itself only carries shared frontmatter and
 * styling.
 *
 * The page shows:
 *   - the title (H1) + description as lead prose,
 *   - a live render via <GoFishExample> (executes the real story module),
 *   - an "Open in live editor" button → /js/examples/playground.html?id=<id>,
 *   - a static `ts` code fence (NO Sandpack here — that is the point: example
 *     pages must stay light), plus a collapsed dataset.ts fence when present.
 *
 * NB: example `code`/`datasetCode` strings frequently contain backticks
 * (template literals in chart code), so they are pushed as plain array
 * elements and never interpolated into a JS template literal.
 */
import { loadStoryExamples } from "../../.vitepress/data/storyExamples.ts";

export default {
  paths() {
    return loadStoryExamples().map((ex) => {
      const parts: string[] = [];

      // Back link to the gallery, above the title.
      parts.push(
        `<a class="example-back" href="/js/examples/">← Examples</a>`,
        ""
      );

      parts.push(`# ${ex.title}`, "");
      if (ex.description) {
        parts.push(ex.description, "");
      }

      // Live render of the real story module (client-only; no code echo).
      parts.push(`<GoFishExample id="${ex.id}" />`, "");

      // Open in live editor (Sandpack) — loaded only on the playground page.
      parts.push(
        `<div class="example-actions">`,
        `  <a class="example-playground-btn" href="/js/examples/playground.html?id=${ex.id}">Open in live editor</a>`,
        `</div>`,
        ""
      );

      if (ex.isFallback) {
        parts.push(
          `_The code below is adapted from the story source; this example relies on local helpers that cannot be inlined into a single standalone snippet._`,
          ""
        );
      }

      // Static code fence (push code as a plain element — may contain backticks).
      parts.push("```ts", ex.code.replace(/\n+$/, ""), "```", "");

      if (ex.datasetCode) {
        parts.push(
          '<details class="example-dataset">',
          "<summary>dataset.ts</summary>",
          "",
          "```ts",
          ex.datasetCode.replace(/\n+$/, ""),
          "```",
          "",
          "</details>",
          ""
        );
      }

      return {
        params: { id: ex.id, title: ex.title },
        content: parts.join("\n"),
      };
    });
  },
};

/**
 * Dynamic-route loader for the per-example pages.
 *
 * One route is emitted per gallery-tagged Storybook story (see
 * `.vitepress/data/storyExamples.ts`). Each page is fully described by the
 * `content` field returned from `buildExamplePage()` (`.vitepress/data/examplePage.ts`,
 * shared with the Python variant of this loader) — VitePress treats it as the
 * markdown body of `[id].md`, so the template file itself only carries shared
 * frontmatter and styling.
 *
 * The page shows:
 *   - the title (H1) + description as lead prose,
 *   - a live render via <GoFishExample> (executes the real story module),
 *   - an "Open in live editor" button → /js/examples/playground.html?id=<id>,
 *   - a static `ts` code fence (NO Sandpack here — that is the point: example
 *     pages must stay light), plus a collapsed dataset.ts fence when present.
 */
import { loadStoryExamples } from "../../.vitepress/data/storyExamples.ts";
import { buildExamplePage } from "../../.vitepress/data/examplePage.ts";

export default {
  paths() {
    return loadStoryExamples().map((ex) => {
      const notes: string[] = [];
      if (ex.isFallback) {
        notes.push(
          `_The code below is adapted from the story source; this example relies on local helpers that cannot be inlined into a single standalone snippet._`
        );
      }

      return buildExamplePage({
        backHref: "/js/examples/",
        title: ex.title,
        description: ex.description,
        exampleId: ex.id,
        // Open in live editor (Sandpack) — loaded only on the playground page.
        actionsHtml: [
          `<div class="example-actions">`,
          `  <a class="example-playground-btn" href="/js/examples/playground.html?id=${ex.id}">Open in live editor</a>`,
          `</div>`,
        ],
        notes,
        fenceLang: "ts",
        code: ex.code,
        datasetLabel: "dataset.ts",
        datasetCode: ex.datasetCode,
      });
    });
  },
};

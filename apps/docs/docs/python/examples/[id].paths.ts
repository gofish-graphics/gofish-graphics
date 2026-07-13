/**
 * Dynamic-route loader for the Python per-example pages.
 *
 * Mirrors `js/examples/[id].paths.ts` — one route per gallery-tagged
 * Storybook story (see `.vitepress/data/storyExamples.ts`), same `id`s, so
 * `/python/examples/<id>` always exists alongside `/js/examples/<id>`
 * (the language toggle and the gallery wall both assume mirrored paths).
 *
 * The Python page differs from the JS one in three ways:
 *   - the code fence shows the Python parity port (`pythonExamples.ts`), not
 *     the JS snippet, and is omitted entirely when there is no port yet;
 *   - there is no "Open in live editor" button — the Sandpack playground is
 *     JS-only;
 *   - the live render is still `<GoFishExample>` (JS and Python serialize to
 *     the same IR, so the same real story module renders both).
 */
import { loadStoryExamples } from "../../.vitepress/data/storyExamples.ts";
import { loadPythonExamples } from "../../.vitepress/data/pythonExamples.ts";

export default {
  paths() {
    const pythonById = new Map(loadPythonExamples().map((p) => [p.id, p]));

    return loadStoryExamples().map((ex) => {
      const py = pythonById.get(ex.id);
      const parts: string[] = [];

      // Back link to the gallery, above the title.
      parts.push(
        `<a class="example-back" href="/python/examples/">← Examples</a>`,
        ""
      );

      parts.push(`# ${ex.title}`, "");
      if (ex.description) {
        parts.push(ex.description, "");
      }

      // Live render of the real story module (client-only; no code echo).
      // JS and Python serialize to the same IR, so this is the same render
      // the JS example page shows — there is no separate Python engine.
      parts.push(`<GoFishExample id="${ex.id}" />`, "");

      const hasCode = !!py?.pythonCode;

      if (!hasCode) {
        parts.push(
          `_This example has not been ported to Python yet. See the ` +
            `[JavaScript version](/js/examples/${ex.id}) for its code._`,
          ""
        );
      } else if (py?.renderDiverges) {
        parts.push(
          `_The chart above is rendered by the JavaScript engine. This example's ` +
            `Python port intentionally uses a different algorithm for part of its ` +
            `computation (an accepted divergence), so its output differs slightly ` +
            `from the render shown._`,
          ""
        );
      }

      if (hasCode) {
        if (py!.isFallback) {
          parts.push(
            `_The code below is the Python parity port's function shown verbatim; ` +
              `it could not be reduced to a standalone snippet automatically._`,
            ""
          );
        }

        parts.push("```python", py!.pythonCode!.replace(/\n+$/, ""), "```", "");

        if (py!.pythonDatasetCode) {
          parts.push(
            '<details class="example-dataset">',
            "<summary>dataset.py</summary>",
            "",
            "```python",
            py!.pythonDatasetCode.replace(/\n+$/, ""),
            "```",
            "",
            "</details>",
            ""
          );
        }
      }

      return {
        params: { id: ex.id, title: ex.title },
        content: parts.join("\n"),
      };
    });
  },
};

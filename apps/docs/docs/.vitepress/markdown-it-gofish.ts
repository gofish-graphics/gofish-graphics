/*
Based on https://github.com/observablehq/plot-markdown-it-container

Copyright 2020-2025 Observable, Inc.

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
 */

/*
 * `::: gofish` markdown container. Three example-embedding modes plus the legacy
 * inline fenced-code mode:
 *
 *   ::: gofish example:internal-<id>      → wiki diagram. GoFishVue executes the
 *                                           code from `.vitepress/examples/internal-<id>.ts`.
 *                                           `hidden` suppresses the code fence.
 *
 *   ::: gofish example:<id>               → gallery story example. Resolved through the
 *                                           story data layer (storyExamples.ts); UNKNOWN
 *                                           IDS THROW AT BUILD TIME (this check replaces
 *                                           the old registry as the source of truth).
 *                                           Renders <GoFishExample id> plus, unless
 *                                           `hidden`, a code fence of the generated snippet
 *                                           (and the dataset in a <details> when present).
 *
 *   ::: gofish story:<storyId>            → render-only embed of ANY story (even untagged
 *                                           ones) by its harness storyId, via GoFishExample.
 *                                           Never shows a code fence.
 *
 *   ::: gofish                            → inline fenced-code mode (unchanged). The
 *   ```ts                                    fenced block's code is executed by GoFishVue.
 *   ...                                       `hidden` renders the chart only (no code).
 *   ```
 *   :::
 */

import container from "markdown-it-container";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getStoryExampleById } from "./data/storyExamples";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, "examples");

/**
 * Read a wiki-diagram source file (`internal-*.ts`). These remain registry-free:
 * any `.vitepress/examples/internal-*.ts` file is embeddable, mirroring the old
 * auto-discovery behaviour.
 */
function loadInternalCode(id: string): string | null {
  try {
    return readFileSync(join(EXAMPLES_DIR, `${id}.ts`), "utf-8");
  } catch {
    return null;
  }
}

export default function gofish(md) {
  md.use(container, "gofish", {
    render(tokens, idx) {
      if (tokens[idx].nesting !== 1) {
        return `\n</div>\n`;
      }

      const directives = tokens[idx].info.split(/\s+/).slice(1);
      const hidden = directives.includes("hidden");
      const href = directives.find((d) => d.startsWith("https://"));

      const renderHref = href
        ? `<a class="gofish-codepen no-icon" href="${md.utils.escapeHtml(
            href
          )}" target="_blank" title="Open in CodePen">CodePen</a>`
        : "";

      const storyImport = directives.find((d) => d.startsWith("story:"));
      const exampleImport = directives.find((d) => d.startsWith("example:"));

      // story:<storyId> — render-only embed of any story by harness id.
      if (storyImport) {
        const storyId = storyImport.slice("story:".length);
        const component = `<GoFishExample story-id="${md.utils.escapeHtml(
          storyId
        )}" />\n`;
        return `<div class="gofish-container">\n${component}`;
      }

      if (exampleImport) {
        const exampleId = exampleImport.slice("example:".length);

        // internal-* wiki diagrams: GoFishVue + code from the internal-*.ts file.
        if (exampleId.startsWith("internal-")) {
          const code = loadInternalCode(exampleId);
          if (code == null) {
            throw new Error(
              `Internal example "${exampleId}" not found: no ${exampleId}.ts in ${EXAMPLES_DIR}`
            );
          }
          const component = `<GoFishVue code="${md.utils.escapeHtml(
            code
          )}" />\n`;
          const codeFence = hidden
            ? ""
            : md.render(`\`\`\`ts\n${code}\n\`\`\``);
          return `<div class="gofish-container">\n${component}${codeFence}`;
        }

        // Gallery story example. Resolve through the data layer; throw on miss so
        // a stale id is a build failure, not a silent broken embed.
        const example = getStoryExampleById(exampleId);
        if (!example) {
          throw new Error(
            `Unknown gofish example id "${exampleId}". It must match a gallery-tagged ` +
              `story id (run \`pnpm --filter docs check-story-examples\` for the full list).`
          );
        }

        const component = `<GoFishExample id="${md.utils.escapeHtml(
          exampleId
        )}" />\n`;

        let codeFence = "";
        if (!hidden) {
          codeFence = md.render(`\`\`\`ts\n${example.code}\n\`\`\``);
          if (example.datasetCode) {
            codeFence += md.render(
              `\n<details class="gofish-dataset">\n<summary>Dataset</summary>\n\n` +
                `\`\`\`ts\n${example.datasetCode}\n\`\`\`\n\n</details>\n`
            );
          }
        }

        const suffix = hidden ? "" : renderHref;
        return `<div class="gofish-container">\n${component}${codeFence}${suffix}\n`;
      }

      // Inline fenced-code mode: require a fenced code block, run it via GoFishVue.
      const token = tokens[idx + 1];
      if (!token || token.type !== "fence" || token.tag !== "code") {
        throw new Error("missing fenced code block");
      }
      const content = token.content;

      // `hidden` => chart only. Neutralise the inner fence token so its code
      // block produces no output (the fence has its own renderer rule that does
      // not honour `token.hidden`, so we retype it to an empty html_block).
      if (hidden) {
        token.type = "html_block";
        token.content = "";
        token.info = "";
      }

      const component = `<GoFishVue code="${md.utils.escapeHtml(content)}" />\n`;
      const suffix = hidden ? "" : `\n${renderHref}`;
      return `<div class="gofish-container">\n${component}${suffix}\n`;
    },
  });
}

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

import container from "markdown-it-container";
import examplesData from "./data/examples.data.js";

export default function gofish(md) {
  md.use(container, "gofish", {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        const directives = tokens[idx].info.split(/\s+/).slice(1);

        // Check if this is an example import directive
        const exampleImport = directives.find((d) => d.startsWith("example:"));
        let content = "";
        let codeFence = "";

        if (exampleImport) {
          const exampleId = exampleImport.split(":")[1];
          const examples = examplesData.load();
          const importedCode = examples.getCodeById(exampleId);
          if (importedCode) {
            content = importedCode;
          } else {
            console.warn(`Example with id "${exampleId}" not found`);
            content = `// Example "${exampleId}" not found`;
          }
          codeFence = directives.includes("hidden")
            ? ""
            : md.render(`\`\`\`ts\n${content}\n\`\`\``);
        } else {
          // For non-example imports, require a fenced code block
          const token = tokens[idx + 1];
          if (token.type !== "fence" || token.tag !== "code")
            throw new Error("missing fenced code block");
          content = token.content;
          // Don't generate additional code fence for regular blocks
        }

        const href = directives.find((d) => d.startsWith("https://"));

        // Create the GoFishVue component with the code content
        // const encoded = encodeURIComponent(md.utils.escapeHtml(token.content));
        // const componentSetup = `<GoFishVue code={decodeURIComponent("${encoded}")}" />\n`;
        const componentSetup = `<GoFishVue code="${md.utils.escapeHtml(
          content
        )}" />\n`;

        const suffix = `\n${
          directives.includes("hidden")
            ? // ? `<div style="display: none;">\n`
              ""
            : href
              ? `<a class="gofish-codepen no-icon" href="${md.utils.escapeHtml(
                  href
                )}" target="_blank" title="Open in CodePen">CodePen</a>`
              : ""
        }`;

        // return directives.includes("hidden")
        //   ? `<div class="gofish-container">${componentSetup}`
        //   : `<div class="gofish-container">\n${componentSetup}${""}${suffix}\n`;
        return `<div class="gofish-container">\n${componentSetup}${codeFence}${suffix}\n`;
      }
      return `\n</div>\n`;
    },
  });
}

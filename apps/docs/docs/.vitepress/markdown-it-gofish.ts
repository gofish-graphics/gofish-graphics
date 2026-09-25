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
 *
 * Flags, written after the mode:
 *
 *   hidden     → no code fence (nor dataset, nor CodePen link).
 *   image      → the chart is a static picture of the story instead of the live
 *                story: a PNG the docs build captures before VitePress runs
 *                (`pnpm --filter docs docs:images` → public/previews/<storyId>.png),
 *                shown by <GoFishImage>. Only the two story modes take it (the
 *                capture renders stories). It changes nothing else, so
 *                `example:<id> image` still shows its code unless `hidden`.
 *                The capture finds the pictures to take with findImageStoryIds()
 *                below, which reads the docs through this same plugin: the
 *                markdown is the only list of them.
 *   https://…  → a CodePen link under the code.
 */

import MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getStoryExampleById,
  getStoryTitle,
  type StoryExample,
} from "./data/storyExamples";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, "examples");
/** The docs source root (`apps/docs/docs`). */
const DOCS_DIR = join(__dirname, "..");

/**
 * Site path of the directory of captured story pictures (under `public/`), and
 * of one story's picture in it. The capture script writes these paths and
 * <GoFishImage> loads them, so they are spelled once, here.
 */
export const STORY_IMAGES_DIR = "/previews";
export function storyImagePath(storyId: string): string {
  return `${STORY_IMAGES_DIR}/${storyId}.png`;
}

/** One `::: gofish` container's info string, parsed. */
interface Directive {
  /** `story:<storyId>` */
  story?: string;
  /** `example:<id>`: a gallery id, or `internal-<id>` */
  example?: string;
  hidden: boolean;
  image: boolean;
  /** a `https://` CodePen link */
  href?: string;
}

function parseDirective(info: string): Directive {
  // The first word is the container name, "gofish".
  const words = info.trim().split(/\s+/).slice(1);
  const valueOf = (prefix: string) =>
    words.find((w) => w.startsWith(prefix))?.slice(prefix.length);
  return {
    story: valueOf("story:"),
    example: valueOf("example:"),
    hidden: words.includes("hidden"),
    image: words.includes("image"),
    href: words.find((w) => w.startsWith("https://")),
  };
}

/**
 * Resolve a gallery example id through the data layer; throw on a miss so a
 * stale id is a build failure, not a silent broken embed.
 */
function requireExample(id: string): StoryExample {
  const example = getStoryExampleById(id);
  if (!example) {
    throw new Error(
      `Unknown gofish example id "${id}". It must match a gallery-tagged ` +
        `story id (run \`pnpm --filter docs check-story-examples\` for the full list).`
    );
  }
  return example;
}

/**
 * The story an `image` container pictures, and its title for the alt text.
 * `example:<id>` resolves to its story, so pictures are keyed by story id in
 * both modes.
 */
function imageStory(d: Directive): { storyId: string; title: string } {
  if (d.story !== undefined) {
    const title = getStoryTitle(d.story);
    if (title === undefined) {
      throw new Error(`Unknown story id "${d.story}" in a gofish \`image\`.`);
    }
    return { storyId: d.story, title };
  }
  if (d.example !== undefined && !d.example.startsWith("internal-")) {
    const example = requireExample(d.example);
    return { storyId: example.storyId, title: example.title };
  }
  throw new Error(
    "gofish `image` pictures a story: use it with `story:<storyId>` or a " +
      "gallery `example:<id>`."
  );
}

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

      const d = parseDirective(tokens[idx].info);
      const esc = md.utils.escapeHtml;
      // Throws for any mode but the two story modes.
      const image = d.image ? imageStory(d) : undefined;
      const picture = image
        ? `<GoFishImage src="${esc(storyImagePath(image.storyId))}" alt="${esc(
            image.title
          )}" />\n`
        : "";

      const renderHref = d.href
        ? `<a class="gofish-codepen no-icon" href="${esc(
            d.href
          )}" target="_blank" title="Open in CodePen">CodePen</a>`
        : "";

      // story:<storyId> — render-only embed of any story by harness id.
      if (d.story !== undefined) {
        const component =
          picture || `<GoFishExample story-id="${esc(d.story)}" />\n`;
        return `<div class="gofish-container">\n${component}`;
      }

      if (d.example !== undefined) {
        const exampleId = d.example;

        // internal-* wiki diagrams: GoFishVue + code from the internal-*.ts file.
        if (exampleId.startsWith("internal-")) {
          const code = loadInternalCode(exampleId);
          if (code == null) {
            throw new Error(
              `Internal example "${exampleId}" not found: no ${exampleId}.ts in ${EXAMPLES_DIR}`
            );
          }
          const component = `<GoFishVue code="${esc(code)}" />\n`;
          const codeFence = d.hidden
            ? ""
            : md.render(`\`\`\`ts\n${code}\n\`\`\``);
          return `<div class="gofish-container">\n${component}${codeFence}`;
        }

        // Gallery story example.
        const example = requireExample(exampleId);
        const component =
          picture || `<GoFishExample id="${esc(exampleId)}" />\n`;

        let codeFence = "";
        if (!d.hidden) {
          codeFence = md.render(`\`\`\`ts\n${example.code}\n\`\`\``);
          // The preview, not the whole dataset — see PREVIEW_ROWS in
          // data/storyExamples.ts.
          if (example.datasetPreview) {
            codeFence += md.render(
              `\n<details class="gofish-dataset">\n<summary>Dataset</summary>\n\n` +
                `\`\`\`ts\n${example.datasetPreview}\n\`\`\`\n\n</details>\n`
            );
          }
        }

        const suffix = d.hidden ? "" : renderHref;
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
      if (d.hidden) {
        token.type = "html_block";
        token.content = "";
        token.info = "";
      }

      const component = `<GoFishVue code="${esc(content)}" />\n`;
      const suffix = d.hidden ? "" : `\n${renderHref}`;
      return `<div class="gofish-container">\n${component}${suffix}\n`;
    },
  });
}

/**
 * Every story an `image` container in the docs pictures, by harness story id:
 * the pictures the docs build has to capture. Each page is tokenized by this
 * same plugin (with `html` on, as VitePress runs markdown-it), so this sees
 * exactly the containers the site renders — not, say, one quoted in a code
 * block. Page content that dynamic routes generate (`[id].paths.ts`) is not on
 * disk and is not scanned; none of it uses `image`.
 */
export function findImageStoryIds(): string[] {
  const md = new MarkdownIt({ html: true }).use(gofish);
  const ids = new Set<string>();
  for (const file of markdownFiles(DOCS_DIR)) {
    for (const token of md.parse(readFileSync(file, "utf-8"), {})) {
      if (token.type !== "container_gofish_open") continue;
      const d = parseDirective(token.info);
      if (!d.image) continue;
      try {
        ids.add(imageStory(d).storyId);
      } catch (err) {
        throw new Error(
          `${relative(DOCS_DIR, file)}: ${(err as Error).message}`
        );
      }
    }
  }
  return [...ids].sort();
}

/** Every `.md` page under `dir`, skipping `public/` and dot-directories. */
function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "public") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

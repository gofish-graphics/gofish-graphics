/**
 * Writes the gallery-based contexts from the docs gallery (every story
 * tagged `gallery`, through the docs build's own loader,
 * apps/docs/docs/.vitepress/data/storyExamples.ts):
 *
 *   - tests/llm-bench/context/gallery-index.json: id, title, description and
 *     the standalone example as JavaScript, for the retrieval context.
 *   - tests/llm-bench/context/skill/: SKILL.md (the cheatsheet, how to use
 *     the folder, and an index of the examples) and examples/<id>.js, for
 *     the skill context.
 *
 * Run make-cheatsheet.ts first: SKILL.md includes the cheatsheet.
 *
 *   pnpm --filter @gofish/tests exec tsx scripts/llm-bench/make-gallery.ts
 *
 * Examples from gofish-gotree are left out (that package is not available
 * to the model), and so are the loader's fallbacks (stories it could not
 * turn into a standalone snippet). The TypeScript snippets are compiled to
 * JavaScript (types removed) and formatted with Prettier, since the model
 * writes JavaScript.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import * as prettier from "prettier";
import ts from "typescript";
import {
  CHEATSHEET_PATH,
  GALLERY_INDEX_PATH,
  SKILL_DIR,
  type GalleryEntry,
} from "./context";

interface StoryExample {
  id: string;
  title: string;
  description: string;
  code: string;
  isFallback: boolean;
  noLiveEditor?: boolean;
}

// A static named import of this .ts trips Node's CJS/ESM interop under tsx
// (see capture-docs-images.ts); a dynamic import with a fallback works.
async function loadStoryExamples(): Promise<StoryExample[]> {
  // Not a literal path, so the docs file stays out of this project's type
  // check (its rootDir).
  const loader = join(
    import.meta.dirname,
    "../../../apps/docs/docs/.vitepress/data/storyExamples.ts"
  );
  const mod: any = await import(pathToFileURL(loader).href);
  const load = mod.loadStoryExamples ?? mod.default?.loadStoryExamples;
  if (typeof load !== "function")
    throw new Error("loadStoryExamples export not found in storyExamples.ts");
  return load();
}

async function toJs(code: string): Promise<string> {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  return prettier.format(js, { parser: "babel" });
}

const SKILL_HOWTO = `## How to use this folder

This folder is the GoFish skill. The cheatsheet above lists every operator and mark. \`examples/\` holds one complete GoFish example per gallery entry, listed below. To see how a kind of chart is built, read the example closest to it (for instance \`examples/mosaic-chart.js\`), or search the folder with Grep for an operator or option name. The examples load their own data; your program uses the \`data\` argument it is given.`;

async function main() {
  const all = await loadStoryExamples();
  const kept = all.filter((e) => !e.noLiveEditor && !e.isFallback);
  const entries: GalleryEntry[] = [];
  for (const e of kept.sort((a, b) => a.id.localeCompare(b.id)))
    entries.push({
      id: e.id,
      title: e.title,
      description: e.description,
      code: await toJs(e.code),
    });
  writeFileSync(GALLERY_INDEX_PATH, JSON.stringify(entries, null, 1) + "\n");

  rmSync(SKILL_DIR, { recursive: true, force: true });
  mkdirSync(join(SKILL_DIR, "examples"), { recursive: true });
  for (const e of entries)
    writeFileSync(
      join(SKILL_DIR, "examples", `${e.id}.js`),
      `// ${e.title}\n// ${e.description}\n\n${e.code}`
    );
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const index = [
    "## Examples",
    "",
    "| example | what it shows | file |",
    "| --- | --- | --- |",
    ...entries.map(
      (e) =>
        `| ${cell(e.title)} | ${cell(e.description)} | examples/${e.id}.js |`
    ),
  ].join("\n");
  const cheatsheet = readFileSync(CHEATSHEET_PATH, "utf8").trimEnd();
  writeFileSync(
    join(SKILL_DIR, "SKILL.md"),
    `${cheatsheet}\n\n${SKILL_HOWTO}\n\n${index}\n`
  );
  console.log(
    `wrote ${entries.length} examples (of ${all.length} gallery stories; ${all.length - kept.length} left out: gofish-gotree or fallback) to ${GALLERY_INDEX_PATH} and ${SKILL_DIR}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

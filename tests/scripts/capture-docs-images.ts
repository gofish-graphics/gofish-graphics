/**
 * capture-docs-images.ts
 *
 * Pre-renders the docs site's static story pictures (2× retina PNGs):
 *
 *   1. The example gallery: every gallery-tagged Storybook story as a thumbnail
 *      + a branded 1200×630 Open Graph card, plus a dimensions manifest, so the
 *      docs example gallery can hang <img> thumbnails instead of executing ~98
 *      SolidJS chart pipelines live on page load (the old measure-on-mount pass —
 *      see GalleryPage.vue), and shared example links unfurl as a branded chart
 *      card.
 *   2. Story images: every story a `::: gofish … image` container pictures (the
 *      tutorials index cards, for one), cropped to its drawing. See
 *      markdown-it-gofish.ts.
 *
 * These are docs BUILD ARTIFACTS (gitignored, not committed): `docs:build` runs
 * this (`docs:images`) before `vitepress build`, which copies public/ into the
 * deployed site.
 *
 * It renders each story exactly the way capture-one.ts / capture-js-dom.ts do
 * (capture-core.ts), then screenshots the <svg>:
 *   1. Start a Vite dev server serving the stories-runner page
 *   2. Per story, open a FRESH browser context on that page (deviceScaleFactor
 *      2 → retina PNGs) with Playwright's fake clock installed and paused
 *   3. Render the story by its harness story id, hand it capture-core's fixed
 *      virtual time budget, screenshot, and close the context
 *
 * Both halves of step 2 matter for animated stories. The fake clock means an
 * animated story is pictured at the same frame on every build, and the
 * screenshot reads a still page. The fresh context means a story's running
 * `timer()` dies with it: in one shared page nothing disposes a story when the
 * next one renders, so every animated story kept re-rendering in the
 * background for the rest of the run and starved every story after it. With
 * the heavy bird-migration trails panels this stretched the run from about a
 * minute to hours.
 *
 * Both lists come from the SAME sources the docs use, so the file names line up
 * with what the pages load by construction (no re-derived id to drift out of
 * sync): the gallery examples (`id` / `storyId`) from `loadStoryExamples()`, the
 * gallery and docs config's loader; the story images from `findImageStoryIds()`,
 * which reads the docs markdown through the `::: gofish` plugin itself, and
 * their paths from the plugin's `storyImagePath()`.
 *
 * Output:
 *   apps/docs/docs/public/gallery/<id>.png        (chart thumbnail, for the wall)
 *   apps/docs/docs/public/gallery/og/<id>.png     (branded 1200×630 card, og:image)
 *   apps/docs/docs/public/gallery/manifest.json   ({ id: { w, h } }, fetched at runtime)
 *   apps/docs/docs/public/previews/<storyId>.png  (story image, for <GoFishImage>)
 */

import { type Page } from "playwright";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  printLine,
  renderStoryOnFakeClock,
  withHarness,
  type OpenRunnerPage,
} from "./capture-core";

// The docs package is `type: commonjs` while this one is `type: module`, so a
// static named import of this .ts trips Node's CJS↔ESM named-export interop under
// tsx. A dynamic import with a default-namespace fallback is robust either way.
// This is the SAME loader the gallery + docs config use, so the example `id`s line
// up with the runtime `ex.id` and the `/js/examples/<id>` slugs by construction.
async function loadGalleryExamples(): Promise<
  { id: string; title: string; storyId: string }[]
> {
  const mod: any = await import(
    "../../apps/docs/docs/.vitepress/data/storyExamples.ts"
  );
  const load = mod.loadStoryExamples ?? mod.default?.loadStoryExamples;
  if (typeof load !== "function")
    throw new Error("loadStoryExamples export not found in storyExamples.ts");
  return load();
}

// The `::: gofish` markdown plugin: which stories the docs picture with
// `image`, and where each picture lives. Same interop dance as above.
async function loadImagePlugin(): Promise<{
  findImageStoryIds: () => string[];
  STORY_IMAGES_DIR: string;
  storyImagePath: (storyId: string) => string;
}> {
  const mod: any = await import(
    "../../apps/docs/docs/.vitepress/markdown-it-gofish.ts"
  );
  const plugin = mod.findImageStoryIds ? mod : mod.default;
  if (typeof plugin?.findImageStoryIds !== "function")
    throw new Error(
      "findImageStoryIds export not found in markdown-it-gofish.ts"
    );
  return plugin;
}

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const REPO_ROOT = join(TESTS_DIR, "..");
const DOCS_PUBLIC_DIR = join(REPO_ROOT, "apps/docs/docs/public");
const PUBLIC_DIR = join(DOCS_PUBLIC_DIR, "gallery");
// Branded 1200×630 social-preview cards (logo + wordmark + marcom + the chart),
// used as each example page's og:image so shared links keep GoFish branding.
const OG_DIR = join(PUBLIC_DIR, "og");
const LOGO_PATH = join(REPO_ROOT, "apps/docs/docs/public/gofish-logo.png");
// Manifest sits next to the thumbnails under public/ and is fetched at runtime by
// GalleryPage.vue (not statically imported) so dev works before it's generated.
const MANIFEST_PATH = join(PUBLIC_DIR, "manifest.json");
const VITE_PORT = 3007; // distinct from capture-js-dom (3001) / capture-one (3002)

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}

/**
 * Branded Open Graph card: cream background + rounded grass-green border, the
 * GoFish fish logo + wordmark and "gofish.graphics" across the top, the example's
 * chart featured in the middle, and the title + "graphics that communicate" tagline
 * along the bottom — echoing public/og-image.png so shared example links stay on
 * brand. `chartUrl` / `logoUrl` are base64 data URLs so the page needs no server.
 */
function cardHtml(chartUrl: string, logoUrl: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px}
.card{width:1200px;height:630px;padding:30px;background:#eef6e6;font-family:"Source Sans 3",sans-serif}
.inner{width:100%;height:100%;border:2px solid #7cb45a;border-radius:26px;padding:30px 44px;display:flex;flex-direction:column;background:linear-gradient(165deg,#fbfdf7,#f0f7e9)}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px}
.brand img{height:58px;width:auto}
.word{font-family:"Baloo 2",cursive;font-weight:700;font-size:48px;color:#2e4a1c;line-height:1}
.url{font-family:"Baloo 2",cursive;font-weight:700;font-size:23px;color:#4f9130}
.chart{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;margin:18px 0}
.chart img{max-width:100%;max-height:100%;object-fit:contain}
.bottom{display:flex;align-items:baseline;justify-content:space-between;gap:24px}
.title{font-weight:600;font-size:30px;color:#2e4a1c;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tag{font-weight:700;font-size:22px;color:#4f9130;white-space:nowrap}
</style></head>
<body><div class="card"><div class="inner">
<div class="top"><div class="brand"><img src="${logoUrl}"><span class="word">GoFish</span></div><span class="url">gofish.graphics</span></div>
<div class="chart"><img src="${chartUrl}"></div>
<div class="bottom"><span class="title">${escapeHtml(title)}</span><span class="tag">graphics that communicate</span></div>
</div></div></body></html>`;
}

const dataUrl = (png: Buffer) =>
  "data:image/png;base64," + png.toString("base64");

/**
 * Render one story in a fresh runner page (its own context, on the fake clock;
 * see the header comment), run `shoot` on the drawn page, then close the
 * context, which also stops any timer the story started. Throws when the story
 * fails to render.
 */
async function withStoryPage<T>(
  open: OpenRunnerPage,
  storyId: string,
  shoot: (page: Page) => Promise<T>
): Promise<T> {
  // deviceScaleFactor 2 → screenshots are 2× PNGs (retina-sharp at the CSS
  // w/h recorded in the manifest).
  const { context, page } = await open(printLine, { deviceScaleFactor: 2 });
  try {
    const error = await renderStoryOnFakeClock(
      page,
      storyId,
      storyId,
      printLine
    );
    if (error) throw new Error(error);
    return await shoot(page);
  } finally {
    await context.close();
  }
}

type Shot = { png: Buffer; width: number; height: number } | { skip: string };

async function main() {
  const examples = await loadGalleryExamples();
  console.log(`Found ${examples.length} gallery examples.`);
  const { findImageStoryIds, STORY_IMAGES_DIR, storyImagePath } =
    await loadImagePlugin();
  const imageStoryIds = findImageStoryIds();
  console.log(`Found ${imageStoryIds.length} story image(s) in the docs.\n`);

  const manifest: Record<string, { w: number; h: number }> = {};
  // Keep each thumbnail's bytes in memory so the OG-card pass can reuse them
  // without reading every PNG back off disk.
  const captured: { id: string; title: string; png: Buffer }[] = [];
  const failed: string[] = [];

  await withHarness(HARNESS_DIR, VITE_PORT, async (open, browser) => {
    // Fresh output dir each run so a removed gallery story doesn't leave a stale PNG.
    if (existsSync(PUBLIC_DIR)) rmSync(PUBLIC_DIR, { recursive: true });
    mkdirSync(PUBLIC_DIR, { recursive: true });

    for (const ex of examples) {
      process.stdout.write(`  ${ex.title} (${ex.id}) ... `);
      try {
        const shot = await withStoryPage(
          open,
          ex.storyId,
          async (page): Promise<Shot> => {
            // Measure the svg in one evaluate and screenshot the page
            // clipped to that box.
            const box = await page.evaluate(() => {
              const svg = document.querySelector("#stories-root svg");
              if (!svg) return null;
              const r = svg.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            });
            if (!box) return { skip: "no svg" };
            if (box.width <= 0 || box.height <= 0) return { skip: "empty box" };
            const png = await page.screenshot({
              type: "png",
              omitBackground: true,
              clip: box,
            });
            return { png, width: box.width, height: box.height };
          }
        );
        if ("skip" in shot) {
          console.log(`SKIP (${shot.skip})`);
          failed.push(ex.id);
          continue;
        }
        writeFileSync(join(PUBLIC_DIR, `${ex.id}.png`), shot.png);
        manifest[ex.id] = {
          w: Math.round(shot.width),
          h: Math.round(shot.height),
        };
        captured.push({ id: ex.id, title: ex.title, png: shot.png });
        console.log(
          `OK (${Math.round(shot.width)}×${Math.round(shot.height)})`
        );
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
        failed.push(ex.id);
      }
    }

    // Sorted keys → stable diffs for the manifest.
    const sorted: Record<string, { w: number; h: number }> = {};
    for (const k of Object.keys(manifest).sort()) sorted[k] = manifest[k];
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(sorted, null, 2) + "\n",
      "utf-8"
    );
    console.log(
      `\nWrote ${captured.length} PNG(s) to ${PUBLIC_DIR}` +
        `\nWrote manifest (${captured.length} entries) to ${MANIFEST_PATH}`
    );

    // ---- Story images for `::: gofish … image` containers, in their own
    // directory, also rebuilt fresh each run.
    const imagesDir = join(DOCS_PUBLIC_DIR, STORY_IMAGES_DIR);
    console.log(`\nCapturing ${imageStoryIds.length} story image(s)...`);
    if (existsSync(imagesDir)) rmSync(imagesDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });
    let imageCount = 0;
    for (const storyId of imageStoryIds) {
      process.stdout.write(`  ${storyId} ... `);
      try {
        const shot = await withStoryPage(
          open,
          storyId,
          async (page): Promise<Shot> => {
            // Crop to the drawing, not the story's own canvas (its margins
            // would only shrink the drawing inside a small preview cell):
            // give the svg a viewBox of its getBBox() plus 2% of the longer
            // side (slack so strokes on the outermost marks are not clipped),
            // drawn at one CSS px per user unit, and screenshot that. The
            // viewBox also brings in any marks that overflow the story's own
            // canvas.
            const box = await page.evaluate(() => {
              const svg =
                document.querySelector<SVGSVGElement>("#stories-root svg");
              if (!svg) return null;
              const b = svg.getBBox();
              if (!(b.width > 0 && b.height > 0)) return null;
              const pad = 0.02 * Math.max(b.width, b.height);
              const w = b.width + 2 * pad;
              const h = b.height + 2 * pad;
              svg.setAttribute(
                "viewBox",
                `${b.x - pad} ${b.y - pad} ${w} ${h}`
              );
              svg.style.width = `${w}px`;
              svg.style.height = `${h}px`;
              const r = svg.getBoundingClientRect();
              return {
                x: r.x + window.scrollX,
                y: r.y + window.scrollY,
                width: r.width,
                height: r.height,
              };
            });
            if (!box) return { skip: "no svg, or an empty drawing" };
            // fullPage so a drawing wider or taller than the viewport is not
            // trimmed to it; `clip` is then in page coordinates.
            const png = await page.screenshot({
              type: "png",
              omitBackground: true,
              fullPage: true,
              clip: box,
            });
            return { png, width: box.width, height: box.height };
          }
        );
        if ("skip" in shot) {
          console.log(`SKIP (${shot.skip})`);
          failed.push(storyId);
          continue;
        }
        writeFileSync(join(DOCS_PUBLIC_DIR, storyImagePath(storyId)), shot.png);
        imageCount++;
        console.log(
          `OK (${Math.round(shot.width)}×${Math.round(shot.height)})`
        );
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
        failed.push(storyId);
      }
    }
    console.log(`Wrote ${imageCount} story image(s) to ${imagesDir}`);

    // ---- Branded OG cards (1200×630, deviceScaleFactor 1 for exact dimensions).
    console.log(`\nBuilding ${captured.length} branded OG card(s)...`);
    mkdirSync(OG_DIR, { recursive: true });
    const logoUrl = dataUrl(readFileSync(LOGO_PATH));
    const cardCtx = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    const cardPage = await cardCtx.newPage();
    for (const { id, title, png } of captured) {
      await cardPage.setContent(cardHtml(dataUrl(png), logoUrl, title), {
        waitUntil: "load",
      });
      await cardPage.evaluate(() => (document as any).fonts.ready);
      const el = await cardPage.$(".card");
      if (!el) {
        console.log(`  card FAILED: ${id}`);
        failed.push(id);
        continue;
      }
      writeFileSync(
        join(OG_DIR, `${id}.png`),
        await el.screenshot({ type: "png" })
      );
    }
    await cardCtx.close();
    console.log(`Wrote ${captured.length} OG card(s) to ${OG_DIR}`);
  });

  if (failed.length) {
    console.error(`\n${failed.length} image(s) failed to capture:`);
    for (const id of failed) console.error(`  ${id}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

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
 * It reuses the same headless harness as capture-one.ts / capture-js-dom.ts:
 *   1. Start a Vite dev server serving the stories-runner page
 *   2. Navigate Playwright to that page ONCE (deviceScaleFactor 2 → retina PNGs)
 *   3. Render each story by its harness story id and screenshot the <svg>
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

import { chromium, type Browser, type Page } from "playwright";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { startViteServer, waitForVite } from "./capture-core";

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

/** Render one story into the runner page; throws when it fails. */
async function renderStory(page: Page, storyId: string): Promise<void> {
  const ok = await page.evaluate(
    async (sid) => (window as any).__renderStory__(sid),
    storyId
  );
  if (!ok) {
    throw new Error(
      await page.evaluate(() => (window as any).__STORY_RENDER_ERROR__)
    );
  }
  await page.waitForFunction(
    () => (window as any).__STORY_RENDER_DONE__ === true,
    { timeout: 15_000 }
  );
}

async function main() {
  const examples = await loadGalleryExamples();
  console.log(`Found ${examples.length} gallery examples.`);
  const { findImageStoryIds, STORY_IMAGES_DIR, storyImagePath } =
    await loadImagePlugin();
  const imageStoryIds = findImageStoryIds();
  console.log(`Found ${imageStoryIds.length} story image(s) in the docs.\n`);

  const viteProc = startViteServer(HARNESS_DIR, VITE_PORT);
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));

  let browser: Browser | undefined;
  const manifest: Record<string, { w: number; h: number }> = {};
  // Keep each thumbnail's bytes in memory so the OG-card pass can reuse them
  // without reading every PNG back off disk.
  const captured: { id: string; title: string; png: Buffer }[] = [];
  const failed: string[] = [];

  try {
    await waitForVite(VITE_PORT);

    browser = await chromium.launch({ headless: true });
    // deviceScaleFactor 2 → element.screenshot writes a 2× PNG (retina-sharp at
    // the CSS w/h recorded in the manifest).
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[browser] ${msg.text()}`);
      else if (process.env.DEBUG)
        console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) =>
      console.error(`[browser pageerror] ${err.message}`)
    );

    await page.goto(`http://localhost:${VITE_PORT}/stories-runner.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => (window as any).__STORIES_RUNNER_READY__ === true,
      { timeout: 30_000 }
    );
    const runnerError = await page.evaluate(
      () => (window as any).__STORIES_RUNNER_ERROR__
    );
    if (runnerError)
      throw new Error(`Stories runner failed to initialize: ${runnerError}`);

    // Fresh output dir each run so a removed gallery story doesn't leave a stale PNG.
    if (existsSync(PUBLIC_DIR)) rmSync(PUBLIC_DIR, { recursive: true });
    mkdirSync(PUBLIC_DIR, { recursive: true });

    for (const ex of examples) {
      process.stdout.write(`  ${ex.title} (${ex.id}) ... `);
      try {
        await renderStory(page, ex.storyId);

        // Measure the svg in one evaluate and screenshot the page clipped to
        // that box, rather than holding an element handle: an animated story
        // replaces its svg every frame, so a handle taken before the
        // screenshot is detached by the time it is used.
        const box = await page.evaluate(() => {
          const svg = document.querySelector("#stories-root svg");
          if (!svg) return null;
          const r = svg.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        if (!box) {
          console.log("SKIP (no svg)");
          failed.push(ex.id);
          continue;
        }
        if (box.width <= 0 || box.height <= 0) {
          console.log("SKIP (empty box)");
          failed.push(ex.id);
          continue;
        }

        const png = await page.screenshot({
          type: "png",
          omitBackground: true,
          clip: box,
        });
        writeFileSync(join(PUBLIC_DIR, `${ex.id}.png`), png);
        manifest[ex.id] = {
          w: Math.round(box.width),
          h: Math.round(box.height),
        };
        captured.push({ id: ex.id, title: ex.title, png });
        console.log(`OK (${Math.round(box.width)}×${Math.round(box.height)})`);
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
        await renderStory(page, storyId);

        // Crop to the drawing, not the story's own canvas (its margins would
        // only shrink the drawing inside a small preview cell): give the svg a
        // viewBox of its getBBox() plus 2% of the longer side (slack so strokes
        // on the outermost marks are not clipped), drawn at one CSS px per
        // user unit, and screenshot that. The viewBox also brings in any
        // marks that overflow the story's own canvas.
        const box = await page.evaluate(() => {
          const svg =
            document.querySelector<SVGSVGElement>("#stories-root svg");
          if (!svg) return null;
          const b = svg.getBBox();
          if (!(b.width > 0 && b.height > 0)) return null;
          const pad = 0.02 * Math.max(b.width, b.height);
          const w = b.width + 2 * pad;
          const h = b.height + 2 * pad;
          svg.setAttribute("viewBox", `${b.x - pad} ${b.y - pad} ${w} ${h}`);
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
        if (!box) {
          console.log("SKIP (no svg, or an empty drawing)");
          failed.push(storyId);
          continue;
        }
        // fullPage so a drawing wider or taller than the viewport is not
        // trimmed to it; `clip` is then in page coordinates.
        const png = await page.screenshot({
          type: "png",
          omitBackground: true,
          fullPage: true,
          clip: box,
        });
        writeFileSync(join(DOCS_PUBLIC_DIR, storyImagePath(storyId)), png);
        imageCount++;
        console.log(`OK (${Math.round(box.width)}×${Math.round(box.height)})`);
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
        failed.push(storyId);
      }
    }
    console.log(`Wrote ${imageCount} story image(s) to ${imagesDir}`);
    await context.close();

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

    if (failed.length) {
      console.error(`\n${failed.length} image(s) failed to capture:`);
      for (const id of failed) console.error(`  ${id}`);
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    viteProc.kill();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

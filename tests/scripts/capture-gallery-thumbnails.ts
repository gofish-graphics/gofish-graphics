/**
 * capture-gallery-thumbnails.ts
 *
 * Pre-renders every gallery-tagged Storybook story to a PNG thumbnail (2× retina)
 * + a branded 1200×630 Open Graph card, plus a dimensions manifest, so the docs
 * example gallery can hang <img> thumbnails instead of executing ~98 SolidJS chart
 * pipelines live on page load (the old measure-on-mount pass — see GalleryPage.vue),
 * and shared example links unfurl as a branded chart card.
 *
 * These are docs BUILD ARTIFACTS (gitignored, not committed): `predocs:build` runs
 * this before `vitepress build`, which copies public/ into the deployed site.
 *
 * It reuses the same headless harness as capture-one.ts / capture-js-dom.ts:
 *   1. Start a Vite dev server serving the stories-runner page
 *   2. Navigate Playwright to that page ONCE (deviceScaleFactor 2 → retina PNGs)
 *   3. Render each gallery example by its harness story id and screenshot the <svg>
 *
 * The example list (and each example's `id` / `storyId`) comes from the SAME source
 * the gallery and docs config use — `loadStoryExamples()` — so the PNG/manifest keys
 * line up with the runtime `ex.id` and the `/js/examples/<id>` page slugs by
 * construction (no re-derived id to drift out of sync).
 *
 * Output:
 *   apps/docs/docs/public/gallery/<id>.png        (chart thumbnail, for the wall)
 *   apps/docs/docs/public/gallery/og/<id>.png     (branded 1200×630 card, og:image)
 *   apps/docs/docs/public/gallery/manifest.json   ({ id: { w, h } }, fetched at runtime)
 */

import { chromium, type Browser } from "playwright";
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

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const REPO_ROOT = join(TESTS_DIR, "..");
const PUBLIC_DIR = join(REPO_ROOT, "apps/docs/docs/public/gallery");
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

async function main() {
  const examples = await loadGalleryExamples();
  console.log(`Found ${examples.length} gallery examples.\n`);

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
        const ok = await page.evaluate(
          async (sid) => (window as any).__renderStory__(sid),
          ex.storyId
        );
        if (!ok) {
          const err = await page.evaluate(
            () => (window as any).__STORY_RENDER_ERROR__
          );
          console.log(`FAILED: ${err}`);
          failed.push(ex.id);
          continue;
        }
        await page.waitForFunction(
          () => (window as any).__STORY_RENDER_DONE__ === true,
          { timeout: 15_000 }
        );

        const svg = await page.$("#stories-root svg");
        if (!svg) {
          console.log("SKIP (no svg)");
          failed.push(ex.id);
          continue;
        }
        const box = await svg.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) {
          console.log("SKIP (empty box)");
          failed.push(ex.id);
          continue;
        }

        const png = await svg.screenshot({ type: "png", omitBackground: true });
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
      console.error(`\n${failed.length} example(s) failed to capture:`);
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

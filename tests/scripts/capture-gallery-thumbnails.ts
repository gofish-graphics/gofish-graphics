/**
 * capture-gallery-thumbnails.ts
 *
 * Pre-renders every gallery-tagged Storybook story to a committed PNG thumbnail
 * (2× retina) plus a dimensions manifest, so the docs example gallery can hang
 * <img> thumbnails instead of executing ~92 SolidJS chart pipelines live on page
 * load (the old measure-on-mount pass — see GalleryPage.vue).
 *
 * It reuses the same headless harness as capture-one.ts / capture-js-dom.ts:
 *   1. Start a Vite dev server serving the stories-runner page
 *   2. Navigate Playwright to that page ONCE (deviceScaleFactor 2 → retina PNGs)
 *   3. List stories, keep the gallery-tagged ones, render + screenshot each <svg>
 *
 * Output (committed, like the screenshot baselines):
 *   apps/docs/docs/public/gallery/<id>.png                  (one per example)
 *   apps/docs/docs/.vitepress/data/galleryThumbnails.json   ({ id: { w, h } })
 *
 * The <id> is kebab(gallery.title) — identical to the gallery id derived by
 * apps/docs/docs/.vitepress/data/storyExamples.ts, so the keys line up with the
 * `ex.id` GalleryPage.vue iterates and the `/js/examples/<id>` page slugs.
 *
 * Run after adding/removing a gallery story:  pnpm --filter @gofish/tests capture-gallery
 */

import { chromium, type Browser } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const REPO_ROOT = join(TESTS_DIR, "..");
const PUBLIC_DIR = join(REPO_ROOT, "apps/docs/docs/public/gallery");
const MANIFEST_PATH = join(
  REPO_ROOT,
  "apps/docs/docs/.vitepress/data/galleryThumbnails.json"
);
const VITE_PORT = 3007; // distinct from capture-js-dom (3001) / capture-one (3002)

/** Mirror of kebab() in apps/docs/docs/.vitepress/data/storyExamples.ts. */
function kebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface StoryInfo {
  id: string;
  title: string;
  name: string;
  gallery?: { title: string; description: string };
}

function startViteServer(): ChildProcess {
  return spawn(
    "npx",
    [
      "vite",
      "--config",
      join(HARNESS_DIR, "vite.config.ts"),
      "--port",
      String(VITE_PORT),
    ],
    {
      cwd: HARNESS_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    }
  );
}

async function waitForVite(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://localhost:${port}/stories-runner.html`);
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite server did not start within ${timeoutMs}ms`);
}

async function main() {
  const viteProc = startViteServer();
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));

  let browser: Browser | undefined;
  const manifest: Record<string, { w: number; h: number }> = {};
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

    const allStories = (await page.evaluate(() =>
      (window as any).__listStories__()
    )) as StoryInfo[];
    const gallery = allStories.filter((s) => s.gallery?.title);

    console.log(`Found ${gallery.length} gallery-tagged stories.\n`);

    // Fresh output dir each run so a removed gallery story doesn't leave a stale PNG.
    if (existsSync(PUBLIC_DIR)) rmSync(PUBLIC_DIR, { recursive: true });
    mkdirSync(PUBLIC_DIR, { recursive: true });

    for (const story of gallery) {
      const id = kebab(story.gallery!.title);
      process.stdout.write(`  ${story.gallery!.title} (${id}) ... `);

      try {
        const ok = await page.evaluate(
          async (sid) => (window as any).__renderStory__(sid),
          story.id
        );
        if (!ok) {
          const err = await page.evaluate(
            () => (window as any).__STORY_RENDER_ERROR__
          );
          console.log(`FAILED: ${err}`);
          failed.push(id);
          continue;
        }
        await page.waitForFunction(
          () => (window as any).__STORY_RENDER_DONE__ === true,
          { timeout: 15_000 }
        );

        const svg = await page.$("#stories-root svg");
        if (!svg) {
          console.log("SKIP (no svg)");
          failed.push(id);
          continue;
        }
        const box = await svg.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) {
          console.log("SKIP (empty box)");
          failed.push(id);
          continue;
        }

        writeFileSync(
          join(PUBLIC_DIR, `${id}.png`),
          await svg.screenshot({ type: "png", omitBackground: true })
        );
        manifest[id] = { w: Math.round(box.width), h: Math.round(box.height) };
        console.log(`OK (${Math.round(box.width)}×${Math.round(box.height)})`);
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
        failed.push(id);
      }
    }

    // Sorted keys → stable diffs for the committed manifest.
    const sorted: Record<string, { w: number; h: number }> = {};
    for (const k of Object.keys(manifest).sort()) sorted[k] = manifest[k];
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(sorted, null, 2) + "\n",
      "utf-8"
    );

    const pngCount = readdirSync(PUBLIC_DIR).filter((f) =>
      f.endsWith(".png")
    ).length;
    console.log(
      `\nWrote ${pngCount} PNG(s) to ${PUBLIC_DIR}` +
        `\nWrote manifest (${Object.keys(sorted).length} entries) to ${MANIFEST_PATH}`
    );
    if (failed.length) {
      console.error(`\n${failed.length} example(s) failed to capture:`);
      for (const id of failed) console.error(`  ${id}`);
      process.exitCode = 1;
    }

    await context.close();
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

/**
 * live-view.ts
 *
 * Live stories for the review pages: the Visual Diff Review site (CI's and
 * the local review server's, build-review-site.ts) and capture-diff's
 * report.html. A reviewer opens a story live and gets the real story running
 * in a frame, so pointer input, sliders and animation work, where the page
 * otherwise shows only a static capture.
 *
 * The frame loads the same harness page the captures render stories in
 * (tests/harness/stories-runner.html), built once as static files by
 * `buildLiveHarness` and shipped next to the page. That page renders the
 * story its query names (`liveSrc`) on the real clock (see "Live mode" in
 * stories-runner.ts). Each story module is its own chunk of the build, so a
 * frame loads only the library and its one story.
 *
 * `LIVE_CSS` and `LIVE_SCRIPT` are the page side: `gofishLive.mount(slot,
 * src, note)` frames a story in `slot` and `gofishLive.unmount(slot)` removes
 * it. Nothing is framed until a page calls `mount`, and at most
 * `LIVE_MAX_OPEN` slots are live at once: opening one more unmounts the
 * oldest.
 */

import { build } from "vite";
import { realpathSync } from "fs";
import { join } from "path";
import type { StorySpec } from "./story-specs.js";

/** Where a built harness goes in a review site, relative to its page. */
export const LIVE_DIR = "live";

/** How many slots a page keeps live at once. */
export const LIVE_MAX_OPEN = 4;

/**
 * Build the harness rooted at `harnessDir` (its vite.config.ts and
 * stories-runner.html) as static files into `outDir`. Paths in the build are
 * relative, so it works under any directory of a site. Takes a few seconds.
 */
export async function buildLiveHarness(
  harnessDirPath: string,
  outDir: string
): Promise<void> {
  // The real path: the harness config roots Vite at its own `__dirname`,
  // which is real, and the input must be under that root (a base-ref
  // worktree under /tmp is /private/tmp on macOS).
  const harnessDir = realpathSync(harnessDirPath);
  await build({
    configFile: join(harnessDir, "vite.config.ts"),
    root: harnessDir,
    base: "./",
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: join(harnessDir, "stories-runner.html") },
      // The library chunk and some datasets are over Vite's 500 kB warning;
      // that is expected here.
      chunkSizeWarningLimit: 100_000,
    },
  });
}

/** The URL, relative to the page, of `spec`'s story live in the harness
 *  built into `<LIVE_DIR>/<side>/`. */
export function liveSrc(
  side: string,
  spec: Pick<StorySpec, "storyFile" | "exportName">
): string {
  const query = new URLSearchParams({
    file: spec.storyFile,
    story: spec.exportName,
  });
  return `${LIVE_DIR}/${side}/stories-runner.html?${query}`;
}

/** CSS for the slots `gofishLive.mount` fills. Pages include it once. */
export const LIVE_CSS = `
  .live-slot { min-width: 0; }
  .live-clip { position: relative; overflow: hidden; background: #fff; }
  .live-clip iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #fff; }
  .live-clip iframe:focus-visible { outline: 3px solid #2980b9; outline-offset: -3px; }
  .live-bar { display: flex; gap: 10px; align-items: baseline; font-size: 12px; color: #666; margin-top: 6px; flex-wrap: wrap; }
  .live-bar a { color: #2471a3; }
  .live-bar a:focus-visible, .live-toggle:focus-visible { outline: 3px solid #2980b9; outline-offset: 2px; }
  .live-note { padding: 16px; color: #888; font-size: 13px; }
`;

/**
 * The page side, as a script body. It defines `window.gofishLive`:
 *
 * - `mount(slot, src, note, onEvict?)` frames the story at `src` in the
 *   element `slot`, with `note` and an "Open in new tab" link below it.
 *   `onEvict` runs when the slot is unmounted to make room for another.
 * - `unmount(slot)` removes the frame, which stops the story.
 *
 * The frame shows the story at the scale it was captured at: the harness
 * page posts the box the story draws in (`gofish-live-size`: the root a
 * capture screenshots, cut to what is drawn), and the frame shows only that
 * box, at 1:1, scaled down only when the slot is narrower. The box only
 * grows, so a tooltip that closes does not move the story under the
 * pointer. The frame's viewport is the captures' 1280 x 720, so the story
 * lays out as it did when it was captured.
 */
export const LIVE_SCRIPT = `
  (() => {
    const VIEWPORT_W = 1280;
    const VIEWPORT_H = 720;
    const MAX_OPEN = ${LIVE_MAX_OPEN};
    /** Live slots, oldest first: { slot, iframe, clip, size, onEvict } */
    const open = [];

    function layout(entry) {
      const { slot, iframe, clip, size } = entry;
      const box = size || { left: 8, top: 8, width: VIEWPORT_W - 16, height: 300 };
      const avail = slot.clientWidth || box.width;
      const s = Math.min(1, avail / box.width);
      clip.style.width = box.width * s + 'px';
      clip.style.height = box.height * s + 'px';
      iframe.style.width = VIEWPORT_W + 'px';
      iframe.style.height = Math.max(VIEWPORT_H, box.top + box.height + 8) + 'px';
      iframe.style.transform = 'scale(' + s + ') translate(' + -box.left + 'px,' + -box.top + 'px)';
    }

    function unmount(slot) {
      const i = open.findIndex((e) => e.slot === slot);
      if (i < 0) return;
      const [entry] = open.splice(i, 1);
      slot.replaceChildren();
      return entry;
    }

    function mount(slot, src, note, onEvict) {
      unmount(slot);
      while (open.length >= MAX_OPEN) {
        const oldest = unmount(open[0].slot);
        if (oldest && oldest.onEvict) oldest.onEvict();
      }
      if (location.protocol === 'file:') {
        // A module script does not load from file://, so the harness
        // cannot run in a page opened from disk.
        const div = document.createElement('div');
        div.className = 'live-note';
        div.textContent = 'Live needs this page served over http. Run pnpm capture-diff:serve and open the address it prints.';
        slot.replaceChildren(div);
        return;
      }
      const clip = document.createElement('div');
      clip.className = 'live-clip';
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'Live story: ' + note;
      clip.appendChild(iframe);
      const bar = document.createElement('div');
      bar.className = 'live-bar';
      const label = document.createElement('span');
      label.textContent = note;
      const link = document.createElement('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open in new tab';
      bar.append(label, link);
      slot.replaceChildren(clip, bar);
      const entry = { slot, iframe, clip, size: null, onEvict };
      open.push(entry);
      layout(entry);
    }

    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'gofish-live-size') return;
      const entry = open.find((o) => o.iframe.contentWindow === e.source);
      if (!entry) return;
      const old = entry.size || { width: 1, height: 1 };
      entry.size = {
        left: e.data.left, top: e.data.top,
        width: Math.max(old.width, e.data.width),
        height: Math.max(old.height, e.data.height),
      };
      layout(entry);
    });
    window.addEventListener('resize', () => open.forEach(layout));

    window.gofishLive = { mount, unmount };
  })();
`;

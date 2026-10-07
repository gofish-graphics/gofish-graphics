/**
 * Batch story runner — loads story modules via Vite's import.meta.glob, then
 * exposes functions for Playwright to list and render stories one at a time
 * in the same page (no navigation between stories).
 *
 * `?module=<moduleKey>` loads only that one story module (the key is a
 * `StoryInfo.moduleKey` from an earlier `__listStories__`); without it every
 * story module is loaded. The capture opens a fresh page per story (see
 * tests/scripts/capture-core.ts), and loading the whole corpus there, data
 * included, to render one story was most of each story's capture time.
 */

import { disposeChart } from "../../packages/gofish-graphics/src/ast/gofish";

// Both workspace packages with stories are scanned: gofish-graphics and the
// gofish-gotree tree-DSL package (the latter compiles its SolidJS source directly
// via the relative `../../src` import in its stories, so no built dist is needed).
const storyModuleLoaders = {
  ...import.meta.glob(
    "../../packages/gofish-graphics/stories/**/*.stories.tsx"
  ),
  ...import.meta.glob("../../packages/gofish-gotree/stories/**/*.stories.tsx"),
} as Record<string, () => Promise<any>>;

/** The loaded story modules by module key, filled in before the runner
 *  signals ready (see the bottom of this file). */
const storyModules: Record<string, any> = {};

interface StoryInfo {
  id: string;
  title: string;
  name: string;
  moduleKey: string;
  hasLoaders: boolean;
  tags: string[];
  gallery?: { title: string; description: string };
}

/** Build a flat list of all stories from the imported modules. */
function buildStoryList(): StoryInfo[] {
  const stories: StoryInfo[] = [];

  for (const [moduleKey, mod] of Object.entries(storyModules)) {
    const meta = mod.default;
    if (!meta?.title) continue;

    // Each named export (other than default) is a story
    for (const [exportName, story] of Object.entries(mod)) {
      if (exportName === "default") continue;
      if (typeof (story as any)?.render !== "function") continue;

      const id = `${meta.title}--${exportName}`
        .toLowerCase()
        .replace(/[\s/]+/g, "-");

      const s = story as any;

      stories.push({
        id,
        title: meta.title,
        name: exportName,
        moduleKey,
        hasLoaders: !!s.loaders?.length,
        tags: [...(meta.tags ?? []), ...(s.tags ?? [])],
        gallery: s.parameters?.gallery,
      });
    }
  }

  return stories;
}

let allStories: StoryInfo[] = [];

// ---------------------------------------------------------------------------
// Exposed to Playwright via page.evaluate
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __listStories__: () => StoryInfo[];
    __renderStory__: (id: string) => Promise<boolean>;
    __STORY_RENDER_DONE__: boolean;
    __STORY_RENDER_ERROR__: string | null;
    // Wall time from render start through the rAF flush, EXCLUDING the trailing
    // settle setTimeout — the bench reads this as the un-instrumented engine time.
    __STORY_RENDER_WALL_MS__: number;
    __STORIES_RUNNER_READY__: boolean;
    __STORIES_RUNNER_ERROR__: string | null;
  }
}

window.__listStories__ = () => allStories;

/** The children `<body>` had at load; anything else there a story appended. */
const bodyAtLoad = new Set<Node>(document.body.childNodes);

/**
 * Tear down whatever the previous story rendered before the next one renders
 * into this same page. Clearing the DOM is not enough: a chart that read an
 * input (a `timer()`, a slider) keeps an interaction runtime, and a live input
 * keeps re-rendering that chart into its detached container forever. So every
 * chart is disposed first, then the root is cleared and the containers the
 * stories' `initializeContainer()` appended to `<body>` are removed.
 *
 * Charts are found by the `__gofishState` they leave on their containers,
 * not through a registry in the engine, which this page's engine source and
 * the prod bench's `dist-bench` bundle would not share (see "Frame
 * publication" in the Rendering essay).
 */
function disposePreviousStory(root: HTMLElement): void {
  for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
    disposeChart(el);
  }
  root.innerHTML = "";
  for (const child of [...document.body.childNodes]) {
    if (!bodyAtLoad.has(child)) child.remove();
  }
}

/**
 * Render a single story into #stories-root.
 * Returns true on success, false on error (check __STORY_RENDER_ERROR__).
 */
window.__renderStory__ = async (id: string): Promise<boolean> => {
  window.__STORY_RENDER_DONE__ = false;
  window.__STORY_RENDER_ERROR__ = null;

  const root = document.getElementById("stories-root")!;
  disposePreviousStory(root);

  const info = allStories.find((s) => s.id === id);
  if (!info) {
    window.__STORY_RENDER_ERROR__ = `Story not found: ${id}`;
    window.__STORY_RENDER_DONE__ = true;
    return false;
  }

  const mod = storyModules[info.moduleKey];
  const story = mod[info.name];

  try {
    // Handle async loaders (vega-lite stories that fetch datasets)
    let context: any = {};
    if (story.loaders?.length) {
      const loaded: Record<string, any> = {};
      for (const loader of story.loaders) {
        Object.assign(loaded, await loader());
      }
      context = { loaded };
    }

    const args = { ...story.args };
    // Some stories (e.g. lowlevel/Treemap) declare an `async render` and
    // await their own data loaders inside. Await unconditionally — `await`
    // on a non-Promise is a no-op, so sync renders are unaffected.
    // (Font-readiness gating lives inside gofish itself now.)
    const t0 = performance.now();
    const element = await story.render(args, context);

    if (element instanceof HTMLElement) {
      root.appendChild(element);
    }

    // Most stories fire `.render(container, ...)` WITHOUT awaiting it and
    // return the container synchronously; the gofish render promise gates on
    // `document.fonts.ready` before layout. On a warm page fonts.ready is
    // already resolved and the rAF + settle below suffices, but each capture
    // now runs in a fresh browser context (see capture-core.ts) where the
    // webfont stylesheet fetch can outlast the settle — leaving "Loading..."
    // in the captured DOM. Await the same gate those renders block on.
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    // Wait a frame for SolidJS to flush
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // Wall clock stops at the rAF flush — the 100ms settle below is capture
    // stabilization, not engine work, so it stays out of the measured time.
    window.__STORY_RENDER_WALL_MS__ = performance.now() - t0;
    // Small extra settle for async renders
    await new Promise((resolve) => setTimeout(resolve, 100));

    window.__STORY_RENDER_DONE__ = true;
    return true;
  } catch (err: any) {
    window.__STORY_RENDER_ERROR__ = err?.message ?? String(err);
    window.__STORY_RENDER_DONE__ = true;
    return false;
  }
};

window.__STORY_RENDER_DONE__ = false;
window.__STORY_RENDER_ERROR__ = null;
window.__STORY_RENDER_WALL_MS__ = 0;
window.__STORIES_RUNNER_READY__ = false;
window.__STORIES_RUNNER_ERROR__ = null;

// Load the requested story modules, then signal that the runner is ready (or
// failed: READY is set either way, so Playwright is unblocked to read the
// error). Modules are keyed in glob order, so the story list's order does not
// depend on which import settles first.
const requested = new URLSearchParams(location.search).get("module");
const moduleKeys = requested ? [requested] : Object.keys(storyModuleLoaders);
try {
  const loaded = await Promise.all(
    moduleKeys.map((key) => {
      const load = storyModuleLoaders[key];
      if (!load) throw new Error(`Unknown story module: ${key}`);
      return load();
    })
  );
  moduleKeys.forEach((key, i) => (storyModules[key] = loaded[i]));
  allStories = buildStoryList();
} catch (err: any) {
  window.__STORIES_RUNNER_ERROR__ = err?.message ?? String(err);
}
window.__STORIES_RUNNER_READY__ = true;

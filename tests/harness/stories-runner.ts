/**
 * Batch story runner — exposes functions for Playwright to list and render
 * stories one at a time in the same page (no navigation between stories).
 *
 * Story modules are loaded lazily, through Vite's import.meta.glob:
 * `__renderStory__` loads only the module of the story it renders, and
 * `__listStories__` is the one call that loads every module. The capture
 * opens a fresh page per story (see tests/scripts/capture-core.ts), and
 * loading the whole corpus there, data included, to render one story was
 * most of each story's capture time.
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

/** Story modules by module key, each loaded on first use. */
const storyModules = new Map<string, Promise<any>>();

function loadModule(moduleKey: string): Promise<any> {
  let mod = storyModules.get(moduleKey);
  if (!mod) {
    const load = storyModuleLoaders[moduleKey];
    if (!load)
      return Promise.reject(new Error(`Unknown story module: ${moduleKey}`));
    mod = load();
    storyModules.set(moduleKey, mod);
  }
  return mod;
}

interface StoryInfo {
  id: string;
  title: string;
  name: string;
  moduleKey: string;
  hasLoaders: boolean;
  tags: string[];
  gallery?: { title: string; description: string };
}

/** What `__renderStory__` takes: a story's module and export name. */
type StoryRef = Pick<StoryInfo, "moduleKey" | "name">;

/** Load every story module and list their stories, in glob order. */
async function listStories(): Promise<StoryInfo[]> {
  const moduleKeys = Object.keys(storyModuleLoaders);
  const modules = await Promise.all(moduleKeys.map(loadModule));
  const stories: StoryInfo[] = [];

  for (const [i, moduleKey] of moduleKeys.entries()) {
    const mod = modules[i];
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

// ---------------------------------------------------------------------------
// Exposed to Playwright via page.evaluate
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __listStories__: () => Promise<StoryInfo[]>;
    __loadStory__: (story: StoryRef) => Promise<void>;
    __renderStory__: (story: StoryRef) => Promise<boolean>;
    __STORY_RENDER_DONE__: boolean;
    __STORY_RENDER_ERROR__: string | null;
    // Wall time from render start through the rAF flush, EXCLUDING the trailing
    // settle setTimeout — the bench reads this as the un-instrumented engine time.
    __STORY_RENDER_WALL_MS__: number;
    __STORIES_RUNNER_READY__: boolean;
  }
}

window.__listStories__ = listStories;

/**
 * Load a story's module without rendering it. `__renderStory__` loads it
 * anyway; this is for a caller that must have the module loaded before the
 * render starts (capture-core's fake clock, which it pauses in between).
 */
window.__loadStory__ = async (story: StoryRef): Promise<void> => {
  await loadModule(story.moduleKey);
};

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
 * Render a single story into #stories-root, loading its module first.
 * Returns true on success, false on error (check __STORY_RENDER_ERROR__).
 */
window.__renderStory__ = async (ref: StoryRef): Promise<boolean> => {
  window.__STORY_RENDER_DONE__ = false;
  window.__STORY_RENDER_ERROR__ = null;

  const root = document.getElementById("stories-root")!;
  disposePreviousStory(root);

  try {
    const story = (await loadModule(ref.moduleKey))[ref.name];
    if (typeof story?.render !== "function") {
      throw new Error(`Story not found: ${ref.moduleKey} ${ref.name}`);
    }

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
window.__STORIES_RUNNER_READY__ = true;

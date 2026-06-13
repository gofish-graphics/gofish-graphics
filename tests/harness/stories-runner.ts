/**
 * Batch story runner — imports all story modules via Vite's import.meta.glob,
 * then exposes functions for Playwright to list and render stories one at a time
 * in the same page (no navigation between stories).
 */

// Import all story modules eagerly so they're available synchronously after page load
const storyModules = import.meta.glob(
  "../../packages/gofish-graphics/stories/**/*.stories.tsx",
  { eager: true }
) as Record<string, any>;

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

const allStories = buildStoryList();

// ---------------------------------------------------------------------------
// Exposed to Playwright via page.evaluate
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __listStories__: () => StoryInfo[];
    __renderStory__: (id: string) => Promise<boolean>;
    __STORY_RENDER_DONE__: boolean;
    __STORY_RENDER_ERROR__: string | null;
    __STORIES_RUNNER_READY__: boolean;
    __STORIES_RUNNER_ERROR__: string | null;
  }
}

window.__listStories__ = () => allStories;

/**
 * Render a single story into #stories-root.
 * Returns true on success, false on error (check __STORY_RENDER_ERROR__).
 */
window.__renderStory__ = async (id: string): Promise<boolean> => {
  window.__STORY_RENDER_DONE__ = false;
  window.__STORY_RENDER_ERROR__ = null;

  const root = document.getElementById("stories-root")!;
  root.innerHTML = "";

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
    const element = await story.render(args, context);

    if (element instanceof HTMLElement) {
      root.appendChild(element);
    }

    // Wait a frame for SolidJS to flush
    await new Promise((resolve) => requestAnimationFrame(resolve));
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
window.__STORIES_RUNNER_READY__ = false;
window.__STORIES_RUNNER_ERROR__ = null;

// Signal that the runner is ready (or failed)
try {
  // Touch allStories to force evaluation now (catches module-load errors)
  void allStories.length;
  window.__STORIES_RUNNER_READY__ = true;
} catch (err: any) {
  window.__STORIES_RUNNER_ERROR__ = err?.message ?? String(err);
  window.__STORIES_RUNNER_READY__ = true; // unblock Playwright so it can read the error
}

/**
 * Site path of the directory of captured story pictures (under `public/`), and
 * of one story's picture in it. The capture script
 * (tests/scripts/capture-docs-images.ts) writes these paths; <GoFishImage> and
 * the landing page load them. They are spelled once, here, in a module with no
 * Node imports so client components can use it too.
 */
export const STORY_IMAGES_DIR = "/previews";
export function storyImagePath(storyId: string): string {
  return `${STORY_IMAGES_DIR}/${storyId}.png`;
}

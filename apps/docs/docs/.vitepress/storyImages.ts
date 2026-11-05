/**
 * Site paths of the captured story pictures (under `public/`), each cropped to
 * its drawing. The capture script (tests/scripts/capture-docs-images.ts)
 * writes these paths; <GoFishImage> loads them. They are spelled once, here,
 * in a module with no Node imports so client components can use it too.
 */
export const STORY_IMAGES_DIR = "/previews";

/** The picture of one story, by harness story id (`::: gofish … image`). */
export function storyImagePath(storyId: string): string {
  return `${STORY_IMAGES_DIR}/${storyId}.png`;
}

/** The picture of one gallery example, by gallery id (the landing page's cards). */
export function exampleImagePath(id: string): string {
  return `${STORY_IMAGES_DIR}/examples/${id}.png`;
}

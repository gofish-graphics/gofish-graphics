/**
 * Render the theming-proposal prototype stories at deviceScaleFactor 2 and
 * write one PNG per story, named after the story (kebab case), into OUT_DIR.
 *
 *   pnpm --filter @gofish/tests exec tsx ../proposals/theming/prototypes/capture2x.ts [filter]
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  HARNESS_DIR,
  discoverStories,
  printLine,
  renderStoryOnFakeClock,
  withHarness,
} from "../../../tests/scripts/capture-core.ts";

const OUT_DIR = join(import.meta.dirname, "../img");
const filter = (process.argv[2] ?? "").toLowerCase();

await withHarness(HARNESS_DIR, 3005, async (open) => {
  const stories = (await discoverStories(open)).filter(
    (s) =>
      s.title.startsWith("Proposals Theming/") &&
      `${s.title}/${s.name}`.toLowerCase().includes(filter)
  );
  mkdirSync(OUT_DIR, { recursive: true });
  for (const story of stories) {
    const file =
      story.name
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/\s+/g, "-")
        .toLowerCase() + ".png";
    const { context, page } = await open(printLine, { deviceScaleFactor: 2 });
    try {
      const err = await renderStoryOnFakeClock(
        page,
        story,
        story.name,
        printLine
      );
      if (err) {
        console.error(`FAILED ${story.name}: ${err}`);
        continue;
      }
      // shrink-wrap the story's container so the shot has no empty margin
      await page.evaluate(() => {
        const c = document.querySelector(
          "#stories-root > *"
        ) as HTMLElement | null;
        if (c && getComputedStyle(c).display === "block")
          c.style.display = "inline-block";
        if (c) c.style.margin = "0";
      });
      if (process.env.DUMP)
        writeFileSync(
          join(OUT_DIR, "..", file.replace(".png", ".dump.html")),
          await page.evaluate(
            () => document.querySelector("#stories-root")!.innerHTML
          )
        );
      const el = await page.$("#stories-root > *");
      if (!el) continue;
      writeFileSync(join(OUT_DIR, file), await el.screenshot({ type: "png" }));
      console.log(`wrote ${join(OUT_DIR, file)}`);
    } finally {
      await context.close();
    }
  }
});

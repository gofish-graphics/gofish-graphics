/**
 * PROTOTYPE(#1395): drive the "Proposals/Tooltips/Measure" story in a real
 * (headless) Chromium with a REAL clock, and print its numbers.
 *
 *   cd tests && CAPTURE_ONE_PORT=4793 pnpm exec tsx ../proposals/tooltips/measure.ts
 *
 * The capture harness installs a fake clock (capture-core.ts), so
 * performance.now() there is virtual; this opens the same runner page without
 * one.
 */
import { withHarness, HARNESS_DIR } from "../../tests/scripts/capture-core.ts";

const port = Number(process.env.CAPTURE_ONE_PORT) || 4793;
const moduleKey =
  "../../packages/gofish-graphics/stories/_proposals/tooltips/Measure.stories.tsx";

await withHarness(HARNESS_DIR, port, async (_open, browser) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto(`http://localhost:${port}/stories-runner.html`);
  await page.waitForFunction(
    () => (window as any).__STORIES_RUNNER_READY__ === true
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(
    (key) => (window as any).__renderStory__({ moduleKey: key, name: "Run" }),
    moduleKey
  );
  await page.waitForFunction(
    () => (window as any).__TT_MEASURE__ !== undefined,
    null,
    {
      timeout: 120_000,
    }
  );
  console.log(
    JSON.stringify(
      await page.evaluate(() => (window as any).__TT_MEASURE__),
      null,
      2
    )
  );
  await context.close();
});

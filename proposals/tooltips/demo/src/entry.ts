// The live demos of the tooltip proposal page (#1395): `window.TooltipDemos`.
//
// Build, from the repo root:
//   pnpm --filter gofish-graphics exec vite build --config ../../proposals/tooltips/demo/vite.config.mjs
// It writes proposals/tooltips/demo/tooltip-demos.js, one minified IIFE with
// GoFish (from source) and solid-js inside.
//
// Each demo is the `mount*` function its Interactive story calls, so the page
// and Storybook run one implementation.
import { mountInteractive as issueBar } from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/IssueBar.stories";
import {
  mountInteractiveSegment as stackSegment,
  mountInteractiveWholeStack as stackWhole,
} from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/StackedBar.stories";
import { mountInteractive as linesShared } from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/SharedLines.stories";
import { mountInteractive as scatterNearest } from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/ScatterNearest.stories";
import { mountInteractive as chartInTooltip } from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/ChartInTooltip.stories";
import { mountInteractiveFlipped as edgeFlip } from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/EdgeCases.stories";
import {
  mountBars as focusBars,
  select as selectFocus,
  behaviors as focusBehaviors,
} from "../../../../packages/gofish-graphics/stories/_proposals/tooltips/FocusSwitcher.stories";

const demos: Record<string, (el: HTMLElement) => unknown> = {
  "issue-bar": issueBar,
  "stack-segment": stackSegment,
  "stack-whole": stackWhole,
  "lines-shared": linesShared,
  "scatter-nearest": scatterNearest,
  "chart-in-tooltip": chartInTooltip,
  "edge-flip": edgeFlip,
  "focus-bars": focusBars,
};

(window as any).TooltipDemos = {
  names: Object.keys(demos),
  /** The focus switcher: the behaviors' names, and the one to use. */
  focus: { names: Object.keys(focusBehaviors), select: selectFocus },
  /** Render demo `name` into `element`. Resolves when its `<svg>` is in the
   *  DOM; rejects if the demo throws or draws nothing within 10 s. */
  async mount(name: string, element: HTMLElement): Promise<SVGSVGElement> {
    const demo = demos[name];
    if (!demo) throw new Error(`Unknown demo "${name}"`);
    await demo(element);
    return firstSvg(element, 10_000);
  },
};

function firstSvg(el: HTMLElement, ms: number): Promise<SVGSVGElement> {
  return new Promise((resolve, reject) => {
    const found = () => el.querySelector("svg");
    const now = found();
    if (now) return resolve(now);
    const obs = new MutationObserver(() => {
      const svg = found();
      if (!svg) return;
      obs.disconnect();
      clearTimeout(timer);
      resolve(svg);
    });
    obs.observe(el, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      reject(new Error("nothing drawn"));
    }, ms);
  });
}

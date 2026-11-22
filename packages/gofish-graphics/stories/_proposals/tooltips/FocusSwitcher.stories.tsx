/**
 * PROTOTYPE(#1395): one chart, several focus behaviors, each written in user
 * space against focus.ts. The proposal page's Focus tab shows a button per
 * behavior and the code below beside the chart.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { Focus, boxDistance, defaultFocus, readsOf, type FocusBehavior, type Frame } from "./focus";
import { mountInteractive as issueBar } from "./IssueBar.stories";

// The lowercase exports are builders and mounts, not stories.
const meta: Meta = { title: "Proposals/Tooltips/Focus Behaviors", excludeStories: /^[a-z]/ };
export default meta;

/** The escape hatch: a plain function, no combinators. The bar with the
 *  largest share among those within 60 px of the pointer. */
const largestNear: FocusBehavior = ({ pointer, candidates }) => {
  if (!pointer) return { choice: undefined, gap: Infinity };
  const near = candidates.filter((c) => boxDistance(pointer, c.box) <= 60);
  const choice = near.sort((a, b) => (b.datum[0] as any).share - (a.datum[0] as any).share)[0];
  return { choice, gap: choice ? boxDistance(pointer, choice.box) : Infinity };
};

export const behaviors: Record<string, FocusBehavior> = {
  default: defaultFocus,
  hit: Focus.hit(),
  center: Focus.closest({ to: "center", radius: 40 }),
  outline: Focus.closest({ to: "outline" }).within(8),
  unlimited: Focus.first([Focus.hit(), Focus.closest({ stickiness: 4 })]),
  pin: defaultFocus.onClick(),
  custom: largestNear,
};

/** The selected behavior, shared by every switcher chart on the page. */
let selected = "default";
export function select(name: string) {
  if (behaviors[name]) selected = name;
}
/** A behavior is a function, so switching is one more user function. It
 *  passes on what the selected behavior reads, for the region overlay. */
const switching: FocusBehavior = Object.defineProperty(
  (frame: Frame) => behaviors[selected](frame),
  "reads",
  { get: () => readsOf(behaviors[selected]) }
);

export const mountBars = (container: HTMLElement) => issueBar(container, switching);

export const Bars: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mountBars(container);
    return container;
  },
};

/**
 * Animation grammar PROTOTYPE: Periscopic's "U.S. Gun Deaths" (2013), built
 * with time composed like space. The spec is `./gun-deaths.ts`.
 *
 * `Animated` plays it; `Filmstrip` holds it still at several times (the render
 * options `playing: false, at`): one life, a few, then thousands; `Final` is
 * the last frame.
 *
 * Not gallery-tagged: a prototype for review, not a docs example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import gunDeaths from "./gun-deaths";

const meta: Meta = {
  title: "Animation/Grammar Prototype/Gun Deaths",
};
export default meta;

const BG = "#141414";
const FONT = "system-ui, -apple-system, sans-serif";

const panel = (parent: HTMLElement, caption?: string) => {
  const cell = document.createElement("div");
  Object.assign(cell.style, { background: BG, padding: "8px" });
  if (caption !== undefined) {
    const label = document.createElement("div");
    Object.assign(label.style, {
      color: "#aaa",
      font: `12px ${FONT}`,
      marginBottom: "4px",
    });
    label.textContent = caption;
    cell.appendChild(label);
  }
  const box = document.createElement("div");
  cell.appendChild(box);
  parent.appendChild(cell);
  return box;
};

const page = () => {
  const container = initializeContainer();
  Object.assign(container.style, { background: BG, display: "inline-block" });
  return container;
};

export const Animated: StoryObj = {
  render: () => {
    const container = page();
    gunDeaths(panel(container));
    return container;
  },
};

/** ms into the build. One life alone, its stolen years, the second life, a
 *  few overlapping, the acceleration, thousands. */
const FRAMES = [1600, 4200, 7600, 10600, 14000, 23500];

export const Filmstrip: StoryObj<{ frames: number[] }> = {
  args: { frames: FRAMES },
  render: ({ frames }) => {
    const container = page();
    Object.assign(container.style, {
      display: "grid",
      gridTemplateColumns: "auto",
      gap: "4px",
    });
    for (const at of frames) {
      gunDeaths(panel(container, `t = ${(at / 1000).toFixed(1)} s`), {
        playing: false,
        at,
      });
    }
    return container;
  },
};

/** One held frame at `at` ms: what the frame-sequence recorder loads. */
export const Frame: StoryObj<{ at: number }> = {
  args: { at: 1600 },
  render: ({ at }) => {
    const container = page();
    gunDeaths(panel(container), { playing: false, at });
    return container;
  },
};

export const Final: StoryObj = {
  render: () => {
    const container = page();
    gunDeaths(panel(container), { playing: false, at: 1e9 });
    return container;
  },
};

/**
 * Animation grammar PROTOTYPE: R2D3's "A Visual Introduction to Machine
 * Learning, Part 1" (2015), the segue Gemini and Data Animator start from:
 * the same homes as a scatterplot, a stacked-dot histogram (staggered by
 * elevation) and the decision tree's first split. The spec is `./r2d3.ts`, a
 * `timeline` of scenes placed in time by `.relate()` clauses.
 *
 * The filmstrip holds it still at several playheads (ms). `GifFrames` holds
 * one loop at 60 playheads in a 1-wide grid of fixed-size cells, which the GIF
 * recorder cuts into frames.
 *
 * Not gallery-tagged: a prototype for review, not a docs example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { LOOP, r2d3 } from "./r2d3";

const meta: Meta = {
  title: "Animation/Grammar Prototype/R2D3",
};
export default meta;

const FONT = "system-ui, -apple-system, sans-serif";

export const Animated: StoryObj = {
  render: () => {
    const page = initializeContainer();
    r2d3(page);
    return page;
  },
};

/** ms: the scatterplot, the staggered segue, the histogram with its
 *  threshold building in, the split segue, the split, back to the scatter. */
const FRAMES = [0, 3600, 4400, 5300, 5700, 7000, 8600, 9800, 11000, 12800];

export const Filmstrip: StoryObj = {
  render: () => {
    const page = initializeContainer();
    Object.assign(page.style, {
      fontFamily: FONT,
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      maxWidth: "1600px",
    });
    for (const at of FRAMES) {
      const cell = document.createElement("div");
      const caption = document.createElement("div");
      caption.textContent = `t = ${at} ms`;
      Object.assign(caption.style, { fontSize: "12px", color: "#555" });
      cell.appendChild(caption);
      const box = document.createElement("div");
      Object.assign(box.style, { border: "1px solid #ddd" });
      cell.appendChild(box);
      page.appendChild(cell);
      r2d3(box, { playing: false, at });
    }
    return page;
  },
};

/** One held frame at `at` ms: what the frame recorder loads. */
export const Frame: StoryObj<{ at: number }> = {
  args: { at: 0 },
  render: ({ at }) => {
    const page = initializeContainer();
    const box = document.createElement("div");
    Object.assign(box.style, { background: "white" });
    page.appendChild(box);
    r2d3(box, { playing: false, at });
    return page;
  },
};

/** One loop at 60 playheads, in a 1-wide grid of 840 x 490 cells (the chart
 *  is 825 x 480: its longest histogram row runs past `w`). */
export const GIF_CELL: [number, number] = [840, 490];
export const GIF_FRAMES = 60;
export const GifFrames: StoryObj = {
  render: () => {
    const [w, h] = GIF_CELL;
    const page = initializeContainer();
    Object.assign(page.style, {
      display: "grid",
      gridTemplateColumns: `repeat(1, ${w}px)`,
      gridAutoRows: `${h}px`,
      gap: "0",
      padding: "0",
      margin: "0",
      background: "white",
      width: `${w}px`,
      maxWidth: "none",
    });
    for (let i = 0; i < GIF_FRAMES; i++) {
      const cell = document.createElement("div");
      Object.assign(cell.style, { overflow: "hidden", background: "white" });
      page.appendChild(cell);
      r2d3(cell, { playing: false, at: (LOOP * i) / GIF_FRAMES });
    }
    return page;
  },
};

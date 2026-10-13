/**
 * Animation grammar PROTOTYPE: R2D3's "A Visual Introduction to Machine
 * Learning, Part 1" (2015), the segue Gemini and Data Animator start from:
 * the same homes as a scatterplot, a stacked-dot histogram (staggered by
 * elevation) and the decision tree's first split. The spec is `./r2d3.ts`,
 * in two spellings: `time.sequence` over the keyframes (`Animated`) and a
 * layer placed in time by `.relate()` clauses (`AnimatedRelate`).
 *
 * The filmstrips hold each form still at several playheads (the sequence in
 * child-index units, the relate timeline in ms). `GifFrames` holds one loop
 * of the sequence form at 60 playheads in a 1-wide grid of fixed-size cells,
 * which the GIF recorder cuts into frames.
 *
 * Not gallery-tagged: a prototype for review, not a docs example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { RELATE_LOOP, relateForm, sequenceForm, type Hold } from "./r2d3";

const meta: Meta = {
  title: "Animation/Grammar Prototype/R2D3",
};
export default meta;

const FONT = "system-ui, -apple-system, sans-serif";
type Form = (container: HTMLElement, hold?: Hold) => unknown;

export const Animated: StoryObj = {
  render: () => {
    const page = initializeContainer();
    sequenceForm(page);
    return page;
  },
};

export const AnimatedRelate: StoryObj = {
  render: () => {
    const page = initializeContainer();
    relateForm(page);
    return page;
  },
};

const filmstrip = (
  form: Form,
  frames: number[],
  label: (at: number) => string
) => {
  const page = initializeContainer();
  Object.assign(page.style, {
    fontFamily: FONT,
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    maxWidth: "1600px",
  });
  for (const at of frames) {
    const cell = document.createElement("div");
    const caption = document.createElement("div");
    caption.textContent = label(at);
    Object.assign(caption.style, { fontSize: "12px", color: "#555" });
    cell.appendChild(caption);
    const box = document.createElement("div");
    Object.assign(box.style, { border: "1px solid #ddd" });
    cell.appendChild(box);
    page.appendChild(cell);
    form(box, { playing: false, at });
  }
  return page;
};

/** Child-index units: scatter (0), the staggered segue, the histogram (1),
 *  the line coming in, histogram + line (2), the split (3). */
export const Filmstrip: StoryObj = {
  render: () =>
    filmstrip(
      sequenceForm,
      [0, 0.3, 0.5, 0.75, 1, 1.5, 2.5, 3],
      (at) => `t = ${at} (child index)`
    ),
};

/** ms: scatter, the staggered segue, the histogram, the line built in after
 *  the dots settle, the split, back to the scatter. */
export const FilmstripRelate: StoryObj = {
  render: () =>
    filmstrip(
      relateForm,
      [0, 1700, 2300, 3000, 3800, 5000, 5800, 8000],
      (at) => `t = ${at} ms`
    ),
};

/** One loop of the sequence form at 60 playheads (4 child-index units over
 *  10 s), in a 1-wide grid of 840 x 490 cells (the chart is 825 x 480: its longest histogram row runs past `w`). */
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
      sequenceForm(cell, { playing: false, at: (4 * i) / GIF_FRAMES });
    }
    return page;
  },
};

void RELATE_LOOP;

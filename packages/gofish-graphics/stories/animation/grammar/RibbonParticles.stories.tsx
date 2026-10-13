/**
 * Animation grammar PROTOTYPE: particles flowing along a ribbon chart
 * (cf. Elijah Meeks, "Sankey Particles"). The example lives in
 * `examples/particles.ts`; see its header for how it is built.
 *
 * Stories: the live chart; a filmstrip of six held playheads; the GIF frames
 * (one loop at 60 playheads in a 2-wide grid of fixed cells, which
 * `tests/tmp/record-particles.sh` cuts into frames); the keyframes alone (every
 * particle's two stops, nothing moving); and a warm-up with one particle per
 * flow. Not gallery-tagged: a prototype for review, not a docs example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import run, { CELL, LOOP_MS } from "./examples/particles";

const meta: Meta = { title: "Animation/Grammar Prototype/Ribbon Particles" };
export default meta;

const FONT = "system-ui, -apple-system, sans-serif";

export const Animated: StoryObj = {
  render: () => {
    const container = initializeContainer();
    run(container);
    return container;
  },
};

const filmstrip =
  (opts: { single?: boolean } = {}): StoryObj["render"] =>
  () => {
    const page = initializeContainer();
    Object.assign(page.style, {
      fontFamily: FONT,
      display: "grid",
      gridTemplateColumns: "repeat(2, max-content)",
      gap: "12px",
      width: "max-content",
      maxWidth: "none",
    });
    for (const at of [0, 0.08, 0.16, 0.24, 0.32, 0.4]) {
      const cell = document.createElement("div");
      const label = document.createElement("div");
      label.textContent = `t = ${at} loop (${Math.round(at * LOOP_MS)} ms)`;
      Object.assign(label.style, { fontSize: "12px", color: "#555" });
      const box = document.createElement("div");
      Object.assign(box.style, { border: "1px solid #ddd" });
      cell.append(label, box);
      page.appendChild(cell);
      run(box, { playing: false, at }, opts);
    }
    return page;
  };

export const Filmstrip: StoryObj = { render: filmstrip() };

/** One loop at 60 playheads, each in a fixed-size cell of a 2-wide grid. */
export const GIF_FRAMES = 60;
export const GifFrames: StoryObj = {
  name: "GIF frames",
  render: () => {
    const [w, h] = CELL;
    const page = initializeContainer();
    Object.assign(page.style, {
      display: "grid",
      gridTemplateColumns: `repeat(2, ${w}px)`,
      gridAutoRows: `${h}px`,
      gap: "0",
      padding: "0",
      margin: "0",
      background: "white",
      width: `${2 * w}px`,
      maxWidth: "none",
    });
    for (let i = 0; i < GIF_FRAMES; i++) {
      const cell = document.createElement("div");
      Object.assign(cell.style, { overflow: "hidden", background: "white" });
      page.appendChild(cell);
      run(cell, { playing: false, at: i / GIF_FRAMES });
    }
    return page;
  },
};

export const Keyframes: StoryObj = {
  render: () => {
    const container = initializeContainer();
    run(container, {}, { keyframes: true });
    return container;
  },
};

export const WarmUpAnimated: StoryObj = {
  name: "Warm-up (one particle per flow)",
  render: () => {
    const container = initializeContainer();
    run(container, {}, { single: true });
    return container;
  },
};

export const WarmUpFilmstrip: StoryObj = {
  name: "Warm-up filmstrip",
  render: filmstrip({ single: true }),
};

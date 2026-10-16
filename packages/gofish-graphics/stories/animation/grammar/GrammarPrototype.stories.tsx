/**
 * Animation grammar PROTOTYPE: temporal composition that mirrors spatial
 * `layer([...])` and `.relate(...)`. Syntax is not signed off; these stories
 * exist so the spellings can be judged against real renders.
 *
 * Each example has a live story and a FILMSTRIP story: the same example held
 * still at several playheads (ms). A sequence holds through its own options
 * (`playing: false, at`); a `.relate()` timeline through the render
 * options. The `gif frames` stories hold one loop at
 * up to 60 playheads in a grid, which the GIF recorder cuts into frames.
 *
 * Not gallery-tagged: a prototype for review, not a docs example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";

type Run = (container: HTMLElement, hold?: Record<string, unknown>) => unknown;

const modules = import.meta.glob<{ default: Run }>("./examples/e*.ts", {
  eager: true,
});

type Example = {
  title: string;
  file: string;
  /** Held playheads for the filmstrip, in ms. */
  frames: number[];
  /** One loop, for the GIF recorder: [start, end] in ms. */
  loop: [number, number];
  /** One loop in wall-clock ms, and the size of a GIF frame. */
  loopMs: number;
  cell: [number, number];
};

export const EXAMPLES: Record<string, Example> = {
  e1a: {
    title: "E1a · stacked ↔ grouped, time.sequence",
    file: "e1a-sequence",
    frames: [0, 800, 1100, 1400, 1700, 2000, 3000],
    loop: [0, 4000],
    loopMs: 4000,
    cell: [620, 340],
  },
  e1b: {
    title: "E1b · stacked ↔ grouped, timeline + relate",
    file: "e1b-relate",
    frames: [0, 1800, 2100, 2300, 2500, 2800, 4400, 5000],
    loop: [0, 5600],
    loopMs: 5600,
    cell: [620, 340],
  },
  e1c: {
    title: "E1c · staggered by lake",
    file: "e1c-staggered",
    frames: [0, 400, 800, 1200, 1600, 2000],
    loop: [0, 4000],
    loopMs: 4000,
    cell: [620, 340],
  },
  e1d: {
    title: "E1d · two-stage (x, then y)",
    file: "e1d-two-stage",
    frames: [0, 750, 1500, 2250, 3000, 3750, 4500, 5250],
    loop: [0, 6000],
    loopMs: 6000,
    cell: [620, 340],
  },
  e3: {
    title: "E3 · fixed total, data-valued scene durations",
    file: "e3-fit",
    frames: [0, 1199, 1800, 2400, 4799, 5400],
    loop: [0, 6000],
    loopMs: 6000,
    cell: [620, 340],
  },
  e2: {
    title: "E2 · linked-list insertion (magic move)",
    file: "e2-linked-list",
    frames: [0, 600, 1200, 2000, 2600, 3200, 4000, 5000],
    loop: [0, 6000],
    loopMs: 6000,
    cell: [540, 130],
  },
};

const meta: Meta = {
  title: "Animation/Grammar Prototype",
};
export default meta;

const FONT = "system-ui, -apple-system, sans-serif";

const run = (
  host: HTMLElement,
  example: Example,
  hold?: Record<string, unknown>
) => modules[`./examples/${example.file}.ts`].default(host, hold);

const held = (example: Example, at: number) => ({ playing: false, at });

const live = (key: string): StoryObj => ({
  name: `${EXAMPLES[key].title} · live`,
  render: () => {
    const page = initializeContainer();
    run(page, EXAMPLES[key]);
    return page;
  },
});

const filmstrip = (key: string): StoryObj => ({
  name: `${EXAMPLES[key].title} · filmstrip`,
  render: () => {
    const example = EXAMPLES[key];
    const page = initializeContainer();
    Object.assign(page.style, {
      fontFamily: FONT,
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      maxWidth: "1600px",
    });
    for (const at of example.frames) {
      const cell = document.createElement("div");
      const label = document.createElement("div");
      label.textContent =
        `t = ${at} ms`;
      Object.assign(label.style, { fontSize: "12px", color: "#555" });
      cell.appendChild(label);
      const box = document.createElement("div");
      Object.assign(box.style, { border: "1px solid #ddd" });
      cell.appendChild(box);
      page.appendChild(cell);
      run(box, example, held(example, at));
    }
    return page;
  },
});

export const E1aLive = live("e1a");
export const E1aFilmstrip = filmstrip("e1a");
export const E1bLive = live("e1b");
export const E1bFilmstrip = filmstrip("e1b");
export const E1cLive = live("e1c");
export const E1cFilmstrip = filmstrip("e1c");
export const E1dLive = live("e1d");
export const E1dFilmstrip = filmstrip("e1d");
export const E3Live = live("e3");
export const E3Filmstrip = filmstrip("e3");
export const E2Live = live("e2");
export const E2Filmstrip = filmstrip("e2");

/** GIF frames: one loop of the example at up to 60 evenly spaced playheads,
 *  each in a fixed-size cell of a 2-wide grid (the capture viewport is 1264 px), for the recorder to cut. */
export const GIF_COLUMNS = 2;
export const gifFrameCount = (example: Example) =>
  Math.min(60, Math.round(example.loopMs / 50));
const gifFrames = (key: string): StoryObj => ({
  name: `${EXAMPLES[key].title} · gif frames`,
  render: () => {
    const example = EXAMPLES[key];
    const [w, h] = example.cell;
    const n = gifFrameCount(example);
    const page = initializeContainer();
    Object.assign(page.style, {
      display: "grid",
      gridTemplateColumns: `repeat(${GIF_COLUMNS}, ${w}px)`,
      gridAutoRows: `${h}px`,
      gap: "0",
      padding: "0",
      margin: "0",
      background: "white",
      width: `${GIF_COLUMNS * w}px`,
      maxWidth: "none",
    });
    const [a, b] = example.loop;
    for (let i = 0; i < n; i++) {
      const cell = document.createElement("div");
      Object.assign(cell.style, { overflow: "hidden", background: "white" });
      page.appendChild(cell);
      run(cell, example, held(example, a + ((b - a) * i) / n));
    }
    return page;
  },
});

export const E1aGifFrames = gifFrames("e1a");
export const E1bGifFrames = gifFrames("e1b");
export const E1cGifFrames = gifFrames("e1c");
export const E1dGifFrames = gifFrames("e1d");
export const E2GifFrames = gifFrames("e2");

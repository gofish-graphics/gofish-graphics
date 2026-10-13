/**
 * Animation grammar PROTOTYPE: temporal composition that mirrors spatial
 * `layer([...])` and `.relate(...)`. Syntax is not signed off; these stories
 * exist so the spellings can be judged against real renders.
 *
 * Each example has a live story and a FILMSTRIP story: the same example held
 * still at several playheads. A sequence holds through its own options
 * (`playing: false, at` in child-index units); a `.relate()` timeline through
 * the render options (`at` in ms). The `gif frames` stories hold one loop at
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
  /** Held playheads for the filmstrip. */
  frames: number[];
  unit: "step" | "ms";
  /** One loop, for the GIF recorder: [start, end] in `unit`. */
  loop: [number, number];
  /** One loop in wall-clock ms, and the size of a GIF frame. */
  loopMs: number;
  cell: [number, number];
};

export const EXAMPLES: Record<string, Example> = {
  e1a: {
    title: "E1a · stacked ↔ grouped, time.sequence",
    file: "e1a-sequence",
    frames: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.5],
    unit: "step",
    loop: [0, 2],
    loopMs: 4000,
    cell: [620, 340],
  },
  e1b: {
    title: "E1b · stacked ↔ grouped, layer + relate",
    file: "e1b-relate",
    frames: [0, 800, 1000, 1200, 1500, 1800, 2600, 3200],
    unit: "ms",
    loop: [0, 3600],
    loopMs: 3600,
    cell: [620, 340],
  },
  e1c: {
    title: "E1c · staggered by lake",
    file: "e1c-staggered",
    frames: [0, 0.2, 0.4, 0.6, 0.8, 1],
    unit: "step",
    loop: [0, 2],
    loopMs: 4000,
    cell: [620, 340],
  },
  e1d: {
    title: "E1d · two-stage (x, then y)",
    file: "e1d-two-stage",
    frames: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    unit: "step",
    loop: [0, 4],
    loopMs: 6000,
    cell: [620, 340],
  },
  e2: {
    title: "E2 · linked-list insertion (magic move)",
    file: "e2-linked-list",
    frames: [0, 0.3, 0.6, 1, 1.3, 1.6, 2, 2.5],
    unit: "step",
    loop: [0, 3],
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
        example.unit === "ms" ? `t = ${at} ms` : `t = ${at} (child index)`;
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

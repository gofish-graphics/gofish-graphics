/**
 * Animation grammar PROTOTYPE: temporal composition that mirrors spatial
 * `layer([...])` and `.relate(...)`. Syntax is not signed off; these stories
 * exist so the spellings can be judged against real renders.
 *
 * Each example has a live story and a FILMSTRIP story: the same example held
 * still at several playheads. A sequence holds through its own options
 * (`playing: false, at` in child-index units); a `.relate()` timeline through
 * the render options (`at` in ms). `Frame` renders one example at one
 * playhead from story args, for recording GIFs.
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
};

export const EXAMPLES: Record<string, Example> = {
  e1a: {
    title: "E1a · stacked ↔ grouped, time.sequence",
    file: "e1a-sequence",
    frames: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.5],
    unit: "step",
    loop: [0, 2],
  },
  e1b: {
    title: "E1b · stacked ↔ grouped, layer + relate",
    file: "e1b-relate",
    frames: [0, 800, 1000, 1200, 1500, 1800, 2600, 3200],
    unit: "ms",
    loop: [0, 3600],
  },
  e1c: {
    title: "E1c · staggered by lake",
    file: "e1c-staggered",
    frames: [0, 0.2, 0.4, 0.6, 0.8, 1],
    unit: "step",
    loop: [0, 2],
  },
  e1d: {
    title: "E1d · two-stage (x, then y)",
    file: "e1d-two-stage",
    frames: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    unit: "step",
    loop: [0, 4],
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

/** One example held at one playhead, from story args (the GIF recorder sets
 *  them through the iframe URL: `&args=example:e1a;at:0.5`). */
export const Frame: StoryObj<{ example: string; at: number }> = {
  args: { example: "e1a", at: 0 },
  render: ({ example, at }) => {
    const page = initializeContainer();
    const box = document.createElement("div");
    box.id = "frame";
    Object.assign(box.style, { display: "inline-block", background: "white" });
    page.appendChild(box);
    run(box, EXAMPLES[example], held(EXAMPLES[example], Number(at)));
    return page;
  },
};

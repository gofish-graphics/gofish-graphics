/**
 * Build-in animation PROTOTYPE (draft PR #901): the syntax of
 * `sketches/build-in/bar-grow-in.ts` and `sketches/build-in/canis-examples.ts`,
 * running.
 *
 * `Gallery` shows every example as a row: its source on the left (the module
 * in `./build-in/`, imported twice, once to run and once with `?raw` to show,
 * so the code on screen is the code that runs) and the animation on the
 * right, with a Replay button.
 *
 * Each example also has a story of its own that draws it as a FILMSTRIP: the
 * same chart held still at several times (the render options
 * `playing: false, at`), so a capture shows the whole animation in one image.
 * Pass `frames` to hold it at other times.
 *
 * Not gallery-tagged: this is a prototype for review, not a docs example.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";

import ex1 from "./build-in/ex1";
import ex1Src from "./build-in/ex1.ts?raw";
import ex1Sel from "./build-in/ex1-selection";
import ex1SelSrc from "./build-in/ex1-selection.ts?raw";
import ex2 from "./build-in/ex2";
import ex2Src from "./build-in/ex2.ts?raw";
import ex2Sel from "./build-in/ex2-selection";
import ex2SelSrc from "./build-in/ex2-selection.ts?raw";
import ex3a from "./build-in/ex3a";
import ex3aSrc from "./build-in/ex3a.ts?raw";
import ex3b from "./build-in/ex3b";
import ex3bSrc from "./build-in/ex3b.ts?raw";
import ex3c from "./build-in/ex3c";
import ex3cSrc from "./build-in/ex3c.ts?raw";
import ex3d from "./build-in/ex3d";
import ex3dSrc from "./build-in/ex3d.ts?raw";
import ex3e from "./build-in/ex3e";
import ex3eSrc from "./build-in/ex3e.ts?raw";
import ex3f from "./build-in/ex3f";
import ex3fSrc from "./build-in/ex3f.ts?raw";
import ex4a from "./build-in/ex4a";
import ex4aSrc from "./build-in/ex4a.ts?raw";
import ex4aSel from "./build-in/ex4a-selection";
import ex4aSelSrc from "./build-in/ex4a-selection.ts?raw";
import ex4b from "./build-in/ex4b";
import ex4bSrc from "./build-in/ex4b.ts?raw";
import ex4c from "./build-in/ex4c";
import ex4cSrc from "./build-in/ex4c.ts?raw";
import ex5a from "./build-in/ex5a";
import ex5aSrc from "./build-in/ex5a.ts?raw";
import ex5b from "./build-in/ex5b";
import ex5bSrc from "./build-in/ex5b.ts?raw";
import raceChained from "./build-in/race-chained";
import raceChainedSrc from "./build-in/race-chained.ts?raw";
import raceStagger from "./build-in/race-stagger";
import raceStaggerSrc from "./build-in/race-stagger.ts?raw";
import canis1bSel from "./build-in/canis-1b-selection";
import canis1bSelSrc from "./build-in/canis-1b-selection.ts?raw";
import canis1bChained from "./build-in/canis-1b-chained";
import canis1bChainedSrc from "./build-in/canis-1b-chained.ts?raw";
import castFig3 from "./build-in/cast-fig3";
import castFig3Src from "./build-in/cast-fig3.ts?raw";
import gantt from "./build-in/gantt";
import ganttSrc from "./build-in/gantt.ts?raw";

type Hold = { playing?: boolean; at?: number };
type Run = (container: HTMLElement, hold?: Hold) => unknown;

type Example = {
  section: string;
  title: string;
  caption: string;
  run: Run;
  source: string;
  /** Held times for the filmstrip story (ms into the build; years for the
   *  race, whose clock is its sequence's). */
  frames: number[];
  /** What the frames count: build milliseconds, or the race's years. */
  unit?: "ms" | "year";
};

const SECTIONS = {
  s1: "1. All bars grow at once",
  s2: "2. The target: a staggered grow",
  s3: "3. Variations: only the arrangement or the effect changes",
  s4: "4. Grouped bars",
  s5: "5. Stacked bars",
  s8: "6a and 8. The race, chained",
  canis: "Canis and CAST",
};

const EXAMPLES: Record<string, Example> = {
  ex1: {
    section: SECTIONS.s1,
    title: "1 · chained",
    caption:
      "The mark says how it enters. No arrangement on the spread, so every bar starts together.",
    run: ex1,
    source: ex1Src,
    frames: [0, 150, 300, 600],
  },
  ex1Sel: {
    section: SECTIONS.s1,
    title: "1 · selection form",
    caption:
      "The same build written as a layer over the named bars. It draws the same frames.",
    run: ex1Sel,
    source: ex1SelSrc,
    frames: [0, 150, 300, 600],
  },
  ex2: {
    section: SECTIONS.s2,
    title: "2 · chained",
    caption:
      "Each bar starts 60 ms after the one before and grows over 600 ms (slow-in, slow-out). Before its turn a bar shows its enter state, zero height at its baseline.",
    run: ex2,
    source: ex2Src,
    frames: [0, 400, 900, 1500, 2100],
  },
  ex2Sel: {
    section: SECTIONS.s2,
    title: "2 · selection form",
    caption:
      "time.stagger as a flow operator over the selected bars. The chained form means exactly this (asserted by src/tests/buildInTower.test.ts).",
    run: ex2Sel,
    source: ex2SelSrc,
    frames: [0, 400, 900, 1500, 2100],
  },
  ex3a: {
    section: SECTIONS.s3,
    title: "3a · tallest first",
    caption:
      "The stagger's own `by`, an ordinary field expression: letters in order of frequency, largest first.",
    run: ex3a,
    source: ex3aSrc,
    frames: [0, 400, 900, 1500, 2100],
  },
  ex3b: {
    section: SECTIONS.s3,
    title: "3b · from the center",
    caption:
      '`from: "center"` (GSAP, Motion). With 26 bars the middle two (M, N) start together, then the pairs outward.',
    run: ex3b,
    source: ex3bSrc,
    frames: [0, 300, 700, 1320],
  },
  ex3c: {
    section: SECTIONS.s3,
    title: "3c · dwell 0.3",
    caption:
      "The lag is derived: δ = w·d / (n − w(n − 1)) = 0.3·600 / (26 − 7.5) ≈ 9.7 ms, so the build lasts about 843 ms. (The OPEN line about a total budget is not built.)",
    run: ex3c,
    source: ex3cSrc,
    frames: [0, 200, 450, 850],
  },
  ex3d: {
    section: SECTIONS.s3,
    title: "3d · appear",
    caption:
      "No motion: each bar pops in at its start, 120 ms apart. `appear` holds for its duration (default 500 ms), which only matters to what waits for it.",
    run: ex3d,
    source: ex3dSrc,
    frames: [0, 500, 1500, 3000],
  },
  ex3e: {
    section: SECTIONS.s3,
    title: "3e · grow and fade together",
    caption:
      "An array of effects plays them together, each with its own duration: the fade is done at 300 ms, the grow at 600 ms.",
    run: ex3e,
    source: ex3eSrc,
    frames: [0, 150, 600, 1200, 2100],
  },
  ex3f: {
    section: SECTIONS.s3,
    title: "3f · a named effect",
    caption:
      "An effect is a plain value. This one eases out (a fast start), where the default is slow-in, slow-out.",
    run: ex3f,
    source: ex3fSrc,
    frames: [0, 400, 900, 1500, 2100],
  },
  ex4a: {
    section: SECTIONS.s4,
    title: "4a · one month at a time",
    caption:
      'Keynote "By Set". The months are staggered 300 ms apart; the three cities in a month grow together.',
    run: ex4a,
    source: ex4aSrc,
    frames: [0, 500, 1500, 2600, 3700],
  },
  ex4aSel: {
    section: SECTIONS.s4,
    title: "4a · selection form",
    caption:
      "The same timing over the selected bars, split by month. It draws the same frames as 4a (asserted by the tower test).",
    run: ex4aSel,
    source: ex4aSelSrc,
    frames: [0, 500, 1500, 2600, 3700],
  },
  ex4b: {
    section: SECTIONS.s4,
    title: "4b · months, and cities inside each",
    caption:
      'Keynote "By Element in Set". Nested operators nest the time frames: each month lasts 2 × 50 + 400 = 500 ms and months start 300 ms apart, so neighbors overlap by 200 ms. The whole build lasts 3.8 s.',
    run: ex4b,
    source: ex4bSrc,
    frames: [0, 350, 1500, 2700, 3800],
  },
  ex4c: {
    section: SECTIONS.s4,
    title: "4c · one city at a time",
    caption:
      'Keynote "By Series". In space the months are outside and the cities inside; in time it is the other way around, so it is written as a selection. Each city\'s twelve bars grow together, one city after another.',
    run: ex4c,
    source: ex4cSrc,
    frames: [0, 200, 600, 1000, 1200],
  },
  ex5a: {
    section: SECTIONS.s5,
    title: "5a · whole stacks",
    caption:
      "DECLARED PROTOTYPE BEHAVIOR: each segment grows in place from its own stack start (ECharts), so gaps open between the segments while a stack grows. Riding on the segments below (amCharts) is not built.",
    run: ex5a,
    source: ex5aSrc,
    frames: [0, 300, 700, 1380],
  },
  ex5b: {
    section: SECTIONS.s5,
    title: "5b · stacks, bottom segment first",
    caption:
      "The stack's own arrangement nests inside the spread's: each segment grows in place (200 ms) when the one below it has finished.",
    run: ex5b,
    source: ex5bSrc,
    frames: [0, 300, 900, 1400, 1880],
  },
  race: {
    section: SECTIONS.s8,
    title: "8 · the bar chart race, chained",
    caption:
      'Under a time.sequence the mark\'s .transition() is the chained spelling of .layer(time.transition({ curve: "linear" })): update says how it moves, and enter / exit can only be the default fade in place (#892). Draws the same as the Bar Chart Race story (asserted by the tower test).',
    run: raceChained,
    source: raceChainedSrc,
    frames: [2000, 2007.5, 2019],
    unit: "year",
  },
  raceStagger: {
    section: SECTIONS.s8,
    title: "6a · the race with a staggered re-sort (stretch)",
    caption:
      "The spread's update arrangement staggers the moves between two years, in the order the year ends in (D3 Sortable Bar Chart). The FIT default: each bar's move and the 20 ms lag shrink together so the last bar arrives at the next year, keeping the dwell (here to about 59%: 12 ms apart, 625 ms moves in a 1053 ms year). Every keyframe still draws exactly.",
    run: raceStagger,
    source: raceStaggerSrc,
    frames: [2007, 2007.25, 2007.5, 2007.75, 2008],
    unit: "year",
  },
  canis1bSel: {
    section: SECTIONS.canis,
    title: "Canis Fig. 1b · selection form",
    caption:
      'One product after another (spacing 0, Canis\'s "start after previous"), and inside each product the quarters 100 ms apart. Each segment wipes up from the bottom (500 ms).',
    run: canis1bSel,
    source: canis1bSelSrc,
    frames: [0, 400, 1000, 1700, 2400],
  },
  canis1bChained: {
    section: SECTIONS.canis,
    title: "Canis Fig. 1b · chained (the chart's own nesting)",
    caption:
      "Timed the way the chart is nested instead: whole quarters 100 ms apart, and inside each stack the bottom segment first.",
    run: canis1bChained,
    source: canis1bChainedSrc,
    frames: [0, 400, 900, 1400, 1800],
  },
  cast: {
    section: SECTIONS.canis,
    title: "CAST Fig. 3 · dots in order of a value",
    caption:
      'Dots appear 100 ms apart in order of body mass, each with a circular reveal (a growing radius). Penguins stand in for the paper\'s counties; 68 dots have 34 distinct masses, so the build lasts 33 × 100 + 500 = 3800 ms. DIVERGENCE from the sketch: its `by: "rate"` takes the groups in the order the data shows them, as `by` does everywhere, so ascending order is `field("mass").sort()`. Dots of equal mass start together.',
    run: castFig3,
    source: castFig3Src,
    frames: [0, 1000, 2000, 3000, 3800],
  },
  gantt: {
    section: SECTIONS.canis,
    title: "CAST+ Gantt · duration from a field (stretch)",
    caption:
      "Tasks wipe in from the left one after another, and each wipe lasts in proportion to the task's days, as `w: \"days\"` sizes the bar. DECLARED SHORTCUT: the time scale is linear with the longest task at 1000 ms (Build, 12 days); a real time scale for field-valued durations is open. The build lasts 36 days × 1000 / 12 = 3000 ms.",
    run: gantt,
    source: ganttSrc,
    frames: [0, 700, 1500, 2300, 3000],
  },
};

/** One line each: what the sketches have that this prototype does not. */
const NOT_BUILT = [
  "Axes, title or other chrome first (sketch §7, CAST Fig. 3's title): OPEN, waits on custom axes. Axes appear at once.",
  "A label, then its bar, inside one mark (CAST+ Fig. 8): OPEN (how data reaches a createMark mark).",
  "Exit on a data change for a static chart (sketch 6b): there is no data-change trigger yet, so `exit` in a build throws.",
  "Canis data-driven delay (start times spaced by a value): needs `history` from PR #902.",
  '"Ride" semantics for stacks (segments riding on the ones below, amCharts): segments grow in place instead (5a, 5b).',
  "Polar or radial grow: a mark in a polar coord lowers to a path, which a grow cannot collapse yet.",
  "A total budget for a stagger (3c's OPEN line): not built.",
  "Labels riding the growing bar's end (#894): a label waits until its bar has arrived, then appears.",
];

const meta: Meta = {
  title: "Animation/Build-in Prototype",
};
export default meta;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> = {},
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
};

const FONT = "system-ui, -apple-system, sans-serif";

/** Run `example` into a fresh chart box inside `host`. */
const play = (host: HTMLElement, example: Example, hold?: Hold) => {
  host.innerHTML = "";
  const box = el("div");
  host.appendChild(box);
  example.run(box, hold);
};

export const Gallery: StoryObj = {
  render: () => {
    const page = initializeContainer();
    Object.assign(page.style, { fontFamily: FONT, maxWidth: "1400px" });

    page.appendChild(
      el(
        "h1",
        { fontSize: "22px", margin: "0 0 4px" },
        "Build-in animations: prototype"
      )
    );
    page.appendChild(
      el(
        "p",
        {
          fontSize: "14px",
          color: "#444",
          margin: "0 0 12px",
          maxWidth: "900px",
        },
        "The syntax of sketches/build-in, running. `time.*` says WHEN (stagger, parallel), `animation.*` says WHAT (grow, fadeIn, wipe, …). Chained: an operator's .transition({ enter }) arranges its children in time and a mark's .transition({ enter }) says how it looks as it enters. Selection: .layer(chart(selectAll(...)).flow(time.stagger(...)).mark(time.transition({ enter }))). Both are read by one core: a small time layout, one clock per chart, and paint-time patches (layout runs once). Hold a build still with the render options { playing: false, at: <ms> }. Under an arrangement, a mark with no effect of its own fades in (the #892 default)."
      )
    );

    const replays: (() => void)[] = [];
    const replayAll = el(
      "button",
      { fontSize: "14px", padding: "6px 14px", marginBottom: "16px" },
      "Replay all"
    );
    replayAll.onclick = () => replays.forEach((r) => r());
    page.appendChild(replayAll);

    let section = "";
    for (const example of Object.values(EXAMPLES)) {
      if (example.section !== section) {
        section = example.section;
        page.appendChild(
          el(
            "h2",
            {
              fontSize: "18px",
              margin: "28px 0 8px",
              borderBottom: "1px solid #ddd",
              paddingBottom: "4px",
            },
            section
          )
        );
      }
      const row = el("div", {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: "20px",
        alignItems: "start",
        margin: "0 0 24px",
      });
      const code = el(
        "pre",
        {
          margin: "0",
          padding: "10px 12px",
          background: "#f6f7f9",
          border: "1px solid #e3e5e8",
          borderRadius: "6px",
          fontSize: "12px",
          lineHeight: "1.45",
          overflowX: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        example.source
      );
      const right = el("div");
      const head = el("div", {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginBottom: "4px",
      });
      head.appendChild(el("strong", { fontSize: "14px" }, example.title));
      const replay = el(
        "button",
        { fontSize: "12px", padding: "2px 10px" },
        "Replay"
      );
      head.appendChild(replay);
      right.appendChild(head);
      right.appendChild(
        el(
          "p",
          { fontSize: "13px", color: "#555", margin: "0 0 6px" },
          example.caption
        )
      );
      const host = el("div");
      right.appendChild(host);
      const again = () => play(host, example);
      replay.onclick = again;
      replays.push(again);
      again();
      row.appendChild(code);
      row.appendChild(right);
      page.appendChild(row);
    }

    page.appendChild(
      el(
        "h2",
        {
          fontSize: "18px",
          margin: "28px 0 8px",
          borderBottom: "1px solid #ddd",
          paddingBottom: "4px",
        },
        "Not in this prototype"
      )
    );
    const list = el("ul", { fontSize: "14px", color: "#333" });
    for (const line of NOT_BUILT) list.appendChild(el("li", {}, line));
    page.appendChild(list);
    return page;
  },
};

type FilmArgs = { frames: number[] };

/** The example held still at each of `frames`, side by side. */
const filmstrip = (key: keyof typeof EXAMPLES): StoryObj<FilmArgs> => ({
  args: { frames: EXAMPLES[key].frames },
  render: ({ frames }) => {
    const example = EXAMPLES[key];
    const page = initializeContainer();
    Object.assign(page.style, { fontFamily: FONT });
    page.appendChild(el("strong", { fontSize: "14px" }, example.title));
    const strip = el("div", {
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      alignItems: "flex-start",
    });
    for (const at of frames) {
      const cell = el("div");
      cell.appendChild(
        el(
          "div",
          { fontSize: "12px", color: "#666" },
          example.unit === "year" ? `year ${at}` : `t = ${at} ms`
        )
      );
      const host = el("div");
      cell.appendChild(host);
      strip.appendChild(cell);
      play(host, example, { playing: false, at });
    }
    page.appendChild(strip);
    return page;
  },
});

export const Ex1Together = filmstrip("ex1");
export const Ex1TogetherSelection = filmstrip("ex1Sel");
export const Ex2Stagger = filmstrip("ex2");
export const Ex2StaggerSelection = filmstrip("ex2Sel");
export const Ex3aTallestFirst = filmstrip("ex3a");
export const Ex3bFromCenter = filmstrip("ex3b");
export const Ex3cDwell = filmstrip("ex3c");
export const Ex3dAppear = filmstrip("ex3d");
export const Ex3eGrowAndFade = filmstrip("ex3e");
export const Ex3fNamedEffect = filmstrip("ex3f");
export const Ex4aByMonth = filmstrip("ex4a");
export const Ex4aByMonthSelection = filmstrip("ex4aSel");
export const Ex4bNested = filmstrip("ex4b");
export const Ex4cByCity = filmstrip("ex4c");
export const Ex5aStacks = filmstrip("ex5a");
export const Ex5bStackSegments = filmstrip("ex5b");
export const RaceChained = filmstrip("race");
export const RaceStaggeredUpdate = filmstrip("raceStagger");
export const Canis1bSelection = filmstrip("canis1bSel");
export const Canis1bChained = filmstrip("canis1bChained");
export const CastFig3 = filmstrip("cast");
export const CastPlusGantt = filmstrip("gantt");

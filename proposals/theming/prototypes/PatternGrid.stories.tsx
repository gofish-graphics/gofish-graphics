import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { rect, text, spread, table } from "../../src/lib";
import { lines, cross, dots, tile } from "./defs";

const meta: Meta = { title: "Proposals Theming/Pattern Grid" };
export default meta;

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Each swatch: [id, def, call, options-line]
const swatches: [string, any, string, string][] = [
  ["g-lines", lines("g-lines"), "Pattern.lines()", ""],
  [
    "g-lines0",
    lines("g-lines0", { angle: 0 }),
    "Pattern.lines(",
    "{ angle: 0 })",
  ],
  [
    "g-lines90",
    lines("g-lines90", { angle: 90 }),
    "Pattern.lines(",
    "{ angle: 90 })",
  ],
  [
    "g-linesm45",
    lines("g-linesm45", { angle: -45, gap: 10 }),
    "Pattern.lines(",
    "{ angle: -45, gap: 10 })",
  ],
  [
    "g-lines3",
    lines("g-lines3", { width: 3, gap: 8 }),
    "Pattern.lines(",
    "{ width: 3 })",
  ],
  ["g-cross", cross("g-cross"), "Pattern.cross()", ""],
  ["g-dots", dots("g-dots", { gap: 6, r: 1 }), "Pattern.dots()", ""],
  [
    "g-dots12",
    dots("g-dots12", { gap: 12, r: 2.5 }),
    "Pattern.dots(",
    "{ gap: 12, r: 2.5 })",
  ],
  [
    "g-ring",
    tile("g-ring", 14, 14, [
      <circle
        cx={7}
        cy={7}
        r={3.5}
        fill="none"
        stroke="black"
        stroke-width={1.2}
      />,
    ]),
    "Pattern.tile(",
    "[circle({ r: 3.5 })])",
  ],
  [
    "g-tri",
    tile("g-tri", 16, 16, [
      <path d="M 4 11 L 8 4 L 12 11 Z" fill="#e15759" />,
      <circle cx={0} cy={0} r={1.6} fill="#4e79a7" />,
      <circle cx={16} cy={0} r={1.6} fill="#4e79a7" />,
      <circle cx={0} cy={16} r={1.6} fill="#4e79a7" />,
      <circle cx={16} cy={16} r={1.6} fill="#4e79a7" />,
    ]),
    "Pattern.tile(",
    "[triangle, dot])",
  ],
];

const label = (s: string, size = 11) =>
  text({ text: s || " ", fontSize: size, fontFamily: MONO, fill: "black" });

// Proposed: each swatch is rect({ w: 110, h: 70, fill: <pattern>, stroke: "black" })
export const PatternGrid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "12px";
    const cells = swatches.map(([id, , call, opts]) =>
      spread({ dir: "y", spacing: 5, alignment: "middle" }, [
        rect({ w: 165, h: 0, fill: "none" }),
        rect({
          w: 110,
          h: 70,
          fill: `url(#${id})`,
          stroke: "black",
          strokeWidth: 1,
        }),
        label(call),
        label(opts),
      ])
    );
    table({ numCols: 5, spacing: [8, 22] }, cells).render(container, {
      defs: swatches.map(([, def]) => def),
    });
    return container;
  },
};

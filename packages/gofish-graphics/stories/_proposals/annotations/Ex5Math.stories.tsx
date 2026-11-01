// Example 5: math augmentation (Head et al., "Augmenting Scientific Papers
// with Just-in-Time, Position-Sensitive Definitions", diagram side). The
// variance formula as a row of text tokens; three terms colored, each with a
// thin bar under it and a short colored note below, joined by a short line.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { arrow, Constraint, layer, rect, spread, text } from "../../../src/lib";

const meta: Meta = { title: "Proposals/Annotations/Ex5 Math Augmentation" };
export default meta;

// ─── A: today's primitives ───────────────────────────────────────────────────
export const A: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // ── spec ──
    const tok = (t: string, fill = "#222") =>
      text({ text: t, fontSize: 32, fill, fontFamily: "Georgia, serif" });
    const note = (lines: string[], fill: string) =>
      spread(
        { dir: "y", spacing: 1, alignment: "middle" },
        lines.map((t) => text({ text: t, fontSize: 12, fill }))
      );
    const terms = [
      // `depth` staggers the notes by hand so neighbors do not collide.
      {
        name: "v",
        color: "#c0392b",
        depth: 18,
        note: ["variance:", "how far X spreads"],
      },
      {
        name: "e",
        color: "#2e86c1",
        depth: 54,
        note: ["expected value:", "the average over X"],
      },
      {
        name: "d",
        color: "#1e8449",
        depth: 18,
        note: ["squared distance", "from the mean μ"],
      },
    ];
    layer([
      spread({ dir: "x", spacing: 8, alignment: "baseline" }, [
        tok("Var(X)", terms[0].color).name("v"),
        tok("="),
        tok("E", terms[1].color).name("e"),
        tok("["),
        tok("(X − μ)²", terms[2].color).name("d"),
        tok("]"),
      ]),
      ...terms.map((t) => rect({ h: 2, fill: t.color }).name(`${t.name}Bar`)),
      ...terms.map((t) => note(t.note, t.color).name(`${t.name}Note`)),
    ])
      .relate((names) =>
        terms.flatMap((t) => {
          const [term, bar, n] = [
            names[t.name],
            names[`${t.name}Bar`],
            names[`${t.name}Note`],
          ];
          return [
            Constraint.align({ x: "span" }, [term, bar]),
            Constraint.distribute({ dir: "y", spacing: 4 }, [term, bar]),
            Constraint.align({ x: "middle" }, [bar, n]),
            Constraint.distribute({ dir: "y", spacing: t.depth }, [bar, n]),
            arrow(
              {
                bow: 0,
                stretch: 0,
                strokeWidth: 1,
                padStart: 2,
                padEnd: 2,
                stroke: t.color,
              },
              [n, bar]
            ),
          ];
        })
      )
      .render(container, { w: 440, h: 190 });
    // ── end spec ──
    return container;
  },
};

// The d3-annotation types (Lu, 2017), each rebuilt from today's primitives on
// the same small line chart. Every cell targets the highest point unless the
// type is about a region or a threshold.
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import {
  arrow,
  chart,
  circle,
  Constraint,
  Curve,
  datum,
  enclose,
  filter,
  layer,
  line,
  project,
  rect,
  scatter,
  selectAll,
  Shape,
  spread,
  text,
} from "../../../src/lib";

const meta: Meta = { title: "Proposals/Annotations/D3 Annotation Types" };
export default meta;

const pts = [3, 5, 4, 7, 6, 9, 8, 6, 7, 5].map((y, i) => ({ x: i + 1, y }));
const RED = "#c0392b";
const BLUE = "#467DA8";

// The shared plot: dots named "pts" and a line through them.
const plot = () =>
  chart(pts, { w: 240, h: 140 })
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 3, fill: BLUE }).name("pts"))
    .layer(line({ stroke: BLUE }));
const peak = () =>
  chart(selectAll("pts")).flow(filter((p) => project(p, "y") === 9));
// An invisible padded box around the target: the thing a note or connector names.
const hidden = (padding = 4) =>
  enclose({ padding, fill: "none", stroke: "none" });
const note = (title: string, body: string) =>
  spread({ dir: "y", spacing: 1, alignment: "start" }, [
    text({ text: title, fontSize: 12, fontWeight: 700 }),
    text({ text: body, fontSize: 11, fill: "#444" }),
  ]);
// A note with a rule under it. The rule is named so a connector can start at
// it. Its width is fixed by hand: `Constraint.align({ x: "span" })` from the
// note to the rule throws ("source has no resolved extent yet") when the note
// is a spread that only a constraint places.
const underlined = (n: any) =>
  spread({ dir: "y", spacing: 2, alignment: "start" }, [
    n,
    rect({ w: 44, h: 1, fill: RED }).name("ul"),
  ]);
const straight = {
  bow: 0,
  stretch: 0,
  strokeWidth: 1,
  padStart: 3,
  padEnd: 2,
  stroke: RED,
};

const cells: [string, () => any][] = [
  // label: a note only, offset from its subject; no connector, no subject.
  [
    "label",
    () =>
      layer([
        plot().layer(peak().mark(hidden().name("t"))),
        note("Peak", "y = 9").name("n"),
      ]).relate(({ t, n }) => [
        Constraint.distribute({ dir: "x", spacing: 6 }, [n, t]),
        Constraint.align({ y: "middle" }, [t, n]),
      ]),
  ],
  // callout: a note with a rule under it, joined to the subject.
  [
    "callout",
    () =>
      layer([
        plot().layer(peak().mark(hidden().name("t"))),
        underlined(note("Peak", "y = 9")).name("n"),
      ]).relate(({ t, n, ul }) => [
        Constraint.distribute({ dir: "x", spacing: 30 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 14 }, [t, n]),
        arrow(straight, [ul, t]),
      ]),
  ],
  // elbow: the connector bends at a right angle (line, Curve.orthogonal).
  [
    "elbow",
    () =>
      layer([
        plot().layer(peak().mark(hidden(0).name("t"))),
        underlined(note("Peak", "y = 9")).name("n"),
      ]).relate(({ t, n, ul }) => [
        Constraint.distribute({ dir: "x", spacing: 30 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 20 }, [t, n]),
        line({ stroke: RED, curve: Curve.orthogonal() }, [ul, t]),
      ]),
  ],
  // curve: a bowed connector.
  [
    "curve",
    () =>
      layer([
        plot().layer(peak().mark(hidden().name("t"))),
        note("Peak", "y = 9").name("n"),
      ]).relate(({ t, n }) => [
        Constraint.distribute({ dir: "x", spacing: 30 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 16 }, [t, n]),
        arrow({ ...straight, bow: 0.5 }, [n, t]),
      ]),
  ],
  // calloutCircle: a circle subject around the target.
  [
    "calloutCircle",
    () =>
      layer([
        plot().layer(
          peak().mark(
            enclose({
              shape: Shape.oval(),
              padding: 7,
              fill: "none",
              stroke: RED,
            }).name("t")
          )
        ),
        note("Peak", "y = 9").name("n"),
      ]).relate(({ t, n }) => [
        Constraint.distribute({ dir: "x", spacing: 30 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 6 }, [t, n]),
        arrow(straight, [n, t]),
      ]),
  ],
  // calloutRect: a rect subject around a region (x from 7 to 9).
  [
    "calloutRect",
    () =>
      layer([
        plot().layer(
          chart(selectAll("pts"))
            .flow(filter((p) => project(p, "x") >= 7 && project(p, "x") <= 9))
            .mark(enclose({ padding: 6, fill: "none", stroke: RED }).name("t"))
        ),
        note("Plateau", "x = 7 to 9").name("n"),
      ]).relate(({ t, n }) => [
        Constraint.distribute({ dir: "x", spacing: 16 }, [n, t]),
        Constraint.distribute({ dir: "y", spacing: 8 }, [t, n]),
        arrow(straight, [n, t]),
      ]),
  ],
  // xyThreshold: a rule at a data value, its note at its end.
  [
    "xyThreshold",
    () =>
      plot().layer(
        rect({ y: datum(8), h: 1, fill: RED }).label(() => "threshold 8", {
          position: "inset-top-end",
          fontSize: 11,
          color: RED,
        })
      ),
  ],
  // badge: a small filled circle with a letter, at the target's corner.
  [
    "badge",
    () =>
      layer([
        plot().layer(peak().mark(hidden(2).name("t"))),
        layer([
          circle({ r: 8, fill: RED }).name("dot"),
          text({
            text: "A",
            fontSize: 11,
            fontWeight: 700,
            fill: "white",
          }).name("ch"),
        ])
          .relate(({ dot, ch }) => [
            Constraint.align({ x: "middle", y: "middle" }, [dot, ch]),
          ])
          .name("b"),
      ]).relate(({ t, b }) => [
        Constraint.distribute({ dir: "x", spacing: 0 }, [b, t]),
        Constraint.distribute({ dir: "y", spacing: 0 }, [t, b]),
      ]),
  ],
];

export const Grid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(4, 290px)";
    container.style.gap = "12px 8px";
    for (const [title, build] of cells) {
      const cell = document.createElement("div");
      const heading = document.createElement("div");
      heading.textContent = title;
      heading.style.font = "600 13px sans-serif";
      cell.append(heading);
      container.append(cell);
      build().render(cell, { axes: false });
    }
    return container;
  },
};

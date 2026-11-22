import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  layer,
  Constraint,
  line,
  createMark,
  rect,
  circle,
  text,
  polygon,
} from "../../src/lib";
import { lines, cross, drawn, all } from "./defs";

// A copy of stories/bluefish/Pulley.stories.tsx, parametrized by a sketch
// flag. The sketch version swaps solid fills for hatching, puts a roughen
// filter on every shape and rope, and (after layout, so nothing moves) sets a
// handwriting font on the text.

const meta: Meta = { title: "Proposals Theming/Diagram" };
export default meta;

const r = 25;
const w2jut = 10;

// A roughen filter in user space: an objectBoundingBox filter region on a
// vertical or horizontal line (a zero-width or zero-height bbox) is empty, so
// the line would vanish.
const sketchFilter = (
  <filter
    id="sk-rough"
    filterUnits="userSpaceOnUse"
    x="-100"
    y="-100"
    width="1000"
    height="1000"
  >
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.05"
      numOctaves="2"
      seed="4"
      result="noise"
    />
    <feDisplacementMap
      in="SourceGraphic"
      in2="noise"
      scale="3.5"
      xChannelSelector="R"
      yChannelSelector="G"
    />
  </filter>
);
const sketchDefs = [
  sketchFilter,
  lines("sk-ceiling", { angle: 45, gap: 5, width: 1, color: "#333" }),
  lines("sk-wheel", { angle: -45, gap: 4, width: 0.9, color: "#777" }),
  cross("sk-weight", { gap: 4, width: 0.9, color: "#444" }),
];

const pulley = (sketch: boolean) => {
  const f = sketch ? { filter: "url(#sk-rough)" } : {};
  const ink = sketch ? "#222" : undefined;
  const rope = {
    stroke: sketch ? "#5a3a24" : "#774e32",
    strokeWidth: sketch ? 2.5 : 3,
    blendMode: "normal",
    ...f,
  } as const;

  const PulleyCircle = createMark(({ r = 25 }: { r?: number }) =>
    layer([
      circle({
        r,
        stroke: sketch ? "#333" : "#828282",
        strokeWidth: sketch ? 2 : 3,
        fill: sketch ? "url(#sk-wheel)" : "#C1C1C1",
        ...f,
      }).name("wheel"),
      circle({ r: 5, fill: "#555555", ...f }).name("hub"),
    ]).relate(({ wheel, hub }) => [
      Constraint.align({ x: "middle", y: "middle" }, [wheel, hub]),
    ])
  );

  const Weight = createMark(
    ({
      width,
      height,
      label,
    }: {
      width: number;
      height: number;
      label: string;
    }) =>
      layer([
        polygon({
          points: [
            [10, 0],
            [width - 10, 0],
            [width, height],
            [0, height],
          ],
          fill: sketch ? "url(#sk-weight)" : "#545454",
          stroke: sketch ? "#222" : "#545454",
          ...(sketch ? { strokeWidth: 1.6 } : {}),
          ...f,
        }).name("body"),
        text({
          text: label,
          fontSize: 10,
          fill: sketch ? "#111" : "white",
          ...(sketch ? { fontWeight: 700 } : {}),
        }).name("label"),
      ]).relate(({ body, label }) => [
        Constraint.align({ x: "middle", y: "middle" }, [body, label]),
      ])
  );

  return layer({ x: 20, y: 20 }, [
    layer([
      rect({
        h: 20,
        w: 9 * r,
        fill: sketch ? "url(#sk-ceiling)" : "#C9C9C9",
        stroke: "#000",
        strokeWidth: sketch ? 1.6 : 2,
        ...f,
      }).name("ceiling"),
      PulleyCircle({ r }).name("A"),
      PulleyCircle({ r }).name("B"),
      PulleyCircle({ r }).name("C"),
      Weight({ width: 30, height: 30, label: "W1" }).name("w1"),
      Weight({ width: 3 * r + w2jut, height: 30, label: "W2" }).name("w2"),
      text({ text: "A", fontSize: 12, ...(ink ? { fill: ink } : {}) }).name(
        "Alabel"
      ),
      text({ text: "B", fontSize: 12, ...(ink ? { fill: ink } : {}) }).name(
        "Blabel"
      ),
      text({ text: "C", fontSize: 12, ...(ink ? { fill: ink } : {}) }).name(
        "Clabel"
      ),
    ]).relate((c) => [
      Constraint.align({ x: ["middle", "start"] }, [c.A, c.B]),
      Constraint.align({ x: ["end", "start"] }, [c.B, c.C]),
      Constraint.distribute({ dir: "y", spacing: 40 }, [c.ceiling, c.B]),
      Constraint.distribute({ dir: "y", spacing: 30 }, [c.B, c.A]),
      Constraint.distribute({ dir: "y", spacing: 50 }, [c.B, c.C]),
      Constraint.align({ x: "middle" }, [c.B, c.ceiling]),
      Constraint.distribute({ dir: "y", spacing: 50 }, [c.C, c.w2]),
      Constraint.distribute({ dir: "x", spacing: -20 }, [c.A, c.w2]),
      Constraint.distribute({ dir: "x", spacing: -15 }, [c.w1, c.A]),
      Constraint.align({ y: "middle" }, [c.w2, c.w1]),
      ...(
        [
          { pulley: c.A, label: c.Alabel, side: "left", y: "start" },
          { pulley: c.B, label: c.Blabel, side: "right", y: "start" },
          { pulley: c.C, label: c.Clabel, side: "right", y: "end" },
        ] as const
      ).flatMap(({ pulley, label, side, y }) => [
        Constraint.distribute(
          { dir: "x", spacing: 1 },
          side === "right" ? [pulley, label] : [label, pulley]
        ),
        Constraint.align({ y }, [pulley, label]),
      ]),
      line({ ...rope, target: "middle" }, [c.ceiling, c.B])
        .name("ropeSupport")
        .zOrder(-1),
      line({ ...rope, source: ["start", "middle"], target: "middle" }, [
        c.B,
        c.A,
      ])
        .name("ropeX")
        .zOrder(-1),
      line(
        { ...rope, source: ["end", "middle"], target: ["start", "middle"] },
        [c.B, c.C]
      )
        .name("ropeY")
        .zOrder(-1),
      line({ ...rope, target: ["end", "middle"] }, [c.ceiling, c.C])
        .name("ropeZ")
        .zOrder(-1),
      line({ ...rope, source: ["start", "middle"] }, [c.A, c.w1])
        .name("ropeP")
        .zOrder(-1),
      line({ ...rope, source: ["end", "middle"] }, [c.A, c.w2])
        .name("ropeQ")
        .zOrder(-1),
      line({ ...rope, source: "middle" }, [c.C, c.w2])
        .name("ropeS")
        .zOrder(-1),
    ]),
    ...["x", "y", "z", "p", "q", "s"].map((t) =>
      text({ text: t, ...(ink ? { fill: ink } : {}) }).name(
        `label${t.toUpperCase()}`
      )
    ),
  ]).relate((c) => [
    ...[
      { rope: c.ropeX, label: c.labelX, yAnchorTo: c.ropeX },
      { rope: c.ropeY, label: c.labelY, yAnchorTo: c.labelX },
      { rope: c.ropeZ, label: c.labelZ, yAnchorTo: c.labelX },
      { rope: c.ropeS, label: c.labelS, yAnchorTo: c.ropeS },
      { rope: c.ropeQ, label: c.labelQ, yAnchorTo: c.labelS },
      { rope: c.ropeP, label: c.labelP, yAnchorTo: c.labelS },
    ].flatMap(({ rope, label, yAnchorTo }) => [
      Constraint.distribute({ dir: "x", spacing: 5 }, [rope, label]),
      Constraint.align({ y: "middle" }, [yAnchorTo, label]),
    ]),
    Constraint.zAbove(c.ropeX, c.A),
    Constraint.zBelow(c.ropeX, c.B),
    Constraint.zAbove(c.ropeSupport, c.B),
    Constraint.zAbove(c.ropeS, c.C),
  ]);
};

const story = (sketch: boolean): StoryObj => ({
  render: async () => {
    const container = initializeContainer();
    container.style.background = "white";
    container.style.padding = "8px";
    await pulley(sketch).render(container, { defs: sketch ? sketchDefs : [] });
    if (sketch) {
      const [svg] = await drawn(container);
      for (const t of all(svg, "text") as SVGTextElement[]) {
        // keep each label's center where the layout put it
        const b = t.getBBox();
        t.setAttribute("x", String(b.x + b.width / 2));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute(
          "font-family",
          "Bradley Hand, Noteworthy, Chalkboard SE, cursive"
        );
        const isWeight = t.textContent?.trim().startsWith("W");
        t.setAttribute(
          "font-size",
          String(
            (parseFloat(t.getAttribute("font-size") ?? "") || 12) +
              (isWeight ? 1 : 2)
          )
        );
        if (isWeight) {
          // a white halo so the weight labels read over the cross-hatching
          t.style.stroke = "white";
          t.style.strokeWidth = "4px";
          t.style.strokeLinejoin = "round";
          t.style.paintOrder = "stroke";
        }
      }
    }
    return container;
  },
});

// Proposed: pulley.render(el, { theme: Theme.sketch() })
export const DiagramDefault = story(false);
export const DiagramSketch = story(true);

// E2. Magic move on a hand-built diagram: inserting into a linked list.
// Three states, each a layer placed with spatial .relate() clauses and
// joined by arrows. Nodes match across states by their names; the arrows are
// drawn again from where the nodes are at every frame, so they stay attached
// while C slides right. In state 3 the new node morphs from a circle to a
// rounded rect, changes color, and its label cross-fades.
import {
  Animation,
  Constraint,
  arrow,
  circle,
  layer,
  rect,
  text,
  time,
} from "../../../../src/lib";
import type { SequenceClock } from "./clock";

const BLUE = "#3E8CCC";
const ORANGE = "#E8833A";

/** One list node: a shape with its label centered on it. */
const node = (
  id: string,
  label: string,
  { box = false, fill = BLUE }: { box?: boolean; fill?: string } = {}
) =>
  layer([
    (box
      ? rect({ w: 64, h: 44, rx: 10, ry: 10, fill })
      : circle({ r: 24, fill })
    ).name("shape"),
    text({ text: label, fill: "white", fontSize: 16 }).name("label"),
  ])
    .relate(({ shape, label }) => [
      Constraint.align({ x: "middle", y: "middle" }, [shape, label]),
    ])
    .name(id);

const link = (from: any, to: any) =>
  arrow({ stroke: "#555", strokeWidth: 2, padEnd: 8, padStart: 4, bow: 0 }, [
    from,
    to,
  ]);

/** A list laid out left to right, each node linked to the next. */
const list = (nodes: ReturnType<typeof node>[], ids: string[]) =>
  layer(nodes).relate((env) => {
    const ns = ids.map((id) => env[id]);
    return [
      Constraint.distribute({ dir: "x", spacing: 56 }, ns),
      Constraint.align({ y: "middle" }, ns),
      ...ns.slice(1).map((n, i) => link(ns[i], n)),
    ];
  });

const s1 = list([node("A", "3"), node("B", "7"), node("C", "9")], ["A", "B", "C"]);

const s2 = list(
  [node("A", "3"), node("B", "7"), node("N", "8", { fill: ORANGE }), node("C", "9")],
  ["A", "B", "N", "C"]
);

const s3 = list(
  [
    node("A", "3"),
    node("B", "7"),
    node("N", "new", { box: true, fill: "#2E9E6A" }),
    node("C", "9"),
  ],
  ["A", "B", "N", "C"]
);

export default (container: HTMLElement, clock?: SequenceClock) =>
  time
    .sequence({ gap: 2000, cyclic: true, ...clock }, [s1, s2, s3])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 520, h: 120 });

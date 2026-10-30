/**
 * THROWAWAY PROTOTYPE (#1266). The JSX components.
 *
 * Naming: capitalized (`Chart`, `Spread`, `Rect`) because React requires a
 * capital for a non-intrinsic element. This clashes with GoFish's rule that a
 * capital letter means a class or a namespace (`Curve`, `Coord`, `GoFishRef`);
 * the proposal discusses it. Lowercase intrinsics (`<rect>`) would clash with
 * the DOM's SVG elements instead.
 *
 * Each component is two things:
 *  - a marker the converter reads (`Component.gofish`), when the element sits
 *    inside a GoFish tree;
 *  - a real React component, when React itself renders it, i.e. when it is the
 *    root of a GoFish tree (`<Chart>` straight in MDX). It then converts its
 *    own element, runs layout to a display list, and draws it.
 *
 * One component per operator, used two ways (the one-lowercase-surface rule,
 * mirrored): inside `<Chart>` a `<Stack>` is a flow step (`.flow(stack(o))`);
 * outside it, a `<Stack>` with explicit children is the combinator
 * (`stack(o, [a, b])`).
 */
import { createElement, type ReactNode } from "react";
import * as GF from "gofish-graphics";
import type { GoFishSpec } from "./convert";
import { GoFishRoot } from "./render";

const G = GF as any;

type AnyProps = Record<string, any> & { children?: ReactNode };

function component(displayName: string, spec: GoFishSpec) {
  const C = (props: AnyProps): ReactNode =>
    createElement(GoFishRoot, { type: C, props });
  Object.assign(C, { gofish: spec, displayName });
  Object.defineProperty(C, "name", { value: displayName });
  return C as ((props: AnyProps) => ReactNode) & { gofish: GoFishSpec };
}

// Pipeline root.
export const Chart = component("Chart", { kind: "chart" });

// Operators: flow step inside <Chart>, combinator outside.
export const Spread = component("Spread", {
  kind: "operator",
  factory: G.spread,
});
export const Stack = component("Stack", { kind: "operator", factory: G.stack });
export const Scatter = component("Scatter", {
  kind: "operator",
  factory: G.scatter,
});
export const Group = component("Group", { kind: "operator", factory: G.group });
export const Treemap = component("Treemap", {
  kind: "operator",
  factory: G.treemap,
});
// `derive(fn)` takes a function, not an options object.
export const Derive = component("Derive", {
  kind: "operator",
  factory: G.derive,
  args: (o) => [o.fn],
});
export const Filter = component("Filter", {
  kind: "operator",
  factory: G.filter,
  args: (o) => [o.fn],
});

// Combinator-only.
export const Layer = component("Layer", {
  kind: "combinator",
  factory: G.layer,
});
export const Frame = component("Frame", {
  kind: "combinator",
  factory: G.frame,
});

// Leaf marks.
export const Rect = component("Rect", { kind: "mark", factory: G.rect });
export const Circle = component("Circle", { kind: "mark", factory: G.circle });
export const Ellipse = component("Ellipse", {
  kind: "mark",
  factory: G.ellipse,
});
export const Text = component("Text", { kind: "mark", factory: G.text });
export const Petal = component("Petal", { kind: "mark", factory: G.petal });
export const Blank = component("Blank", { kind: "mark", factory: G.blank });

// Relational marks: a tier / leaf with no children, or a combinator over
// <Ref> children.
export const Line = component("Line", { kind: "relational", factory: G.line });
export const Ribbon = component("Ribbon", {
  kind: "relational",
  factory: G.ribbon,
});
export const Arrow = component("Arrow", {
  kind: "relational",
  factory: G.arrow,
});

// `ref(name)`: `<Ref to="a"/>`.
export const Ref = component("Ref", { kind: "ref" });

// `.label(field, opts)`: `<Label field="species" position="center"/>` as a
// child of the mark (or flow step) it labels.
export const Label = component("Label", { kind: "label" });

// Spelling B: a fluent value as a prop. `<GoFish spec={chart(d)...} w h/>`.
export const GoFish = component("GoFish", { kind: "spec" });

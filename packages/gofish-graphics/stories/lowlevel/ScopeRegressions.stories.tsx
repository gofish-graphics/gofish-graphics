import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  spreadX,
  spreadY,
  rect,
  layer,
  enclose,
  Constraint,
  For,
  v,
} from "../../src/lib";
import { color6 } from "../../src/color";

// Regression repros for per-scope y-orientation (issue #629). NOT gallery-tagged
// — these are test-like orientation checks (CLAUDE.md: regression repros get no
// tag), guarding that a subtree keeps its own y-orientation even when wrapped in
// a bake boundary or reordered by a z-order constraint.
const meta: Meta = {
  title: "Low Level Syntax/Scope Regressions",
};
export default meta;

// A vertical bar chart: continuous-y value axis → grows UPWARD (y-up).
const bars = () =>
  spreadX(
    { spacing: 10, alignment: "start", h: 160 },
    For([40, 90, 60, 80, 55], (b, i) =>
      rect({ key: `b${i}`, w: 20, h: v(b), fill: color6[0] })
    )
  );

// A heatmap: keyed rows → ordinal y axis → reads top→bottom (y-down).
const heat = () =>
  spreadY(
    { spacing: 3, alignment: "start" },
    For(["A", "B", "C"], (row) =>
      spreadX(
        { key: row, spacing: 3, alignment: "middle" },
        For([0, 1, 2, 3], (c) =>
          rect({ w: 20, h: 20, fill: `rgba(189,0,38,${0.2 + 0.2 * c})` })
        )
      )
    )
  );

// Bug #2: a bake boundary (enclose) around a continuous-y bar chart beside an
// ordinal heatmap. The boundary's own y space is UNDEFINED, so it declares no
// flip — but its internal lowering must still run the scope walk, so the bars
// grow UP (y-up) while the heatmap reads top→bottom (y-down). Before the fix the
// whole boundary subtree rendered y-down and the bars hung from the top.
export const EncloseMixed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    enclose([
      spreadX({ spacing: 40, alignment: "start" }, [bars(), heat()]),
    ]).render(container, {});
    return container;
  },
};

// Bug #3: the same mixed composition inside a layer that carries a z-order
// (zAbove/zBelow) constraint — which routes the layer through the z-order hoist.
// The hoist must CARRY the flip scope through each hoisted-through plain layer,
// so adding the constraint never changes which orientation a subtree lowers
// under: the bars still grow up, the heatmap still reads top→bottom.
export const ZOrderedMixed: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      // Plain nested layers wrapping each subtree: these are what
      // flattenForZOrder hoists through — the continuous-y bars' scope must be
      // carried through the hoist so the z-order constraint never changes it.
      layer([bars()]).name("barsWrap"),
      layer([heat()]).name("heatWrap"),
    ])
      .constrain((c) => [
        // Position side by side (layout), and add a z-order relation so the
        // layer takes the z-order hoist path (`hoistWithScope`) at bake time.
        Constraint.distribute(
          { dir: "x", spacing: 40, mode: "edge" },
          [c.barsWrap, c.heatWrap]
        ),
        Constraint.zAbove(c.heatWrap, c.barsWrap),
      ])
      .render(container, {});
    return container;
  },
};

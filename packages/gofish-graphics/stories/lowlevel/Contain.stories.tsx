import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import { Constraint, Layer, rect, spread, value } from "../../src/lib";

/**
 * `Constraint.contain({x?, y?}, [outer, inner])`: the relation `outer = inner +
 * 2·padding` holds per constrained axis, and inner is centered in outer. Which
 * side is *derived* is dispatched on which side carries the size:
 *   - Basic / Chained / AutoFit: inner is sized, outer is not → INSIDE_OUT
 *     (`outer = inner + 2p`). Basic wraps a fixed-pixel inner; Chained nests
 *     three levels (sizes propagate inner→outer in dependency order); AutoFit's
 *     data-driven inners make the contain SIZE fold participate in the parent
 *     spread's auto-fit solve (the case PR #461 could not do).
 *   - OutsideIn: outer is sized, inner is not → OUTSIDE_IN (`inner = outer −
 *     2p`). This is CSS padding — the direction PR #461 errored on.
 *   - FillOuter: neither is sized → the layer fills the outer, then `inner =
 *     outer − 2p` (outside-in over a fill outer).
 */
const meta: Meta = {
  title: "Low Level Syntax/Contain",
  argTypes: {
    w: { control: { type: "number", min: 100, max: 1200, step: 20 } },
    h: { control: { type: "number", min: 100, max: 1000, step: 20 } },
  },
};
export default meta;

type Args = { w: number; h: number };

const COLORS = ["#e63946", "#457b9d", "#2a9d8f"];

// ── Basic box-in-box ────────────────────────────────────────────────────────
// inner 60×40, padding 10 → outer 80×60; inner centered (inner.min = 10).

export const Basic: StoryObj<Args> = {
  args: { w: 200, h: 160 },
  render: (args: Args) => {
    const container = initializeContainer();
    Layer([
      rect({ fill: "#dbe6f3", stroke: "#5a7da6", strokeWidth: 1.5, rx: 6 }).name(
        "outer"
      ),
      rect({ w: 60, h: 40, fill: "#e63946", rx: 4 }).name("inner"),
    ])
      .constrain(({ outer, inner }) => [
        Constraint.contain({ x: 10, y: 10 }, [outer, inner]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Chained nesting (3 levels) ──────────────────────────────────────────────
// core 40×30; mid = core + 2·8 = 56×46; shell = mid + 2·12 = 80×70.

export const Chained: StoryObj<Args> = {
  args: { w: 220, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    const mid = Layer([
      rect({ fill: "#cfdcec", stroke: "#5a7da6", strokeWidth: 1.25, rx: 5 }).name(
        "midOuter"
      ),
      rect({ w: 40, h: 30, fill: "#2a9d8f", rx: 3 }).name("core"),
    ]).constrain(({ midOuter, core }) => [
      Constraint.contain({ x: 8, y: 8 }, [midOuter, core]),
    ]);

    Layer([
      rect({ fill: "#fafbfd", stroke: "#9bb1c4", strokeWidth: 1.5, rx: 6 }).name(
        "shell"
      ),
      mid.name("mid"),
    ])
      .constrain(({ shell, mid }) => [
        Constraint.contain({ x: 12, y: 12 }, [shell, mid]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Auto-fit: a fixed-width spread of contained pairs ───────────────────────
// Inner widths are data-driven (value); each pair's outer = inner + 2·8. The
// spread sums the pairs' SIZE claims and inverts against the 300px budget:
//   Σ(σ·vᵢ + 16) + 2·spacing = 300, with Σvᵢ = 190, spacing = 10
//   190σ + 48 + 20 = 300 → σ = 232/190 ≈ 1.22105
// so the three outer widths (σ·vᵢ + 16) sum to 280 and, with 2·10 spacing,
// exactly fill 300. Inner heights are fixed (18), padded to outer height 34.

const INNER_WIDTHS = [40, 90, 60];

export const AutoFit: StoryObj<Args> = {
  args: { w: 300, h: 80 },
  render: (args: Args) => {
    const container = initializeContainer();
    spread(
      { dir: "x", spacing: 10, alignment: "middle" },
      INNER_WIDTHS.map((v, i) =>
        Layer([
          rect({ fill: "#eef2f7", stroke: "#9bb1c4", strokeWidth: 1, rx: 4 }).name(
            "outer"
          ),
          rect({ w: value(v), h: 18, fill: COLORS[i], rx: 3 }).name("inner"),
        ]).constrain(({ outer, inner }) => [
          Constraint.contain({ x: 8, y: 8 }, [outer, inner]),
        ])
      )
    ).render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Outside-in: CSS padding ─────────────────────────────────────────────────
// The OUTER carries the size (200×140) and the INNER is claim-less, so contain
// resolves outside-in: inner = outer − 2·16 = 168×108, centered (inner.min =
// outer.min + 16). This is the direction PR #461 errored on; it is exactly CSS
// `padding: 16px`.

export const OutsideIn: StoryObj<Args> = {
  args: { w: 280, h: 220 },
  render: (args: Args) => {
    const container = initializeContainer();
    Layer([
      rect({ w: 200, h: 140, fill: "#dbe6f3", stroke: "#5a7da6", strokeWidth: 1.5, rx: 6 }).name(
        "outer"
      ),
      rect({ fill: "#e63946", rx: 4 }).name("inner"),
    ])
      .constrain(({ outer, inner }) => [
        Constraint.contain({ x: 16, y: 16 }, [outer, inner]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

// ── Fill outer: neither side sized ──────────────────────────────────────────
// Neither outer nor inner declares a size, so the layer sizes the outer (it
// fills the layer box) and contain resolves outside-in: inner = layer − 2·20 on
// each axis, centered. At 240×180 the inner is 200×140.

export const FillOuter: StoryObj<Args> = {
  args: { w: 240, h: 180 },
  render: (args: Args) => {
    const container = initializeContainer();
    Layer([
      rect({ fill: "#dbe6f3", stroke: "#5a7da6", strokeWidth: 1.5, rx: 6 }).name(
        "outer"
      ),
      rect({ fill: "#2a9d8f", rx: 4 }).name("inner"),
    ])
      .constrain(({ outer, inner }) => [
        Constraint.contain({ x: 20, y: 20 }, [outer, inner]),
      ])
      .render(container, { w: args.w, h: args.h });
    return container;
  },
};

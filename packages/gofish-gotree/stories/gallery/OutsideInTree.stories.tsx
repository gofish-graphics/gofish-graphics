import type { Meta, StoryObj } from "@storybook/html";
import { rect, Layer, Frame, polar } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — outside-in-tree (INVERTED filled sunburst).
//
// REFRAME. The committed dsl.json says Node="circle" with Link="curve", which
// reads like a point node-link diagram — and the previous port drew circles +
// links. But the rendered gallery reference (gallery/outside-in-tree/tree.png)
// is a FILLED INVERTED SUNBURST: concentric arc-wedge rings with NO circles and
// NO visible links. So this story belongs to the filled-wedge polar family
// (Sunburst / IciclePlot / HierarchicalSectorChart), read as wedges — the
// "Node=circle but the reference is filled wedges" convention those ports use.
//
// The "inverted / outside-in" reading comes straight from the dsl's radial
// placement: CoordinateSystem PolarCenter="bottom" with Layout Y.Root=juxtapose
// Position="bottom". GoTree's "bottom" radial anchor puts the ROOT at the OUTER
// edge and grows the tree INWARD — the opposite of a normal sunburst. Decoded:
//   - depth 0 (root)  → OUTERMOST ring, full 2π, thickest, DARKEST (#2171b5).
//   - depth 1 (its 19 children) → the middle ring; one wedge per child, each
//     wedge's angular span ∝ its subtree LEAF count (X.Subtree=flatten with
//     leaf-count weighting), medium blue.
//   - depth 2 (grandchildren) → the INNERMOST ring, palest (#deebf7 end of the
//     ColorRange), inside a white center hole (InnerRadius as drawn ≈ 40% of the
//     disc). Depth-1 LEAVES have no children, so their inner-ring slot is empty
//     — several middle-ring wedges sit over blank center space (visible in the
//     reference), which this layout reproduces by emitting a wedge only for
//     nodes that exist.
//
// DSL vs DATA-POSITION. This port uses the DATA-POSITION approach (like
// RadialDeep, per issue #627), NOT the tree()/combine() DSL. Two DSL gaps make
// the literal spec inexpressible today:
//   1. INVERTED radial order (root at the LARGEST r, growing inward) — the
//      combine distribute-r primitive only steps parent→children OUTWARD
//      (root at the center); there is no reversed-radial knob, and PolarCenter
//      /Y.Position="bottom" (the "bottom" radial anchor that drives the
//      inversion) is not expressible via polar()'s screen-offset `center`.
//   2. Depth-1 leaves must occupy ONLY the middle ring with an empty inner slot;
//      under nest-θ + distribute-r they would still tile a ring cleanly, but the
//      inversion is the blocker regardless.
// So a small story-local pass computes each node's angular span (bottom-up from
// leaf counts: leaf = 1 slot, parent span = Σ children, 37 leaf slots total) and
// its radial band (by depth, rings INVERTED), then emits rect wedges directly
// into a Frame({ coord: polar() }). Each wedge is the "both dimensions embedded"
// rect case: emX makes the width sweep an arc (θ-units) and emY makes the height
// a radial band (r-units), so a rect in polar space IS an annular sector (the
// same embedded-wedge technique as the Sunburst / HierarchicalSectorChart
// templates, but with explicit θ/r instead of the σ-solve).
//
// APPROXIMATIONS (flagged, not faked):
//  - Angular gaps: the dsl's X.Subtree Margin is "0" (no angular padding), so
//    wedges are allotted CONTIGUOUS spans; the thin white seams between them are
//    the white stroke, exactly as in the reference — not real angular gaps.
//  - thetaSize angular auto-fit (#622) and polar() options (#620,
//    innerRadius/direction/startAngle) would let the DSL express the angular fit
//    and the hole once the inverted-radial gap (above) is closed; here the raw
//    radians/pixels bypass the scale machinery (the "simple thing for now" #627
//    calls for), so those knobs are baked into the numbers instead.
//  - Link="curve": no links in a filled inverted sunburst (link is implied by
//    ring adjacency), matching the reference.

const meta: Meta = { title: "GoTree / Gallery / outside-in-tree" };
export default meta;

// ---- geometry -------------------------------------------------------------

// Reference proportions (measured off the reference PNG, radii as a fraction of
// the outer radius): dark root ring ≈ 16%, medium depth-1 ring ≈ 28% (the widest
// band), pale depth-2 ring ≈ 19%, and a white center hole ≈ 37%. Bands measured
// from the OUTSIDE in.
const R_OUTER = 246; // root outer edge
const ROOT_THICK = 40; // depth 0 band (outermost, darkest)
const MID_THICK = 68; // depth 1 band (widest)
const LEAF_THICK = 46; // depth 2 band (innermost)

// Inverted radial bands: [inner, outer] per depth.
const R2 = R_OUTER; // root outer
const R1 = R2 - ROOT_THICK; // root inner = depth-1 outer
const R0 = R1 - MID_THICK; // depth-1 inner = depth-2 outer
const RH = R0 - LEAF_THICK; // depth-2 inner = white hole radius
const BANDS: [number, number][] = [
  [R1, R2], // depth 0
  [R0, R1], // depth 1
  [RH, R0], // depth 2
];

// ColorRange ["#2171b5","#deebf7"] mapped by depth: dark root → pale leaves.
// depth 1 is the linear midpoint of the two endpoints.
const DEPTH_COLORS = ["#2171b5", "#7faed6", "#deebf7"];

type Wedge = {
  depth: number;
  theta0: number; // start angle (radians)
  dTheta: number; // angular span (radians)
};

// ---- data-position layout -------------------------------------------------

const leafCount = (n: FlareNode): number =>
  n.children?.length ? n.children.reduce((s, c) => s + leafCount(c), 0) : 1;

const layout = (root: FlareNode): Wedge[] => {
  const total = leafCount(root); // 37 leaf slots
  const slot = (2 * Math.PI) / total;
  const wedges: Wedge[] = [];

  // Top-down: allocate each node a contiguous angular span ∝ its leaf count,
  // and tile its children left-to-right inside it. Root spans the full 2π.
  const walk = (n: FlareNode, depth: number, theta0: number): void => {
    const dTheta = leafCount(n) * slot;
    wedges.push({ depth, theta0, dTheta });
    let cursor = theta0;
    (n.children ?? []).forEach((c) => {
      walk(c, depth + 1, cursor);
      cursor += leafCount(c) * slot;
    });
  };

  walk(root, 0, 0);
  return wedges;
};

const wedges = layout(flareVis);

// ---- marks ----------------------------------------------------------------

// A wedge is a rect swept through polar space: x = start angle, w = angular
// span (emX → measured in radians), y = inner radius, h = band thickness
// (emY → radial extent). Both dims embedded ⇒ the rect lowers to an annular
// sector. White stroke draws the thin seams between adjacent wedges.
//
// A near-2π wedge (the root annulus) would DEGENERATE: with start angle ≡ end
// angle the polar path resamples to a zero-width sliver, so a full ring can't be
// one wedge. The root is therefore split into quarter-annuli (strokeWidth 0 → no
// seams between the quarters, so they read as one solid dark ring).
const wedgeMark = (theta0: number, dTheta: number, depth: number) => {
  const [rInner, rOuter] = BANDS[depth];
  return rect({
    x: theta0,
    w: dTheta,
    y: rInner,
    h: rOuter - rInner,
    emX: true,
    emY: true,
    fill: DEPTH_COLORS[depth],
    stroke: "white",
    strokeWidth: depth === 0 ? 0 : 2,
  });
};

const wedgeMarks = (wg: Wedge) => {
  if (wg.dTheta > 1.5 * Math.PI) {
    // Full annulus → four quarter-wedges so none is degenerate.
    const q = wg.dTheta / 4;
    return [0, 1, 2, 3].map((i) => wedgeMark(wg.theta0 + i * q, q, wg.depth));
  }
  return [wedgeMark(wg.theta0, wg.dTheta, wg.depth)];
};

// Outer → inner so inner wedges (and their white seams) paint on top.
const marks = wedges
  .slice()
  .sort((a, b) => b.depth - a.depth)
  .flatMap(wedgeMarks);

export const OutsideInTree: StoryObj = {
  render: () => {
    const container = initializeContainer({ w: 540, h: 540 });
    Frame({ coord: polar() as any }, [Layer(marks)]).render(container, {
      w: 540,
      h: 540,
    });
    return container;
  },
};

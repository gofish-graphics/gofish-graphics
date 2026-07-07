import type { Meta, StoryObj } from "@storybook/html";
import { rect, ellipse, line, Layer, Frame, polar } from "gofish-graphics";
import { initializeContainer } from "../helper";
import { flareVis, type FlareNode } from "./_flareVis";

// GoTree gallery port — MultilevelSilhouetteTree (MULTI-TEMPLATE radial tree).
//
// This is the hardest radial port: the reference is not one layout but TWO
// GoTree templates composited over the SAME tree, chosen per subtree.
//
// ── DECODED MULTI-TEMPLATE SWITCHING RULE ────────────────────────────────────
// The gallery spec is a multi-template GoTree spec: a TreeVisSpecification
// (dsl0.json) whose entries pair a NodeQuery with a TreeTemplate, plus two
// template bodies:
//   • dsl1.json — the SILHOUETTE template:
//       Element{ Node:rectangle, Color:depth, Link:hidden, RootWidth:value }
//       CoordinateSystem polar ; Layout X{Root:include, Subtree:flatten}
//                                       Y{Root:juxtapose, Subtree:align}.
//     ⇒ concentric FILLED WEDGE bands: each node is a polar rect, angular span
//       ∝ its subtree leaf count, children stacked one ring outward.
//   • dsl2.json — the NODE-LINK template ("Node-Link"):
//       Element{ Node:circle, Link:straight, Color:depth } ; polar.
//     ⇒ a small circle parent with STRAIGHT links fanning out to leaf circles.
//
// The committed dsl0.json only carries the GENERIC depth-parity queries
// (depth%2==1 / depth%2==0), which — both mapping to SliceLayout — alone yield
// an all-silhouette render; the per-subtree node-link SELECTION that the PNG
// shows is a hand-authored NodeQuery set that the committed JSON does not
// preserve. So the switching rule is decoded from the reference PNG itself:
//   • ROOT               → one giant DARK-BLUE filled DISC at the center.
//   • MOST depth-1 nodes → the SILHOUETTE template: a MEDIUM-blue wedge on the
//     first ring (span ∝ subtree leaf count), with its depth-2 children drawn
//     as PALE wedges tiled on the next ring out.
//   • A HANDFUL of depth-1 subtrees → the NODE-LINK template instead: a medium
//     circle just outside the disc with straight links fanning to PALE leaf
//     circles far beyond the wedge ring. FAN_INDICES picks the four subtrees
//     the reference draws this way (heap, Maths, Shapes, Strings) — one near
//     each of the four sides, matching the PNG's four fans.
//
// ── LAYOUT MATH (data-position, per issue #627) ──────────────────────────────
// Like RadialDeep / OutsideInTree, this BYPASSES the tree()/combine() DSL: the
// DSL cannot express a per-subtree template swap, so a small story-local pass
// computes each node's angular slice directly and emits marks explicitly into a
// Frame({ coord: polar() }).
//   • Angular allocation (X.Subtree=flatten, leaf-count weighted): the 2π circle
//     is divided among the 19 depth-1 subtrees ∝ their leaf count (leaf = 1
//     slot, internal = Σ children; 37 leaf slots total). Each subtree's slot is
//     rendered EITHER as a wedge OR as a fan, so both templates share one
//     angular budget and the fans sit in the gaps between wedge clusters.
//   • Radial bands (Y.Root=juxtapose → one ring per depth): disc r∈[0,DISC_R],
//     medium wedges r∈[WEDGE_R0,WEDGE_R1], pale children r∈[PALE_R0,PALE_R1].
//   • A wedge is a rect swept through polar (x=θ0, w=Δθ, emX; y=rInner, h=band,
//     emY) → an annular sector (same embedded-wedge technique as Sunburst /
//     OutsideInTree). Raw radians/pixels bypass the scale machinery.
//   • The root disc is a full-2π ring, which would degenerate to a sliver as one
//     rect (start angle ≡ end angle resamples to zero width), so it is split
//     into four quarter-pies (strokeWidth 0 → they read as one solid disc).
//   • Fan circles reuse RadialDeep's point-ellipse trick (w/h are pixel-size
//     aesthetics, center lands exactly on the polar (θ,r)); links are linear
//     `connect`s between invisible pt() anchors.
//
// ── APPROXIMATIONS (flagged, not faked) ──────────────────────────────────────
//  - Fan links: the dsl asks for STRAIGHT (screen-space) links, but a linear
//    connect interpolates in (θ,r) space and the polar resample bows it into a
//    gentle arc. The parent→leaf Δθ is small, so the bow is slight; true
//    straight-in-screen links (and curve links generally) land with #637.
//  - Angular gaps: GoTree's flatten Margin gives the thin white seams; here they
//    are a small fixed angular inset per wedge plus the white stroke.
//  - polar() options (#620: innerRadius/direction/startAngle/centralAngle) and
//    thetaSize auto-fit (#622) would let the DSL express the ring fit and hole;
//    the numbers bake them in instead. The PolarAxis θ/r swap is still not
//    expressible (no transposed variant).

const meta: Meta = {
  title: "GoTree / Gallery / MultilevelSilhouetteTree",
};
export default meta;

// ---- geometry -------------------------------------------------------------

// Reference proportions (canvas ≈ 660): a large central disc (~32% of the
// half-canvas), a thick medium ring, a paler outer ring, and fans reaching
// nearly to the canvas edge.
const DISC_R = 106; // root filled disc
const WEDGE_R0 = 113; // medium ring inner (thin white gap after the disc)
const WEDGE_R1 = 191; // medium ring outer
const PALE_R0 = 197; // pale ring inner (thin white gap after the medium ring)
const PALE_R1 = 252; // pale ring outer
const FAN_PARENT_R = 123; // node-link parent circle, just outside the disc
const FAN_LEAF_R = 291; // node-link leaf circles, beyond the wedge rings
const PARENT_CIRCLE_R = 15; // px screen radius of a fan parent
const LEAF_CIRCLE_R = 13; // px screen radius of a fan leaf

// Angular seams (radians): the white gaps between adjacent wedges.
const WEDGE_GAP = 0.03; // between depth-1 slots
const PALE_GAP = 0.016; // between depth-2 pale wedges within a slot
const FAN_PITCH = 0.2; // angular pitch between adjacent leaves in a fan

// Colors sampled from the reference: dark-blue root → medium depth-1 → pale
// depth-2; fans use a slightly more saturated parent and a pale leaf.
const DISC_FILL = "#2f75bd";
const MED_FILL = "#84abd9";
const PALE_FILL = "#d7e6f6";
const FAN_PARENT_FILL = "#6f9fd0";
const FAN_LEAF_FILL = "#cfe0f2";
const LINK_STROKE = "#5f6b7a";

// Depth-1 subtrees the reference draws with the NODE-LINK template instead of a
// silhouette wedge. flareVis order: 6=heap(2), 11=Maths(4), 15=Shapes(4),
// 18=Strings(4) — one fan near each side (right / bottom / left / top).
const FAN_INDICES = new Set([6, 11, 15, 18]);

// ---- data-position layout -------------------------------------------------

const leafCount = (n: FlareNode): number =>
  n.children?.length ? n.children.reduce((s, c) => s + leafCount(c), 0) : 1;

type Wedge = { theta0: number; theta1: number; fill: string; stroke: string };
type Circle = { theta: number; r: number; radius: number; fill: string };
type Link = { a: [number, number]; b: [number, number] };

const discQuarters: Wedge[] = [];
const medWedges: Wedge[] = [];
const paleWedges: Wedge[] = [];
const fanLinks: Link[] = [];
const fanLeaves: Circle[] = [];
const fanParents: Circle[] = [];

const build = (root: FlareNode) => {
  const total = leafCount(root); // 37 leaf slots
  const slot = (2 * Math.PI) / total;

  // Root disc as four quarter-pies (a single 2π rect degenerates). Each quarter
  // slightly overlaps the next and is stroked in its own fill so no seam shows.
  for (let i = 0; i < 4; i++) {
    discQuarters.push({
      theta0: (i * Math.PI) / 2,
      theta1: ((i + 1) * Math.PI) / 2 + 0.03,
      fill: DISC_FILL,
      stroke: DISC_FILL,
    });
  }

  const kids = root.children ?? [];
  let cursor = 0;
  kids.forEach((child, idx) => {
    const span = leafCount(child) * slot;
    const t0 = cursor;
    const t1 = cursor + span;
    cursor = t1;

    if (FAN_INDICES.has(idx)) {
      // NODE-LINK template: parent circle + straight fan to leaf circles.
      const center = (t0 + t1) / 2;
      fanParents.push({
        theta: center,
        r: FAN_PARENT_R,
        radius: PARENT_CIRCLE_R,
        fill: FAN_PARENT_FILL,
      });
      const leaves = child.children ?? [];
      const k = leaves.length;
      leaves.forEach((_leaf, j) => {
        // Fan the leaves at a fixed pitch, centered on the slot (a point-node
        // fan claims its own angular spread, wider than the wedge slot).
        const theta = center + (j - (k - 1) / 2) * FAN_PITCH;
        fanLeaves.push({
          theta,
          r: FAN_LEAF_R,
          radius: LEAF_CIRCLE_R,
          fill: FAN_LEAF_FILL,
        });
        fanLinks.push({
          a: [center, FAN_PARENT_R],
          b: [theta, FAN_LEAF_R],
        });
      });
      return;
    }

    // SILHOUETTE template: medium wedge + pale children.
    medWedges.push({
      theta0: t0 + WEDGE_GAP / 2,
      theta1: t1 - WEDGE_GAP / 2,
      fill: MED_FILL,
      stroke: "white",
    });
    const leaves = child.children ?? [];
    const k = leaves.length;
    if (k > 0) {
      const sub = span / k;
      leaves.forEach((_leaf, j) => {
        paleWedges.push({
          theta0: t0 + j * sub + PALE_GAP / 2,
          theta1: t0 + (j + 1) * sub - PALE_GAP / 2,
          fill: PALE_FILL,
          stroke: "white",
        });
      });
    }
  });
};

build(flareVis);

// ---- marks ----------------------------------------------------------------

// A wedge is a rect swept through polar space (both dims embedded → annular
// sector). Disc quarters carry no stroke so they read as one solid disc.
const wedgeMark = (
  w: Wedge,
  rInner: number,
  rOuter: number,
  strokeWidth: number
) =>
  rect({
    x: w.theta0,
    w: w.theta1 - w.theta0,
    y: rInner,
    h: rOuter - rInner,
    emX: true,
    emY: true,
    fill: w.fill,
    stroke: w.stroke,
    strokeWidth,
  });

// Point-ellipse trick (RadialDeep): w/h are pixel-size aesthetics so the ellipse
// lowers to a screen circle whose center lands exactly on the polar (θ, r).
const circleMark = (c: Circle) =>
  ellipse({
    x: c.theta - c.radius,
    y: c.r - c.radius,
    w: c.radius * 2,
    h: c.radius * 2,
    fill: c.fill,
    stroke: "white",
    strokeWidth: 2.5,
  });

// Invisible zero-size anchor at exact polar coords, used as connect endpoints.
const pt = (theta: number, r: number) =>
  ellipse({ x: theta, y: r, w: 0, h: 0, fill: "none", stroke: "none" });

const linkMark = (l: Link) =>
  line(
    {
      curve: "straight",
      fill: "none",
      stroke: LINK_STROKE,
      strokeWidth: 2,
    },
    [pt(l.a[0], l.a[1]), pt(l.b[0], l.b[1])]
  );

// Paint order (array order inside a coord): disc behind, then wedge rings, then
// fan links under fan circles, leaves under parents.
const marks = [
  ...discQuarters.map((w) => wedgeMark(w, 0, DISC_R, 2)),
  ...medWedges.map((w) => wedgeMark(w, WEDGE_R0, WEDGE_R1, 2.5)),
  ...paleWedges.map((w) => wedgeMark(w, PALE_R0, PALE_R1, 2.5)),
  ...fanLinks.map(linkMark),
  ...fanLeaves.map(circleMark),
  ...fanParents.map(circleMark),
];

export const MultilevelSilhouetteTree: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "GoTree: Multilevel Silhouette Tree",
      description:
        "A multi-template radial tree: a filled-wedge silhouette for most branches with a few node-link fans, radiating from one central disc.",
    },
  },
  render: () => {
    const container = initializeContainer({ w: 660, h: 660 });
    Frame({ coord: polar() as any }, [Layer(marks)]).render(container, {
      w: 660,
      h: 660,
    });
    return container;
  },
};

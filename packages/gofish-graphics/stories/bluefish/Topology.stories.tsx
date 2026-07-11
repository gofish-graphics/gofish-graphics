import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  layer,
  ellipse,
  text,
  position,
  polygon,
  Layer,
} from "../../src/lib";

// Ported from Bluefish's example-gallery topology.tsx (issue #440): three
// labeled points (a, b, c) with nested ellipse "neighbourhood" outlines
// showing different point-set topologies on the same three points. The a/c
// neighbourhood (the one where two non-adjacent points share a
// neighbourhood but the point between them does not) is drawn as a
// `polygon` sampled from Bluefish's original hand-authored concave SVG
// path — see `acNeighbourhoodPoints` below.
//
// NOTE on enclose+refs: this port originally probed
// `enclose({}, [ref("a"), ref("b")])` and found it broken — enclose
// unconditionally re-placed every child at local (0, 0), collapsing refs
// onto the origin. That bug is fixed in #713 (enclose shares layer's
// place-only-if-unplaced child semantics via `placeUnplacedChild`); the
// canonical regression probe lives at
// stories/lowlevel/EncloseRefs.stories.tsx. The neighbourhood outlines
// below still use analytic geometry (`ellipse`/`polygon` via `position`)
// rather than enclose-over-refs, for two remaining reasons recorded in the
// friction log: enclose's hull is a hardcoded gray outline (no fill/stroke
// opts, so no colored translucent pills), and enclose only produces convex
// bbox-based hulls — it can't express the concave a/c neighbourhood.

const meta: Meta = {
  title: "Bluefish/Topology",
};
export default meta;

type Args = { w: number; h: number };

// ── The actual port ─────────────────────────────────────────────────────────

const POINT_NAMES = ["a", "b", "c"] as const;
type PointName = (typeof POINT_NAMES)[number];
type Neighbourhood = PointName[];

const SPACING = 50; // center-to-center distance between adjacent points
const POINT_SIZE = 8; // point marker diameter

const TOPOLOGY_COLORS = [
  "#ff2400", // red
  "#009dff", // blue
  "#d4c400", // yellow (darkened for contrast on white)
  "orange",
  "green",
  "purple",
];
const TOPOLOGY_OPACITY = 0.5;

const isAandCNeighbourhood = (n: Neighbourhood) =>
  n.length === 2 && n.includes("a") && n.includes("c");

// The a/c neighbourhood in Bluefish's original is a hand-drawn concave SVG
// path (drawn in Figma, exported, then hand-offset into place — see the
// upstream comment in bluefish-monorepo's
// packages/bluefish-solid/src/stories/ThreePointTopologies.stories.tsx) that
// bulges out to enclose "a" and "c" while dipping away from "b", which sits
// between them but is NOT a member of the neighbourhood. GoFish has no
// concave-enclosure primitive, but it does have `polygon` (explicit
// local-coordinate point list) — so this samples the original path's cubic
// Bézier segments into a dense point list and remaps it (piecewise-
// linearly; see AC_X_WARP/AC_Y_WARP) into this story's own
// point-spacing/point-size coordinate system, anchored on the two points
// ("a" and "c") the shape must actually enclose. That keeps the shape
// faithful to the original hand-drawn artwork instead of re-approximating
// it with a bbox-based primitive.
const AC_PATH_SEGMENTS: [number, number][][] = [
  // Each entry: [P0, C1, C2, P1] control points of one cubic Bézier segment,
  // transcribed directly from the original path's "d" attribute
  // (M68.5011 48 H53.0011 H37.501 C32.001 48 ... Z).
  [
    [68.5011, 48],
    [68.5011, 48],
    [53.0011, 48],
    [53.0011, 48],
  ],
  [
    [53.0011, 48],
    [53.0011, 48],
    [37.501, 48],
    [37.501, 48],
  ],
  [
    [37.501, 48],
    [32.001, 48],
    [29.039, 47.7419],
    [24.001, 46.02],
  ],
  [
    [24.001, 46.02],
    [14.431, 42.76],
    [8.50201, 33.96],
    [7.00201, 31],
  ],
  [
    [7.00201, 31],
    [5.50201, 28.039],
    [2.00201, 19.42],
    [2.00201, 13.5],
  ],
  [
    [2.00201, 13.5],
    [2.00201, 7.58],
    [5.15102, 2],
    [11.502, 2],
  ],
  [
    [11.502, 2],
    [17.862, 2],
    [22.002, 4.11],
    [23.002, 13.5],
  ],
  [
    [23.002, 13.5],
    [24.002, 22.887],
    [34.001, 42.07],
    [41.501, 42.07],
  ],
  [
    [41.501, 42.07],
    [41.501, 42.07],
    [53.0011, 42.07],
    [53.0011, 42.07],
  ],
  [
    [53.0011, 42.07],
    [53.0011, 42.07],
    [64.5011, 42.07],
    [64.5011, 42.07],
  ],
  [
    [64.5011, 42.07],
    [72.0011, 42.07],
    [82.0001, 22.887],
    [83.0001, 13.5],
  ],
  [
    [83.0001, 13.5],
    [84.0001, 4.11],
    [88.1401, 2],
    [94.5001, 2],
  ],
  [
    [94.5001, 2],
    [100.851, 2],
    [104, 7.58],
    [104, 13.5],
  ],
  [
    [104, 13.5],
    [104, 19.42],
    [100.5, 28.039],
    [99.0001, 31],
  ],
  [
    [99.0001, 31],
    [97.5001, 33.96],
    [91.5711, 42.76],
    [82.0011, 46.02],
  ],
  [
    [82.0011, 46.02],
    [76.9631, 47.7419],
    [74.0011, 48],
    [68.5011, 48],
  ],
];

// Remap from the path's own coordinate space into this story's point
// layout, as two independent piecewise-linear warps (x and y). A single
// affine map can't work here: the "a"/"c" lobe anchors must land exactly on
// this story's dot centers (fixing the x scale between them), while the
// concave dip's opening must clear this story's label-containing b-pill
// (which is wider, relative to the dot spacing, than the original's tiny
// r=5 dot circle) and the dip band must clear both the two-point pills
// above it and the outer ellipse below it. The knots are hand-tuned against
// rendered captures. Path-space landmarks (from the segment data above):
// lobe anchors x=14/94 at y=17 (mirror-symmetric about x=53, cross-checked
// against upstream's hand-tuned x:-7, y:-10 placement); dip walls at
// x=41.5/64.5; band from y=42.07 (top) to y=48 (bottom); lobe tops at y=2.
const AC_X_WARP: [number, number][] = [
  [2, -66], // outer edge of the "a" lobe
  [14, -50], // "a" lobe anchor -> dot a
  [41.5, -16], // left dip wall (hugs the r=9 b-circle, like upstream)
  [64.5, 16], // right dip wall
  [94, 50], // "c" lobe anchor -> dot c
  [104, 66], // outer edge of the "c" lobe
];
const AC_Y_WARP: [number, number][] = [
  [17, 0], // lobe anchor height -> dot centerline
  [42.07, 43.5], // band top: below the two-point pills' deepest edge
  [48, 49.5], // band bottom: inside the outer ellipse
];

// Piecewise-linear interpolation through sorted (input, output) knots,
// extrapolating with the end segments' slopes.
const warp1d = (knots: [number, number][], v: number): number => {
  let i = 0;
  while (i < knots.length - 2 && v > knots[i + 1][0]) i++;
  const [x0, y0] = knots[i];
  const [x1, y1] = knots[i + 1];
  return y0 + ((v - x0) * (y1 - y0)) / (x1 - x0);
};

const cubicBezierPoint = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] => {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
};

const SAMPLES_PER_SEGMENT = 12;

// Sample the hand-drawn a/c path into a dense point list, warped through
// the piecewise-linear x/y maps above so its lobes land on this story's
// "a"/"c" dots and its dip clears this story's (larger) pills.
const acNeighbourhoodPoints = (): [number, number][] => {
  const remap = ([px, py]: [number, number]): [number, number] => [
    warp1d(AC_X_WARP, px),
    warp1d(AC_Y_WARP, py),
  ];

  const pts: [number, number][] = [];
  for (const [p0, c1, c2, p1] of AC_PATH_SEGMENTS) {
    for (let i = 0; i < SAMPLES_PER_SEGMENT; i++) {
      const t = i / SAMPLES_PER_SEGMENT;
      pts.push(remap(cubicBezierPoint(p0, c1, c2, p1, t)));
    }
  }
  return pts;
};

// Per-axis ellipse padding, keyed by neighbourhood size, matching the
// Bluefish original's proportions: a single-point neighbourhood is a SMALL
// CIRCLE snug around its dot (upstream draws an r=10 circle around an r=5
// dot — it deliberately does NOT contain the point's label, which sits
// below/outside it), while the multi-point pills and the outer set ellipse
// are sized to contain their dots AND the labels (which hang ~22px below
// the dot centers) with breathing room — label containment applies to
// those outer levels only. Sizing enclosures to contain labels
// automatically (a Penrose-style optimization pass) is future design
// direction; these are hand-tuned constants pending that.
const NEIGHBOURHOOD_PAD: Record<number, { x: number; y: number }> = {
  1: { x: 5, y: 5 }, // circle: 18 x 18 (r 9) — snug, label outside
  2: { x: 21, y: 34 }, // pill: 100 x 76 (rx 50, ry 38)
};
const OUTER_PAD = { x: 34, y: 54 }; // outer: 176 x 116 (rx 88, ry 58)

// Analytic bbox for a neighbourhood: since the three points sit at known,
// fixed x-offsets (index * SPACING) with a shared y, the ellipse outline
// spanning a subset of them can be computed directly instead of asking
// `enclose` to discover it from refs (see finding above).
const neighbourhoodBox = (n: Neighbourhood, pad: { x: number; y: number }) => {
  const indices = n.map((p) => POINT_NAMES.indexOf(p));
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  const spanW = (maxIdx - minIdx) * SPACING + POINT_SIZE;
  return {
    // centerX of the span, relative to the middle point (b, index 1) which
    // the panel's local coordinates place at x = 0.
    centerX: (minIdx + maxIdx - 2) * (SPACING / 2),
    w: spanW + pad.x * 2,
    h: POINT_SIZE + pad.y * 2,
  };
};

const ThreePointTopology = (
  topology: Neighbourhood[],
  opts: { showLabels?: boolean; overdraw?: boolean } = {}
) => {
  const { showLabels = false, overdraw = false } = opts;

  // `position({x, y}, [child])` sets the CHILD's own (min-x, min-y) corner —
  // rect/ellipse are min-anchored at their own local (0, 0), not centered —
  // so every placement below subtracts half the shape's extent to land its
  // *center* at the intended coordinate. (Friction: this offset-by-half-size
  // bookkeeping is exactly what `enclose`/an align-to-center primitive would
  // normally absorb; see friction log.)
  const points = POINT_NAMES.map((p, i) => {
    const x = (i - 1) * SPACING;
    return position(
      { x: x - POINT_SIZE / 2, y: -POINT_SIZE / 2 },
      [ellipse({ w: POINT_SIZE, h: POINT_SIZE, fill: "black" }).name(p)]
    );
  });

  const labels = showLabels
    ? POINT_NAMES.map((p, i) => {
        const x = (i - 1) * SPACING;
        return position(
          // -4: a single-character italic label is ~8px wide at fontSize 12;
          // approximate centering since text has no measured-width query here.
          // y: 10 keeps the label snug under the dot so the label-containing
          // pill sizes (NEIGHBOURHOOD_PAD) stay compact.
          { x: x - 4, y: 10 },
          [text({ text: p, fontStyle: "italic" })]
        );
      })
    : [];

  // Whole-stack outline (always present, plain black, never filled) — the
  // Bluefish `<EllipseBackground padding={36} overdraw={props.overdraw}>`
  // wrapping the full <StackH>. `overdraw` is accepted-but-unused there too
  // (the component only reads `fill`/`opacity`, both left at their plain
  // defaults), so it renders identically in both modes.
  const outerBox = neighbourhoodBox(["a", "b", "c"], OUTER_PAD);
  const outer = position(
    { x: outerBox.centerX - outerBox.w / 2, y: -outerBox.h / 2 },
    [
      ellipse({
        w: outerBox.w,
        h: outerBox.h,
        fill: "none",
        stroke: "black",
        strokeWidth: 3,
      }),
    ]
  );

  const neighbourhoods = topology.map((n, i) => {
    const acSpecial = isAandCNeighbourhood(n);

    // Bluefish draws the a-c neighbourhood as a hand-authored concave SVG
    // path that bulges around "a" and "c" while dipping away from "b"
    // (which sits between them but is NOT a member) — replicated here as a
    // `polygon` sampled from that same path (see `acNeighbourhoodPoints`
    // above) rather than the convex ellipse every other neighbourhood uses.
    const rawColor = TOPOLOGY_COLORS[i % TOPOLOGY_COLORS.length];

    if (acSpecial) {
      return polygon({
        points: acNeighbourhoodPoints(),
        fill: overdraw ? "none" : rawColor,
        stroke: "black",
        strokeWidth: 3,
        opacity: overdraw ? 1 : TOPOLOGY_OPACITY,
      });
    }

    const box = neighbourhoodBox(n, NEIGHBOURHOOD_PAD[n.length]);
    return position(
      { x: box.centerX - box.w / 2, y: -box.h / 2 },
      [
        ellipse({
          w: box.w,
          h: box.h,
          fill: overdraw ? "none" : rawColor,
          stroke: "black",
          strokeWidth: 3,
          opacity: overdraw ? 1 : TOPOLOGY_OPACITY,
        }),
      ]
    );
  });

  // Paint order (last = on top in GoFish's layer z-order): outer outline at
  // the back, then each neighbourhood outline (in declared order, so later
  // topology entries sit visually on top of earlier ones — matching
  // Bluefish's `<For>` source order), then the points and labels on top of
  // everything so they're never occluded by a filled neighbourhood.
  return layer([outer, ...neighbourhoods, ...points, ...labels]);
};

// Grid pitches: panel = outer ellipse (176 x 116) + a 40px gutter. The grid
// is placed EXPLICITLY (position() at fixed pitches) rather than with
// nested `spread`s: spread spaces panels by their layout extents, and the
// panels' extents vary spuriously (a label or the a/c polygon inflates a
// panel's proposed size asymmetrically — see friction log item 7), which
// produced visibly uneven gutters. The panels' ellipses are all the same
// size, so a fixed-pitch grid is both correct and deterministic.
const COL_PITCH = 176 + 40;
const ROW_PITCH = 116 + 40;

// `cols` is column-major: cols[c][r] is the panel at column c, row r —
// matching the original Bluefish source's StackH-of-StackV structure.
const panelGrid = (cols: ReturnType<typeof ThreePointTopology>[][]) =>
  layer(
    cols.flatMap((colPanels, c) =>
      colPanels.map((panel, r) =>
        position({ x: c * COL_PITCH, y: r * ROW_PITCH }, [panel])
      )
    )
  );

export const Topology: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Three-Point Set Topologies",
      description:
        "Nine point-set topologies on the same three labeled points, each drawn as nested ellipse neighbourhood outlines around the points they contain.",
    },
  },
  render: () => {
    const container = initializeContainer();

    // The root `Layer`'s own x/y/w/h options (the technique Pulley uses to
    // shift a bounding box) turned out to have NO effect at the root: the
    // final canvas normalizes the root's content bbox back to (0, 0)
    // regardless of the root node's own translate, so root-level margin has
    // to come from the render() call's own {w, h} (below) — a wider/taller
    // canvas than the tightly-fit content, which leaves the extra room as a
    // margin on the bottom/right since content stays anchored at its
    // auto-fit top-left. See friction log.
    Layer(
      {},
      [
        panelGrid([
          [
            ThreePointTopology([], { showLabels: true }),
            ThreePointTopology([["b"]]),
            ThreePointTopology([["a", "b"]]),
          ],
          [
            ThreePointTopology([["a", "b"], ["a"]], { showLabels: true }),
            ThreePointTopology([["a", "b"], ["c"]]),
            ThreePointTopology([["a", "b"], ["a"], ["b"]]),
          ],
          [
            ThreePointTopology([["a", "b"], ["b", "c"], ["b"]], {
              showLabels: true,
            }),
            ThreePointTopology([["a", "b"], ["b", "c"], ["b"], ["c"]]),
            ThreePointTopology([
              ["a", "b"],
              ["b", "c"],
              ["b"],
              ["a", "c"],
            ]),
          ],
        ]),
      ]
    ).render(container, { w: 700, h: 460 });

    return container;
  },
};

export const TopologyOverdraw: StoryObj<Args> = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Three-Point Set Topologies (Outline Only)",
      description:
        "The same nine point-set topologies redrawn with unfilled, overlapping outlines instead of translucent fills, so every nested neighbourhood boundary stays legible.",
    },
  },
  render: () => {
    const container = initializeContainer();

    Layer(
      {},
      [
        panelGrid([
          [
            ThreePointTopology([], { showLabels: true, overdraw: true }),
            ThreePointTopology([["b"]], { overdraw: true }),
            ThreePointTopology([["a", "b"]], { overdraw: true }),
          ],
          [
            ThreePointTopology([["a", "b"], ["a"]], {
              showLabels: true,
              overdraw: true,
            }),
            ThreePointTopology([["a", "b"], ["c"]], { overdraw: true }),
            ThreePointTopology([["a", "b"], ["a"], ["b"]], {
              overdraw: true,
            }),
          ],
          [
            ThreePointTopology([["a", "b"], ["b", "c"], ["b"]], {
              showLabels: true,
              overdraw: true,
            }),
            ThreePointTopology([["a", "b"], ["b", "c"], ["b"], ["c"]], {
              overdraw: true,
            }),
            ThreePointTopology(
              [["a", "b"], ["a", "c"], ["b", "c"], ["b"]],
              { overdraw: true }
            ),
          ],
        ]),
      ]
    ).render(container, { w: 700, h: 460 });

    return container;
  },
};

// ── Friction log ─────────────────────────────────────────────────────────
//
// 1. `enclose({}, [ref(a), ref(b), ...])` over multiple named refs — the
//    thing this port was meant to stress-test — was broken when this port
//    was written: enclose unconditionally re-placed every child at local
//    (0, 0), collapsing refs onto the origin. FIXED in #713: enclose now
//    shares layer's place-only-if-unplaced
//    child semantics (`placeUnplacedChild` in _node.ts) and unions
//    children's actual placed boxes; the regression probe lives at
//    stories/lowlevel/EncloseRefs.stories.tsx. This port keeps its analytic
//    fallback anyway because of items 2 and 4: enclose's hull is a
//    hardcoded gray outline (no fill/stroke opts — no colored translucent
//    pills) and a bbox hull can't express the concave a/c neighbourhood.
//
// 2. Variable-length groups of refs: even setting the enclose bug aside,
//    there's no primitive for "outline exactly this list of named
//    children," full stop — everything is a fixed two-child API (`connect`
//    between exactly two refs) or an operator meant for *arranging* children
//    it's laying out for the first time (`spread`/`stack`), not for wrapping
//    ones already placed elsewhere. A group-of-N-refs "bounding decoration"
//    (rect/ellipse/pill sized and positioned to the union of N named
//    children's resolved bboxes) is exactly the missing piece, and would
//    also directly solve the Bluefish concave a/c-neighbourhood case (item 4
//    below) if it exposed a shape callback instead of a fixed rect/ellipse.
//
// 3. `position({x, y}, [child])`'s coordinate convention (min-corner offset,
//    not center) meant every call site here had to manually subtract half
//    the shape's width/height to center something at a computed coordinate
//    (see the comment at the top of `ThreePointTopology`). A center-anchored
//    variant (or an `anchor` option, mirroring `connect`'s `AnchorSpec`)
//    would remove a whole class of off-by-half-size arithmetic bugs — this
//    port hit exactly that bug on the first pass (every neighbourhood
//    outline was offset by half its own width) and it was only caught by
//    rendering and comparing pixel coordinates by hand.
//
// 4. No concave-enclosure OPERATOR. `enclose`/`position` + rect/ellipse is
//    entirely convex-bbox-based, so there is still no way to ask GoFish to
//    *discover* a "wrap these points but carve out this other one" shape
//    from refs. GoFish does, however, have a lower-level `polygon` shape
//    (explicit local-coordinate point list), which is enough to *replicate*
//    Bluefish's hand-authored concave SVG path for the a/c neighbourhood by
//    sampling its cubic Bézier segments into a dense point list and
//    remapping them piecewise-linearly onto this story's own point layout
//    (anchored on the "a"/"c" point centers, with the dip widened to clear
//    the label-containing b-pill) — see `acNeighbourhoodPoints`. That's a
//    faithful reproduction of the *specific* hand-drawn artwork, not a
//    general concave-hull primitive; a real general fix still needs either
//    a path-based enclose variant or a documented non-goal. It also
//    surfaced a smaller gap: `ellipse`/`polygon` had no `opacity` style
//    prop (unlike `rect`) — since fixed in the library for both, and both
//    are used here (element opacity dimming fill and stroke together, which
//    matches how upstream Bluefish applied `opacity` to its whole
//    Rect/Path elements).
//
// 5. Auto-fit canvas margin. The root node's own `x`/`y`/`w`/`h` options
//    (the technique the Pulley story uses to shift a sub-tree's bounding
//    box) have no effect at the very root: the render entry point
//    renormalizes the final content bbox to (0, 0) regardless of the root
//    node's own translate, so a root-level margin can only come from
//    padding the render() canvas size beyond the tightly-fit content (as
//    done here: `.render(container, { w: 700, h: 460 })`, leaving the extra
//    room as bottom/right margin since content stays pinned to its
//    auto-fit top-left corner). This cost a full render/inspect cycle to
//    diagnose (multiplying `x`/`y` by 20x produced a byte-identical DOM,
//    which is what revealed it was inert rather than merely too small a
//    value) and there's no direct way to add symmetric margin around a
//    free-floating (non-data-scaled) composition today.
//
// 6. `stack()` silently ignores `spacing` (its type comment says so — "the
//    same as `spread` but never a gap") which is easy to reach for by
//    analogy with `spread` and get flush-touching panels with no error.
//    Switching to `spread({ anchor: "edge" })` fixed it (the grid has since
//    moved off spread entirely — see item 7), but a runtime warning (or
//    accepting the option as a no-op-with-warning) would have caught this
//    immediately instead of via a visual diff.
//
// 7. Spread spaces panels by phantom-inflated extents, so the grid is
//    placed explicitly. With identical outer ellipses in every panel,
//    `spread` should produce a uniform 3x3 grid — but panels containing a
//    label or the a/c polygon report a layout extent asymmetrically larger
//    than their visible content (measured: a labeled panel's box bottom sat
//    at outer-max + label-max, a polygon panel's at outer-max +
//    polygon-max — a SUM, not a union), producing visibly uneven gutters in
//    both `anchor: "edge"` (uneven gaps) and `anchor: "middle"` (shifted
//    middles, since the phantom shifts the bbox middle). Adding invisible
//    y-mirrored counterweight children did NOT re-center the boxes, which
//    rules out a simple bbox-union story and points at the size-proposal
//    pass double-counting positive `position` offsets / free minima (the
//    #39 bbox-sync family). The story-local fix: place the nine panels at
//    fixed pitches with `position()` (`panelGrid`), which no layout pass
//    can perturb. The same inflation is why the rendered canvas is larger
//    than the ink (item 5's margins).

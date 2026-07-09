import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  layer,
  spread,
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
// Bézier segments into a dense point list and affinely remaps it into this
// story's own point-spacing/point-size coordinate system, anchored on the
// two points ("a" and "c") the shape must actually enclose. That keeps the
// shape faithful to the original hand-drawn artwork instead of
// re-approximating it with a bbox-based primitive.
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

// Anchor points in the original path's own coordinate space: the centers of
// the "a" and "c" lobes, derived from the symmetry of the path data (the
// path is mirror-symmetric about x = 53) and cross-checked against the
// upstream Path component's hand-tuned x:-7, y:-10 placement offset, which
// lands the lobes on the actual "a"/"c" point centers.
const AC_PATH_ANCHOR_A: [number, number] = [14, 17];
const AC_PATH_ANCHOR_C: [number, number] = [94, 17];
// Original point spacing (StackH spacing=30 + point diameter 10 = 40
// center-to-center), so a-to-c center distance is 80 in path-space.
const AC_ORIGINAL_A_TO_C = 80;

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

// Sample the hand-drawn a/c path into a dense point list, then remap from
// the path's own coordinate space into this story's point layout: uniformly
// scaled so the "a"-"c" anchor distance matches this story's actual
// SPACING, and translated so the anchors land on the real "a"/"c" point
// centers.
const acNeighbourhoodPoints = (): [number, number][] => {
  const scale = (2 * SPACING) / AC_ORIGINAL_A_TO_C;
  const aCenter: [number, number] = [-SPACING, 0];
  const remap = ([px, py]: [number, number]): [number, number] => [
    aCenter[0] + (px - AC_PATH_ANCHOR_A[0]) * scale,
    aCenter[1] + (py - AC_PATH_ANCHOR_A[1]) * scale,
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

// Analytic bbox for a neighbourhood: since the three points sit at known,
// fixed x-offsets (index * SPACING) with a shared y, the ellipse outline
// spanning a subset of them can be computed directly instead of asking
// `enclose` to discover it from refs (see finding above).
const neighbourhoodBox = (n: Neighbourhood, padding: number) => {
  const indices = n.map((p) => POINT_NAMES.indexOf(p));
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  const spanW = (maxIdx - minIdx) * SPACING + POINT_SIZE;
  return {
    // centerX of the span, relative to the middle point (b, index 1) which
    // spread({alignment:"middle"}) centers at x = 0.
    centerX: (minIdx + maxIdx - 2) * (SPACING / 2),
    w: spanW + padding * 2,
    h: POINT_SIZE + padding * 2,
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
          { x: x - 4, y: 14 },
          [text({ text: p, fontStyle: "italic" })]
        );
      })
    : [];

  // Whole-stack outline (always present, plain black, never filled) — the
  // Bluefish `<EllipseBackground padding={36} overdraw={props.overdraw}>`
  // wrapping the full <StackH>. `overdraw` is accepted-but-unused there too
  // (the component only reads `fill`/`opacity`, both left at their plain
  // defaults), so it renders identically in both modes.
  const outerBox = neighbourhoodBox(["a", "b", "c"], 36);
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
        stroke: "#999",
        strokeWidth: 3,
        opacity: overdraw ? 1 : TOPOLOGY_OPACITY,
      });
    }

    const padding = n.length * 17 - 12;
    const box = neighbourhoodBox(n, padding);
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

const col = (panels: ReturnType<typeof ThreePointTopology>[]) =>
  spread({ dir: "y", spacing: 40, mode: "edge", alignment: "middle" }, panels);

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
        spread({ dir: "x", spacing: 40, mode: "edge", alignment: "middle" }, [
          col([
            ThreePointTopology([], { showLabels: true }),
            ThreePointTopology([["b"]]),
            ThreePointTopology([["a", "b"]]),
          ]),
          col([
            ThreePointTopology([["a", "b"], ["a"]], { showLabels: true }),
            ThreePointTopology([["a", "b"], ["c"]]),
            ThreePointTopology([["a", "b"], ["a"], ["b"]]),
          ]),
          col([
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
          ]),
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
        spread({ dir: "x", spacing: 40, mode: "edge", alignment: "middle" }, [
          col([
            ThreePointTopology([], { showLabels: true, overdraw: true }),
            ThreePointTopology([["b"]], { overdraw: true }),
            ThreePointTopology([["a", "b"]], { overdraw: true }),
          ]),
          col([
            ThreePointTopology([["a", "b"], ["a"]], {
              showLabels: true,
              overdraw: true,
            }),
            ThreePointTopology([["a", "b"], ["c"]], { overdraw: true }),
            ThreePointTopology([["a", "b"], ["a"], ["b"]], {
              overdraw: true,
            }),
          ]),
          col([
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
          ]),
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
//    affinely remapping them onto this story's own point layout (anchored
//    on the "a"/"c" point centers) — see `acNeighbourhoodPoints`. That's a
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
//    Switching to `spread({ mode: "edge" })` fixed it, but a runtime warning
//    (or accepting the option as a no-op-with-warning) would have caught
//    this immediately instead of via a visual diff.

import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  layer,
  spread,
  ellipse,
  rect,
  text,
  position,
  Layer,
} from "../../src/lib";

// Ported from Bluefish's example-gallery topology.tsx (issue #440): three
// labeled points (a, b, c) with nested rounded-rect "neighbourhood" outlines
// showing different point-set topologies on the same three points.
//
// NOTE on enclose+refs: this port originally probed
// `enclose({}, [ref("a"), ref("b")])` and found it broken — enclose
// unconditionally re-placed every child at local (0, 0), collapsing refs
// onto the origin. That bug is fixed in #713 (enclose shares layer's
// place-only-if-unplaced child semantics via `placeUnplacedChild`); the
// canonical regression probe lives at
// stories/lowlevel/EncloseRefs.stories.tsx. The neighbourhood outlines
// below still use analytic geometry (rect via `position`) rather than
// enclose-over-refs, for two remaining reasons recorded in the friction
// log: enclose's hull is a hardcoded gray outline (no fill/stroke opts, so
// no colored translucent pills), and the a/c neighbourhood needs a concave
// shape a bbox hull can't express.

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

// Analytic bbox for a neighbourhood: since the three points sit at known,
// fixed x-offsets (index * SPACING) with a shared y, the rounded-rect
// outline spanning a subset of them can be computed directly instead of
// asking `enclose` to discover it from refs (see finding above).
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
          { x: x - 4, y: -34 },
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
      rect({
        w: outerBox.w,
        h: outerBox.h,
        rx: outerBox.h / 2,
        ry: outerBox.h / 2,
        fill: "none",
        stroke: "black",
        strokeWidth: 3,
      }),
    ]
  );

  const neighbourhoods = topology.map((n, i) => {
    const acSpecial = isAandCNeighbourhood(n);
    // Bluefish draws the a-c neighbourhood as a hand-authored concave SVG
    // path that dips around "b" (which sits between a and c but is NOT a
    // member). GoFish has no concave-enclosure primitive today, so this is
    // approximated with the same convex rounded-rect as every other
    // neighbourhood — it necessarily (and topologically incorrectly)
    // covers "b" too. See friction log.
    const padding = n.length * 17 - 12;
    const box = neighbourhoodBox(n, padding);
    return position(
      { x: box.centerX - box.w / 2, y: -box.h / 2 },
      [
        rect({
          w: box.w,
          h: box.h,
          rx: box.h / 2,
          ry: box.h / 2,
          fill: overdraw
            ? "none"
            : TOPOLOGY_COLORS[i % TOPOLOGY_COLORS.length],
          stroke: acSpecial ? "#999" : "black",
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
        "Nine point-set topologies on the same three labeled points, each drawn as nested rounded-rect neighbourhood outlines around the points they contain.",
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
// 4. No concave-enclosure primitive. Bluefish's a/c-neighbourhood panel
//    (a and c share a neighbourhood, b does not, and b sits between them)
//    is drawn there as a hand-authored concave SVG path that dips around b.
//    GoFish's `enclose`/`position` + rect/ellipse vocabulary is entirely
//    convex-bbox-based, so there is no way to express "wrap these points but
//    carve out this other one." This port approximates it with the same
//    convex pill as every other neighbourhood (necessarily also covering b,
//    which is topologically wrong) and marks it with a grey instead of black
//    stroke so the discrepancy is at least visible. A real fix needs either
//    a path-based enclose variant or a documented non-goal.
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

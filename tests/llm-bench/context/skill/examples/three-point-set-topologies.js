// Three-Point Set Topologies
// Nine point-set topologies on the same three labeled points, each drawn as nested ellipse neighbourhood outlines around the points they contain.

import { ellipse, layer, polygon, position, text } from "gofish-graphics";
const POINT_NAMES = ["a", "b", "c"];
const SPACING = 50;
const POINT_SIZE = 8;
const TOPOLOGY_COLORS = [
  "#ff2400", // red
  "#009dff", // blue
  "#d4c400", // yellow (darkened for contrast on white)
  "orange",
  "green",
  "purple",
];
const TOPOLOGY_OPACITY = 0.5;
const isAandCNeighbourhood = (n) =>
  n.length === 2 && n.includes("a") && n.includes("c");
const AC_PATH_SEGMENTS = [
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
const AC_X_WARP = [
  [2, -66], // outer edge of the "a" lobe
  [14, -50], // "a" lobe anchor -> dot a
  [41.5, -16], // left dip wall (hugs the r=9 b-circle, like upstream)
  [64.5, 16], // right dip wall
  [94, 50], // "c" lobe anchor -> dot c
  [104, 66], // outer edge of the "c" lobe
];
const AC_Y_WARP = [
  [17, 0], // lobe anchor height -> dot centerline
  [42.07, 43.5], // band top: below the two-point pills' deepest edge
  [48, 49.5], // band bottom: inside the outer ellipse
];
const warp1d = (knots, v) => {
  let i = 0;
  while (i < knots.length - 2 && v > knots[i + 1][0]) i++;
  const [x0, y0] = knots[i];
  const [x1, y1] = knots[i + 1];
  return y0 + ((v - x0) * (y1 - y0)) / (x1 - x0);
};
const cubicBezierPoint = (p0, p1, p2, p3, t) => {
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
const acNeighbourhoodPoints = () => {
  const remap = ([px, py]) => [warp1d(AC_X_WARP, px), warp1d(AC_Y_WARP, py)];
  const pts = [];
  for (const [p0, c1, c2, p1] of AC_PATH_SEGMENTS) {
    for (let i = 0; i < SAMPLES_PER_SEGMENT; i++) {
      const t = i / SAMPLES_PER_SEGMENT;
      pts.push(remap(cubicBezierPoint(p0, c1, c2, p1, t)));
    }
  }
  return pts;
};
const NEIGHBOURHOOD_PAD = {
  1: { x: 5, y: 5 }, // circle: 18 x 18 (r 9) — snug, label outside
  2: { x: 21, y: 34 }, // pill: 100 x 76 (rx 50, ry 38)
};
const OUTER_PAD = { x: 34, y: 54 };
const neighbourhoodBox = (n, pad) => {
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
const ThreePointTopology = (topology, opts = {}) => {
  const { showLabels = false, overdraw = false } = opts;
  // `position({x, y}, [child])` sets the CHILD's own (min-x, min-y) corner —
  // rect/ellipse are min-anchored at their own local (0, 0), not centered —
  // so every placement below subtracts half the shape's extent to land its
  // *center* at the intended coordinate. (Friction: this offset-by-half-size
  // bookkeeping is exactly what `enclose`/an align-to-center primitive would
  // normally absorb; see friction log.)
  const points = POINT_NAMES.map((p, i) => {
    const x = (i - 1) * SPACING;
    return position({ x: x - POINT_SIZE / 2, y: -POINT_SIZE / 2 }, [
      ellipse({ w: POINT_SIZE, h: POINT_SIZE, fill: "black" }).name(p),
    ]);
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
          [text({ text: p, fontStyle: "italic" })],
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
    ],
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
    return position({ x: box.centerX - box.w / 2, y: -box.h / 2 }, [
      ellipse({
        w: box.w,
        h: box.h,
        fill: overdraw ? "none" : rawColor,
        stroke: "black",
        strokeWidth: 3,
        opacity: overdraw ? 1 : TOPOLOGY_OPACITY,
      }),
    ]);
  });
  // Paint order (last = on top in GoFish's layer z-order): outer outline at
  // the back, then each neighbourhood outline (in declared order, so later
  // topology entries sit visually on top of earlier ones — matching
  // Bluefish's `<For>` source order), then the points and labels on top of
  // everything so they're never occluded by a filled neighbourhood.
  return layer([outer, ...neighbourhoods, ...points, ...labels]);
};
const COL_PITCH = 176 + 40;
const ROW_PITCH = 116 + 40;
const panelGrid = (cols) =>
  layer(
    cols.flatMap((colPanels, c) =>
      colPanels.map((panel, r) =>
        position({ x: c * COL_PITCH, y: r * ROW_PITCH }, [panel]),
      ),
    ),
  );
const container = document.getElementById("app");
// The root `Layer`'s own x/y/w/h options (the technique Pulley uses to
// shift a bounding box) turned out to have NO effect at the root: the
// final canvas normalizes the root's content bbox back to (0, 0)
// regardless of the root node's own translate, so root-level margin has
// to come from the render() call's own {w, h} (below) — a wider/taller
// canvas than the tightly-fit content, which leaves the extra room as a
// margin on the bottom/right since content stays anchored at its
// auto-fit top-left. See friction log.
layer({}, [
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
      ThreePointTopology([["a", "b"], ["b", "c"], ["b"], ["a", "c"]]),
    ],
  ]),
]).render(container, { w: 700, h: 460 });

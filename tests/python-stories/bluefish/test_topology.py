"""Equivalent of bluefish/Topology.stories.tsx — Bluefish/Topology.

Pure analytic geometry, no constraints/refs: `layer([...])` overlays,
`position([child], x=, y=)` min-corner placement (every call site subtracts
half the shape's extent to center it, mirroring the JS), `ellipse`/`text` for
points and neighbourhood outlines, and one `polygon` (sampled from
hand-transcribed cubic Bezier segments and remapped through piecewise-linear
warps) for the concave a/c neighbourhood.
"""

from typing import List, Tuple

from gofish import ellipse, layer, polygon, position, text

POINT_NAMES = ["a", "b", "c"]

SPACING = 50  # center-to-center distance between adjacent points
POINT_SIZE = 8  # point marker diameter

TOPOLOGY_COLORS = [
    "#ff2400",  # red
    "#009dff",  # blue
    "#d4c400",  # yellow (darkened for contrast on white)
    "orange",
    "green",
    "purple",
]
TOPOLOGY_OPACITY = 0.5


def _is_a_and_c_neighbourhood(n: List[str]) -> bool:
    return len(n) == 2 and "a" in n and "c" in n


# The a/c neighbourhood in Bluefish's original is a hand-drawn concave SVG
# path, transcribed directly from the original path's "d" attribute
# (M68.5011 48 H53.0011 H37.501 C32.001 48 ... Z). Each entry: [P0, C1, C2,
# P1] control points of one cubic Bezier segment.
AC_PATH_SEGMENTS: List[List[Tuple[float, float]]] = [
    [(68.5011, 48), (68.5011, 48), (53.0011, 48), (53.0011, 48)],
    [(53.0011, 48), (53.0011, 48), (37.501, 48), (37.501, 48)],
    [(37.501, 48), (32.001, 48), (29.039, 47.7419), (24.001, 46.02)],
    [(24.001, 46.02), (14.431, 42.76), (8.50201, 33.96), (7.00201, 31)],
    [(7.00201, 31), (5.50201, 28.039), (2.00201, 19.42), (2.00201, 13.5)],
    [(2.00201, 13.5), (2.00201, 7.58), (5.15102, 2), (11.502, 2)],
    [(11.502, 2), (17.862, 2), (22.002, 4.11), (23.002, 13.5)],
    [(23.002, 13.5), (24.002, 22.887), (34.001, 42.07), (41.501, 42.07)],
    [(41.501, 42.07), (41.501, 42.07), (53.0011, 42.07), (53.0011, 42.07)],
    [(53.0011, 42.07), (53.0011, 42.07), (64.5011, 42.07), (64.5011, 42.07)],
    [(64.5011, 42.07), (72.0011, 42.07), (82.0001, 22.887), (83.0001, 13.5)],
    [(83.0001, 13.5), (84.0001, 4.11), (88.1401, 2), (94.5001, 2)],
    [(94.5001, 2), (100.851, 2), (104, 7.58), (104, 13.5)],
    [(104, 13.5), (104, 19.42), (100.5, 28.039), (99.0001, 31)],
    [(99.0001, 31), (97.5001, 33.96), (91.5711, 42.76), (82.0011, 46.02)],
    [(82.0011, 46.02), (76.9631, 47.7419), (74.0011, 48), (68.5011, 48)],
]

# Piecewise-linear x/y warps remapping the path's own coordinate space into
# this story's point layout. See the JS file's comment block for the
# path-space landmarks these knots were hand-tuned against.
AC_X_WARP: List[Tuple[float, float]] = [
    (2, -66),  # outer edge of the "a" lobe
    (14, -50),  # "a" lobe anchor -> dot a
    (41.5, -16),  # left dip wall (hugs the r=9 b-circle, like upstream)
    (64.5, 16),  # right dip wall
    (94, 50),  # "c" lobe anchor -> dot c
    (104, 66),  # outer edge of the "c" lobe
]
AC_Y_WARP: List[Tuple[float, float]] = [
    (17, 0),  # lobe anchor height -> dot centerline
    (42.07, 43.5),  # band top: below the two-point pills' deepest edge
    (48, 49.5),  # band bottom: inside the outer ellipse
]


def warp1d(knots: List[Tuple[float, float]], v: float) -> float:
    """Piecewise-linear interpolation through sorted (input, output) knots,
    extrapolating with the end segments' slopes."""
    i = 0
    while i < len(knots) - 2 and v > knots[i + 1][0]:
        i += 1
    x0, y0 = knots[i]
    x1, y1 = knots[i + 1]
    return y0 + ((v - x0) * (y1 - y0)) / (x1 - x0)


def cubic_bezier_point(
    p0: Tuple[float, float],
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    t: float,
) -> Tuple[float, float]:
    mt = 1 - t
    a = mt * mt * mt
    b = 3 * mt * mt * t
    c = 3 * mt * t * t
    d = t * t * t
    return (
        a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    )


SAMPLES_PER_SEGMENT = 12


def ac_neighbourhood_points() -> List[List[float]]:
    """Sample the hand-drawn a/c path into a dense point list, warped so its
    lobes land on this story's "a"/"c" dots and its dip clears this story's
    (larger) pills."""

    def remap(p: Tuple[float, float]) -> List[float]:
        px, py = p
        return [warp1d(AC_X_WARP, px), warp1d(AC_Y_WARP, py)]

    pts: List[List[float]] = []
    for p0, c1, c2, p1 in AC_PATH_SEGMENTS:
        for i in range(SAMPLES_PER_SEGMENT):
            t = i / SAMPLES_PER_SEGMENT
            pts.append(remap(cubic_bezier_point(p0, c1, c2, p1, t)))
    return pts


# Per-axis ellipse padding, keyed by neighbourhood size.
NEIGHBOURHOOD_PAD = {
    1: {"x": 5, "y": 5},  # circle: 18 x 18 (r 9) — snug, label outside
    2: {"x": 21, "y": 34},  # pill: 100 x 76 (rx 50, ry 38)
}
OUTER_PAD = {"x": 34, "y": 54}  # outer: 176 x 116 (rx 88, ry 58)


def neighbourhood_box(n: List[str], pad: dict) -> dict:
    """Analytic bbox for a neighbourhood: the three points sit at known,
    fixed x-offsets (index * SPACING) with a shared y, so the ellipse
    outline spanning a subset of them can be computed directly."""
    indices = [POINT_NAMES.index(p) for p in n]
    min_idx = min(indices)
    max_idx = max(indices)
    span_w = (max_idx - min_idx) * SPACING + POINT_SIZE
    return {
        "centerX": (min_idx + max_idx - 2) * (SPACING / 2),
        "w": span_w + pad["x"] * 2,
        "h": POINT_SIZE + pad["y"] * 2,
    }


def three_point_topology(
    topology: List[List[str]], show_labels: bool = False, overdraw: bool = False
):
    """One panel: a set of point-set-topology neighbourhood outlines over
    the same three labeled points a/b/c."""
    # `position([child], x=, y=)` sets the child's own (min-x, min-y) corner
    # — rect/ellipse are min-anchored at their own local (0, 0), not
    # centered — so every placement below subtracts half the shape's extent
    # to land its *center* at the intended coordinate.
    points = []
    for i, p in enumerate(POINT_NAMES):
        x = (i - 1) * SPACING
        points.append(
            position(
                [ellipse(w=POINT_SIZE, h=POINT_SIZE, fill="black").name(p)],
                x=x - POINT_SIZE / 2,
                y=-POINT_SIZE / 2,
            )
        )

    labels = []
    if show_labels:
        for i, p in enumerate(POINT_NAMES):
            x = (i - 1) * SPACING
            labels.append(
                position(
                    [text(text=p, fontStyle="italic")],
                    x=x - 4,
                    y=10,
                )
            )

    # Whole-stack outline (always present, plain black, never filled).
    outer_box = neighbourhood_box(["a", "b", "c"], OUTER_PAD)
    outer = position(
        [
            ellipse(
                w=outer_box["w"],
                h=outer_box["h"],
                fill="none",
                stroke="black",
                strokeWidth=3,
            )
        ],
        x=outer_box["centerX"] - outer_box["w"] / 2,
        y=-outer_box["h"] / 2,
    )

    neighbourhoods = []
    for i, n in enumerate(topology):
        ac_special = _is_a_and_c_neighbourhood(n)
        raw_color = TOPOLOGY_COLORS[i % len(TOPOLOGY_COLORS)]

        if ac_special:
            neighbourhoods.append(
                polygon(
                    points=ac_neighbourhood_points(),
                    fill="none" if overdraw else raw_color,
                    stroke="black",
                    strokeWidth=3,
                    opacity=1 if overdraw else TOPOLOGY_OPACITY,
                )
            )
            continue

        box = neighbourhood_box(n, NEIGHBOURHOOD_PAD[len(n)])
        neighbourhoods.append(
            position(
                [
                    ellipse(
                        w=box["w"],
                        h=box["h"],
                        fill="none" if overdraw else raw_color,
                        stroke="black",
                        strokeWidth=3,
                        opacity=1 if overdraw else TOPOLOGY_OPACITY,
                    )
                ],
                x=box["centerX"] - box["w"] / 2,
                y=-box["h"] / 2,
            )
        )

    # Paint order (last = on top): outer outline at the back, then each
    # neighbourhood outline in declared order, then the points and labels on
    # top of everything.
    return layer([outer, *neighbourhoods, *points, *labels])


# Grid pitches: panel = outer ellipse (176 x 116) + a 40px gutter.
COL_PITCH = 176 + 40
ROW_PITCH = 116 + 40


def panel_grid(cols: List[List[object]]):
    """`cols` is column-major: cols[c][r] is the panel at column c, row r."""
    panels = []
    for c, col_panels in enumerate(cols):
        for r, panel in enumerate(col_panels):
            panels.append(position([panel], x=c * COL_PITCH, y=r * ROW_PITCH))
    return layer(panels)


def story_topology():
    return (
        layer(
            [
                panel_grid(
                    [
                        [
                            three_point_topology([], show_labels=True),
                            three_point_topology([["b"]]),
                            three_point_topology([["a", "b"]]),
                        ],
                        [
                            three_point_topology(
                                [["a", "b"], ["a"]], show_labels=True
                            ),
                            three_point_topology([["a", "b"], ["c"]]),
                            three_point_topology([["a", "b"], ["a"], ["b"]]),
                        ],
                        [
                            three_point_topology(
                                [["a", "b"], ["b", "c"], ["b"]],
                                show_labels=True,
                            ),
                            three_point_topology(
                                [["a", "b"], ["b", "c"], ["b"], ["c"]]
                            ),
                            three_point_topology(
                                [
                                    ["a", "b"],
                                    ["b", "c"],
                                    ["b"],
                                    ["a", "c"],
                                ]
                            ),
                        ],
                    ]
                ),
            ]
        ),
        {"w": 700, "h": 460},
    )


def story_topology_overdraw():
    return (
        layer(
            [
                panel_grid(
                    [
                        [
                            three_point_topology(
                                [], show_labels=True, overdraw=True
                            ),
                            three_point_topology([["b"]], overdraw=True),
                            three_point_topology([["a", "b"]], overdraw=True),
                        ],
                        [
                            three_point_topology(
                                [["a", "b"], ["a"]],
                                show_labels=True,
                                overdraw=True,
                            ),
                            three_point_topology(
                                [["a", "b"], ["c"]], overdraw=True
                            ),
                            three_point_topology(
                                [["a", "b"], ["a"], ["b"]], overdraw=True
                            ),
                        ],
                        [
                            three_point_topology(
                                [["a", "b"], ["b", "c"], ["b"]],
                                show_labels=True,
                                overdraw=True,
                            ),
                            three_point_topology(
                                [["a", "b"], ["b", "c"], ["b"], ["c"]],
                                overdraw=True,
                            ),
                            three_point_topology(
                                [
                                    ["a", "b"],
                                    ["a", "c"],
                                    ["b", "c"],
                                    ["b"],
                                ],
                                overdraw=True,
                            ),
                        ],
                    ]
                ),
            ]
        ),
        {"w": 700, "h": 460},
    )

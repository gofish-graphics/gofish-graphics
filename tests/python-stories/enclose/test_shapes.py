"""Equivalent of EncloseShapes.stories.tsx — Enclose/Shapes.

`enclose` in every form: the combinator over fresh children, over
`.relate()` operands and over explicit `ref(...)` children; the chart mark
form with one outline per group; avoiding with holes off and on; and graph
edges as members. PenguinsFourShapes (a DOM grid of four charts) and
ChartAccentSubSaharanAfrica (a JS lambda filter over refs) are exempt, see
tests/.python-sync-exempt.
"""

import math

from gofish import (
    Shape,
    chart,
    circle,
    enclose,
    group,
    layer,
    line,
    position,
    ref,
    scatter,
    select_all,
    spread,
)
from python_stories.data import PENGUINS

# ── 1. Combinator form, fresh children ───────────────────────────────────────

PLANETS = [
    {"name": "mercury", "r": 15, "fill": "#F5E3C8", "stroke": "#EFC9A2"},
    {"name": "venus", "r": 36, "fill": "#D2913C", "stroke": "#A96F26"},
    {"name": "earth", "r": 38, "fill": "#3E8CCC", "stroke": "#2F6FA6"},
    {"name": "mars", "r": 21, "fill": "#F4BC80", "stroke": "#E0954C"},
]


def story_planets_box():
    return (
        enclose(
            [
                spread(
                    [
                        circle(r=d["r"], fill=d["fill"], stroke=d["stroke"], stroke_width=3)
                        for d in PLANETS
                    ],
                    dir="x",
                    spacing=50,
                    alignment="middle",
                )
            ],
            padding=20,
            fill="#252150",
            stroke="none",
            shape=Shape.box(rx=16, ry=16),
        ),
        {"w": 410, "h": 116},
    )


# ── 2. Combinator form over `.relate()` operands ────────────────────────────


def story_munkres_figure():
    outline = {"fill": "none", "stroke": "#111", "stroke_width": 1.5}
    return (
        layer([
            spread(
                [
                    circle(r=5, fill="#111").name("a"),
                    circle(r=5, fill="#111").name("b"),
                    circle(r=5, fill="#111").name("c"),
                ],
                dir="x",
                spacing=95,
                alignment="middle",
            )
        ]).relate(lambda a, b, c: [
            enclose([a, b, c], shape=Shape.ellipse(), padding=30, **outline),
            enclose([a, b], shape=Shape.ellipse(), padding=16, **outline),
            enclose([b, c], shape=Shape.ellipse(), padding=16, **outline),
            enclose(
                [a, c],
                shape=Shape.spine(avoiding=[b], clearance=6),
                padding=12,
                **outline,
            ),
        ]),
        {"w": 400, "h": 150},
    )


# ── 3. Combinator form over explicit `ref(...)` children ────────────────────


def story_ref_hull():
    return (
        layer([
            position([circle(r=12, fill="#4c78a8").name("p")], x=20, y=70),
            position([circle(r=8, fill="#4c78a8").name("q")], x=130, y=10),
            position([circle(r=16, fill="#4c78a8").name("s")], x=200, y=90),
        ]).relate(lambda: [
            enclose(
                [ref("p"), ref("q"), ref("s")],
                shape=Shape.hull(),
                padding=10,
                fill="#4c78a8",
                fill_opacity=0.15,
                stroke="#1f3b63",
                stroke_width=1.5,
            )
        ]),
        {"w": 260, "h": 150},
    )


# ── 4. Chart mark form: one outline per group ───────────────────────────────

BEAKS = [
    d
    for d in PENGUINS
    if d["Beak Length (mm)"] is not None and d["Beak Depth (mm)"] is not None
]


def _penguin_shapes(shape):
    return (
        chart(BEAKS, axes=True)
        .flow(scatter(x="Beak Length (mm)", y="Beak Depth (mm)"))
        .mark(circle(r=2.5, fill="Species").name("points"))
        .layer(
            chart(select_all("points"))
            .flow(group(by="Species"))
            .mark(
                enclose(
                    shape=shape,
                    padding=6,
                    fill="Species",
                    stroke="Species",
                    fill_opacity=0.2,
                )
            )
        )
    )


def story_penguin_boxes():
    return (_penguin_shapes(Shape.box()), {"w": 420, "h": 320})


def story_penguin_hulls():
    return (_penguin_shapes(Shape.hull()), {"w": 420, "h": 320})


def story_penguin_blobs():
    return (_penguin_shapes(Shape.blob()), {"w": 420, "h": 320})


def story_penguin_spines():
    return (_penguin_shapes(Shape.spine()), {"w": 420, "h": 320})


def story_penguin_ellipses():
    return (_penguin_shapes(Shape.ellipse()), {"w": 420, "h": 320})


# ── 6. avoiding and holes ───────────────────────────────────────────────────


def _u_points():
    path = [(35, 22), (35, 150), (190, 150), (190, 22)]
    out = []
    for s in range(3):
        a, b = path[s], path[s + 1]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        nx, ny = -(b[1] - a[1]) / length, (b[0] - a[0]) / length
        k = round(length / 26)
        for i in range(0 if s == 0 else 1, k + 1):
            t = i / k
            jit = ((i * 7 + s * 3) % 5) - 2
            for side in (-1, 1):
                out.append((
                    a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit,
                    a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit,
                ))
    return out


U = _u_points()
GRAY = [(112, 50), (112, 100)]


def _dot(p, fill, name):
    return position([circle(r=5, fill=fill).name(name)], x=p[0] - 5, y=p[1] - 5)


def _u_blob(holes):
    return layer(
        [_dot(p, "#3366aa", f"u{i}") for i, p in enumerate(U)]
        + [_dot(p, "#9aa0a6", f"g{i}") for i, p in enumerate(GRAY)]
    ).relate(lambda **names: [
        enclose(
            [names[f"u{i}"] for i in range(len(U))],
            shape=Shape.blob(
                convexity=0.75,
                holes=holes,
                avoiding=[names[f"g{i}"] for i in range(len(GRAY))],
            ),
            padding=8,
            fill="#3366aa",
            stroke="#3366aa",
            fill_opacity=0.25,
        )
    ])


def story_holes_filled():
    return (_u_blob(False), {"w": 240, "h": 190})


def story_holes_kept():
    return (_u_blob(True), {"w": 240, "h": 190})


# ── 7. Hyperedges: graph edges as members ───────────────────────────────────

NODES = {
    "n1": (40, 50),
    "n2": (110, 30),
    "n3": (100, 110),
    "n4": (170, 90),
    "n5": (240, 50),
    "n6": (250, 130),
    "n7": (180, 170),
    "n8": (60, 180),
    "n9": (310, 190),
    "n10": (320, 80),
}
EDGES = [
    ("n1", "n2"),
    ("n1", "n3"),
    ("n2", "n4"),
    ("n3", "n4"),
    ("n4", "n5"),
    ("n4", "n6"),
    ("n6", "n7"),
    ("n3", "n8"),
    ("n7", "n9"),
    ("n5", "n10"),
    ("n6", "n9"),
    ("n8", "n7"),
]
SETS = [
    {"nodes": ["n1", "n2", "n3"], "color": "#e45756"},
    {"nodes": ["n4", "n5", "n6", "n10"], "color": "#4c78a8"},
    {"nodes": ["n3", "n8", "n7", "n9"], "color": "#54a24b"},
]


def _edge_name(e):
    return f"{e[0]}-{e[1]}"


def story_hyperedges():
    graph = layer([
        position(
            [circle(r=9, fill="white", stroke="#333", stroke_width=1.5).name(node)],
            x=x - 9,
            y=y - 9,
        )
        for node, (x, y) in NODES.items()
    ]).relate(lambda **n: [
        line([n[p], n[q]], stroke="#555", stroke_width=1.5).name(_edge_name((p, q)))
        for p, q in EDGES
    ])
    return (
        layer([graph]).relate(lambda **n: [
            enclose(
                [n[node] for node in s["nodes"]]
                + [
                    ref(_edge_name(e))
                    for e in EDGES
                    if e[0] in s["nodes"] and e[1] in s["nodes"]
                ],
                shape=Shape.spine(avoiding=[n[node] for node in NODES], clearance=3),
                padding=6,
                fill=s["color"],
                stroke=s["color"],
                fill_opacity=0.3,
            )
            for s in SETS
        ]),
        {"w": 360, "h": 230},
    )

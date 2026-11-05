"""Equivalent of EncloseShapes.stories.tsx — Enclose/Shapes.

`enclose` in every form: the combinator over fresh children, over
`.relate()` operands and over explicit `ref(...)` children; the chart mark
form with one outline per group; holes off and on; graph
edges as members; the radius of ``Shape.fillet``; the blob's convexity,
connection and separate; and the fillet's neck. PenguinsFourShapes (a DOM grid of four charts) and
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
    pack,
    ref,
    scatter,
    select_all,
    spread,
    text,
)
from python_stories.data import COUNTRY_POPULATIONS, PENGUINS

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
            shape=Shape.box(rx=16),
        ),
        {},
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
            enclose([a, b, c], shape=Shape.oval(), padding=30, **outline),
            enclose([a, b], shape=Shape.oval(), padding=16, **outline),
            enclose([b, c], shape=Shape.oval(), padding=16, **outline),
            enclose(
                [a, c],
                shape=Shape.spine(),
                avoiding=[b],
                clearance=6,
                padding=12,
                **outline,
            ),
        ]),
        {},
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
        {},
    )


# ── 4. Chart mark form: one outline per group ───────────────────────────────

BEAKS = [
    d
    for d in PENGUINS
    if d["Beak Length (mm)"] is not None and d["Beak Depth (mm)"] is not None
]


def _penguin_shapes(shape, data=BEAKS):
    return (
        chart(data, axes=True, w=420, h=320)
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
    return (_penguin_shapes(Shape.box()), {})


def story_penguin_hulls():
    return (_penguin_shapes(Shape.hull()), {})


def story_penguin_blobs():
    return (_penguin_shapes(Shape.blob()), {})


def story_penguin_spines():
    return (_penguin_shapes(Shape.spine()), {})


def story_penguin_ovals():
    return (_penguin_shapes(Shape.oval()), {})


ADELIE = [d for d in BEAKS if d["Species"] == "Adelie"]


def story_penguin_holes_filled():
    return (_penguin_shapes(Shape.blob(convexity=0, holes=False), ADELIE), {})


def story_penguin_holes_kept():
    return (_penguin_shapes(Shape.blob(convexity=0, holes=True), ADELIE), {})


# ── 6. holes ────────────────────────────────────────────────────────────────

# A ring of points two dots thick (16 inside, 20 outside) around an empty
# middle.
RING = [
    (195, 125), (192, 153), (177, 177), (152, 191), (125, 198), (98, 190),
    (74, 176), (57, 153), (54, 125), (58, 97), (76, 76), (97, 58),
    (125, 51), (152, 59), (177, 73), (190, 98),
    (216, 139), (209, 168), (193, 193), (167, 208), (140, 219), (111, 216),
    (82, 209), (57, 193), (42, 167), (31, 140), (34, 111), (41, 82),
    (57, 57), (83, 42), (110, 31), (139, 34), (168, 41), (193, 57),
    (208, 83), (219, 110),
]


def _dot(p, fill, name):
    return position([circle(r=5, fill=fill).name(name)], x=p[0] - 5, y=p[1] - 5)


def _ring_blob(holes):
    return layer([_dot(p, "#3366aa", f"p{i}") for i, p in enumerate(RING)]).relate(
        lambda **names: [
            enclose(
                [names[f"p{i}"] for i in range(len(RING))],
                shape=Shape.blob(convexity=0.75, holes=holes),
                padding=8,
                fill="#3366aa",
                stroke="#3366aa",
                fill_opacity=0.25,
            )
        ]
    )


def story_holes_filled():
    return (_ring_blob(False), {})


def story_holes_kept():
    return (_ring_blob(True), {})


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
                shape=Shape.spine(),
                avoiding=[n[node] for node in NODES],
                clearance=3,
                padding=6,
                fill=s["color"],
                stroke=s["color"],
                fill_opacity=0.3,
            )
            for s in SETS
        ]),
        {},
    )


# ── 8. Shape.fillet: the radius of the closing disc ────────────────────────────

AFRICA = [
    1.6 * math.sqrt(d["pop"]) for d in COUNTRY_POPULATIONS if d["continent"] == "Africa"
]


def _fillet_panel(radius):
    return spread(
        [
            text(text=f"Shape.fillet({{ radius: {radius} }})", font_size=12),
            enclose(
                [pack([circle(r=r, fill="#f2c14e") for r in AFRICA], spacing=6)],
                shape=Shape.fillet(radius=radius),
                padding=6,
                fill="#f2c14e",
                fill_opacity=0.25,
                stroke="#333",
                stroke_width=1.5,
            ),
        ],
        dir="y",
        spacing=8,
        alignment="middle",
    )


def story_fillet_radius_sweep():
    return (
        spread(
            [
                spread([_fillet_panel(r) for r in (0, 6, 12)], dir="x", spacing=24),
                spread([_fillet_panel(r) for r in (24, 48, 200)], dir="x", spacing=24),
            ],
            dir="y",
            spacing=24,
        ),
        {},
    )


# ── 9. Shape.blob: convexity, connection and separate ────────────────────────


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


# A band of points two dots thick around a U-shaped path.
U = _u_points()


def _blob_panel(title, shape, pts, key):
    return spread(
        [
            text(text=title, font_size=12),
            layer([_dot(p, "#3366aa", f"{key}{i}") for i, p in enumerate(pts)]).relate(
                lambda **names: [
                    enclose(
                        [names[f"{key}{i}"] for i in range(len(pts))],
                        shape=shape,
                        padding=8,
                        fill="#3366aa",
                        stroke="#3366aa",
                        fill_opacity=0.25,
                    )
                ]
            ),
        ],
        dir="y",
        spacing=36,
        alignment="middle",
    )


def story_blob_convexity_sweep():
    def panel(convexity, i):
        return _blob_panel(
            f"Shape.blob({{ convexity: {convexity} }})",
            Shape.blob(convexity=convexity),
            U,
            f"c{i}-",
        )

    return (
        spread(
            [
                spread([panel(c, i) for i, c in enumerate((0, 0.5, 1))], dir="x", spacing=72),
                spread([panel(c, i + 3) for i, c in enumerate((1.5, 2))], dir="x", spacing=72),
            ],
            dir="y",
            spacing=48,
        ),
        {},
    )


INNER = [(100, 70), (124, 70), (112, 91)]


def story_blob_connection():
    return (
        spread(
            [
                _blob_panel(
                    "Shape.blob({ convexity: 1 })",
                    Shape.blob(convexity=1),
                    U + INNER,
                    "k0-",
                ),
                _blob_panel(
                    "Shape.blob({ convexity: 1, connection: 0.5 })",
                    Shape.blob(convexity=1, connection=0.5),
                    U + INNER,
                    "k1-",
                ),
                _blob_panel(
                    "Shape.blob({ convexity: 1, connection: 0.5, separate: true })",
                    Shape.blob(convexity=1, connection=0.5, separate=True),
                    U + INNER,
                    "k2-",
                ),
            ],
            dir="x",
            spacing=24,
        ),
        {},
    )


# ── 10. Shape.fillet: the neck of the links between pieces ───────────────────

GROUPS = [
    [14, 10, 8, 6, 6],
    [12, 9, 7, 5],
    [16, 8, 8, 6],
]


def _neck_panel(neck, key):
    return spread(
        [
            text(text=f"Shape.fillet({{ radius: 16, neck: {neck} }})", font_size=12),
            layer([
                spread(
                    [
                        pack(
                            [
                                circle(r=r, fill="#f2c14e").name(f"{key}{g}-{j}")
                                for j, r in enumerate(radii)
                            ],
                            spacing=4,
                        )
                        for g, radii in enumerate(GROUPS)
                    ],
                    dir="x",
                    spacing=40,
                    alignment="middle",
                )
            ]).relate(
                lambda **names: [
                    enclose(
                        [
                            names[f"{key}{g}-{j}"]
                            for g, radii in enumerate(GROUPS)
                            for j in range(len(radii))
                        ],
                        shape=Shape.fillet(radius=16, neck=neck),
                        padding=6,
                        fill="#f2c14e",
                        fill_opacity=0.25,
                        stroke="#333",
                        stroke_width=1.5,
                    )
                ]
            ),
        ],
        dir="y",
        spacing=8,
        alignment="middle",
    )


def story_fillet_neck_sweep():
    return (
        spread(
            [_neck_panel(neck, f"n{i}-") for i, neck in enumerate((0, 0.25, 0.5, 1))],
            dir="x",
            spacing=24,
        ),
        {},
    )

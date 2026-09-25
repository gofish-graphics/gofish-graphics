"""Equivalent of lowlevel/NameScope.stories.tsx — Low Level Syntax/Name Scope.

String-name resolution checks: a `.constrain()` parameter can name a node
nested anywhere inside the layer (`mercury` inside enclose › spread), and a
constrained mark repeated per chart row reuses its local names in every row.
"""

from gofish import Constraint, arrow, chart, circle, enclose, layer, rect, ref, spread, text

PLANETS = [
    {"name": "mercury", "r": 8, "fill": "#b5b5b5", "stroke": "#8a8a8a"},
    {"name": "venus", "r": 14, "fill": "#e8c77a", "stroke": "#c9a24d"},
    {"name": "earth", "r": 15, "fill": "#4a90d9", "stroke": "#2d6fb3"},
    {"name": "mars", "r": 10, "fill": "#d9603b", "stroke": "#b04424"},
]


def story_nested_operand():
    return (
        layer([
            enclose(
                [
                    spread(
                        [
                            circle(
                                r=d["r"],
                                fill=d["fill"],
                                stroke=d["stroke"],
                                strokeWidth=3,
                            ).name(d["name"])
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
                rx=16,
                ry=16,
            ).name("planets"),
            text(text="Mercury", fill="#E94560", fontSize=14).name("label"),
            arrow([ref("label"), ref("mercury")], stroke="#E94560"),
        ]).constrain(lambda mercury, planets, label: [
            Constraint.align([mercury, label], x="middle"),
            Constraint.distribute([planets, label], dir="y", spacing=20),
        ]),
        {"w": 400, "h": 200},
    )


def story_per_row_names():
    return (
        chart(
            [
                {"k": "a", "v": 40},
                {"k": "b", "v": 90},
                {"k": "c", "v": 60},
            ],
            axes=False,
        )
        .flow(spread(by="k", dir="x", spacing=20, axes=False))
        .mark(
            layer([
                rect(w=40, h="v", fill="#9cc3e6").name("bar"),
                rect(w=16, h=4, fill="#1a5683").name("tick"),
            ]).constrain(lambda bar, tick: [
                Constraint.align([bar, tick], x="middle", y="end"),
            ])
        ),
        {"w": 200, "h": 120},
    )

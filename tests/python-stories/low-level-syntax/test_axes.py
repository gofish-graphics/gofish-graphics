"""Equivalent of lowlevel/Axes.stories.tsx — Low Level Syntax/Axes.

Hand-drawn axes built from `layer` + `spread` + `constrain` + `ref`, with
cross-tier links via `createName` tokens (the Pulley pattern). Two stories:

- OrdinalXAxis: 3 bars with species labels and a chart-axis title beneath.
  Three tiers (bars / labels / title), each one's `ref(token)` resolves
  across the layer boundary so each label centers on its bar.

- ContinuousYAxis: 3 bars with a vertical scale (axis line + tick marks +
  tick labels + axis title) to their left. All marks flat in one layer; the
  constraint block chains positions title → ticks → axis → bars in x and
  pins the tick column endpoints to the axis line in y.

Heights and fill are shared between both stories — same three bars in each.
"""

from gofish import (
    Constraint,
    createName,
    layer,
    rect,
    ref,
    spread,
    text,
)


# Shared bar definition — both stories use the same three bars.
HEIGHTS = [100, 280, 150]
BAR_FILL = "#457b9d"


def _bars(names):
    return [
        rect(w=40, h=HEIGHTS[0], fill=BAR_FILL).name(names[0]),
        rect(w=40, h=HEIGHTS[1], fill=BAR_FILL).name(names[1]),
        rect(w=40, h=HEIGHTS[2], fill=BAR_FILL).name(names[2]),
    ]


def story_ordinal_xaxis():
    a = createName("a")
    b = createName("b")
    c = createName("c")
    bars_tok = createName("bars")

    return (
        layer(
            [
                # tier 1: bars laid out as a horizontal spread, top-aligned
                spread(
                    _bars([a, b, c]),
                    dir="x",
                    alignment="start",
                ).name(bars_tok),
                # tier 2: each label paired with a ref to its bar in a
                # vertical spread (label above bar in declaration order →
                # below the bar after layout, horizontally centered)
                layer([
                    spread(
                        [
                            text(text="salmon", fontSize=12, fill="#666"),
                            ref(a),
                        ],
                        dir="y",
                        spacing=8,
                        alignment="middle",
                    ),
                    spread(
                        [
                            text(text="bass", fontSize=12, fill="#666"),
                            ref(b),
                        ],
                        dir="y",
                        spacing=8,
                        alignment="middle",
                    ),
                    spread(
                        [
                            text(text="trout", fontSize=12, fill="#666"),
                            ref(c),
                        ],
                        dir="y",
                        spacing=8,
                        alignment="middle",
                    ),
                ]),
                # tier 3: title above the bars group, x-centered on its bbox
                spread(
                    [
                        text(text="species", fontSize=14, fill="#333"),
                        ref(bars_tok),
                    ],
                    dir="y",
                    spacing=24,
                    alignment="middle",
                ),
            ],
            x=20,
            y=20,
        ),
        {"w": 400, "h": 400},
    )


# Tick values matching JS `d3.nice(0, max(HEIGHTS)=280, 5)` → [0, 300] and
# `d3.ticks(0, 300, 5)` → [0, 50, 100, 150, 200, 250, 300]. Hard-coded so the
# parity fixture doesn't need a d3-array shim.
_Y_MAX = 300
_TICK_VALUES = [0, 50, 100, 150, 200, 250, 300]
_N = len(_TICK_VALUES)


def story_continuous_yaxis():
    def _tick(v, i):
        return spread(
            [
                text(text=str(v), fontSize=11, fill="#666"),
                rect(w=5, h=1, fill="#999"),
            ],
            dir="x",
            spacing=3,
            alignment="middle",
        ).name(f"t{i}")

    ticks = [_tick(v, i) for i, v in enumerate(_TICK_VALUES)]

    def _constrain(**g):
        tick_refs = [g[f"t{i}"] for i in range(_N)]
        return [
            # ── X chain: title (x=0) → ticks → axis → bars ──
            Constraint.align([g["title"]], x="start"),
            Constraint.distribute(
                [g["title"], tick_refs[_N - 1]], dir="x", spacing=8
            ),
            # right-align the tick column so every mark's right edge sits at
            # the same x (each tick's right edge is its mark's right edge)
            Constraint.align(tick_refs, x="end"),
            # axis flush against the right edge of the tick column
            Constraint.distribute([tick_refs[0], g["axis"]], dir="x", spacing=0),
            Constraint.distribute([g["axis"], g["bars"]], dir="x", spacing=6),
            # ── Y: bars + axis top-aligned, ticks distributed along axis ──
            Constraint.align([g["bars"], g["axis"]], y="start"),
            # top tick's middle pinned to the axis line's start (= axis top)
            Constraint.align([tick_refs[0], g["axis"]], y=["middle", "start"]),
            # ticks distributed center-to-center along the axis line
            Constraint.distribute(
                tick_refs,
                dir="y",
                spacing=_Y_MAX / (_N - 1),
                mode="center",
            ),
            # title vertically centered on the axis line
            Constraint.align([g["axis"], g["title"]], y="middle"),
        ]

    return (
        layer(
            [
                # bars wrapped in a spread so the outer constraints address
                # them as one unit named "bars"
                spread(
                    _bars(["a", "b", "c"]),
                    dir="x",
                    alignment="start",
                ).name("bars"),
                rect(w=1, h=_Y_MAX, fill="#999").name("axis"),
                *ticks,
                text(text="count", fontSize=13, fill="#333").name("title"),
            ]
        ).constrain(_constrain),
        {"w": 400, "h": 400},
    )

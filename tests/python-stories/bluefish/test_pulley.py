"""Equivalent of bluefish/Pulley.stories.tsx — Bluefish/Pulley.

Port of the Bluefish pulley diagram, structured as nested layer tiers (see
notes/nested-layer-tiers.md):
  tier 1 — an inner layer that fully places the shapes;
  tier 2 — the ropes (`connect`), which read those placed shapes;
  tier 3 — the dimension labels, placed beside the ropes.

Exercises four features added in this PR's Python wrapper port:
  - `polygon` (the trapezoidal weight glyphs)
  - `connect` with keyword anchors (`source` / `target` accept `"middle"`,
    `["start", "middle"]`, or `{"x": "...", "y": ...}`)
  - `Constraint.z_above` / `Constraint.z_below` for granular paint order
  - `.z_order(n)` on the rope marks
"""

from gofish import (
    Constraint,
    circle,
    connect,
    createName,
    layer,
    mark,
    polygon,
    rect,
    ref,
    text,
)

R = 25
W2_JUT = 10

# `connect`'s default mix-blend-mode is "multiply" — that would turn the brown
# stroke translucent over the gray pulleys. Override to "normal" so the ropes
# are opaque, matching the Bluefish reference.
ROPE_OPTS = {
    "stroke": "#774e32",
    "strokeWidth": 3,
    "mixBlendMode": "normal",
}


@mark
def pulley_circle(r: float = R):
    """A pulley wheel — outer ring + concentric hub dot."""
    return layer(
        [
            circle(
                r=r, stroke="#828282", strokeWidth=3, fill="#C1C1C1"
            ).name("wheel"),
            circle(r=5, fill="#555555").name("hub"),
        ]
    ).constrain(
        lambda wheel, hub: [
            Constraint.align([wheel, hub], x="middle", y="middle"),
        ]
    )


@mark
def weight(width: float, height: float, label: str):
    """A weight glyph — trapezoid (wider at the bottom) with a centered label."""
    return layer(
        [
            polygon(
                # GoFish y-up: full-width bottom edge at y=0, inset top edge
                # at y=height.
                points=[
                    [0, 0],
                    [width, 0],
                    [width - 10, height],
                    [10, height],
                ],
                fill="#545454",
                stroke="#545454",
            ).name("body"),
            text(text=label, fontSize=10, fill="white").name("label"),
        ]
    ).constrain(
        lambda body, label: [
            Constraint.align([body, label], x="middle", y="middle"),
        ]
    )


def story_pulley():
    # Cross-tier names: the ropes (outer tier) reference shapes named on the
    # inner tier. String names are layer-scoped; `createName` tokens register
    # globally, so `ref(token)` resolves across the layer boundary.
    ceiling = createName("ceiling")
    A = createName("A")
    B = createName("B")
    C = createName("C")
    w1 = createName("w1")
    w2 = createName("w2")

    return (
        layer(
            [
                # ── tier 1: shapes + letter labels — a finished, fully-placed unit ──
                layer(
                    [
                        rect(
                            h=20,
                            w=9 * R,
                            fill="#C9C9C9",
                            stroke="#000",
                            strokeWidth=2,
                        ).name(ceiling),
                        pulley_circle(r=R).name(A),
                        pulley_circle(r=R).name(B),
                        pulley_circle(r=R).name(C),
                        weight(width=30, height=30, label="W1").name(w1),
                        weight(width=3 * R + W2_JUT, height=30, label="W2").name(
                            w2
                        ),
                        text(text="A", fontSize=12).name("Alabel"),
                        text(text="B", fontSize=12).name("Blabel"),
                        text(text="C", fontSize=12).name("Clabel"),
                    ]
                ).constrain(
                    lambda ceiling, A, B, C, w1, w2, Alabel, Blabel, Clabel: [
                        # Horizontal pulley cluster — each adjacent pair
                        # shares an edge: B.start sits on A.middle (overlap
                        # by half a wheel), C.start on B.end.
                        Constraint.align([A, B], x=["middle", "start"]),
                        Constraint.align([B, C], x=["end", "start"]),
                        # Vertical placement (GoFish is y-up; pair order
                        # flipped vs Bluefish).
                        Constraint.distribute(
                            [B, ceiling], dir="y", spacing=40, mode="edge"
                        ),
                        Constraint.distribute(
                            [A, B], dir="y", spacing=30, mode="edge"
                        ),
                        Constraint.distribute(
                            [C, B], dir="y", spacing=50, mode="edge"
                        ),
                        # Ceiling centered over the cluster.
                        Constraint.align([B, ceiling], x="middle"),
                        # Weights — negative spacings offset each weight so
                        # its inset trapezoid top sits under the rope source
                        # points.
                        Constraint.distribute(
                            [w2, C], dir="y", spacing=50, mode="edge"
                        ),
                        Constraint.distribute(
                            [A, w2], dir="x", spacing=-20, mode="edge"
                        ),
                        Constraint.distribute(
                            [w1, A], dir="x", spacing=-15, mode="edge"
                        ),
                        Constraint.align([w2, w1], y="middle"),
                        # Pulley letter labels — 1px gap from the wheel; the
                        # label sits on one side and y-anchors to one corner.
                        Constraint.distribute(
                            [Alabel, A], dir="x", spacing=1, mode="edge"
                        ),
                        Constraint.align([A, Alabel], y="end"),
                        Constraint.distribute(
                            [B, Blabel], dir="x", spacing=1, mode="edge"
                        ),
                        Constraint.align([B, Blabel], y="end"),
                        Constraint.distribute(
                            [C, Clabel], dir="x", spacing=1, mode="edge"
                        ),
                        Constraint.align([C, Clabel], y="start"),
                    ]
                ),
                # ── tier 2: rope segments — read the placed shapes ──────────
                # Declared after tier 1 so their ref()s resolve against
                # placed shapes. `z_order(-1)` keeps the unmentioned ropes
                # behind their circles by default.
                connect(
                    [ref(ceiling), ref(B)], target="middle", **ROPE_OPTS
                )
                .name("ropeSupport")
                .z_order(-1),
                connect(
                    [ref(B), ref(A)],
                    source=["start", "middle"],
                    target="middle",
                    **ROPE_OPTS,
                )
                .name("ropeX")
                .z_order(-1),
                connect(
                    [ref(B), ref(C)],
                    source=["end", "middle"],
                    target=["start", "middle"],
                    **ROPE_OPTS,
                )
                .name("ropeY")
                .z_order(-1),
                connect(
                    [ref(ceiling), ref(C)],
                    target=["end", "middle"],
                    **ROPE_OPTS,
                )
                .name("ropeZ")
                .z_order(-1),
                connect(
                    [ref(A), ref(w1)],
                    source=["start", "middle"],
                    **ROPE_OPTS,
                )
                .name("ropeP")
                .z_order(-1),
                connect(
                    [ref(A), ref(w2)],
                    source=["end", "middle"],
                    **ROPE_OPTS,
                )
                .name("ropeQ")
                .z_order(-1),
                connect(
                    [ref(C), ref(w2)], source="middle", **ROPE_OPTS
                )
                .name("ropeS")
                .z_order(-1),
                # ── tier 3: dimension labels ────────────────────────────────
                text(text="x").name("labelX"),
                text(text="y").name("labelY"),
                text(text="z").name("labelZ"),
                text(text="p").name("labelP"),
                text(text="q").name("labelQ"),
                text(text="s").name("labelS"),
            ],
            x=20,
            y=20,
        ).constrain(
            lambda A,
            B,
            C,
            ropeSupport,
            ropeX,
            ropeY,
            ropeZ,
            ropeP,
            ropeQ,
            ropeS,
            labelX,
            labelY,
            labelZ,
            labelP,
            labelQ,
            labelS,
            **_extra: [
                # Each dimension label sits 5px right of its rope on x.
                # Upper trio (x/y/z) shares ropeX's centerY; lower trio
                # (p/q/s) shares ropeS's — à la Bluefish's
                # `Align centerY [t1,t2,t3]` / `[t6,t5,t4]`.
                *[
                    c
                    for rope, label, y_anchor in [
                        (ropeX, labelX, ropeX),
                        (ropeY, labelY, labelX),
                        (ropeZ, labelZ, labelX),
                        (ropeS, labelS, ropeS),
                        (ropeQ, labelQ, labelS),
                        (ropeP, labelP, labelS),
                    ]
                    for c in [
                        Constraint.distribute(
                            [rope, label], dir="x", spacing=5, mode="edge"
                        ),
                        Constraint.align([y_anchor, label], y="middle"),
                    ]
                ],
                # Granular paint order: relative z-order constraints. Cross-
                # tier refs (A/B/C) work because `.constrain()` descends into
                # the non-component inner shapes layer. The ropes' default
                # `.z_order(-1)` keeps the unmentioned ropes (Y/Z/P/Q)
                # behind their circles; these four carve out the exceptions.
                Constraint.z_above(ropeX, A),  # x over A
                Constraint.z_below(ropeX, B),  # x under B
                Constraint.z_above(ropeSupport, B),  # ceiling→B over B
                Constraint.z_above(ropeS, C),  # s over C
            ]
        ),
        {},
    )

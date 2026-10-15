"""Equivalent of bluefish/Pulley.stories.tsx — Bluefish/Pulley.

Port of the Bluefish pulley diagram, structured as two nested layer tiers:
  tier 1 — an inner layer that places the shapes, then draws the ropes
           between them as drawing clauses of its own `.relate()`;
  tier 2 — the dimension labels, placed beside the ropes.

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
    line,
    layer,
    mark,
    polygon,
    rect,
    text,
)

R = 25
W2_JUT = 10

# `connect`'s default mix-blend-mode is "multiply" — that would turn the brown
# stroke translucent over the gray pulleys. Override to "normal" so the ropes
# are opaque, matching the Bluefish reference.
ROPE_OPTS = {
    "stroke": "#774e32",
    "stroke_width": 3,
    "mix_blend_mode": "normal",
}


@mark
def pulley_circle(r: float = R):
    """A pulley wheel — outer ring + concentric hub dot."""
    return layer(
        [
            circle(
                r=r, stroke="#828282", stroke_width=3, fill="#C1C1C1"
            ).name("wheel"),
            circle(r=5, fill="#555555").name("hub"),
        ]
    ).relate(
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
                # y-down free space (issue #143/#16): the inset top edge is at
                # y=0, the full-width bottom edge at y=height — a weight wider
                # at the bottom.
                points=[
                    [10, 0],
                    [width - 10, 0],
                    [width, height],
                    [0, height],
                ],
                fill="#545454",
                stroke="#545454",
            ).name("body"),
            text(text=label, font_size=10, fill="white").name("label"),
        ]
    ).relate(
        lambda body, label: [
            Constraint.align([body, label], x="middle", y="middle"),
        ]
    )


def story_pulley():
    return (
        layer(
            [
                # ── tier 1: shapes + letter labels + ropes ──────────────────
                layer(
                    [
                        rect(
                            h=20,
                            w=9 * R,
                            fill="#C9C9C9",
                            stroke="#000",
                            stroke_width=2,
                        ).name("ceiling"),
                        pulley_circle(r=R).name("A"),
                        pulley_circle(r=R).name("B"),
                        pulley_circle(r=R).name("C"),
                        weight(width=30, height=30, label="W1").name("w1"),
                        weight(width=3 * R + W2_JUT, height=30, label="W2").name(
                            "w2"
                        ),
                        text(text="A", font_size=12).name("Alabel"),
                        text(text="B", font_size=12).name("Blabel"),
                        text(text="C", font_size=12).name("Clabel"),
                    ]
                ).relate(
                    lambda ceiling, A, B, C, w1, w2, Alabel, Blabel, Clabel: [
                        # Horizontal pulley cluster — each adjacent pair
                        # shares an edge: B.start sits on A.middle (overlap
                        # by half a wheel), C.start on B.end.
                        Constraint.align([A, B], x=["middle", "start"]),
                        Constraint.align([B, C], x=["end", "start"]),
                        # Vertical placement: y-down free space matches
                        # Bluefish's ttb order (ceiling on top, pulleys below,
                        # weights at the bottom) — #143/#16.
                        Constraint.distribute(
                            [ceiling, B], dir="y", spacing=40, anchor="edge"
                        ),
                        Constraint.distribute(
                            [B, A], dir="y", spacing=30, anchor="edge"
                        ),
                        Constraint.distribute(
                            [B, C], dir="y", spacing=50, anchor="edge"
                        ),
                        # Ceiling centered over the cluster.
                        Constraint.align([B, ceiling], x="middle"),
                        # Weights — negative spacings offset each weight so
                        # its inset trapezoid top sits under the rope source
                        # points.
                        Constraint.distribute(
                            [C, w2], dir="y", spacing=50, anchor="edge"
                        ),
                        Constraint.distribute(
                            [A, w2], dir="x", spacing=-20, anchor="edge"
                        ),
                        Constraint.distribute(
                            [w1, A], dir="x", spacing=-15, anchor="edge"
                        ),
                        Constraint.align([w2, w1], y="middle"),
                        # Pulley letter labels — 1px gap from the wheel; the
                        # label sits on one side and y-anchors to one corner.
                        Constraint.distribute(
                            [Alabel, A], dir="x", spacing=1, anchor="edge"
                        ),
                        Constraint.align([A, Alabel], y="start"),
                        Constraint.distribute(
                            [B, Blabel], dir="x", spacing=1, anchor="edge"
                        ),
                        Constraint.align([B, Blabel], y="start"),
                        Constraint.distribute(
                            [C, Clabel], dir="x", spacing=1, anchor="edge"
                        ),
                        Constraint.align([C, Clabel], y="end"),
                        # Rope segments — drawing clauses, drawn between the
                        # placed shapes. `z_order(-1)` keeps the unmentioned
                        # ropes behind their circles by default.
                        line([ceiling, B], target="middle", **ROPE_OPTS)
                        .name("ropeSupport")
                        .z_order(-1),
                        line(
                            [B, A],
                            source=["start", "middle"],
                            target="middle",
                            **ROPE_OPTS,
                        )
                        .name("ropeX")
                        .z_order(-1),
                        line(
                            [B, C],
                            source=["end", "middle"],
                            target=["start", "middle"],
                            **ROPE_OPTS,
                        )
                        .name("ropeY")
                        .z_order(-1),
                        line([ceiling, C], target=["end", "middle"], **ROPE_OPTS)
                        .name("ropeZ")
                        .z_order(-1),
                        line([A, w1], source=["start", "middle"], **ROPE_OPTS)
                        .name("ropeP")
                        .z_order(-1),
                        line([A, w2], source=["end", "middle"], **ROPE_OPTS)
                        .name("ropeQ")
                        .z_order(-1),
                        line([C, w2], source="middle", **ROPE_OPTS)
                        .name("ropeS")
                        .z_order(-1),
                    ]
                ),
                # ── tier 2: dimension labels ────────────────────────────────
                text(text="x").name("labelX"),
                text(text="y").name("labelY"),
                text(text="z").name("labelZ"),
                text(text="p").name("labelP"),
                text(text="q").name("labelQ"),
                text(text="s").name("labelS"),
            ],
            x=20,
            y=20,
        ).relate(
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
                            [rope, label], dir="x", spacing=5, anchor="edge"
                        ),
                        Constraint.align([y_anchor, label], y="middle"),
                    ]
                ],
                # Granular paint order: relative z-order constraints. The
                # ropes and the shapes all lie in tier 1, so these order them
                # inside that tier. The ropes' default `.z_order(-1)` keeps
                # the unmentioned ropes (Y/Z/P/Q) behind their circles; these
                # four carve out the exceptions.
                Constraint.z_above(ropeX, A),  # x over A
                Constraint.z_below(ropeX, B),  # x under B
                Constraint.z_above(ropeSupport, B),  # ceiling→B over B
                Constraint.z_above(ropeS, C),  # s over C
            ]
        ),
        {},
    )

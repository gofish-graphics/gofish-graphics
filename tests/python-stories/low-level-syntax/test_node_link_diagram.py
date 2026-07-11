"""Equivalent of lowlevel/NodeLink.stories.tsx —
Low Level Syntax/Node-Link Diagram.

A small node-link diagram built with the nested-tier pattern:
  tier 1 — nodes (rect + centered text), placed by constraints;
  tier 2 — `connect` edges that read the placed nodes;
  tier 3 — edge labels, placed beside the edges.

Exercises the Python wrapper's new `connect` operator with keyword anchors
(`source` / `target` accept `"middle"`, `["start", "middle"]`, etc.).
"""

from gofish import (
    Constraint,
    createName,
    line,
    layer,
    mark,
    rect,
    ref,
    text,
)


EDGE_OPTS = {"stroke": "#90a4ae", "strokeWidth": 2}


@mark
def node(label: str):
    """A node — rounded box with a centered label."""
    return layer(
        [
            rect(
                w=76,
                h=40,
                rx=6,
                fill="#e2ebf6",
                stroke="#457b9d",
                strokeWidth=2,
            ).name("box"),
            text(text=label, fontSize=14, fill="#1d3557").name("label"),
        ],
        w=76,
        h=40,
    ).constrain(
        lambda box, label: [
            Constraint.align([box, label], x="middle", y="middle"),
        ]
    )


def story_node_link():
    # Cross-tier names: edges (outer tier) reference nodes (inner tier).
    A = createName("A")
    B = createName("B")
    C = createName("C")
    D = createName("D")

    return (
        layer(
            [
                # ── tier 1: nodes — placed by constraints, a finished unit ──
                layer(
                    [
                        node(label="A").name(A),
                        node(label="B").name(B),
                        node(label="C").name(C),
                        node(label="D").name(D),
                    ]
                ).constrain(
                    lambda A, B, C, D: [
                        Constraint.distribute(
                            [A, B, C], dir="x", spacing=60, anchor="edge"
                        ),
                        Constraint.align([A, B, C], y="middle"),
                        Constraint.distribute(
                            [D, B], dir="y", spacing=60, anchor="edge"
                        ),
                        Constraint.align([B, D], x="middle"),
                    ]
                ),
                # ── tier 2: edges ───────────────────────────────────────────
                line(
                    [ref(A), ref(B)],
                    source=["end", "middle"],
                    target=["start", "middle"],
                    **EDGE_OPTS,
                )
                .name("e1")
                .z_order(-1),
                line(
                    [ref(B), ref(C)],
                    source=["end", "middle"],
                    target=["start", "middle"],
                    **EDGE_OPTS,
                )
                .name("e2")
                .z_order(-1),
                line(
                    [ref(B), ref(D)],
                    source=["middle", "start"],
                    target=["middle", "end"],
                    **EDGE_OPTS,
                )
                .name("e3")
                .z_order(-1),
                # ── tier 3: edge labels ─────────────────────────────────────
                text(text="open", fontSize=11, fill="#607d8b").name("t1"),
                text(text="run", fontSize=11, fill="#607d8b").name("t2"),
                text(text="drop", fontSize=11, fill="#607d8b").name("t3"),
            ],
            x=20,
            y=20,
        ).constrain(
            lambda e1, e2, e3, t1, t2, t3, **_extra: [
                # Horizontal edges: label centered just above the edge.
                Constraint.align([e1, t1], x="middle"),
                Constraint.distribute(
                    [e1, t1], dir="y", spacing=3, anchor="edge"
                ),
                Constraint.align([e2, t2], x="middle"),
                Constraint.distribute(
                    [e2, t2], dir="y", spacing=3, anchor="edge"
                ),
                # Vertical edge: label centered just to the right.
                Constraint.align([e3, t3], y="middle"),
                Constraint.distribute(
                    [e3, t3], dir="x", spacing=4, anchor="edge"
                ),
            ]
        ),
        {"w": 420, "h": 220},
    )

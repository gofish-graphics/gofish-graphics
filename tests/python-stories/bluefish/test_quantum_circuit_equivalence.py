"""Equivalent of bluefish/QuantumCircuit.stories.tsx — Bluefish/Quantum Circuit Equivalence.

Structured like Pulley: an inner tier that fully places the two wire-groups +
"≡" + description (including the two highlight enclosures, built inline
around their own content), then vertical control-to-gate connector lines
(`line`, `z_order(-1)`) that read those placed refs. `WireSlot`, `BoxedSymbol`,
`OPlus`, and `Wire` are `@mark` components; `EmptySlot` and `ControlDot` stay
plain functions, mirroring the JS choice (a bare `rect()`/`circle()` call is
itself a still-deferred Mark that a `@mark`/`createMark` wrapper can't take).
"""

from gofish import (
    Constraint,
    circle,
    createName,
    enclose,
    layer,
    line,
    mark,
    ref,
    rect,
    spread,
    text,
)

SLOT = 60  # pitch between gate slots on a wire
GATE = 50  # gate box / wire-symbol side length


@mark
def wire_slot(content):
    """A single gate/dot centered in a fixed 50x50 slot."""
    return layer(
        [
            rect(w=GATE, h=GATE, fill="transparent").name("slot"),
            content.name("content"),
        ]
    ).constrain(
        lambda slot, content: [
            Constraint.align([slot, content], x="middle", y="middle"),
        ]
    )


def empty_slot():
    """An empty 50x50 slot — a placeholder gap on a wire."""
    return rect(w=GATE, h=GATE, fill="transparent")


@mark
def boxed_symbol(label):
    """A labeled square gate."""
    return layer(
        [
            rect(
                w=GATE,
                h=GATE,
                fill="white",
                stroke="black",
                strokeWidth=3,
            ).name("box"),
            text(
                text=label,
                fontSize=30,
                fontFamily="serif",
                fontStyle="italic",
                fill="black",
            ).name("label"),
        ]
    ).constrain(
        lambda box, label: [
            Constraint.align([box, label], x="middle", y="middle"),
        ]
    )


@mark
def o_plus():
    """The circled-plus CNOT target symbol."""
    return layer(
        [
            circle(
                r=15, fill="transparent", stroke="black", strokeWidth=3
            ).name("ring"),
            rect(w=30, h=3, fill="black").name("hbar"),
            rect(w=3, h=30, fill="black").name("vbar"),
        ]
    ).constrain(
        lambda ring, hbar, vbar: [
            Constraint.align([ring, hbar, vbar], x="middle", y="middle"),
        ]
    )


def control_dot():
    """A filled control dot."""
    return circle(r=5, fill="black")


@mark
def wire(slots, span=None):
    """A horizontal wire: a full-span black rail with gates spread on it.

    `span` is the number of slot columns the rail covers, independent of how
    many slots this wire actually carries. Rail width = span*SLOT + 30.
    """
    return layer(
        [
            rect(
                w=(span if span is not None else len(slots)) * SLOT + 30,
                h=3,
                fill="black",
            ).name("line"),
            spread(
                [rect(w=10, h=GATE, fill="transparent"), *slots],
                dir="x",
                spacing=SLOT - GATE,
                alignment="middle",
            ).name("gates"),
        ]
    ).constrain(
        lambda line, gates: [
            Constraint.align([line, gates], x="start", y="middle"),
        ]
    )


def story_quantum_circuit():
    # Cross-tier names: the connector lines reference marks placed deep
    # inside the wire-group layers.
    c1 = createName("c1")
    z = createName("z")
    c2 = createName("c2")
    oplus = createName("oplus")

    # The two highlight callouts (yellow boxes), built with `enclose`
    # wrapping their owned content at the point that content is constructed.
    highlight = {
        "padding": 10,
        "rx": 10,
        "ry": 10,
        "fill": "rgba(255,200,0,0.333)",
        "stroke": "none",
    }
    highlighted_oplus = enclose([o_plus()], **highlight)
    highlighted_description = enclose(
        [text(text="This is a controlled-NOT.")], **highlight
    )

    return (
        layer(
            [
                # ── tier 1: the two wire-groups + "≡" + description ──
                spread(
                    [
                        # Left circuit: controlled-Z.
                        spread(
                            [
                                wire(
                                    slots=[
                                        wire_slot(content=control_dot()).name(c1)
                                    ]
                                ),
                                wire(slots=[boxed_symbol(label="Z").name(z)]),
                            ],
                            dir="y",
                            spacing=30,
                            alignment="start",
                        ),
                        text(text="≡", fontSize=40, fontWeight=300),
                        # Right circuit: H-CNOT-H. Both wires span 3 columns.
                        spread(
                            [
                                wire(
                                    span=3,
                                    slots=[
                                        empty_slot(),
                                        wire_slot(content=control_dot()).name(
                                            c2
                                        ),
                                    ],
                                ),
                                wire(
                                    span=3,
                                    slots=[
                                        boxed_symbol(label="H"),
                                        wire_slot(
                                            content=highlighted_oplus
                                        ).name(oplus),
                                        boxed_symbol(label="H"),
                                    ],
                                ),
                            ],
                            dir="y",
                            spacing=30,
                            alignment="start",
                        ),
                        highlighted_description,
                    ],
                    dir="x",
                    spacing=25,
                    alignment="middle",
                ),
                # ── tier 2: control-to-gate connector lines ──
                line([ref(c1), ref(z)], stroke="black", strokeWidth=3).z_order(
                    -1
                ),
                line(
                    [ref(c2), ref(oplus)], stroke="black", strokeWidth=3
                ).z_order(-1),
            ],
            x=20,
            y=20,
        ),
        {},
    )

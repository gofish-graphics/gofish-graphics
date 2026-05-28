"""Equivalent of piccl/Bottle.stories.tsx — Piccl/Bottle.

The JS storybook composes the per-category "filled bottle" via
`layer([atop([image, fill_rect]).name("bottle"), line, label])` plus three
constraints that pin the bottle, the line, and the percent label together.

The percent label is authored as `text({text: (d) => `${d.amount}%`})` — a
Python callable. The wrapper wires it through the same derive-server lambda
registry as `derive()` operators: each lambda gets a UUID, the Mark IR
carries `{"__gofish_lambda": id}`, and the JS harness swaps in an `async
(d) => fetch /derive/<id>` arrow at render time. JS sees a real accessor;
the body just happens to RPC into Python.
"""

import os

from gofish import (
    Constraint,
    atop,
    chart,
    image,
    layer,
    rect,
    spread,
    text,
    v,
)

_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)
BOTTLE_PNG = (
    f"/@fs{_REPO_ROOT}/packages/gofish-graphics/stories/assets/wilsonblanco.png"
)


DATA = [
    {"category": "a", "amount": 30},
    {"category": "d", "amount": 60},
    {"category": "b", "amount": 75},
    {"category": "c", "amount": 100},
]


def story_default():
    return (
        chart(DATA)
        .flow(spread(by="category", dir="x", spacing=20, axes={"x": False}))
        .mark(
            layer([
                atop(
                    [
                        image(href=BOTTLE_PNG, h=v(100)),
                        rect(h="amount", fill="#00ff00"),
                    ],
                    blendMode="color",
                ).name("bottle"),
                rect(h=1, fill="#666", w=175, y="amount").name("line"),
                text(
                    text=lambda d: f"{d['amount']}%",
                    fontSize=35,
                    fill="#666",
                ).name("label"),
            ]).constrain(lambda bottle, line, label: [
                Constraint.align([bottle, line], x="start"),
                Constraint.distribute([line, label], dir="y", spacing=0),
                Constraint.align([label, line], x="end"),
            ])
        ),
        {"w": 1000, "h": 400, "axes": False},
    )

"""Equivalent of LabeledChart.stories.tsx — Forward Syntax/LabeledChart."""

from gofish import (
    chart,
    circle,
    layer,
    rect,
    resolve,
    scatter,
    select_all,
    spread,
    stack,
    text,
)
from python_stories.data import SEAFOOD

NODES = [
    {"id": "a", "grp": 0},
    {"id": "b", "grp": 1},
    {"id": "c", "grp": 2},
]

LABELS = [
    {"ref": "a", "label": "Alpha"},
    {"ref": "b", "label": "Bravo"},
    {"ref": "c", "label": "Charlie"},
]


def story_basic():
    return (
        chart(NODES, axes=False, w=500, h=300)
        .flow(scatter(by="id", x="grp", y="grp"))
        .mark(circle(r=16, fill="#59a14f").name("nodes"))
        .layer(
            chart(LABELS)
            .flow(resolve(["ref"], from_=select_all("nodes")))
            .mark(
                lambda rows: layer(
                    [
                        spread([r["ref"], text(text=r["label"])], dir="x", spacing=6)
                        for r in rows
                    ]
                )
            )
        ),
        {},
    )


# A callout on one group: the outer spread is named, so `select_all("lakes")`
# yields one ref per lake, and the annotation table joins its row to the lake
# it names through `resolve`.
CALLOUTS = [{"ref": "Lake B", "note": "most fish"}]


def story_group_callout():
    return (
        chart(SEAFOOD, w=500, h=300)
        .flow(
            spread(by="lake", dir="x").name("lakes"),
            stack(by="species", dir="y"),
        )
        .mark(rect(h="count", fill="species"))
        .layer(
            chart(CALLOUTS)
            .flow(resolve(["ref"], from_=select_all("lakes")))
            .mark(
                lambda rows: layer(
                    [
                        spread(
                            [text(text=r["note"]), r["ref"]],
                            dir="y",
                            spacing=4,
                            alignment="middle",
                        )
                        for r in rows
                    ]
                )
            )
        ),
        {},
    )

"""Equivalent of LabeledChart.stories.tsx — Forward Syntax/LabeledChart."""

from gofish import chart, circle, layer, resolve, scatter, select_all, spread, text

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
        chart(NODES, axes=False)
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
        {"w": 500, "h": 300},
    )
